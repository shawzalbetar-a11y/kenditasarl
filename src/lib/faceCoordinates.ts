import { placementBounds, freePlacementBounds } from "./placementBounds";
import { getPlacementsForGarment, isFaceMatching } from "./printPlacementConfig";

export type CoordinateSpace = "FULL_MOCKUP_NATIVE" | "PRINT_AREA_LOCAL" | "STANDALONE_SURFACE";
export type EditorFrame = {
  version: 1; space: CoordinateSpace; surface: string; width: number; height: number; templateRevision: string;
};

export function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
}

export async function templateRevision(config: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(config));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function editorFrame(surface: string, panorama: boolean, width: number, height: number,
  revision: string, loaded?: EditorFrame | null): EditorFrame | null {
  if (!revision || !Number.isFinite(width) || !Number.isFinite(height) || Math.min(width, height) <= 0) return null;
  const frame: EditorFrame = {version: 1, surface: panorama ? "mug_full_wrap" : surface,
    space: panorama ? "STANDALONE_SURFACE" : "FULL_MOCKUP_NATIVE", width, height, templateRevision: revision};
  if (panorama && (width !== 1840 || height !== 760)) return null;
  if (loaded !== undefined && canonicalJson(loaded) !== canonicalJson(frame)) return null;
  return frame;
}

export function faceCoordinates(frame: EditorFrame, config: any, family: string, garment: string,
  placementIds: string[], free: boolean, method: string | null) {
  const wrap = frame.space === "STANDALONE_SURFACE";
  const canonical = wrap ? "front" : frame.surface;
  const face = Object.keys(config?.faces || {}).find(f => f === canonical || isFaceMatching(f, canonical));
  if (!face) return null;
  const area = config.faces[face]?.printArea;
  if (!area) return null;
  const specs = getPlacementsForGarment(config.garmentType || garment);
  const selected = specs.filter(s => placementIds.includes(s.id) && isFaceMatching(s.targetFace, canonical));
  const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  const placements = (free || !selected.length ? [null] : selected).map(spec => {
    const b = spec ? placementBounds(spec, config, family, face, frame.width, frame.height, wrap) : null;
    const rect = b ? { left: b.fabricLeft, top: b.fabricTop, width: b.fabricWidth, height: b.fabricHeight }
      : free ? freePlacementBounds(config, family, face, frame.width, frame.height) : area;
    const {left, top, width, height} = rect;
    const sameArea = left === area.left && top === area.top && width === area.width && height === area.height;
    const freeCalibration = free ? config.freeModeBounds?.[face] : null;
    return {id: spec?.id || (free ? "free" : "face"), rect: {left, top, width, height},
      widthCm: positive(b?.calibratedWidthCm ?? freeCalibration?.physicalWidthCm ?? (sameArea ? area.physicalWidthCm : null)),
      heightCm: positive(b?.calibratedHeightCm ?? freeCalibration?.physicalHeightCm ?? (sameArea ? area.physicalHeightCm : null))};
  });
  const flip = area.mirrorHorizontal;
  return {frame, referenceFace: face, placements,
    targetDPI: positive(area.targetDPI), printMethod: method || area.printMethod || null,
    mirror: typeof flip === "boolean" ? (flip ? "OUTPUT_HORIZONTAL" : "NONE") : null};
}


export function readSavedFrame(json: unknown): EditorFrame | null {
  try {
    const face = typeof json === "string" ? JSON.parse(json) : json;
    return face?.coordinates?.frame ?? null;
  } catch { return null; }
}

export function canUpdateSavedDesign(faces: Record<string, unknown>, revision: string): boolean {
  const entries = Object.entries(faces);
  return !!revision && entries.length > 0 && entries.every(([key, encoded]) => {
    const f = readSavedFrame(encoded);
    return !!f && f.version === 1 && f.templateRevision === revision && f.surface === key.split(":::").pop() &&
      (f.space === "FULL_MOCKUP_NATIVE" || f.space === "STANDALONE_SURFACE");
  });
}

export const SERIALIZE_PROPERTIES = [
  'id', 'name', 'selectable', 'evented', 'src', 'originalAssetId', 'originalAssetUrl', 'crossOrigin',
  'isCustomUpload', 'assetName', 'assetPrice', 'assetType', 'assetCategory', 'assetVersion', 'fontSize', 'fontFamily',
  'fontWeight', 'fontStyle', 'underline', 'fill', 'stroke', 'strokeWidth',
  'textAlign', 'lineHeight', 'charSpacing', 'opacity', 'scaleX', 'scaleY',
  'angle', 'left', 'top', 'width', 'height', 'flipX', 'flipY',
  'assignedPlacementId', 'placementId', 'targetFace',
  'originMode', 'createdInMode',
  'isLocked', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY',
  'hasControls', 'hasBorders'
];

export function serializeEditorFace(json: Record<string, any>, surface: {
  face: string; panorama: boolean; nativeWidth: number; nativeHeight: number;
  canvasWidth: number; canvasHeight: number; loaded?: EditorFrame | null;
}, template: {
  revision: string; config: any; family: string; garment: string; selected: string[];
  free: boolean; method: string | null;
}) {
  const saved: Record<string, any> = {...json,
    width: surface.panorama ? 1840 : surface.nativeWidth,
    height: surface.panorama ? 760 : surface.nativeHeight};
  delete saved.coordinates;
  if (surface.panorama) saved.mugPanoramaSheet = true;
  if (surface.canvasWidth !== saved.width || surface.canvasHeight !== saved.height) return saved;
  const frame = editorFrame(surface.face, surface.panorama, saved.width, saved.height, template.revision, surface.loaded);
  if (frame) {
    const assigned = saved.objects.map((o: any) => o.assignedPlacementId || o.placementId).filter(Boolean);
    const ids = Array.from(new Set<string>([...template.selected, ...assigned]));
    const coordinates = faceCoordinates(frame, template.config, template.family, template.garment, ids, template.free, template.method);
    if (coordinates) saved.coordinates = coordinates;
  }
  return saved;
}
