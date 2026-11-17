import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fixtures,original} from "./phase4b-fixtures.mts";
const root=fileURLToPath(new URL("../../",import.meta.url));
const deps=createRequire(new URL("../firestore/package.json",import.meta.url));
const sharp=createRequire(new URL("../../package.json",import.meta.url))("sharp");
const dir=path.join(root,"docs","production","phase4b");
const save=process.env.PHASE4B_WRITE_PROOFS==="1";
const decode=s=>Buffer.from(s,"base64");
const rgba=b=>sharp(b).ensureAlpha().raw().toBuffer();
const clear=[0,0,0,0],red=[208,32,64,255],blue=[20,86,217,255],green=[17,153,76,255],yellow=[243,171,25,255];
const samples={
 "origins/native":[red,clear,blue,green,clear],"origins/local":[clear,red,clear,clear,clear],
 "garment/front~left_chest":[red,green,clear],"garment/front~right_chest":[blue,blue,clear],
 "garment/back":[yellow,clear],"garment/left_sleeve":[green,clear],
 "mug/mug_full_wrap~mug_full_wrap":[blue,blue,red,green,clear,clear],
 "mug-mirror/mug_full_wrap~mug_full_wrap":[blue,blue,clear,red,clear,clear],
 "handle/mug_full_wrap~mug_full_wrap":[clear,clear,red,green,clear,clear],
 "shirt-proof/front~front_register":[red,red,blue,clear,green],
 "type/front":[clear,clear],"type-mirror/front":[clear,clear]
};

async function proofSheet(name,shots) {
  const width=1050, row=194, height=68+row*shots.length;
  let labels='<rect width="100%" height="100%" fill="#f1f4f7"/><g fill="#16293b" font-family="Arial,sans-serif">';
  labels+='<text x="16" y="24" font-size="18">Kendin Tasarla · 04B · '+name+'</text>';
  ["Editor reference crop","Decoded production PNG","Pixel difference (3×)"].forEach((s,j)=>labels+='<text x="'+(16+j*345)+'" y="49" font-size="15">'+s+'</text>');
  const layers=[];
  for(const [i,s] of shots.entries()) {
    const y=66+i*row;
    for(const [j,field] of ["expected","actual","diff"].entries()) {
      const buf=await sharp(decode(s[field])).resize(326,112,{fit:"contain",background:"#ffffff"}).flatten({background:"#fff"}).png().toBuffer();
      layers.push({input:buf,left:16+j*345,top:y});
    }
    labels+='<text x="16" y="'+(y+136)+'" font-size="14">'+s.label+' / '+s.key+' · '+s.w+' × '+s.h+' px · '+s.dpi+' DPI · '+s.mirror+'</text>';
    const probe=s.probes.find(p=>p.rgba[3]) || s.probes[0];
    labels+='<text x="16" y="'+(y+158)+'" font-size="12">RGBA ('+probe.x+', '+probe.y+') = ['+probe.rgba+'] · Pixels over tolerance: '+s.bad+' · Mean difference: '+s.mean.toFixed(3)+'</text>';
  }
  const base=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'">'+labels+'</g></svg>');
  await sharp(base).composite(layers).png().toFile(path.join(dir,name+".png"));
}

