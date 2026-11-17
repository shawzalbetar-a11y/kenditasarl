import { effectivePolicy, type PrintTemplate } from "../printTemplate";
import { editorFrame, faceCoordinates } from "../faceCoordinates";
import { createHash } from "node:crypto";
import { isColorMatch } from "../colorTranslations";
import {
  getPlacementsForGarment,
  isFaceMatching,
} from "../printPlacementConfig";
import {
  calculateCustomProductPrice,
  DEFAULT_PRICING_CONFIG,
} from "../pricing";
import { freePlacementBounds, placementBounds } from "../placementBounds";
import {
  resolveMugMeta,
  resolveProductStudioProfile,
} from "../productStudioProfile";

type Data = Record<string, any>;
export class CheckoutError extends Error {
  status: number;
  line?: string;
  constructor(code: string, status = 409) {
    super(code);
    this.status = status;
  }
}
export function check(
  condition: unknown,
  code = "NEEDS_REVIEW",
  status = 409,
): asserts condition {
  if (!condition) throw new CheckoutError(code, status);
}
export function id(value: unknown): string {
  check(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 150 &&
      !/[\/\\\x00-\x1f]/.test(value) &&
      value !== "." &&
      value !== "..",
    "INVALID",
    400,
  );
  return value;
}
export function digest(value: unknown) {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, v[k]]),
            )
          : v,
      ),
    )
    .digest("hex");
}
export function money(value: unknown) {
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1e7,
  );
  return Math.round((value + Number.EPSILON) * 100);
}
function decode(value: any): Data {
  for (let i = 0; i < 3 && typeof value === "string"; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      throw new CheckoutError("NEEDS_REVIEW");
    }
  }
  check(value && typeof value === "object" && !Array.isArray(value));
  return value;
}

export function settings(data: Data) {
  const defaults = DEFAULT_PRICING_CONFIG;
  const source = data.customization || {};
  const prices = (base: Data, overrides: Data) =>
    Object.fromEntries(
      Object.entries({ ...base, ...overrides }).map(([k, v]) => [k, money(v)]),
    );
  const rules = {
    ...defaults.customization.placement_rules!,
    ...source.placement_rules,
  };
  return {
    customization: {
      ...defaults.customization,
      ...source,
      face_prices: prices(
        defaults.customization.face_prices,
        source.face_prices,
      ),
      placement_prices: prices(
        defaults.customization.placement_prices!,
        source.placement_prices,
      ),
      placement_rules: {
        ...rules,
        extra_placement_same_face_price: money(
          rules.extra_placement_same_face_price,
        ),
        free_mode_fee: money(rules.free_mode_fee),
      },
      extra_text_price: money(
        source.extra_text_price ?? defaults.customization.extra_text_price,
      ),
      custom_upload_image_price: money(
        source.custom_upload_image_price ??
          defaults.customization.custom_upload_image_price,
      ),
    },
    delivery: {
      ...defaults.delivery,
      ...data.delivery,
      express: { ...defaults.delivery.express, ...data.delivery?.express },
    },
  };
}

