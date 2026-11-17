import type { PlacementSpec } from "./printPlacementConfig";

// Both the editor and checkout resolve a placement in the same native mockup coordinates.
export function placementBounds(
  spec: PlacementSpec,
  config: any,
  family: string,
  resolvedFace: string,
  nw: number,
  nh: number,
  panorama: boolean,
) {
  const box = spec.canvasBox;
  const rawX = (box.leftPercent / 100) * nw;
  const rawY = (box.topPercent / 100) * nh;
  const rawW = (box.maxWidthPercent / 100) * nw;
  const rawH = (box.maxHeightPercent / 100) * nh;

  // Physical dimensions from spec (e.g. 30x40 cm for full front, 23x9.5 cm for mug wrap)
  const recW = spec.dimensions?.recommended?.widthCm || 30;
  const recH = spec.dimensions?.recommended?.heightCm || 40;

  let fabricLeft: number;
  let fabricTop: number;
  let fabricWidth: number;
  let fabricHeight: number;
  let calibratedWidthCm: number | undefined;
  let calibratedHeightCm: number | undefined;

  // 0. Unwrapped 23x9.5 Panoramic Mug Sheet Workspace (1:1 coordinate fidelity = 80 px/cm)
  if (panorama && spec.id === "mug_full_wrap") {
    return {
      fabricLeft: 0,
      fabricTop: 0,
      fabricWidth: 1840,
      fabricHeight: 760,
      calibratedWidthCm: recW,
      calibratedHeightCm: recH,
    };
  }

  // 1. Highest priority: Admin-calibrated placement rectangle (with face-aware Mug overrides)
  const calibratedMap = config?.calibratedPlacements as
    | Record<string, any>
    | undefined;
  let calibrated = calibratedMap?.[spec.id];
  if (family === "mug" && calibratedMap) {
    if (
      spec.id === "mug_full_wrap" &&
      resolvedFace === "back" &&
      calibratedMap["mug_full_wrap_back"]
    ) {
      calibrated = calibratedMap["mug_full_wrap_back"];
    } else if (
      spec.id === "mug_full_wrap" &&
      resolvedFace === "other" &&
      calibratedMap["mug_full_wrap_other"]
    ) {
      calibrated = calibratedMap["mug_full_wrap_other"];
    } else if (
      spec.id === "mug_front" &&
      resolvedFace === "other" &&
      calibratedMap["mug_front_other"]
    ) {
      calibrated = calibratedMap["mug_front_other"];
    } else if (spec.id === "mug_front" && resolvedFace === "back") {
      calibrated =
        calibratedMap["mug_front_back"] ||
        calibratedMap["mug_back"] ||
        calibrated;
    }
  }

  const facePa = config?.faces?.[resolvedFace]?.printArea;

  if (calibrated && calibrated.width > 0 && calibrated.height > 0) {
    const cNw = calibrated.nativeWidth || nw;
    const cNh = calibrated.nativeHeight || nh;
    fabricLeft = Math.round((calibrated.x / cNw) * nw);
    fabricTop = Math.round((calibrated.y / cNh) * nh);
    fabricWidth = Math.round((calibrated.width / cNw) * nw);
    fabricHeight = Math.round((calibrated.height / cNh) * nh);
    calibratedWidthCm = calibrated.physicalWidthCm;
    calibratedHeightCm = calibrated.physicalHeightCm;
  } else if (
    family === "mug" &&
    facePa &&
    facePa.width > 0 &&
    facePa.height > 0 &&
    (facePa.nativeWidth || nw) > 0 &&
    (facePa.nativeHeight || nh) > 0
  ) {
    // Auto-detected or face-calibrated mug cylinder bounds from uploaded mockup
    const fNw = facePa.nativeWidth || nw;
    const fNh = facePa.nativeHeight || nh;
    const baseLeft = Math.round((facePa.left / fNw) * nw);
    const baseTop = Math.round((facePa.top / fNh) * nh);
    const baseW = Math.round((facePa.width / fNw) * nw);
    const baseH = Math.round((facePa.height / fNh) * nh);

    if (spec.id === "mug_full_wrap") {
      fabricLeft = baseLeft;
      fabricTop = baseTop;
      fabricWidth = baseW;
      fabricHeight = baseH;
    } else {
      // Single face centered cleanly inside the safe cylinder wall
      fabricWidth = Math.round(baseW * 0.72);
      fabricHeight = Math.round(baseH * 0.94);
      fabricLeft = Math.round(baseLeft + (baseW - fabricWidth) / 2);
      fabricTop = Math.round(baseTop + (baseH - fabricHeight) / 2);
    }
  } else if (family !== "apparel") {
    // Non-apparel (Mug, Hat, Phone Case, Generic): honor calibrated canvasBox percentages directly
    fabricWidth = Math.max(40, Math.round(rawW));
    fabricHeight = Math.max(40, Math.round(rawH));
    fabricLeft = Math.round(rawX);
    fabricTop = Math.round(rawY);
  } else {
    // Apparel pixel density: calibrated to standard ~55cm chest over ~65% of mockup width
    const pxPerCm = (nw * 0.65) / 55;
    fabricWidth = Math.round(recW * pxPerCm);
    fabricHeight = Math.round(recH * pxPerCm);

    // Safeguard: do not exceed garment printable zone bounds
    const maxAllowedW = nw * 0.75;
    const maxAllowedH = nh * 0.58;
    if (fabricWidth > maxAllowedW || fabricHeight > maxAllowedH) {
      const scaleFit = Math.min(
        maxAllowedW / fabricWidth,
        maxAllowedH / fabricHeight,
      );
      fabricWidth = Math.round(fabricWidth * scaleFit);
      fabricHeight = Math.round(fabricHeight * scaleFit);
    }

    const isCentered =
      spec.id === "full_front" ||
      spec.id === "center_chest" ||
      spec.id === "full_back" ||
      spec.id === "back_collar";
    fabricLeft = isCentered
      ? Math.round((nw - fabricWidth) / 2)
      : Math.round(rawX);
    fabricTop = Math.round(rawY);
  }

  return {
    fabricLeft,
    fabricTop,
    fabricWidth,
    fabricHeight,
    calibratedWidthCm,
    calibratedHeightCm,
  };
}

