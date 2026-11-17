import sharp from "sharp";
import { SaxesParser } from "saxes";

const fileLimit = 10 * 1024 * 1024;
const svgTags = new Set("svg g defs path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern symbol use image style marker".split(" "));
const svgAttributes = new Set(("xmlns xmlns:xlink version id class style viewBox preserveAspectRatio width height x y x1 y1 x2 y2 cx cy r rx ry d points transform opacity fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit clip-path clip-rule mask offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr href xlink:href font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline dx dy letter-spacing xml:space color display visibility vector-effect paint-order shape-rendering stroke-linejoin patternUnits patternContentUnits patternTransform maskUnits maskContentUnits clipPathUnits markerWidth markerHeight refX refY orient markerUnits marker-start marker-mid marker-end").split(" "));

class InvalidUpload extends Error {
  status: number;
  constructor(status: number) { super(); this.status = status; }
}
function invalid(status = 400): never { throw new InvalidUpload(status); }

// Accept static vector artwork and local paint references. No external loads, scripts or XML directives.
function validateSvg(bytes: Buffer) {
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  const safeCss = (value: string) => {
    const plain = value.replace(/url\(\s*['"]?#[\w.:-]+['"]?\s*\)/gi, "");
    const functions = plain.matchAll(/([\w-]+)\s*\(/g);
    for (const [, fn] of Array.from(functions)) {
      if (!/^(?:rgba?|hsla?|matrix|translate|scale|rotate|skew[XY])$/i.test(fn)) invalid(415);
    }
    if (/[^\w\s.,#%:;(){}*+>\-'"\/]|\/\*|(?:https?|data):/i.test(plain)) invalid(415);
  };
  let inStyle = false;
  let styleText = "";
  parser.on("doctype", () => invalid(415));
  parser.on("xmldecl", decl => { if (decl.encoding && !/^utf-8$/i.test(decl.encoding)) invalid(415); });
  parser.on("processinginstruction", () => invalid(415));
  parser.on("opentag", tag => {
    if (inStyle || (!depth && tag.name !== "svg") || ++depth > 100 || tag.uri !== "http://www.w3.org/2000/svg" || !svgTags.has(tag.name)) invalid(415);
    for (const attribute of Object.values(tag.attributes)) {
      const { name, value } = attribute;
      if (!svgAttributes.has(name)) invalid(415);
      if (name === "xmlns" || name === "xmlns:xlink") continue;
      if (name === "href" || name === "xlink:href") {
        if (!/^#[\w.:-]+$/.test(value) && !(tag.name === "image" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))) invalid(415);
      } else if (name !== "id" && name !== "class") safeCss(value);
    }
    inStyle = tag.name === "style";
  });
  parser.on("text", value => { if (inStyle) styleText += value; });
  parser.on("cdata", value => { if (inStyle) styleText += value; });
  parser.on("closetag", () => {
    if (inStyle) safeCss(styleText);
    inStyle = false;
    styleText = "";
    depth--;
  });
  parser.write(xml).close();
}

async function validateImage(bytes: Buffer, mime: string) {
  if (!bytes.length) invalid();
  if (bytes.length > fileLimit) invalid(413);
  const formats: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/webp": "webp", "image/svg+xml": "svg",
  };
  if (!Object.hasOwn(formats, mime)) invalid(415);
  try {
    if (mime === "image/svg+xml") { validateSvg(bytes); return; }
    // Check the signature before giving a raster decoder any untrusted input.
    const format = formats[mime];
    if (format === "png" && !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) invalid(415);
    if (format === "jpeg" && !bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) invalid(415);
    if (format === "webp" && (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP")) invalid(415);
    const image = sharp(bytes, { limitInputPixels: 64000000, failOn: "warning" });
    if ((await image.metadata()).format !== format) invalid(415);
    await image.resize(1, 1).raw().toBuffer();
  } catch { invalid(415); }
}

// Count bytes while reading, including requests without a Content-Length header.
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) invalid(413);
  if (!request.body) invalid();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); invalid(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export function errorResponse(error: unknown) {
  const status = error instanceof InvalidUpload ? error.status : 503;
  return Response.json({ error: "upload_failed" }, { status, headers: { "Cache-Control": "no-store" } });
}

type UploadServices = {
  authorize: (request: Request, adminOnly: boolean) => Promise<string | number>;
  upload: (bytes: Buffer, folder: string, uid: string) => Promise<{ url: string; public_id: string }>;
};

export async function handleUpload(request: Request, adminOnly: boolean, services: UploadServices) {
  try {
    const uid = await services.authorize(request, adminOnly);
    if (typeof uid === "number") invalid(uid);
    const type = request.headers.get("content-type") || "";
    let bytes: Buffer, mime: string;
    let folder = "kenditasarl_products";
    if (/^multipart\/form-data\s*;/i.test(type)) {
      const raw = await boundedBody(request, fileLimit + 16384);
      let form: FormData;
      try { form = await new Response(new Uint8Array(raw), { headers: { "content-type": type } }).formData(); }
      catch { invalid(); }
      for (const key of Array.from(form.keys())) {
        if (key !== "file" && !(adminOnly && key === "folder")) invalid();
      }
      const file = form.get("file");
      if (!file || typeof file === "string" || form.getAll("file").length !== 1) invalid();
      if (adminOnly) {
        const target = form.get("folder") ?? "kenditasarla";
        if (typeof target !== "string" || !["products/gallery", "stickers", "prints", "kenditasarla"].includes(target) || form.getAll("folder").length > 1) invalid();
        folder = target;
      }
      bytes = Buffer.from(await file.arrayBuffer());
      mime = file.type;
    } else if (!adminOnly && /^application\/json(?:\s*;|$)/i.test(type)) {
      const raw = await boundedBody(request, Math.ceil(fileLimit / 3) * 4 + 1024);
      let data;
      try { data = JSON.parse(raw.toString("utf8")); } catch { invalid(); }
      if (!data || typeof data !== "object" || Object.keys(data).length !== 1) invalid();
      const [key] = Object.keys(data);
      if (!["image", "file", "dataUrl"].includes(key) || typeof data[key] !== "string") invalid();
      const comma = data[key].indexOf(",");
      const match = /^data:(image\/[a-z+]+);base64$/i.exec(data[key].slice(0, comma));
      if (!match) invalid(415);
      const encoded = data[key].slice(comma + 1);
      if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) invalid();
      bytes = Buffer.from(encoded, "base64");
      mime = match[1].toLowerCase();
    } else invalid(415);
    await validateImage(bytes, mime);
    const result = await services.upload(bytes, folder, uid);
    return Response.json({ success: true, url: result.url, public_id: result.public_id });
  } catch (error) { return errorResponse(error); }
}
