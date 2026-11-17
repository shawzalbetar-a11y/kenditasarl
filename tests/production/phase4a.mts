import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { editorFrame, faceCoordinates, templateRevision, readSavedFrame, canUpdateSavedDesign, serializeEditorFace } from "../../src/lib/faceCoordinates";
import { artwork } from "../../src/lib/server/checkoutArt";
import { printOrigin, productionPlan } from "../../kenditasarl-admin/src/lib/production-plan";
const dependencies = createRequire(new URL("../firestore/package.json",import.meta.url));
const area = {left:0,top:0,width:200,height:200,nativeWidth:200,nativeHeight:200,physicalWidthCm:2.54,physicalHeightCm:2.54,targetDPI:300,mirrorHorizontal:false,printMethod:"DTF"};
const rect = {type:"rect",left:12,top:12,width:12,height:12,strokeWidth:0,fill:"red"};
const catalog = {garmentType:"tshirt",faces:{front:{enabled:true,printArea:area}}};
const rev = await templateRevision(catalog);
const frame = editorFrame("front",false,200,200,rev)!;
const contract = faceCoordinates(frame,catalog,"apparel","tshirt",[],false,"DTF")!;
function item(c:any, objects = [rect]) {
  return {id:"demo-line",schema_version:1,is_immutable_snapshot:true,art_version:rev,product_id:"shirt",design_id:"art",variant_id:"red_M",
    canvas_json:JSON.stringify({front:JSON.stringify({objects,width:200,height:200,coordinates:c})}),
    production_snapshot:JSON.stringify({customization_config:catalog,coordinateFaces:{front:c}})};
}
test("identical points in two explicit spaces, legacy restore, face/size/template changes",() => {
  for (const [space,expected] of [["PRINT_AREA_LOCAL",[140,160]],["FULL_MOCKUP_NATIVE",[40,40]]] as const) {
    const origin = printOrigin(space,{left:100,top:120});
    assert.deepEqual([140-origin.x,160-origin.y],expected);
  }
  assert.throws(()=>productionPlan(item(null)),/NEEDS_REVIEW/);
  const incomplete = item(contract);
  const snap = JSON.parse(incomplete.production_snapshot);
  snap.coordinateFaces.back = {...contract,frame:{...frame,surface:"back"}};
  assert.throws(()=>productionPlan({...incomplete,production_snapshot:JSON.stringify(snap)}),/ART/);
  const saved = JSON.stringify({objects:[rect],coordinates:contract});
  const historical = JSON.stringify({objects:[rect],width:200,height:200});
  assert.equal(canUpdateSavedDesign({"red:::front":saved},rev),true);
  assert.equal(canUpdateSavedDesign({"red:::front":saved,"blue:::back":historical},rev),false);
  assert.equal(editorFrame("front",false,200,200,rev,readSavedFrame(historical)),null);
  assert.deepEqual(editorFrame("front",false,200,200,rev,frame),frame);
  assert.equal(editorFrame("back",false,200,200,rev,frame),null);
  assert.equal(editorFrame("front",false,201,200,rev,frame),null);
  assert.equal(editorFrame("front",false,200,200,"b".repeat(64),frame),null);
});
test("active face serializer retains provenance across draft reload and independent mug and shirt surfaces",async () => {
  const selected = [];
  const context = {revision:rev, config:catalog, family:"apparel", garment:"tshirt", selected, free:false, method:"DTF"};
  const surface = {face:"front",panorama:false,nativeWidth:200,nativeHeight:200,canvasWidth:200,canvasHeight:200};
  const payload = {objects:[rect]};
  const first = serializeEditorFace(payload,surface,context);
  assert.deepEqual(first.coordinates, contract);
  assert.deepEqual(serializeEditorFace(payload,{...surface,loaded:readSavedFrame(JSON.stringify(first))},context),first);
  assert.equal(serializeEditorFace(payload,{...surface,loaded:readSavedFrame(payload)},context).coordinates,undefined);
  assert.equal(serializeEditorFace(payload,{...surface,canvasWidth:180},context).coordinates,undefined);
  const mug = {...catalog,garmentType:"mug"};
  const wrap = serializeEditorFace(payload,{...surface,panorama:true,canvasWidth:1840,canvasHeight:760},
    {...context,revision:await templateRevision(mug),config:mug,family:"mug",selected:["mug_full_wrap"]});
  assert.deepEqual([wrap.width,wrap.height,wrap.mugPanoramaSheet,wrap.coordinates.frame.space,wrap.coordinates.frame.surface],
    [1840,760,true,"STANDALONE_SURFACE","mug_full_wrap"]);
});
test("server checks mug wrap, separate shirt placements, forged geometry and release gates",async () => {
  const wrapCatalog = {...catalog,garmentType:"mug",productType:"mug"};
  const wrap = editorFrame("front",true,1840,760,await templateRevision(wrapCatalog))!;
  const wc = faceCoordinates(wrap,wrapCatalog,"mug","mug",["mug_full_wrap"],false,"DTF")!;
  assert.equal(wrap.space,"STANDALONE_SURFACE");
  assert.deepEqual([wc.placements[0].widthCm,wc.placements[0].heightCm],[23,9.5]);
  async function freeze(config, family, face, width, height, coordinates, ids, objects) {
    const scene = {width,height,coordinates,objects,...(family==="mug"?{mugPanoramaSheet:true}:{})};
    const design = {color:"red",print_method:"DTF",selected_placement_ids:ids,canvas_json:JSON.stringify({["red:::"+face]:JSON.stringify(scene)}),
      production_snapshot:JSON.stringify({snapshotVersion:1,customization_config:config})};
    const result = await artwork(design,{color:"red"},"red",{category:family,customization_config:config},async()=>{throw Error("fixture");});
    return JSON.parse(result.art.production_snapshot).coordinateFaces?.[face];
  }
  assert.deepEqual(await freeze(wrapCatalog,"mug","mug_full_wrap",1840,760,wc,["mug_full_wrap"],[rect]),wc);
  const ids = ["left_chest","center_chest"];
  const calibratedPlacements = Object.fromEntries(ids.map((k,i)=>[k,{x:i*100,y:0,width:100,height:100,nativeWidth:200,nativeHeight:200,physicalWidthCm:4,physicalHeightCm:4}]));
  const config = {...catalog,calibratedPlacements};
  const current = editorFrame("front",false,200,200,await templateRevision(config))!;
  const c = faceCoordinates(current,config,"apparel","tshirt",ids,false,"DTF")!;
  const shapes = ids.map((id,i)=>({...rect,left:12+i*100,assignedPlacementId:id}));
  assert.deepEqual(await freeze(config,"apparel","front",200,200,c,ids,shapes),c);
  assert.equal(c.placements.length,2);
  assert.equal(await freeze(config,"apparel","front",200,200,{...c,targetDPI:72},ids,shapes),undefined);
  assert.throws(()=>productionPlan(item(c)),/MAPPING/);
  assert.throws(()=>productionPlan(item({...contract,mirror:null})),/CALIBRATION/);
});
test("Chrome verifies nested assets and fonts, actual PNG and ZIP membership, optional previews and all faces", async () => {
  const { chromium } = dependencies("playwright-core"), {build} = dependencies("esbuild");
  const browser = await chromium.launch({channel:"chrome",headless:true});
  try {
    const page = await browser.newPage({deviceScaleFactor:2});
    await page.route(/^https?:/,r=>r.abort());
    await page.route("https://fixture.invalid/", r=>r.fulfill({contentType:"text/html",body:"<html></html>"}));
    await page.goto("https://fixture.invalid/");
    const sharp = createRequire(new URL("../../package.json",import.meta.url))("sharp");
    const pixels = await sharp({create:{width:256,height:256,channels:4,background:"red"}}).png().toBuffer();
    await page.route("https://fixture.invalid/source.png",r=>r.fulfill({status:200,contentType:"image/png",headers:{"Access-Control-Allow-Origin":"*"},body:pixels}));
    const bundle = await build({stdin:{contents:`
      import {checkDesignQuality} from "./production-quality"; import {buildPackage} from "./production-job";
      import {generateProductionZip} from "./production-zip"; import JSZip from "jszip";
      Object.assign(window,{checkDesignQuality,buildPackage,generateProductionZip,JSZip});
    `,resolveDir:fileURLToPath(new URL("../../kenditasarl-admin/src/lib/",import.meta.url))},bundle:true,write:false,platform:"browser"});
    // Playwright serializes evaluate callbacks separately from the tsx module.
    await page.addScriptTag({content:"window.__name = (fn) => fn;"});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const plan = productionPlan(item(contract));
    const result = await page.evaluate(async ({plan,data,rect})=>{
      const w = window as any, p = plan[0], url="https://fixture.invalid/missing.png";
      const group = objects=>({type:"group",objects});
      const img = {type:"image",src:url,width:16,height:16};
      const check = async objects=>(await w.checkDesignQuality(JSON.stringify({objects}),p.config,200,200)).status;
      const blocked = async f=> { try {await f();return false;}catch{return true;} };
      function fromFaces(entries) {
        const snap = JSON.parse(data.production_snapshot), docs = {};
        snap.coordinateFaces = {};
        for (const entry of entries) {
          const coords = {...p.coordinates,frame:{...p.coordinates.frame,surface:entry.face}};
          snap.coordinateFaces[entry.face] = coords;
          docs[entry.face] = JSON.stringify({width:200,height:200,coordinates:coords,objects:entry.objects});
        }
        return {...data,production_snapshot:JSON.stringify(snap),canvas_json:JSON.stringify(docs)};
      }
      const pack = await w.buildPackage("local",fromFaces([p,{...p,face:"back"}]));
      const sourceImage = {...img,originalAssetId:"fixture-original",src:"https://fixture.invalid/source.png",left:0,top:0};
      const groupPlan = [{...p,objects:[{type:"group",width:16,height:16,left:50,top:50,objects:[sourceImage]}]}];
      const withImage = await w.buildPackage("local",fromFaces(groupPlan));
      const imageZip = await w.JSZip.loadAsync(await withImage.zip.arrayBuffer());
      const imageManifest = JSON.parse(await imageZip.file("production-info.json").async("string"));
      const zip = await w.JSZip.loadAsync(await pack.zip.arrayBuffer());
      const manifest = JSON.parse(await zip.file("production-info.json").async("string"));
      const files = pack.files, expected = ["front","back"], sources=[{face:"front",url,type:"image"}];
      const archive = (outputs,raw,expectedRaw)=>w.generateProductionZip("o","d","p","v","1",outputs,raw,expected,expectedRaw);
      const goodRaw = [{...sources[0],blob:files[0].blob}];
      const good = await w.JSZip.loadAsync(await (await archive(files,goodRaw,sources)).arrayBuffer());
      const rawPath = JSON.parse(await good.file("production-info.json").async("string")).rawAssets[0].localFileName;
      return {names:Object.keys(zip.files).sort(),sizes:manifest.files.map(f=>[f.pixelWidth,f.pixelHeight]),
        statuses:await Promise.all([check([group([img])]),check([group([{type:"text",text:"x",fontFamily:"missing"}])]),
          check([{type:"text",fontFamily:"Inter",text:"sample"}]), check([rect,{...img,name:"mockup"}]),check([])]),
        negatives:await Promise.all([blocked(()=>archive(files.slice(1),[],[])),blocked(()=>archive(files,[],sources)),blocked(()=>w.buildPackage("local",fromFaces([{...p,objects:[{...rect,opacity:0}]}]))),
          blocked(()=>archive(files,sources,sources)),blocked(()=>archive([{...files[0],blob:new Blob(["broken"],{type:"image/png"})},files[1]],[],[])),
          blocked(()=>w.buildPackage("local",fromFaces([p,{...p,face:"back",objects:[group([img])]}])))]),
        rawPresent:!!good.file(rawPath), nestedIncluded:!!imageZip.file(imageManifest.rawAssets[0].localFileName)};
    },{plan,data:item(contract),rect});
    assert.deepEqual(result.names,["back-300dpi-print-layout.png","front-300dpi-print-layout.png","production-info.json"]);
    assert.deepEqual(result.sizes,[[300,300],[300,300]]);
    assert.deepEqual(result.statuses,["NOT_READY","NOT_READY","NOT_READY","READY","NOT_READY"]);
    assert.ok(result.negatives.every(Boolean)); assert.ok(result.rawPresent); assert.ok(result.nestedIncluded);
  } finally {await browser.close();}
});