export function freePlacementBounds(
  config: any,
  family: string,
  activeFace: string,
  nw: number,
  nh: number,
) {
  const freeBounds = config?.freeModeBounds?.[activeFace];
  if (freeBounds && freeBounds.width > 0 && freeBounds.height > 0) {
    const fbNw = freeBounds.nativeWidth || nw;
    const fbNh = freeBounds.nativeHeight || nh;
    return {
      left: (freeBounds.x / fbNw) * nw,
      top: (freeBounds.y / fbNh) * nh,
      width: (freeBounds.width / fbNw) * nw,
      height: (freeBounds.height / fbNh) * nh,
      nativeWidth: nw,
      nativeHeight: nh,
    };
  }

  const facePa = config?.faces?.[activeFace]?.printArea;
  if (
    family !== "apparel" &&
    facePa &&
    facePa.width > 0 &&
    facePa.height > 0 &&
    (facePa.nativeWidth || nw) > 0 &&
    (facePa.nativeHeight || nh) > 0
  ) {
    const fNw = facePa.nativeWidth || nw;
    const fNh = facePa.nativeHeight || nh;
    return {
      left: (facePa.left / fNw) * nw,
      top: (facePa.top / fNh) * nh,
      width: (facePa.width / fNw) * nw,
      height: (facePa.height / fNh) * nh,
      nativeWidth: nw,
      nativeHeight: nh,
    };
  }

  if (family === "mug") {
    const fw = Math.round(nw * 0.56);
    const fh = Math.round(nh * 0.48);
    const fx = Math.round(nw * 0.22);
    const fy = Math.round(nh * 0.27);
    return {
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      nativeWidth: nw,
      nativeHeight: nh,
    };
  }

  if (family === "hat") {
    const fw = Math.round(nw * 0.38);
    const fh = Math.round(nh * 0.24);
    const fx = Math.round((nw - fw) / 2);
    const fy = Math.round(nh * 0.3);
    return {
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      nativeWidth: nw,
      nativeHeight: nh,
    };
  }

  if (family === "phone_case") {
    const fw = Math.round(nw * 0.4);
    const fh = Math.round(nh * 0.68);
    const fx = Math.round((nw - fw) / 2);
    const fy = Math.round(nh * 0.16);
    return {
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      nativeWidth: nw,
      nativeHeight: nh,
    };
  }

  const isSleeve =
    activeFace === "left" ||
    activeFace === "right" ||
    activeFace === "left_shoulder" ||
    activeFace === "right_shoulder";
  const fw = Math.round(nw * (isSleeve ? 0.48 : 0.62));
  const fh = Math.round(nh * (isSleeve ? 0.68 : 0.76));
  const fx = Math.round((nw - fw) / 2);
  const fy = Math.round(nh * (isSleeve ? 0.16 : 0.13));
  return {
    left: fx,
    top: fy,
    width: fw,
    height: fh,
    nativeWidth: nw,
    nativeHeight: nh,
  };
}