test("04B independent editor crops, golden rasters, glyph masks, frozen placement provenance and rejection matrix",async()=>{
  const browser=await deps("playwright-core").chromium.launch({channel:"chrome",headless:true});
  const bundle=await deps("esbuild").build({entryPoints:[path.join(root,"tests/production/phase4b-browser.mts")],bundle:true,write:false,platform:"browser",
    define:{"process.env":JSON.stringify({NODE_ENV:"test",NEXT_PUBLIC_FIREBASE_API_KEY:""})}});
  const jobs=await fixtures(), remembered=new Map(), packages=new Map(), shots=[], metrics=[];
  const source=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="80"><rect width="128" height="80" fill="#f0a318"/><rect width="24" height="80" fill="#284cd8"/></svg>')).png().toBuffer();
  const small=await sharp(source).resize(8,5).png().toBuffer();
  const goldenDir=path.join(dir,"golden");
  if(save) await mkdir(goldenDir,{recursive:true});
  try {
    for(const dpr of [1,2]) {
      const page=await browser.newPage({deviceScaleFactor:dpr});
      await page.route("**/*",async route=>{
        const url=new URL(route.request().url());
        if(url.origin!=="https://print.fixture.invalid") return route.abort();
        if(url.pathname==="/") return route.fulfill({contentType:"text/html",body:"<html></html>"});
        if(url.href===original || url.pathname==="/degraded.png") return route.fulfill({contentType:"image/png",body:url.href===original?source:small});
        if(/^\/production-fonts\/[\w-]+\.woff$/.test(url.pathname))
          return route.fulfill({contentType:"font/woff",body:await readFile(path.join(root,"kenditasarl-admin/public",url.pathname.slice(1)))});
        return route.fulfill({status:404,body:""});
      });
      await page.goto("https://print.fixture.invalid/");
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      for(const f of jobs) {
        const result=await page.evaluate(f=>(window as any).runFixture(f),f);
        if(dpr===1 && ["shirt-proof","mug","mug-mirror","handle"].includes(f.label)) packages.set(f.label,decode(result.zip));
        assert.equal(result.fileCount,f.expected.length);
        const m=result.manifest; assert.equal(m.source.itemId,f.item.id);assert.equal(m.source.artVersion,f.item.art_version);
        assert.equal(m.source.fingerprint.length,64);assert.ok(!JSON.stringify(m).includes("?demo"));
        assert.deepEqual(result.entries.sort(),["production-info.json",...m.files.map(r=>r.fileName),...m.rawAssets.map(r=>r.localFileName)].sort());
        if(f.label.startsWith("type")) assert.equal(m.rawAssets.length,1);
        for(const s of result.shots) {
          const id=f.label+"/"+s.key,r=m.files.find(r=>r.sha256===s.hash);
          assert.equal(r.coordinates.frame.templateRevision.length,64);
          assert.deepEqual(s.probes.map(p=>p.rgba),samples[id],id);
          assert.ok(s.bad/(s.w*s.h)<=0.004 && s.mean<0.4,id+" raster difference "+s.bad+" / "+s.mean);
          if(s.text) for(const t of s.text) {
            console.log("Cairo",dpr,t);
            assert.ok(Math.abs(t.width-t.referenceWidth)<=2 && Math.abs(t.height-t.referenceHeight)<=2 && t.alphaError<16,"independent shaping "+t.value);
            if(t.unjoined!==null) assert.ok(t.unjoined>t.alphaError+10);
          }
          if(dpr===1) {
            remembered.set(id,s);shots.push({...s,label:f.label,dpi:r.dpi,mirror:r.coordinates.mirror});
            metrics.push({fixture:f.label,output:s.key,width:s.w,height:s.h,dpi:r.dpi,mirror:r.coordinates.mirror,
              expectedRevision:r.coordinates.frame.templateRevision,pngSha256:s.hash,probes:s.probes,pixelsOver24:s.bad,mean:s.mean,text:s.text});
          } else {
            assert.equal(s.hash,remembered.get(id).hash,id+" depends on device scale");
            assert.equal(s.expected,remembered.get(id).expected);
          }
          if(!save) {
            const stored=await readFile(path.join(goldenDir,f.label+"--"+s.key+".png"));
            assert.deepEqual(await rgba(stored),await rgba(decode(s.expected)),id+" golden reference drift");
          }
        }
      }
      const unsafe=structuredClone(jobs.find(f=>f.label==="handle").item);
      const docs=JSON.parse(unsafe.canvas_json),scene=JSON.parse(docs.mug_full_wrap);
      scene.objects[0].left=5;docs.mug_full_wrap=JSON.stringify(scene);unsafe.canvas_json=JSON.stringify(docs);
      await assert.rejects(page.evaluate(item=>(window as any).buildPackage("synthetic-order",item),unsafe),/MAPPING/);
      const typography=jobs.find(f=>f.label==="type");
      const failures=await page.evaluate(f=>(window as any).negatives(f),typography);
      for(const [name,code] of Object.entries({font:"FONT",glyph:"FONT",missingImage:"IMAGE",degraded:"IMAGE",lowDpi:"LOW_DPI",mirror:"CALIBRATION",
        staleTemplate:"NEEDS_REVIEW",bleed:"MAPPING",ambiguous:"NEEDS_REVIEW",missingPng:"PACKAGE",corruptPng:"PACKAGE",aspect:"GEOMETRY"}))
        assert.equal(failures[name],code,name);
      assert.notEqual(failures.truncatedZip,"RELEASED");
      await page.close();
      if(dpr===1) {
        const broken=await browser.newPage();
        await broken.route("**/*",r=>r.request().resourceType()==="document" ?
          r.fulfill({contentType:"text/html",body:"<html></html>"}) :
          r.request().url()===original ? r.fulfill({contentType:"image/png",body:source}) :
          r.fulfill({contentType:"font/woff",body:"corrupt"}));
        await broken.goto("https://print.fixture.invalid/");
        await broken.addScriptTag({content:bundle.outputFiles[0].text});
        await assert.rejects(broken.evaluate(item=>(window as any).buildPackage("synthetic-order",item),typography.item),/FONT/);
        await broken.close();
      }
    }
    for(const [a,b] of [["type","front"],["mug","mug_full_wrap~mug_full_wrap"]]) {
      const normal=remembered.get(a+"/"+b),flipped=remembered.get(a+"-mirror/"+b);
      assert.deepEqual(await sharp(decode(normal.actual)).flop().ensureAlpha().raw().toBuffer(),await rgba(decode(flipped.actual)),"whole output mirror "+a);
    }
    if(!save) {
      const prior=JSON.parse(await readFile(path.join(dir,"measurements.json"),"utf8"));
      if(prior.browser===browser.version())
        assert.deepEqual(metrics.map(r=>r.pngSha256),prior.measurements.map(r=>r.pngSha256),"recorded output PNG fingerprints");
      for(const [label] of packages) {
        const zip=await createRequire(new URL("../../kenditasarl-admin/package.json",import.meta.url))("jszip").loadAsync(await readFile(path.join(dir,"samples",label+".zip")),{checkCRC32:true});
        const manifest=JSON.parse(await zip.file("production-info.json").async("string"));
        assert.equal(manifest.source.itemId,label);
        const measurement=prior.measurements.find(r=>r.fixture===label);
        assert.equal(manifest.files[0].sha256,measurement.pngSha256);
      }
    }
    if(save) {
      await mkdir(path.join(dir,"samples"),{recursive:true});
      for(const [label,blob] of packages) await writeFile(path.join(dir,"samples",label+".zip"),blob);
      for(const s of shots) await writeFile(path.join(goldenDir,s.label+"--"+s.key+".png"),decode(s.expected));
      for(const [name,labels] of [["shirt-placements",["origins","garment","shirt-proof"]],["mug-seam",["mug","mug-mirror","handle"]],["type-and-image",["type","type-mirror"]]])
        await proofSheet(name,shots.filter(s=>labels.includes(s.label)));
      await writeFile(path.join(dir,"measurements.json"),JSON.stringify({dpr:[1,2],browser:browser.version(),measurements:metrics},null,2)+"\n");
    }
    console.log(jobs.length+" immutable items; "+shots.length+" placement outputs at each of two DPRs");
  } finally {await browser.close();}
});
