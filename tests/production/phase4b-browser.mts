import {fabric} from "../../kenditasarl-admin/node_modules/fabric";
import JSZip from "../../kenditasarl-admin/node_modules/jszip";
import {buildPackage} from "../../kenditasarl-admin/src/lib/production-job";
import {loadFontsForDesign} from "../../kenditasarl-admin/src/lib/fonts";
import {generateProductionZip, verifyProductionZip} from "../../kenditasarl-admin/src/lib/production-zip";

function sheet(w:number,h:number) {
  const el=document.createElement("canvas"); el.width=w; el.height=h; return el;
}
async function png(blob:Blob) {
  const image=await createImageBitmap(blob), el=sheet(image.width,image.height);
  el.getContext("2d")!.drawImage(image,0,0); image.close(); return el;
}
function pixels(el:HTMLCanvasElement) {return el.getContext("2d")!.getImageData(0,0,el.width,el.height).data;}
function sample(el:HTMLCanvasElement,x:number,y:number) {
  return Array.from(el.getContext("2d")!.getImageData(x,y,1,1).data);
}
function compare(a:HTMLCanvasElement,b:HTMLCanvasElement) {
  if (a.width!==b.width || a.height!==b.height) throw Error("dimension mismatch");
  const x=pixels(a),y=pixels(b), diff=sheet(a.width,a.height), ctx=diff.getContext("2d")!;
  const delta=ctx.createImageData(a.width,a.height);
  let bad=0,sum=0;
  for(let i=0;i<x.length;i+=4) {
    let d=Math.abs(x[i+3]-y[i+3]);
    for(let c=0;c<3;c++) d=Math.max(d,Math.abs(x[i+c]*x[i+3]-y[i+c]*y[i+3])/255);
    if(d>24) bad++;
    sum+=d;
    delta.data[i]=210;delta.data[i+1]=35;delta.data[i+2]=65;delta.data[i+3]=Math.min(255,Math.round(d*3));
  }
  ctx.putImageData(delta,0,0);
  return {bad,mean:sum/(a.width*a.height),difference:diff};
}
// Reference rasterizes the editor at native size before a Canvas2D crop given by the fixture.
async function reference(item:any,e:any) {
  const face=JSON.parse(JSON.parse(item.canvas_json)[e.face]);
  const el=sheet(face.width,face.height);
  const scene=await loadFontsForDesign({objects:e.indices.map((i:number)=>face.objects[i])});
  const editor=new fabric.StaticCanvas(el,{width:face.width,height:face.height,enableRetinaScaling:false,renderOnAddRemove:false});
  try {
    await new Promise<void>(done=>editor.loadFromJSON(scene,()=>done()));
    editor.renderAll();
    const expected=sheet(e.w,e.h),ctx=expected.getContext("2d")!;
    if(e.mirror) {ctx.translate(e.w,0);ctx.scale(-1,1);}
    const r=e.crop;ctx.drawImage(el,r.left,r.top,r.width,r.height,0,0,e.w,e.h);
    return expected;
  } finally {editor.dispose();}
}
function textProof(actual:HTMLCanvasElement) {
  function tight(el:HTMLCanvasElement) {
    const rgba=pixels(el);let x0=el.width,y0=el.height,x1=-1,y1=-1;
    for(let y=0;y<el.height;y++) for(let x=0;x<el.width;x++)
      if(rgba[(y*el.width+x)*4+3]>24) {x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(x1<x0) throw Error("empty text mask");
    const crop=sheet(x1-x0+1,y1-y0+1);
    crop.getContext("2d")!.drawImage(el,-x0,-y0);return crop;
  }
  return [["ğ ş ı İ ö ü ç","ltr",0,60],["سلام عليكم","rtl",60,87]].map(([value,dir,top,height])=>{
    const region=sheet(240,Number(height));
    region.getContext("2d")!.drawImage(actual,0,Number(top),240,Number(height),0,0,240,Number(height));
    const rendered=tight(region);
    function native(text:string) {
      const el=sheet(430,110),ctx=el.getContext("2d")!;
      ctx.font='34px "KT Print Cairo"';ctx.direction=dir as CanvasDirection;ctx.textAlign="left";
      ctx.fillStyle="#152738";ctx.fillText(text,8,70);return tight(el);
    }
    function distance(reference:HTMLCanvasElement) {
      let best=255;
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
        const aligned=sheet(rendered.width,rendered.height);
        aligned.getContext("2d")!.drawImage(reference,dx,dy);
        const a=pixels(aligned),b=pixels(rendered);let sum=0;
        for(let i=3;i<a.length;i+=4) sum+=Math.abs(a[i]-b[i]);
        best=Math.min(best,sum/(rendered.width*rendered.height));
      }
      return best;
    }
    const ref=native(String(value));
    return {value,width:rendered.width,height:rendered.height,referenceWidth:ref.width,referenceHeight:ref.height,
      alphaError:distance(ref),unjoined:dir==="rtl" ? distance(native(Array.from(String(value)).join("\u200c"))) : null};
  });
}
async function runFixture(f:any) {
  const {files,zip}=await buildPackage("synthetic-order",f.item);
  const archive=await JSZip.loadAsync(await zip.arrayBuffer(),{checkCRC32:true});
  const manifest=JSON.parse(await archive.file("production-info.json")!.async("string"));
  const shots=[];
  for(const e of f.expected) {
    const record=manifest.files.find((x:any)=>x.fileName===e.key+"-"+x.dpi+"dpi-print-layout.png");
    if(!record) throw Error("missing "+e.key);
    const blob=new Blob([await archive.file(record.fileName)!.async("arraybuffer")],{type:"image/png"});
    const actual=await png(blob), expected=await reference(f.item,e);
    const delta=compare(actual,expected);
    const coords = f.label==="origins" ? [[40,40],[140,160],[0,58],[199,52],[75,105]] :
      f.label==="shirt-proof" ? [[378,189],[850,189],[12,448],[500,390],[999,760]] :
      f.label==="garment" ? (e.key.endsWith("left_chest") ? [[14,14],[85,40],[1,1]] :
        e.key.endsWith("right_chest") ? [[10,26],[14,45],[80,70]] : e.face==="back" ? [[30,34],[1,1]] : [[10,12],[1,1]]) :
      f.label.startsWith("mug") || f.label==="handle" ? [[0,100],[2716,100],[230,330],[2470,410],[5,350],[2712,350]] : [[0,0],[419,159]];
    const probes=coords.map(([x,y])=>({x,y,rgba:sample(actual,x,y)}));
    const b64=(c:HTMLCanvasElement)=>c.toDataURL("image/png").split(",")[1];
    shots.push({key:e.key,hash:record.sha256,w:actual.width,h:actual.height,probes,bad:delta.bad,mean:delta.mean,
      expected:b64(expected),actual:b64(actual),diff:b64(delta.difference),text:f.label==="type" ? textProof(actual) : null});
  }
  const bytes=new Uint8Array(await zip.arrayBuffer());
  let binary="";
  for(let off=0;off<bytes.length;off+=16384) binary+=String.fromCharCode(...bytes.subarray(off,off+16384));
  return {shots,manifest,zip:btoa(binary),fileCount:files.length,entries:Object.keys(archive.files).filter(k=>!archive.files[k].dir)};
}
async function negatives(f:any) {
  const statuses:Record<string,string>={};
  async function reject(label:string, action:()=>Promise<any>) {
    try{await action();statuses[label]="RELEASED";}catch(e){statuses[label]=String((e as Error).message);}
  }
  function changed(fn:(doc:any,c:any,snap:any)=>void) {
    const item=structuredClone(f.item), docs=JSON.parse(item.canvas_json),snap=JSON.parse(item.production_snapshot);
    const doc=JSON.parse(docs.front),c=snap.coordinateFaces.front;fn(doc,c,snap);doc.coordinates=c;
    docs.front=JSON.stringify(doc);item.canvas_json=JSON.stringify(docs);item.production_snapshot=JSON.stringify(snap);return item;
  }
  const job=(item:any)=>buildPackage("synthetic-order",item);
  await reject("font",()=>job(changed(d=>{d.objects[0].fontFamily="Missing Font";})));
  await reject("glyph",()=>job(changed(d=>{d.objects[0].text="🧬";})));
  await reject("missingImage",()=>job(changed(d=>{d.objects[2].objects[0].src="https://print.fixture.invalid/missing.png";})));
  await reject("lowDpi",()=>job(changed(d=>{d.objects[2].objects[0].scaleX=8;})));
  await reject("degraded",()=>job(changed(d=>{d.objects[2].objects[0].src="https://print.fixture.invalid/degraded.png";})));
  await reject("mirror",()=>job(changed((d,c)=>{c.mirror=null;})));
  await reject("staleTemplate",()=>job(changed((d,c,s)=>{s.customization_config.faces.front.note="new revision";})));
  await reject("bleed",()=>job(changed((d,c,s)=>{s.customization_config.faces.front.printArea.bleed=3;})));
  await reject("ambiguous",()=>job(changed((d,c,s)=>{delete s.coordinateFaces.front;})));
  const {zip,files}=await job(f.item), archive=await JSZip.loadAsync(await zip.arrayBuffer());
  const m=JSON.parse(await archive.file("production-info.json")!.async("string"));
  const corrupt=new Uint8Array(await files[0].blob.arrayBuffer());corrupt[29]^=1;
  await reject("corruptPng",()=>generateProductionZip("o","d","p","v","1",[{...files[0],blob:new Blob([corrupt],{type:"image/png"})}],[],["front"],[]));
  await reject("aspect",()=>job(changed((d,c)=>{c.placements[0].widthCm*=2;})));
  await reject("truncatedZip",()=>verifyProductionZip(zip.slice(0,-32),m));
  archive.remove(m.files[0].fileName);
  await reject("missingPng",async()=>verifyProductionZip(await archive.generateAsync({type:"blob"}),m));
  return statuses;
}
Object.assign(window,{runFixture,negatives,buildPackage,proofZip:JSZip});
