/**
 * Smart Alignment Guides & Magnetic Snapping Engine (Figma / Canva / Fabric.js Edition)
 * Provides 60fps real-time magnetic alignment for the Design Studio canvas across all product families:
 * 
 * 1. Single Primary Crosshairs (No Duplicate / Conflicting Parallel Lines):
 *    - Unifies canvas & printable area centers into one unambiguous reference per axis.
 *    - 4px proximity deduplication strictly prevents rendering parallel double lines.
 * 
 * 2. Specialized Mug Panorama 3-Zone Snapping (Left • Center • Right):
 *    - Recognizes the 3 unwrapped panorama zones:
 *      • Left Zone Center: 1840 * 0.185 (~340px)
 *      • Center Zone Center: 1840 * 0.50 (920px)
 *      • Right Zone Center: 1840 * 0.815 (~1500px)
 *      • Zone Column Dividers: 35% (644px) & 65% (1196px)
 *    - Single horizontal center across the 23x9.5 cm wrap sheet (Y = 380px).
 * 
 * 3. Object-to-Object Smart Alignment (Multi-Element Alignment):
 *    - Compares active object bounds against all other user stickers/elements.
 *    - Aligns Top, Bottom, Left, Right edges and Horizontal / Vertical centers.
 *    - Multi-element alignment: when 2 or more stickers align on the same axis,
 *      renders a single continuous dashed line connecting all aligned elements.
 * 
 * 4. Zero-Ghosting Upper Canvas Lifecycle:
 *    - Renders on `canvas.contextTop` (upper canvas overlay) ONLY while actively dragging or scaling.
 *    - Wipes previous frame before drawing new frame to prevent line accumulation.
 *    - Cleans up instantly on mouse-up / touch-end / drag-end / selection-cleared.
 *    - Never serialized into JSON, drafts, or production print exports.
 */

export type SmartGuideType = 'canvas-center' | 'zone-center' | 'zone-divider' | 'object-edge' | 'object-center';
export type SmartGuideOrientation = 'vertical' | 'horizontal';

export interface ObjectBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  id?: string;
  name?: string;
}

export interface SmartGuideLine {
  type: SmartGuideOrientation; // 'vertical' (fixed X) or 'horizontal' (fixed Y)
  guideType: SmartGuideType;
  axisCoord: number;           // X coordinate for vertical, Y coordinate for horizontal
  startCoord: number;          // Y1 for vertical, X1 for horizontal
  endCoord: number;            // Y2 for vertical, X2 for horizontal
  matchedObjectIds?: string[]; // IDs/names of objects participating in this alignment
}

export interface PanoramaZoneSpec {
  leftCenter: number;   // e.g. 1840 * 0.185 = 340.4
  centerCenter: number; // e.g. 1840 * 0.50 = 920
  rightCenter: number;  // e.g. 1840 * 0.815 = 1499.6
  dividers?: number[];  // e.g. [1840 * 0.35, 1840 * 0.65] = [644, 1196]
}