const studioFonts = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "Arial",
  "Cairo",
  "Montserrat",
  "Playfair Display",
  "Changa",
  "Alexandria",
  "Almarai",
  "Amiri",
  "Anton",
  "Aref Ruqaa",
  "Arial",
  "Bebas Neue",
  "Cairo",
  "Changa",
  "El Messiri",
  "Inter",
  "Lalezar",
  "Marhey",
  "Montserrat",
  "Open Sans",
  "Oswald",
  "Pacifico",
  "Permanent Marker",
  "Playfair Display",
  "Readex Pro",
  "Reem Kufi",
  "Righteous",
  "Roboto",
  "Rubik",
  "Tajawal",
  "Ubuntu",
]);
function font(value: unknown) {
  check(
    typeof value === "string" &&
      value
        .split(",")
        .every((f) => studioFonts.has(f.trim().replace(/^['"]|['"]$/g, ""))),
  );
}
function fitsPrintZone(obj: Data, zone: Data) {
  const {
    left,
    top,
    width,
    height,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    originX = "left",
    originY = "top",
  } = obj;
  check(
    [left, top, width, height, scaleX, scaleY, angle].every(Number.isFinite) &&
      width >= 0 &&
      height >= 0 &&
      !obj.skewX &&
      !obj.skewY &&
      !obj.transformMatrix,
  );
  const w = (width + (obj.strokeWidth ?? 0)) * Math.abs(scaleX),
    h = (height + (obj.strokeWidth ?? 0)) * Math.abs(scaleY);
  const anchors: Record<string, number> = {
    left: 0,
    top: 0,
    center: 0.5,
    right: 1,
    bottom: 1,
  };
  check(Object.hasOwn(anchors, originX) && Object.hasOwn(anchors, originY));
  const a = (angle * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([x, y]) => {
    const dx = (x - anchors[originX]) * w,
      dy = (y - anchors[originY]) * h;
    return [left + dx * c - dy * s, top + dx * s + dy * c];
  });
  const inside = (x: number, y: number) =>
    x >= zone.left - 0.02 &&
    x <= zone.left + zone.width + 0.02 &&
    y >= zone.top - 0.02 &&
    y <= zone.top + zone.height + 0.02;
  if (!obj.clipPath) return corners.every(([x, y]) => inside(x, y));
  const clip = obj.clipPath;
  if (
    !clip ||
    clip.absolutePositioned !== true ||
    (clip.scaleX ?? 1) !== 1 ||
    (clip.scaleY ?? 1) !== 1 ||
    clip.skewX ||
    clip.skewY ||
    clip.angle ||
    clip.transformMatrix ||
    (clip.originX ?? "left") !== "left" ||
    (clip.originY ?? "top") !== "top" ||
    ![clip.left, clip.top, clip.width, clip.height].every(Number.isFinite) ||
    clip.width <= 0 ||
    clip.height <= 0 ||
    !inside(clip.left, clip.top) ||
    !inside(clip.left + clip.width, clip.top + clip.height)
  )
    return false;
  return (
    Math.max(...corners.map((p) => p[0])) > clip.left &&
    Math.min(...corners.map((p) => p[0])) < clip.left + clip.width &&
    Math.max(...corners.map((p) => p[1])) > clip.top &&
    Math.min(...corners.map((p) => p[1])) < clip.top + clip.height
  );
}

export type Art = {
  canvas_json: string;
  production_snapshot: string;
  selected_placement_ids: string[];
  placement_mode: string;
  print_method: string | null;
};
type Resource = (
  obj: Data,
) => Promise<{ id: string; url: string; price: number; upload: boolean }>;
export async function artwork(
  design: Data,
  variant: Data,
  color: string,
  product: Data,
  resource: Resource,
  explicitSource?: string,
) {
  const snapshot = decode(design.production_snapshot);
  const config = product.customization_config;
  check(
    config?.faces && config.enabled !== false && snapshot.snapshotVersion === 1,
  );
  const template:PrintTemplate | undefined = config.builderTemplate;
  if(template) {
    check(snapshot.customization_config?.builderRevision === config.builderRevision);
    check(design.placement_mode !== "free" || template.allowFreeMode);
  }
  const usedPlacements = new Set<string>();
  const totals = {elements:0, uploads:0};
  const raw = decode(design.canvas_json);
  const faces: Data = {};
  const sources = new Set<string>();
  for (const key of Object.keys(raw))
    if (key.includes(":::")) sources.add(key.split(":::")[0]);
  const exact = Array.from(sources).filter(
    (c) => isColorMatch(c, variant) || c.toLowerCase() === color.toLowerCase(),
  );
  check(exact.length <= 1);
  const source =
    exact[0] ??
    explicitSource ??
    (sources.size === 1 ? Array.from(sources)[0] : undefined);
  if (source) check(sources.has(source));
  else
    check(
      !sources.size &&
        isColorMatch(design.color ?? design.variant_id?.split("_")[0], variant),
    );
  const byColor = design.placements_by_color || {};
  const perColor = design.sync_placements_across_colors
    ? (byColor.synced_all ?? byColor.__synced__)
    : byColor[source ?? color.toLowerCase()];
  const originalSelection = design.selected_placement_ids ?? [];
  check(
    perColor !== undefined ||
      !originalSelection.length ||
      sources.size <= 1 ||
      design.sync_placements_across_colors ||
      source === design.color,
  );
  const selected = perColor ?? originalSelection;
  check(
    Array.isArray(selected) && selected.every((p) => typeof p === "string"),
  );
  const placements = getPlacementsForGarment(
    config.garmentType || product.category,
  );
  const { family } = resolveProductStudioProfile({ ...product, config });
  const valid = (p: string, face?: string) =>
    placements.some(
      (v) => (!template || config.allowedPlacements.includes(p)) && v.id === p && (!face || isFaceMatching(v.targetFace, face)),
    );
  check(selected.every((p) => valid(p)));
  const flat: Data = {};
  const sourceKeys: Record<string, string> = {};
  let count = 0;
  const printAreas: Data = {};
  const coordinateFaces: Data = {};
  const revision = digest(config);
  const inherited = new Set<string>();
  if (source) {
    const rawKeys = Object.keys(raw).filter((k) => k.includes(":::"));
    for (const placement of selected) {
      const target = placements.find((p) => p.id === placement)!.targetFace;
      const candidates = rawKeys.filter((k) =>
        isFaceMatching(target, k.split(":::")[1]),
      );
      if (
        candidates.some((k) => k.startsWith(source + ":::")) ||
        !candidates.length
      )
        continue;
      check(candidates.length === 1);
      inherited.add(candidates[0]);
    }
  }
  for (const [key, encoded] of Object.entries(raw)) {
    const parts = key.split(":::");
    if (parts.length === 2 && parts[0] !== source && !inherited.has(key))
      continue;
    if (
      parts.length === 1 &&
      sources.size &&
      !isColorMatch(design.color, variant)
    )
      continue;
    check(parts.length <= 2);
    const face = parts[parts.length - 1];
    check(
      /^[a-zA-Z0-9_-]{1,64}$/.test(face) &&
        !Object.hasOwn(faces, face) &&
        !Object.hasOwn(Object.prototype, face),
    );
    const canonical = face === "mug_full_wrap" ? "front" : face;
    const faceId = Object.keys(config.faces).find(
      (f) => isFaceMatching(f, canonical) || f === canonical,
    );
    check(faceId && config.faces[faceId].enabled !== false);
    const area = config.faces[faceId].printArea;
    const saved =
      snapshot.printAreas?.[faceId] ??
      snapshot.customization_config?.faces?.[faceId]?.printArea;
    check(
      area &&
        saved &&
        ["width", "height", "left", "top"].every(
          (k) => Number.isFinite(area[k]) && saved[k] === area[k],
        ) &&
        area.width > 0 &&
        area.height > 0,
    );
    printAreas[faceId] = area;
    const content = decode(encoded);
    check(Array.isArray(content.objects));
    if(content.mugPanoramaSheet) check(face==="mug_full_wrap" && family==="mug");
    if(face==="mug_full_wrap") check(content.width===1840 && content.height===760);
    for(const [key,nativeKey] of [["width","nativeWidth"],["height","nativeHeight"]]) {
      if(content[key]===undefined) continue;
      const native=area[nativeKey] ?? config.faces[faceId][nativeKey];
      check(Number.isFinite(content[key]) && content[key]>0 && content[key]<=16384);
      if(native && face!=="mug_full_wrap") check(content[key]===native);
    }
    const billable: Data[] = [];
    const surface = template?.faces.find(f=>f.id===faceId);
    if(template) check(surface && (face===surface.id || face==="mug_full_wrap") && (surface.space==="STANDALONE_SURFACE") === (face==="mug_full_wrap"));
    const usage = new Map<string,{elements:number,uploads:number,roots:number}>();
    const visit = async (obj: Data, depth: number, parentId?:string): Promise<Data | null> => {
      check(
        obj && typeof obj.type === "string" && depth <= 12 && ++count <= 1000,
      );
      if (
        ["mockup", "background", "guideline", "print_area_guide"].includes(
          obj.name,
        )
      )
        return null;
      check(
        [
          "textbox",
          "text",
          "i-text",
          "image",
          "group",
          "path",
          "rect",
          "circle",
          "ellipse",
          "line",
          "polygon",
          "polyline",
          "triangle",
        ].includes(obj.type),
      );
      const selection = selected.filter(p=>valid(p,canonical));
      const assigned = depth ? parentId : design.placement_mode==="free" ? surface?.placements[0]?.id :
        obj.assignedPlacementId || obj.placementId || (selection.length===1 ? selection[0] : undefined);
      const spec = surface?.placements.find(p=>p.id===assigned);
      const policy = template && effectivePolicy(template.policy,spec?.policy);
      const used = usage.get(assigned) ?? {elements:0,uploads:0,roots:0};
      if(template && policy) {
        check(spec && (design.placement_mode==="free" || selection.includes(spec.id)));
        usedPlacements.add(spec.id);
        check([obj.assignedPlacementId,obj.placementId].every(v=>!v || v===assigned));
        check(++totals.elements<=template.policy.maxElements && ++used.elements<=policy.maxElements);
        if(!depth)check(++used.roots===1 || policy.allowLayers);
        if(obj.type==="group")check(policy.allowLayers);
        if(["text","textbox","i-text"].includes(obj.type))check(policy.allowText);
        else if(obj.type!=="image" && obj.type!=="group")check(policy.allowStickers);
        usage.set(assigned,used);
      }
      const clean = { ...obj };
      if (clean.clipPath) {
        const clip = clean.clipPath;
        check(
          clip.type === "rect" &&
            !clip.inverted &&
            !clip.clipPath &&
            !/https?:|data:|"src"|"source"/i.test(JSON.stringify(clip)),
        );
      }
      check(!clean.filters?.length && !clean.resizeFilter);
      for (const k of [
        "assetPrice",
        "assetId",
        "originalAssetId",
        "originalAssetUrl",
        "assetName",
        "isCustomUpload",
        "filters",
        "resizeFilter",
      ])
        delete clean[k];
      // Reject unrecognized resource carriers instead of feeding them to Fabric's loaders.
      for (const [k, v] of Object.entries(clean)) {
        if (["src", "objects", "text", "styles"].includes(k)) continue;
        check(
          !/https?:|data:|url\s*\(/i.test(JSON.stringify(v)) &&
            !(v && typeof v === "object" && !Array.isArray(v) && "source" in v),
        );
      }
      if (clean.styles)
        check(
          !/https?:|data:|url\s*\(|"source"|"src"/i.test(
            JSON.stringify(clean.styles),
          ),
        );
      if (clean.fontFamily) font(clean.fontFamily);
      for (const row of Object.values(clean.styles ?? {}) as Data[]) {
        for (const style of Object.values(row) as Data[])
          if (style?.fontFamily) font(style.fontFamily);
      }
      if (!depth) {
        const selection = selected.filter((p) => valid(p, canonical));
        const pid =
          clean.assignedPlacementId ||
          clean.placementId ||
          (selection.length === 1 ? selection[0] : undefined);
        check(pid || selection.length < 2 || design.placement_mode === "free");
        const calibrated = config.calibratedPlacements?.[pid];
        const nw =
          area.nativeWidth ??
          config.faces[faceId].nativeWidth ??
          calibrated?.nativeWidth;
        const nh =
          area.nativeHeight ??
          config.faces[faceId].nativeHeight ??
          calibrated?.nativeHeight;
        let zone = area;
        if (face === "mug_full_wrap") {
          check(family === "mug");
          zone = { left: 0, top: 0, width: 1840, height: 760 };
        } else if (pid || design.placement_mode === "free") {
          check(Number.isFinite(nw) && nw > 0 && Number.isFinite(nh) && nh > 0);
          if (design.placement_mode === "free")
            zone = freePlacementBounds(config, family, faceId, nw, nh);
          else {
            const spec = placements.find((p) => p.id === pid);
            check(spec && valid(spec.id, canonical));
            const b = placementBounds(
              spec,
              config,
              family,
              faceId,
              nw,
              nh,
              false,
            );
            zone = {
              left: b.fabricLeft,
              top: b.fabricTop,
              width: b.fabricWidth,
              height: b.fabricHeight,
            };
            clean.assignedPlacementId = spec.id;
          }
        }
        check(fitsPrintZone(clean, zone));
        // Fabric can derive geometry from a path or group. Bound those derived pixels too.
        if (!clean.clipPath) clean.clipPath = {
          type:"rect",absolutePositioned:true,originX:"left",originY:"top",
          left:zone.left,top:zone.top,width:zone.width,height:zone.height,strokeWidth:0,
        };
      }
      for (const p of [clean.assignedPlacementId, clean.placementId].filter(
        Boolean,
      ))
        check(valid(p, canonical));
      if (
        obj.type === "image" ||
        obj.name === "sticker" ||
        obj.assetId ||
        obj.originalAssetId
      ) {
        const asset = await resource(obj);
        if(template && policy) {
          check(asset.upload ? policy.allowCustomerUpload : policy.allowStickers);
          if(asset.upload)check(++totals.uploads<=template.policy.maxUploads && ++used.uploads<=policy.maxUploads);
        }
        clean.originalAssetId = asset.id;
        clean.isCustomUpload = asset.upload;
        clean.assetPrice = asset.price;
        clean.name = asset.upload ? "user_upload" : "sticker";
        if (obj.type === "image") clean.src = asset.url;
      } else check(!clean.src);
      if (obj.objects) {
        check(obj.type === "group" && Array.isArray(obj.objects));
        clean.objects = [];
        for (const child of obj.objects) {
          const c = await visit(child, depth + 1, assigned);
          if (c) clean.objects.push(c);
        }
      }
      if(template && design.placement_mode==="free"){
        // The immutable free-mode frame has one output bucket named "free".
        delete clean.assignedPlacementId;
        delete clean.placementId;
      }
      if (
        !clean.objects?.length ||
        clean.assetPrice > 0 ||
        clean.assignedPlacementId ||
        clean.placementId
      )
        billable.push({
          ...clean,
          objects: undefined,
          assetPrice: money(clean.assetPrice ?? 0),
        });
      return clean;
    };
    const objects = [];
    for (const obj of content.objects) {
      const c = await visit(obj, 0);
      if (c) objects.push(c);
    }
    if (!objects.length) continue;
    const normalized: Data = { objects };
    for (const field of ["width", "height", "version", "mugPanoramaSheet"])
      if (content[field] !== undefined) normalized[field] = content[field];
    if (content.coordinates) {
      const wrap = face === "mug_full_wrap";
      const frame = editorFrame(face, wrap, content.width, content.height, revision);
      const nativeWidth = area.nativeWidth ?? config.faces[faceId].nativeWidth;
      const nativeHeight = area.nativeHeight ?? config.faces[faceId].nativeHeight;
      const trustedBasis = wrap ? content.mugPanoramaSheet === true && selected.includes("mug_full_wrap")
        : nativeWidth === content.width && nativeHeight === content.height;
      const ids = Array.from(new Set<string>([...selected, ...objects.map(o => o.assignedPlacementId || o.placementId).filter(Boolean)]));
      const trusted = frame && trustedBasis && faceCoordinates(frame, config, family, product.category,
        ids, design.placement_mode === "free", design.print_method ?? config.defaultPrintMethod ?? null);
      // Preserve checkout for an unverified reference; production requires a verified entry.
      if (trusted && trusted.placements.every(({rect:r}) => Number.isFinite(r.left) && Number.isFinite(r.top) &&
          r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0 && r.left + r.width <= content.width && r.top + r.height <= content.height) &&
          digest(content.coordinates) === digest(trusted)) {
        normalized.coordinates = trusted;
        coordinateFaces[face] = trusted;
      }
    }
    if(template) check(normalized.coordinates);
    faces[face] = JSON.stringify(normalized);
    flat[face] = { objects: billable };
    sourceKeys[face] = key;
  }
  check(Object.keys(faces).length);
  if(template && design.placement_mode!=="free")check(selected.length===new Set(selected).size && selected.every(p=>usedPlacements.has(p)));
  const method = design.print_method ?? config.defaultPrintMethod ?? null;
  if (method) check(["DTF", "Sublimation"].includes(method));
  if (method && config.allowedPrintMethods)
    check(config.allowedPrintMethods.includes(method));
  const art: Art = {
    canvas_json: JSON.stringify(faces),
    production_snapshot: JSON.stringify({
      snapshotVersion: 1,
      editorVersion: 1,
      customization_config: config,
      printAreas,
      ...(Object.keys(coordinateFaces).length ? { coordinateFaces } : {}),
      selectedPlacementIds: selected,
      ...(family === "mug"
        ? { mug_meta: template?.mugMeta ?? resolveMugMeta({ ...product, config }) }
        : {}),
    }),
    selected_placement_ids: selected,
    placement_mode: design.placement_mode === "free" ? "free" : "standard",
    print_method: method,
  };
  return { art, flat, sourceKeys };
}

export function priceCustom(
  base: number,
  flat: Data,
  art: Art,
  config: ReturnType<typeof settings>,
  garmentType: string,
  locale: string,
) {
  const calc = calculateCustomProductPrice({
    basePrice: base,
    facesData: flat,
    selectedPlacementIds: art.selected_placement_ids,
    isFreeMode: art.placement_mode === "free",
    pricingConfig: config,
    garmentType,
    locale,
  });
  const minor = Math.round(calc.totalPrice / 100) * 100;
  const parts: { type: string; id: string; minor: number; label?: string }[] =
    calc.breakdown.map((p) => ({
      type: p.type,
      id: p.id,
      minor: p.price,
      label: p.name,
    }));
  if (minor !== calc.totalPrice)
    parts.push({
      type: "rounding",
      id: "rounding",
      minor: minor - calc.totalPrice,
    });
  return { minor, parts };
}
