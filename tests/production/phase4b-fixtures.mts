import { createHash } from "node:crypto";
import { templateRevision } from "../../src/lib/faceCoordinates";
export const original = "https://print.fixture.invalid/original.png?demo=synthetic";
const mark = (left,top,width,height,fill,extra={}) => ({type:"rect",left,top,width,height,fill,strokeWidth:0,...extra});
const area = (left,top,width,height) => ({left,top,width,height});
const slot = (id,rect,cm?) => ({id,rect,widthCm:cm?.[0] ?? rect.width*2.54/100,heightCm:cm?.[1] ?? rect.height*2.54/100});
const canvas = (surface,width,height,placements,objects,extra={}) => ({surface,width,height,placements,objects,space:"FULL_MOCKUP_NATIVE",mirror:"NONE",dpi:100,...extra});
const single = (rect) => [slot("face",rect)];
async function order(label, surfaces) {
  const config = {faces:Object.fromEntries(surfaces.map(s=>[s.surface,{printArea:{
    ...area(0,0,s.width,s.height),nativeWidth:s.width,nativeHeight:s.height,targetDPI:s.dpi,
    printMethod:s.method || "DTF",mirrorHorizontal:s.mirror==="OUTPUT_HORIZONTAL",...(s.safe && {safeArea:s.safe})}}]))};
  const revision = await templateRevision(config), faces={}, docs={};
  for (const s of surfaces) {
    const c = {frame:{version:1,surface:s.surface,space:s.space,width:s.width,height:s.height,templateRevision:revision},
      referenceFace:s.surface,placements:s.placements,mirror:s.mirror,printMethod:s.method||"DTF",targetDPI:s.dpi};
    faces[s.surface]=c;
    docs[s.surface]=JSON.stringify({objects:s.objects,width:s.width,height:s.height,coordinates:c,viewportTransform:[2,0,0,2,66,44]});
  }
  const canvas_json=JSON.stringify(docs), production_snapshot=JSON.stringify({snapshotVersion:1,coordinateFaces:faces,customization_config:config});
  return {id:label,design_id:"design-"+label,variant_id:"red_M",product_id:"synthetic",schema_version:1,is_immutable_snapshot:true,
    art_version:createHash("sha256").update(canvas_json+production_snapshot).digest("hex"),canvas_json,production_snapshot};
}
export async function fixtures() {
  const red="#d02040", blue="#1456d9", green="#11994c", yellow="#f3ab19";
  const box=area(100,120,200,200);
  const shared=[mark(140,160,10,12,red),mark(92,176,18,12,blue),mark(294,170,30,10,green),
    mark(0,0,400,380,"#000",{name:"mockup"})];
  // The reference crop and layer indices below are hand specified for each design.
  const spec=(face,key,crop,indices,w,h,mirror=false)=>({face,key,crop,indices,w,h,mirror});
  const results=[];
  async function add(label,surfaces,expected) {results.push({label,item:await order(label,surfaces),expected});}
  await add("origins",[canvas("native",400,380,single(box),shared),canvas("local",200,200,single(box),shared,{space:"PRINT_AREA_LOCAL"})],
    [spec("native","native",box,[0,1,2],200,200),spec("local","local",area(0,0,200,200),[0,1,2],200,200)]);
  const left=area(20,24,100,100),right=area(100,24,100,100);
  const front=[mark(32,35,26,22,red,{assignedPlacementId:"left_chest"}),
    mark(108,46,25,24,blue,{assignedPlacementId:"right_chest"}),
    mark(101,60,24,18,green,{assignedPlacementId:"left_chest"})];
  const back=area(15,10,120,80),sleeve=area(30,14,64,64);
  await add("garment",[canvas("front",240,180,[slot("left_chest",left),slot("right_chest",right)],front),
    canvas("back",160,110,single(back),[mark(44,42,20,14,yellow)]),
    canvas("left_sleeve",120,100,single(sleeve),[mark(38,24,12,32,green)])],
    [spec("front","front~left_chest",left,[0,2],100,100),spec("front","front~right_chest",right,[1],100,100),
      spec("back","back",back,[0],120,80),spec("left_sleeve","left_sleeve",sleeve,[0],64,64)]);
  const print=area(40,60,250,200);
  const crosses=[120,220].flatMap(x=>[mark(x-7,99,15,2,red),mark(x-1,93,2,15,red)]);
  const clip={type:"rect",originX:"left",originY:"top",absolutePositioned:true,strokeWidth:0,left:40,top:60,width:250,height:200};
  await add("shirt-proof",[canvas("front",340,310,[slot("front_register",print,[10,8])],
    [...crosses,mark(32,150,30,12,blue,{clipPath:clip}),mark(245,215,22,17,green)],{dpi:300})],
    [spec("front","front~front_register",print,[0,1,2,3,4,5],1181,945)]);
  const wrap=area(0,0,1840,760),wrapSlot=[slot("mug_full_wrap",wrap,[23,9.5])];
  const stripe=[mark(0,60,1840,30,blue),mark(100,180,130,200,red),mark(1550,250,150,90,green)];
  for (const flip of [false,true]) {
    const key=flip?"mug-mirror":"mug";
    await add(key,[canvas("mug_full_wrap",1840,760,wrapSlot,stripe,{space:"STANDALONE_SURFACE",mirror:flip?"OUTPUT_HORIZONTAL":"NONE",dpi:300,method:"Sublimation"})],
      [spec("mug_full_wrap","mug_full_wrap~mug_full_wrap",wrap,[0,1,2],2717,1122,flip)]);
  }
  await add("handle",[canvas("mug_full_wrap",1840,760,wrapSlot,stripe.slice(1),{space:"STANDALONE_SURFACE",dpi:300,method:"Sublimation",
    safe:area(80,50,1680,660)})],[spec("mug_full_wrap","mug_full_wrap~mug_full_wrap",wrap,[0,1],2717,1122)]);
  const paper=area(20,10,420,160);
  const text=(left,top,value,direction="ltr")=>({type:"text",left,top,text:value,fontFamily:"Cairo",fontSize:34,fontWeight:"normal",direction,fill:"#152738",strokeWidth:0});
  const nested={type:"group",left:290,top:96,width:66,height:42,angle:-13,objects:[
    {type:"image",src:original,originalAssetId:"synthetic-source",width:64,height:40,left:-32,top:-20,scaleX:0.65,scaleY:0.65,flipX:true},
    {type:"group",left:4,top:0,width:40,height:20,angle:8,objects:[{...text(-20,-10,"İş"),fontSize:16}]}]};
  // Source density 200 dpi at 1:1, output samples the original frame at 1:1 as well.
  const textSlot=[slot("face",paper,[420*2.54/200,160*2.54/200])];
  for (const flip of [false,true]) {
    await add(flip?"type-mirror":"type",[canvas("front",470,200,textSlot,[
      text(42,15,"ğ ş ı İ ö ü ç"),text(42,70,"سلام عليكم","rtl"),nested],{dpi:200,mirror:flip?"OUTPUT_HORIZONTAL":"NONE"})],
      [spec("front","front",paper,[0,1,2],420,160,flip)]);
  }
  return results;
}