export interface SmartGuideOptions {
  snapThreshold?: number;             // Default: 5px
  enabled?: boolean;                   // Default: true
  canvasCenterEnabled?: boolean;       // Default: true
  objectAlignmentEnabled?: boolean;    // Default: true
  isMugPanorama?: boolean;             // True when 360 wrap sheet is active
  panoramaZones?: PanoramaZoneSpec;    // The 3 panorama zones
  printZone?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface SmartSnappingResult {
  snappedX: boolean;
  snappedY: boolean;
  deltaX: number;
  deltaY: number;
  guidelines: SmartGuideLine[];
}

export const DEFAULT_SNAP_THRESHOLD = 5;

/**
 * Extracts a normalized axis-aligned bounding box from a Fabric.js object or raw bounds object.
 */
export function extractObjectBounds(obj: any): ObjectBounds | null {
  if (!obj) return null;
  if (typeof obj.getBoundingRect === 'function') {
    const r = obj.getBoundingRect(true, true);
    return {
      left: r.left,
      top: r.top,
      width: Math.max(1, r.width),
      height: Math.max(1, r.height),
      id: obj.id || obj.name,
      name: obj.name,
    };
  }
  if (
    typeof obj.left === 'number' &&
    typeof obj.top === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number'
  ) {
    return {
      left: obj.left,
      top: obj.top,
      width: Math.max(1, obj.width),
      height: Math.max(1, obj.height),
      id: obj.id || obj.name,
      name: obj.name,
    };
  }
  return null;
}

interface SnapCandidateX {
  delta: number;
  absDiff: number;
  type: SmartGuideType;
  targetX: number;
  otherObj?: ObjectBounds;
  isCenter: boolean;
}

interface SnapCandidateY {
  delta: number;
  absDiff: number;
  type: SmartGuideType;
  targetY: number;
  otherObj?: ObjectBounds;
  isCenter: boolean;
}

/**
 * Pure and side-effect free mathematical snapping and guideline generation.
 */
export function computeSmartSnapping(
  activeBounds: ObjectBounds,
  otherBoundsList: ObjectBounds[],
  canvasWidth: number,
  canvasHeight: number,
  options?: SmartGuideOptions
): SmartSnappingResult {
  const result: SmartSnappingResult = {
    snappedX: false,
    snappedY: false,
    deltaX: 0,
    deltaY: 0,
    guidelines: [],
  };

  if (options && options.enabled === false) {
    return result;
  }

  const threshold = Math.max(1, options?.snapThreshold ?? DEFAULT_SNAP_THRESHOLD);
  const allowCenter = options?.canvasCenterEnabled !== false;
  const allowObjects = options?.objectAlignmentEnabled !== false;
  const isMugPanorama = Boolean(options?.isMugPanorama);
  const panoramaZones = options?.panoramaZones;
  const printZone = options?.printZone;

  const aLeft = activeBounds.left;
  const aRight = activeBounds.left + activeBounds.width;
  const aCenterX = activeBounds.left + activeBounds.width / 2;

  const aTop = activeBounds.top;
  const aBottom = activeBounds.top + activeBounds.height;
  const aCenterY = activeBounds.top + activeBounds.height / 2;

  // -------------------------------------------------------------
  // 1. EVALUATE X-AXIS SNAP CANDIDATES (Vertical Guide Lines)
  // -------------------------------------------------------------
  const candidatesX: SnapCandidateX[] = [];

  if (allowCenter) {
    if (isMugPanorama) {
      // Panorama Mode: Check all 3 distinct zone centers (Left, Center, Right) + dividers
      const pLeft = panoramaZones?.leftCenter ?? canvasWidth * 0.185;
      const pCenter = panoramaZones?.centerCenter ?? canvasWidth * 0.50;
      const pRight = panoramaZones?.rightCenter ?? canvasWidth * 0.815;

      const pZones = [
        { x: pLeft, type: 'zone-center' as SmartGuideType },
        { x: pCenter, type: 'canvas-center' as SmartGuideType },
        { x: pRight, type: 'zone-center' as SmartGuideType },
      ];

      for (const zone of pZones) {
        const diff = zone.x - aCenterX;
        if (Math.abs(diff) <= threshold) {
          candidatesX.push({
            delta: diff,
            absDiff: Math.abs(diff),
            type: zone.type,
            targetX: zone.x,
            isCenter: true,
          });
        }
      }

      // Check dividers between zones (e.g. 35% and 65%)
      const dividers = panoramaZones?.dividers ?? [canvasWidth * 0.35, canvasWidth * 0.65];
      for (const divX of dividers) {
        // Left edge to divider
        const diffL = divX - aLeft;
        if (Math.abs(diffL) <= threshold) {
          candidatesX.push({
            delta: diffL,
            absDiff: Math.abs(diffL),
            type: 'zone-divider',
            targetX: divX,
            isCenter: false,
          });
        }
        // Right edge to divider
        const diffR = divX - aRight;
        if (Math.abs(diffR) <= threshold) {
          candidatesX.push({
            delta: diffR,
            absDiff: Math.abs(diffR),
            type: 'zone-divider',
            targetX: divX,
            isCenter: false,
          });
        }
      }
    } else {
      // Non-Panorama Mode: Snap to Print Placement Area (or canvas fallback)
      const hasPrintZone = Boolean(printZone && printZone.width > 0 && printZone.height > 0);
      const primaryCenterX = hasPrintZone
        ? printZone!.left + printZone!.width / 2
        : canvasWidth / 2;

      // 1. Placement Main Horizontal Center (50%)
      const diffCenter = primaryCenterX - aCenterX;
      if (Math.abs(diffCenter) <= threshold) {
        candidatesX.push({
          delta: diffCenter,
          absDiff: Math.abs(diffCenter),
          type: 'canvas-center',
          targetX: primaryCenterX,
          isCenter: true,
        });
      }

      // 2. 4-Quadrant Subdivisions (25% and 75% for 4-corner balanced layouts)
      if (hasPrintZone) {
        const pzLeft = printZone!.left;
        const pzRight = printZone!.left + printZone!.width;
        const qLeftX = pzLeft + printZone!.width * 0.25;
        const qRightX = pzLeft + printZone!.width * 0.75;

        // Left Quadrant Center (25%)
        const diffQL = qLeftX - aCenterX;
        if (Math.abs(diffQL) <= threshold) {
          candidatesX.push({
            delta: diffQL,
            absDiff: Math.abs(diffQL),
            type: 'zone-center',
            targetX: qLeftX,
            isCenter: true,
          });
        }

        // Right Quadrant Center (75%)
        const diffQR = qRightX - aCenterX;
        if (Math.abs(diffQR) <= threshold) {
          candidatesX.push({
            delta: diffQR,
            absDiff: Math.abs(diffQR),
            type: 'zone-center',
            targetX: qRightX,
            isCenter: true,
          });
        }

        // Snap to active print placement boundaries (left and right edges)
        const diffLL = pzLeft - aLeft;
        if (Math.abs(diffLL) <= threshold) {
          candidatesX.push({
            delta: diffLL,
            absDiff: Math.abs(diffLL),
            type: 'object-edge',
            targetX: pzLeft,
            isCenter: false,
          });
        }

        const diffRR = pzRight - aRight;
        if (Math.abs(diffRR) <= threshold) {
          candidatesX.push({
            delta: diffRR,
            absDiff: Math.abs(diffRR),
            type: 'object-edge',
            targetX: pzRight,
            isCenter: false,
          });
        }
      }
    }
  }

  // Object-to-Object (X-axis)
  if (allowObjects && otherBoundsList.length > 0) {
    for (const other of otherBoundsList) {
      const oLeft = other.left;
      const oRight = other.left + other.width;
      const oCenterX = other.left + other.width / 2;

      // 1. Center to Center
      const diffCenter = oCenterX - aCenterX;
      if (Math.abs(diffCenter) <= threshold) {
        candidatesX.push({
          delta: diffCenter,
          absDiff: Math.abs(diffCenter),
          type: 'object-center',
          targetX: oCenterX,
          otherObj: other,
          isCenter: true,
        });
      }

      // 2. Left to Left
      const diffLL = oLeft - aLeft;
      if (Math.abs(diffLL) <= threshold) {
        candidatesX.push({
          delta: diffLL,
          absDiff: Math.abs(diffLL),
          type: 'object-edge',
          targetX: oLeft,
          otherObj: other,
          isCenter: false,
        });
      }

      // 3. Left to Right
      const diffLR = oRight - aLeft;
      if (Math.abs(diffLR) <= threshold) {
        candidatesX.push({
          delta: diffLR,
          absDiff: Math.abs(diffLR),
          type: 'object-edge',
          targetX: oRight,
          otherObj: other,
          isCenter: false,
        });
      }

      // 4. Right to Right
      const diffRR = oRight - aRight;
      if (Math.abs(diffRR) <= threshold) {
        candidatesX.push({
          delta: diffRR,
          absDiff: Math.abs(diffRR),
          type: 'object-edge',
          targetX: oRight,
          otherObj: other,
          isCenter: false,
        });
      }

      // 5. Right to Left
      const diffRL = oLeft - aRight;
      if (Math.abs(diffRL) <= threshold) {
        candidatesX.push({
          delta: diffRL,
          absDiff: Math.abs(diffRL),
          type: 'object-edge',
          targetX: oLeft,
          otherObj: other,
          isCenter: false,
        });
      }
    }
  }

  // Pick best X snap
  if (candidatesX.length > 0) {
    candidatesX.sort((a, b) => {
      if (Math.abs(a.absDiff - b.absDiff) > 0.001) {
        return a.absDiff - b.absDiff;
      }
      return a.isCenter ? -1 : 1;
    });

    const bestX = candidatesX[0];
    result.snappedX = true;
    result.deltaX = bestX.delta;
  }

  // -------------------------------------------------------------
  // 2. EVALUATE Y-AXIS SNAP CANDIDATES (Horizontal Guide Lines)
  // -------------------------------------------------------------
  const candidatesY: SnapCandidateY[] = [];

  if (allowCenter) {
    // Single unambiguous primary horizontal center
    const hasPrintZone = Boolean(!isMugPanorama && printZone && printZone.height > 0 && printZone.width > 0);
    const primaryCenterY = hasPrintZone
      ? printZone!.top + printZone!.height / 2
      : canvasHeight / 2;

    // 1. Placement Main Vertical Center (50%)
    const diffCenter = primaryCenterY - aCenterY;
    if (Math.abs(diffCenter) <= threshold) {
      candidatesY.push({
        delta: diffCenter,
        absDiff: Math.abs(diffCenter),
        type: 'canvas-center',
        targetY: primaryCenterY,
        isCenter: true,
      });
    }

    // 2. 4-Quadrant Subdivisions (25% and 75% for 4-corner balanced layouts)
    if (hasPrintZone) {
      const pzTop = printZone!.top;
      const pzBottom = printZone!.top + printZone!.height;
      const qTopY = pzTop + printZone!.height * 0.25;
      const qBottomY = pzTop + printZone!.height * 0.75;

      // Top Quadrant Center (25%)
      const diffQT = qTopY - aCenterY;
      if (Math.abs(diffQT) <= threshold) {
        candidatesY.push({
          delta: diffQT,
          absDiff: Math.abs(diffQT),
          type: 'zone-center',
          targetY: qTopY,
          isCenter: true,
        });
      }

      // Bottom Quadrant Center (75%)
      const diffQB = qBottomY - aCenterY;
      if (Math.abs(diffQB) <= threshold) {
        candidatesY.push({
          delta: diffQB,
          absDiff: Math.abs(diffQB),
          type: 'zone-center',
          targetY: qBottomY,
          isCenter: true,
        });
      }

      // Snap to active print placement boundaries (top and bottom edges)
      const diffTT = pzTop - aTop;
      if (Math.abs(diffTT) <= threshold) {
        candidatesY.push({
          delta: diffTT,
          absDiff: Math.abs(diffTT),
          type: 'object-edge',
          targetY: pzTop,
          isCenter: false,
        });
      }

      const diffBB = pzBottom - aBottom;
      if (Math.abs(diffBB) <= threshold) {
        candidatesY.push({
          delta: diffBB,
          absDiff: Math.abs(diffBB),
          type: 'object-edge',
          targetY: pzBottom,
          isCenter: false,
        });
      }
    }
  }

  // Object-to-Object (Y-axis)
  if (allowObjects && otherBoundsList.length > 0) {
    for (const other of otherBoundsList) {
      const oTop = other.top;
      const oBottom = other.top + other.height;
      const oCenterY = other.top + other.height / 2;

      // 1. Center to Center
      const diffCenter = oCenterY - aCenterY;
      if (Math.abs(diffCenter) <= threshold) {
        candidatesY.push({
          delta: diffCenter,
          absDiff: Math.abs(diffCenter),
          type: 'object-center',
          targetY: oCenterY,
          otherObj: other,
          isCenter: true,
        });
      }

      // 2. Top to Top
      const diffTT = oTop - aTop;
      if (Math.abs(diffTT) <= threshold) {
        candidatesY.push({
          delta: diffTT,
          absDiff: Math.abs(diffTT),
          type: 'object-edge',
          targetY: oTop,
          otherObj: other,
          isCenter: false,
        });
      }

      // 3. Top to Bottom
      const diffTB = oBottom - aTop;
      if (Math.abs(diffTB) <= threshold) {
        candidatesY.push({
          delta: diffTB,
          absDiff: Math.abs(diffTB),
          type: 'object-edge',
          targetY: oBottom,
          otherObj: other,
          isCenter: false,
        });
      }

      // 4. Bottom to Bottom
      const diffBB = oBottom - aBottom;
      if (Math.abs(diffBB) <= threshold) {
        candidatesY.push({
          delta: diffBB,
          absDiff: Math.abs(diffBB),
          type: 'object-edge',
          targetY: oBottom,
          otherObj: other,
          isCenter: false,
        });
      }

      // 5. Bottom to Top
      const diffBT = oTop - aBottom;
      if (Math.abs(diffBT) <= threshold) {
        candidatesY.push({
          delta: diffBT,
          absDiff: Math.abs(diffBT),
          type: 'object-edge',
          targetY: oTop,
          otherObj: other,
          isCenter: false,
        });
      }
    }
  }

  // Pick best Y snap
  if (candidatesY.length > 0) {
    candidatesY.sort((a, b) => {
      if (Math.abs(a.absDiff - b.absDiff) > 0.001) {
        return a.absDiff - b.absDiff;
      }
      return a.isCenter ? -1 : 1;
    });

    const bestY = candidatesY[0];
    result.snappedY = true;
    result.deltaY = bestY.delta;
  }

  // -------------------------------------------------------------
  // 3. BUILD CONNECTING GUIDELINES ACROSS ALIGNED OBJECTS / CANVAS
  // -------------------------------------------------------------
  const snappedLeft = aLeft + result.deltaX;
  const snappedRight = aRight + result.deltaX;
  const snappedCenterX = aCenterX + result.deltaX;

  const snappedTop = aTop + result.deltaY;
  const snappedBottom = aBottom + result.deltaY;
  const snappedCenterY = aCenterY + result.deltaY;

  // A. Vertical Guidelines (along X)
  if (result.snappedX) {
    if (isMugPanorama) {
      const pLeft = panoramaZones?.leftCenter ?? canvasWidth * 0.185;
      const pCenter = panoramaZones?.centerCenter ?? canvasWidth * 0.50;
      const pRight = panoramaZones?.rightCenter ?? canvasWidth * 0.815;

      const pZones = [
        { x: pLeft, type: 'zone-center' as SmartGuideType },
        { x: pCenter, type: 'canvas-center' as SmartGuideType },
        { x: pRight, type: 'zone-center' as SmartGuideType },
      ];

      for (const zone of pZones) {
        if (Math.abs(snappedCenterX - zone.x) <= 1) {
          result.guidelines.push({
            type: 'vertical',
            guideType: zone.type,
            axisCoord: zone.x,
            startCoord: 0,
            endCoord: canvasHeight,
          });
        }
      }

      const dividers = panoramaZones?.dividers ?? [canvasWidth * 0.35, canvasWidth * 0.65];
      for (const divX of dividers) {
        if (Math.abs(snappedLeft - divX) <= 1 || Math.abs(snappedRight - divX) <= 1) {
          result.guidelines.push({
            type: 'vertical',
            guideType: 'zone-divider',
            axisCoord: divX,
            startCoord: 0,
            endCoord: canvasHeight,
          });
        }
      }
    } else {
      const hasPrintZone = Boolean(printZone && printZone.width > 0 && printZone.height > 0);
      const primaryCenterX = hasPrintZone
        ? printZone!.left + printZone!.width / 2
        : canvasWidth / 2;
      const primaryCenterY = hasPrintZone
        ? printZone!.top + printZone!.height / 2
        : canvasHeight / 2;

      const pzLeft = hasPrintZone ? printZone!.left : 0;
      const pzRight = hasPrintZone ? printZone!.left + printZone!.width : canvasWidth;
      const pzTop = hasPrintZone ? printZone!.top : 0;
      const pzBottom = hasPrintZone ? printZone!.top + printZone!.height : canvasHeight;

      const qLeftX = hasPrintZone ? pzLeft + printZone!.width * 0.25 : 0;
      const qRightX = hasPrintZone ? pzLeft + printZone!.width * 0.75 : 0;
      const qTopY = hasPrintZone ? pzTop + printZone!.height * 0.25 : 0;
      const qBottomY = hasPrintZone ? pzTop + printZone!.height * 0.75 : 0;

      const isCornerQuadrant = hasPrintZone && (
        Math.abs(snappedCenterX - qLeftX) <= 1 ||
        Math.abs(snappedCenterX - qRightX) <= 1 ||
        Math.abs(snappedCenterY - qTopY) <= 1 ||
        Math.abs(snappedCenterY - qBottomY) <= 1 ||
        (Math.abs(snappedCenterX - primaryCenterX) > 25 && Math.abs(snappedCenterY - primaryCenterY) > 25)
      );

      // Main Placement Center (50%)
      if (Math.abs(snappedCenterX - primaryCenterX) <= 1) {
        result.guidelines.push({
          type: 'vertical',
          guideType: 'canvas-center',
          axisCoord: primaryCenterX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
      }

      // Quadrant Left Center (25%)
      if (hasPrintZone && Math.abs(snappedCenterX - qLeftX) <= 1) {
        result.guidelines.push({
          type: 'vertical',
          guideType: 'zone-center',
          axisCoord: qLeftX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
      }

      // Quadrant Right Center (75%)
      if (hasPrintZone && Math.abs(snappedCenterX - qRightX) <= 1) {
        result.guidelines.push({
          type: 'vertical',
          guideType: 'zone-center',
          axisCoord: qRightX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
      }

      if (hasPrintZone) {
        if (Math.abs(snappedLeft - pzLeft) <= 1) {
          result.guidelines.push({
            type: 'vertical',
            guideType: 'object-edge',
            axisCoord: pzLeft,
            startCoord: pzTop,
            endCoord: pzBottom,
          });
        }
        if (Math.abs(snappedRight - pzRight) <= 1) {
          result.guidelines.push({
            type: 'vertical',
            guideType: 'object-edge',
            axisCoord: pzRight,
            startCoord: pzTop,
            endCoord: pzBottom,
          });
        }
      }

      // 4-Quadrant Divider Lines when in any of the 4 corners
      if (isCornerQuadrant) {
        result.guidelines.push({
          type: 'vertical',
          guideType: 'zone-divider',
          axisCoord: primaryCenterX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
        result.guidelines.push({
          type: 'horizontal',
          guideType: 'zone-divider',
          axisCoord: primaryCenterY,
          startCoord: pzLeft,
          endCoord: pzRight,
        });
      }
    }

    // Object alignments along vertical lines
    if (allowObjects && otherBoundsList.length > 0) {
      const activeXPoints = [
        { x: snappedCenterX, isCenter: true },
        { x: snappedLeft, isCenter: false },
        { x: snappedRight, isCenter: false },
      ];

      for (const pt of activeXPoints) {
        const alignedOthers: ObjectBounds[] = [];
        for (const other of otherBoundsList) {
          const oLeft = other.left;
          const oRight = other.left + other.width;
          const oCenterX = other.left + other.width / 2;
          if (
            Math.abs(oCenterX - pt.x) <= 1 ||
            Math.abs(oLeft - pt.x) <= 1 ||
            Math.abs(oRight - pt.x) <= 1
          ) {
            alignedOthers.push(other);
          }
        }

        if (alignedOthers.length > 0) {
          const allY = [
            snappedTop,
            snappedBottom,
            ...alignedOthers.flatMap((o) => [o.top, o.top + o.height]),
          ];
          const minY = Math.min(...allY);
          const maxY = Math.max(...allY);
          const padding = 12;

          const hasPrintZone = Boolean(printZone && printZone.width > 0 && printZone.height > 0);
          const limitTop = hasPrintZone ? Math.max(0, printZone!.top) : 0;
          const limitBottom = hasPrintZone ? Math.min(canvasHeight, printZone!.top + printZone!.height) : canvasHeight;

          result.guidelines.push({
            type: 'vertical',
            guideType: pt.isCenter ? 'object-center' : 'object-edge',
            axisCoord: pt.x,
            startCoord: Math.max(limitTop, minY - padding),
            endCoord: Math.min(limitBottom, maxY + padding),
            matchedObjectIds: alignedOthers.map((o) => o.id || o.name || '').filter(Boolean),
          });
        }
      }
    }
  }

  // B. Horizontal Guidelines (along Y)
  if (result.snappedY) {
    const hasPrintZone = Boolean(!isMugPanorama && printZone && printZone.height > 0 && printZone.width > 0);
    const primaryCenterY = hasPrintZone
      ? printZone!.top + printZone!.height / 2
      : canvasHeight / 2;

    const startX = hasPrintZone ? Math.max(0, printZone!.left) : 0;
    const endX = hasPrintZone ? Math.min(canvasWidth, printZone!.left + printZone!.width) : canvasWidth;

    if (Math.abs(snappedCenterY - primaryCenterY) <= 1) {
      result.guidelines.push({
        type: 'horizontal',
        guideType: 'canvas-center',
        axisCoord: primaryCenterY,
        startCoord: startX,
        endCoord: endX,
      });
    }

    if (hasPrintZone) {
      const pzTop = printZone!.top;
      const pzBottom = printZone!.top + printZone!.height;
      const qTopY = pzTop + printZone!.height * 0.25;
      const qBottomY = pzTop + printZone!.height * 0.75;

      // Quadrant Top Center (25%)
      if (Math.abs(snappedCenterY - qTopY) <= 1) {
        result.guidelines.push({
          type: 'horizontal',
          guideType: 'zone-center',
          axisCoord: qTopY,
          startCoord: startX,
          endCoord: endX,
        });
      }

      // Quadrant Bottom Center (75%)
      if (Math.abs(snappedCenterY - qBottomY) <= 1) {
        result.guidelines.push({
          type: 'horizontal',
          guideType: 'zone-center',
          axisCoord: qBottomY,
          startCoord: startX,
          endCoord: endX,
        });
      }

      if (Math.abs(snappedTop - pzTop) <= 1) {
        result.guidelines.push({
          type: 'horizontal',
          guideType: 'object-edge',
          axisCoord: pzTop,
          startCoord: startX,
          endCoord: endX,
        });
      }
      if (Math.abs(snappedBottom - pzBottom) <= 1) {
        result.guidelines.push({
          type: 'horizontal',
          guideType: 'object-edge',
          axisCoord: pzBottom,
          startCoord: startX,
          endCoord: endX,
        });
      }
    }

    // Object alignments along horizontal lines
    if (allowObjects && otherBoundsList.length > 0) {
      const activeYPoints = [
        { y: snappedCenterY, isCenter: true },
        { y: snappedTop, isCenter: false },
        { y: snappedBottom, isCenter: false },
      ];

      for (const pt of activeYPoints) {
        const alignedOthers: ObjectBounds[] = [];
        for (const other of otherBoundsList) {
          const oTop = other.top;
          const oBottom = other.top + other.height;
          const oCenterY = other.top + other.height / 2;
          if (
            Math.abs(oCenterY - pt.y) <= 1 ||
            Math.abs(oTop - pt.y) <= 1 ||
            Math.abs(oBottom - pt.y) <= 1
          ) {
            alignedOthers.push(other);
          }
        }

        if (alignedOthers.length > 0) {
          const allX = [
            snappedLeft,
            snappedRight,
            ...alignedOthers.flatMap((o) => [o.left, o.left + o.width]),
          ];
          const minX = Math.min(...allX);
          const maxX = Math.max(...allX);
          const padding = 12;

          const hasPrintZone = Boolean(!isMugPanorama && printZone && printZone.width > 0 && printZone.height > 0);
          const limitLeft = hasPrintZone ? Math.max(0, printZone!.left) : 0;
          const limitRight = hasPrintZone ? Math.min(canvasWidth, printZone!.left + printZone!.width) : canvasWidth;

          result.guidelines.push({
            type: 'horizontal',
            guideType: pt.isCenter ? 'object-center' : 'object-edge',
            axisCoord: pt.y,
            startCoord: Math.max(limitLeft, minX - padding),
            endCoord: Math.min(limitRight, maxX + padding),
            matchedObjectIds: alignedOthers.map((o) => o.id || o.name || '').filter(Boolean),
          });
        }
      }
    }
  }

  // Strict 4px Proximity Deduplication (Prevents duplicate parallel lines)
  result.guidelines = deduplicateGuidelines(result.guidelines);

  return result;
}

/**
 * Deduplicates guidelines of the same orientation that are within 4px of each other.
 */
export function deduplicateGuidelines(list: SmartGuideLine[]): SmartGuideLine[] {
  if (!list || list.length === 0) return [];

  const deduped: SmartGuideLine[] = [];

  for (const item of list) {
    const existing = deduped.find(
      (g) => g.type === item.type && Math.abs(g.axisCoord - item.axisCoord) <= 4
    );

    if (!existing) {
      deduped.push({ ...item });
    } else {
      // Merge line spans so the line covers the full combined range
      existing.startCoord = Math.min(existing.startCoord, item.startCoord);
      existing.endCoord = Math.max(existing.endCoord, item.endCoord);
      if (item.guideType === 'canvas-center' || item.guideType === 'zone-center') {
        existing.guideType = item.guideType;
      }
      if (item.matchedObjectIds && item.matchedObjectIds.length > 0) {
        existing.matchedObjectIds = Array.from(
          new Set([...(existing.matchedObjectIds || []), ...item.matchedObjectIds])
        );
      }
    }
  }

  return deduped;
}

/**
 * Computes alignment guidelines during object scaling/resizing without forcing position jumps.
 */
export function computeScalingGuides(
  activeBounds: ObjectBounds,
  otherBoundsList: ObjectBounds[],
  canvasWidth: number,
  canvasHeight: number,
  options?: SmartGuideOptions
): SmartGuideLine[] {
  if (options && options.enabled === false) return [];

  const threshold = Math.max(1, options?.snapThreshold ?? DEFAULT_SNAP_THRESHOLD);
  const allowCenter = options?.canvasCenterEnabled !== false;
  const allowObjects = options?.objectAlignmentEnabled !== false;
  const isMugPanorama = Boolean(options?.isMugPanorama);
  const panoramaZones = options?.panoramaZones;
  const printZone = options?.printZone;

  const aLeft = activeBounds.left;
  const aRight = activeBounds.left + activeBounds.width;
  const aCenterX = activeBounds.left + activeBounds.width / 2;

  const aTop = activeBounds.top;
  const aBottom = activeBounds.top + activeBounds.height;
  const aCenterY = activeBounds.top + activeBounds.height / 2;

  const guidelines: SmartGuideLine[] = [];

  // Canvas center crosshairs during scaling
  if (allowCenter) {
    if (isMugPanorama) {
      const pLeft = panoramaZones?.leftCenter ?? canvasWidth * 0.185;
      const pCenter = panoramaZones?.centerCenter ?? canvasWidth * 0.50;
      const pRight = panoramaZones?.rightCenter ?? canvasWidth * 0.815;

      for (const z of [pLeft, pCenter, pRight]) {
        if (Math.abs(aCenterX - z) <= threshold) {
          guidelines.push({
            type: 'vertical',
            guideType: z === pCenter ? 'canvas-center' : 'zone-center',
            axisCoord: z,
            startCoord: 0,
            endCoord: canvasHeight,
          });
        }
      }

      if (Math.abs(aCenterY - canvasHeight / 2) <= threshold) {
        guidelines.push({
          type: 'horizontal',
          guideType: 'canvas-center',
          axisCoord: canvasHeight / 2,
          startCoord: 0,
          endCoord: canvasWidth,
        });
      }
    } else {
      const hasPrintZone = Boolean(printZone && printZone.width > 0 && printZone.height > 0);
      const primaryCenterX = hasPrintZone
        ? printZone!.left + printZone!.width / 2
        : canvasWidth / 2;

      const primaryCenterY = hasPrintZone
        ? printZone!.top + printZone!.height / 2
        : canvasHeight / 2;

      const pzLeft = hasPrintZone ? printZone!.left : 0;
      const pzRight = hasPrintZone ? printZone!.left + printZone!.width : canvasWidth;
      const pzTop = hasPrintZone ? printZone!.top : 0;
      const pzBottom = hasPrintZone ? printZone!.top + printZone!.height : canvasHeight;

      const qLeftX = hasPrintZone ? pzLeft + printZone!.width * 0.25 : 0;
      const qRightX = hasPrintZone ? pzLeft + printZone!.width * 0.75 : 0;
      const qTopY = hasPrintZone ? pzTop + printZone!.height * 0.25 : 0;
      const qBottomY = hasPrintZone ? pzTop + printZone!.height * 0.75 : 0;

      const isCornerQuadrant = hasPrintZone && (
        Math.abs(aCenterX - qLeftX) <= threshold ||
        Math.abs(aCenterX - qRightX) <= threshold ||
        Math.abs(aCenterY - qTopY) <= threshold ||
        Math.abs(aCenterY - qBottomY) <= threshold ||
        (Math.abs(aCenterX - primaryCenterX) > 25 && Math.abs(aCenterY - primaryCenterY) > 25)
      );

      // Main Placement Vertical Center (50%)
      if (Math.abs(aCenterX - primaryCenterX) <= threshold) {
        guidelines.push({
          type: 'vertical',
          guideType: 'canvas-center',
          axisCoord: primaryCenterX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
      }

      // Quadrant Left Center (25%)
      if (hasPrintZone && Math.abs(aCenterX - qLeftX) <= threshold) {
        guidelines.push({
          type: 'vertical',
          guideType: 'zone-center',
          axisCoord: qLeftX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
      }

      // Quadrant Right Center (75%)
      if (hasPrintZone && Math.abs(aCenterX - qRightX) <= threshold) {
        guidelines.push({
          type: 'vertical',
          guideType: 'zone-center',
          axisCoord: qRightX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
      }

      // Placement Left and Right Edges
      if (hasPrintZone) {
        if (Math.abs(aLeft - pzLeft) <= threshold) {
          guidelines.push({
            type: 'vertical',
            guideType: 'object-edge',
            axisCoord: pzLeft,
            startCoord: pzTop,
            endCoord: pzBottom,
          });
        }
        if (Math.abs(aRight - pzRight) <= threshold) {
          guidelines.push({
            type: 'vertical',
            guideType: 'object-edge',
            axisCoord: pzRight,
            startCoord: pzTop,
            endCoord: pzBottom,
          });
        }
      }

      // Main Placement Horizontal Center (50%)
      if (Math.abs(aCenterY - primaryCenterY) <= threshold) {
        guidelines.push({
          type: 'horizontal',
          guideType: 'canvas-center',
          axisCoord: primaryCenterY,
          startCoord: pzLeft,
          endCoord: pzRight,
        });
      }

      // Quadrant Top Center (25%)
      if (hasPrintZone && Math.abs(aCenterY - qTopY) <= threshold) {
        guidelines.push({
          type: 'horizontal',
          guideType: 'zone-center',
          axisCoord: qTopY,
          startCoord: pzLeft,
          endCoord: pzRight,
        });
      }

      // Quadrant Bottom Center (75%)
      if (hasPrintZone && Math.abs(aCenterY - qBottomY) <= threshold) {
        guidelines.push({
          type: 'horizontal',
          guideType: 'zone-center',
          axisCoord: qBottomY,
          startCoord: pzLeft,
          endCoord: pzRight,
        });
      }

      // Placement Top and Bottom Edges
      if (hasPrintZone) {
        if (Math.abs(aTop - pzTop) <= threshold) {
          guidelines.push({
            type: 'horizontal',
            guideType: 'object-edge',
            axisCoord: pzTop,
            startCoord: pzLeft,
            endCoord: pzRight,
          });
        }
        if (Math.abs(aBottom - pzBottom) <= threshold) {
          guidelines.push({
            type: 'horizontal',
            guideType: 'object-edge',
            axisCoord: pzBottom,
            startCoord: pzLeft,
            endCoord: pzRight,
          });
        }
      }

      // 4-Quadrant Divider Lines when scaling in a corner
      if (isCornerQuadrant) {
        guidelines.push({
          type: 'vertical',
          guideType: 'zone-divider',
          axisCoord: primaryCenterX,
          startCoord: pzTop,
          endCoord: pzBottom,
        });
        guidelines.push({
          type: 'horizontal',
          guideType: 'zone-divider',
          axisCoord: primaryCenterY,
          startCoord: pzLeft,
          endCoord: pzRight,
        });
      }
    }
  }

  // Object-to-object edge/center alignment during scaling
  if (allowObjects && otherBoundsList.length > 0) {
    const activeXPoints = [
      { x: aCenterX, isCenter: true },
      { x: aLeft, isCenter: false },
      { x: aRight, isCenter: false },
    ];

    for (const pt of activeXPoints) {
      const alignedOthers: ObjectBounds[] = [];
      let exactAxisX = pt.x;

      for (const other of otherBoundsList) {
        const oLeft = other.left;
        const oRight = other.left + other.width;
        const oCenterX = other.left + other.width / 2;

        if (Math.abs(oCenterX - pt.x) <= threshold) {
          alignedOthers.push(other);
          exactAxisX = oCenterX;
        } else if (Math.abs(oLeft - pt.x) <= threshold) {
          alignedOthers.push(other);
          exactAxisX = oLeft;
        } else if (Math.abs(oRight - pt.x) <= threshold) {
          alignedOthers.push(other);
          exactAxisX = oRight;
        }
      }

      if (alignedOthers.length > 0) {
        const allY = [
          aTop,
          aBottom,
          ...alignedOthers.flatMap((o) => [o.top, o.top + o.height]),
        ];
        const hasPrintZone = Boolean(printZone && printZone.width > 0 && printZone.height > 0);
        const limitTop = hasPrintZone ? Math.max(0, printZone!.top) : 0;
        const limitBottom = hasPrintZone ? Math.min(canvasHeight, printZone!.top + printZone!.height) : canvasHeight;

        guidelines.push({
          type: 'vertical',
          guideType: pt.isCenter ? 'object-center' : 'object-edge',
          axisCoord: exactAxisX,
          startCoord: Math.max(limitTop, Math.min(...allY) - 12),
          endCoord: Math.min(limitBottom, Math.max(...allY) + 12),
          matchedObjectIds: alignedOthers.map((o) => o.id || o.name || '').filter(Boolean),
        });
      }
    }

    const activeYPoints = [
      { y: aCenterY, isCenter: true },
      { y: aTop, isCenter: false },
      { y: aBottom, isCenter: false },
    ];

    for (const pt of activeYPoints) {
      const alignedOthers: ObjectBounds[] = [];
      let exactAxisY = pt.y;

      for (const other of otherBoundsList) {
        const oTop = other.top;
        const oBottom = other.top + other.height;
        const oCenterY = other.top + other.height / 2;

        if (Math.abs(oCenterY - pt.y) <= threshold) {
          alignedOthers.push(other);
          exactAxisY = oCenterY;
        } else if (Math.abs(oTop - pt.y) <= threshold) {
          alignedOthers.push(other);
          exactAxisY = oTop;
        } else if (Math.abs(oBottom - pt.y) <= threshold) {
          alignedOthers.push(other);
          exactAxisY = oBottom;
        }
      }

      if (alignedOthers.length > 0) {
        const allX = [
          aLeft,
          aRight,
          ...alignedOthers.flatMap((o) => [o.left, o.left + o.width]),
        ];
        const hasPrintZone = Boolean(!isMugPanorama && printZone && printZone.width > 0 && printZone.height > 0);
        const limitLeft = hasPrintZone ? Math.max(0, printZone!.left) : 0;
        const limitRight = hasPrintZone ? Math.min(canvasWidth, printZone!.left + printZone!.width) : canvasWidth;

        guidelines.push({
          type: 'horizontal',
          guideType: pt.isCenter ? 'object-center' : 'object-edge',
          axisCoord: exactAxisY,
          startCoord: Math.max(limitLeft, Math.min(...allX) - 12),
          endCoord: Math.min(limitRight, Math.max(...allX) + 12),
          matchedObjectIds: alignedOthers.map((o) => o.id || o.name || '').filter(Boolean),
        });
      }
    }
  }

  return deduplicateGuidelines(guidelines);
}

/**
 * Robust full retina context wiping helper to prevent any ghosting or persistent lines.
 */
export function wipeContext(canvas: any, ctx: CanvasRenderingContext2D | null | undefined) {
  if (!ctx) return;
  const retina = canvas?.getRetinaScaling ? canvas.getRetinaScaling() : (canvas?.retinaScaling || 1);
  const backingEl = ctx.canvas;
  const clearW = Math.max(backingEl?.width || 0, Math.ceil((canvas?.getWidth?.() || 1000) * retina));
  const clearH = Math.max(backingEl?.height || 0, Math.ceil((canvas?.getHeight?.() || 1000) * retina));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, clearW, clearH);
  ctx.restore();
}

/**
 * Renders small anchor tick marks at the endpoints or element bounds (Figma / Canva style).
 */
function drawGuideTick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  orientation: 'vertical' | 'horizontal'
) {
  ctx.save();
  ctx.setLineDash([]); // solid tick line
  ctx.lineWidth = 1.5;
  const tickRadius = 3.5;
  ctx.beginPath();
  if (orientation === 'vertical') {
    ctx.moveTo(x - tickRadius, y);
    ctx.lineTo(x + tickRadius, y);
  } else {
    ctx.moveTo(x, y - tickRadius);
    ctx.lineTo(x, y + tickRadius);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders high-contrast, beautiful dashed alignment lines onto `contextTop` (upper canvas).
 */
export function renderSmartGuidelines(
  ctx: CanvasRenderingContext2D,
  guidelines: SmartGuideLine[],
  canvasWidth: number,
  canvasHeight: number
) {
  if (!ctx || !guidelines || guidelines.length === 0) return;

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);

  for (const line of guidelines) {
    if (line.guideType === 'canvas-center') {
      // Crimson-Red / Coral for primary center crosshair
      ctx.strokeStyle = '#EF4444';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 3;
    } else if (line.guideType === 'zone-center') {
      // Amber-Orange for Mug Panorama Left/Right zone centers
      ctx.strokeStyle = '#F59E0B';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 3;
    } else if (line.guideType === 'zone-divider') {
      // Sky-Blue for Mug Panorama 35% / 65% column dividers
      ctx.strokeStyle = '#38BDF8';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.40)';
      ctx.shadowBlur = 3;
    } else if (line.guideType === 'object-center') {
      // Vibrant Purple / Violet for element center-to-center
      ctx.strokeStyle = '#8B5CF6';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.40)';
      ctx.shadowBlur = 3;
    } else {
      // Vibrant Cyan / Blue for element edge-to-edge
      ctx.strokeStyle = '#0284C7';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.40)';
      ctx.shadowBlur = 3;
    }

    ctx.beginPath();
    if (line.type === 'vertical') {
      const x = Math.round(line.axisCoord) + 0.5; // subpixel crisp alignment
      const y1 = Math.max(0, line.startCoord);
      const y2 = Math.min(canvasHeight, line.endCoord);
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();

      drawGuideTick(ctx, x, y1, 'vertical');
      drawGuideTick(ctx, x, y2, 'vertical');
    } else {
      const y = Math.round(line.axisCoord) + 0.5; // subpixel crisp alignment
      const x1 = Math.max(0, line.startCoord);
      const x2 = Math.min(canvasWidth, line.endCoord);
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      drawGuideTick(ctx, x1, y, 'horizontal');
      drawGuideTick(ctx, x2, y, 'horizontal');
    }
  }

  ctx.restore();
}

/**
 * Filter out internal / non-user objects (mockups, print boundaries, background, guideline lines).
 */
export function getEligibleCanvasObjects(canvas: any, activeObj?: any): any[] {
  if (!canvas || typeof canvas.getObjects !== 'function') return [];
  const rawList = canvas.getObjects();
  const activeSet = new Set<any>();

  if (activeObj) {
    activeSet.add(activeObj);
    if (Array.isArray(activeObj._objects)) {
      activeObj._objects.forEach((o: any) => activeSet.add(o));
    }
    if (typeof activeObj.getObjects === 'function') {
      try {
        activeObj.getObjects().forEach((o: any) => activeSet.add(o));
      } catch { }
    }
  }

  return rawList.filter((o: any) => {
    if (!o || activeSet.has(o)) return false;
    const name = String(o.name || '').toLowerCase();
    if (
      name === 'background' ||
      name === 'mockup' ||
      name === 'print_area_guide' ||
      name === 'guideline' ||
      name === 'grid' ||
      name === 'centerline'
    ) {
      return false;
    }
    if (o.visible === false || o.opacity === 0) return false;
    return true;
  });
}

/**
 * Applies smart magnetic snapping to an active Fabric.js object during `object:moving`.
 */
export function applySmartSnappingToCanvas(
  canvas: any,
  activeObj: any,
  options?: SmartGuideOptions
): SmartSnappingResult {
  const emptyResult: SmartSnappingResult = {
    snappedX: false,
    snappedY: false,
    deltaX: 0,
    deltaY: 0,
    guidelines: [],
  };

  if (!canvas || !activeObj || (options && options.enabled === false)) {
    if (canvas) (canvas as any).__smartGuidelines = [];
    return emptyResult;
  }

  const activeBounds = extractObjectBounds(activeObj);
  if (!activeBounds) {
    (canvas as any).__smartGuidelines = [];
    return emptyResult;
  }

  const otherObjs = getEligibleCanvasObjects(canvas, activeObj);
  const otherBoundsList: ObjectBounds[] = [];
  for (const o of otherObjs) {
    const b = extractObjectBounds(o);
    if (b) otherBoundsList.push(b);
  }

  const cw = typeof canvas.getWidth === 'function' ? canvas.getWidth() : 1000;
  const ch = typeof canvas.getHeight === 'function' ? canvas.getHeight() : 1000;

  const result = computeSmartSnapping(activeBounds, otherBoundsList, cw, ch, options);

  if (result.snappedX) {
    activeObj.set({ left: (activeObj.left || 0) + result.deltaX });
  }
  if (result.snappedY) {
    activeObj.set({ top: (activeObj.top || 0) + result.deltaY });
  }
  if (result.snappedX || result.snappedY) {
    activeObj.setCoords();
  }

  (canvas as any).__smartGuidelines = result.guidelines;
  (canvas as any).__isInteracting = true;
  return result;
}

/**
 * Applies alignment guidelines during `object:scaling` without moving the object anchor.
 */
export function applySmartScalingGuidesToCanvas(
  canvas: any,
  activeObj: any,
  options?: SmartGuideOptions
): SmartGuideLine[] {
  if (!canvas || !activeObj || (options && options.enabled === false)) {
    if (canvas) {
      (canvas as any).__smartGuidelines = [];
      (canvas as any).__isInteracting = false;
    }
    return [];
  }

  const activeBounds = extractObjectBounds(activeObj);
  if (!activeBounds) {
    (canvas as any).__smartGuidelines = [];
    (canvas as any).__isInteracting = false;
    return [];
  }

  const otherObjs = getEligibleCanvasObjects(canvas, activeObj);
  const otherBoundsList: ObjectBounds[] = [];
  for (const o of otherObjs) {
    const b = extractObjectBounds(o);
    if (b) otherBoundsList.push(b);
  }

  const cw = typeof canvas.getWidth === 'function' ? canvas.getWidth() : 1000;
  const ch = typeof canvas.getHeight === 'function' ? canvas.getHeight() : 1000;

  const guidelines = computeScalingGuides(activeBounds, otherBoundsList, cw, ch, options);
  (canvas as any).__smartGuidelines = guidelines;
  (canvas as any).__isInteracting = true;
  return guidelines;
}

/**
 * Clears active smart guidelines from the canvas and wipes `contextTop` completely.
 */
export function clearSmartGuidelinesFromCanvas(canvas: any) {
  if (!canvas) return;
  (canvas as any).__smartGuidelines = [];
  (canvas as any).__isInteracting = false;

  const anyCanvas = canvas as any;
  if (anyCanvas.contextTop) {
    wipeContext(canvas, anyCanvas.contextTop);
    anyCanvas.contextTopDirty = true;
  }
  if (typeof canvas.requestRenderAll === 'function') {
    canvas.requestRenderAll();
  }
}

/**
 * Idempotently attaches the smart guidelines overlay renderer to `canvas.on('after:render')`.
 */
export function setupSmartGuidesOnCanvas(
  canvas: any,
  isInteractingCheck?: () => boolean
) {
  if (!canvas || (canvas as any).__smartGuidesAttached) return;
  (canvas as any).__smartGuidesAttached = true;

  if (typeof canvas.on === 'function') {
    canvas.on('after:render', () => {
      const anyCanvas = canvas as any;
      const ctxTop = anyCanvas.contextTop as CanvasRenderingContext2D | undefined;
      if (!ctxTop) return;

      const isInteracting = isInteractingCheck ? isInteractingCheck() : Boolean(anyCanvas.__isInteracting);
      const guidelines: SmartGuideLine[] = anyCanvas.__smartGuidelines;

      // When user is NOT actively dragging or scaling, ensure contextTop is completely blank!
      if (!isInteracting || !guidelines || guidelines.length === 0) {
        wipeContext(canvas, ctxTop);
        anyCanvas.contextTopDirty = true;
        return;
      }

      // Wipe previous frame before drawing new frame
      wipeContext(canvas, ctxTop);
      const cw = typeof canvas.getWidth === 'function' ? canvas.getWidth() : 1000;
      const ch = typeof canvas.getHeight === 'function' ? canvas.getHeight() : 1000;
      renderSmartGuidelines(ctxTop, guidelines, cw, ch);
      anyCanvas.contextTopDirty = true;
    });
  }
}
