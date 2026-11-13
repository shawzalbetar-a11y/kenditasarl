/**
 * Modern Global Brand Fabric.js Custom Controls & Selection Frame (Resolution-Independent Adaptive Edition)
 * Inspired by Canva, Printify, Printful, and Figma design platforms.
 * 
 * Features:
 * - Dynamically adapts handle size & border thickness to canvas resolution
 * - Compact, half-size modern handles (30px on-screen visual scale)
 * - Top-Left: Red Delete (✕) action button
 * - Top-Right: Blue Duplicate / Clone (📑) action button
 * - Bottom-Left: Indigo Rotate (↻) interactive handle
 * - Bottom-Right: Emerald Scale / Resize (⤢) interactive handle
 */

export const BASE_BUTTON_SIZE = 16; // Modern compact handle size (reduced to half for sleek UX)
export const BASE_BUTTON_RADIUS = BASE_BUTTON_SIZE / 2; // 8px at 400px reference

export interface CanvasPoint2D {
  x: number;
  y: number;
}

/**
 * Clips a polygon against an axis-aligned rectangle [minX..maxX, minY..maxY]
 * using the Sutherland-Hodgman algorithm so overflowing selection borders
 * continue rendering cleanly along the visible canvas boundary.
 */
export function clipPolygonToRect(
  poly: CanvasPoint2D[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): CanvasPoint2D[] {
  if (poly.length === 0 || minX >= maxX || minY >= maxY) return [];

  const clipEdge = (
    input: CanvasPoint2D[],
    isInside: (p: CanvasPoint2D) => boolean,
    intersect: (a: CanvasPoint2D, b: CanvasPoint2D) => CanvasPoint2D
  ): CanvasPoint2D[] => {
    if (input.length === 0) return [];
    const output: CanvasPoint2D[] = [];
    let prev = input[input.length - 1];
    let prevIn = isInside(prev);
    for (const curr of input) {
      const currIn = isInside(curr);
      if (currIn) {
        if (!prevIn) output.push(intersect(prev, curr));
        output.push(curr);
      } else if (prevIn) {
        output.push(intersect(prev, curr));
      }
      prev = curr;
      prevIn = currIn;
    }
    return output;
  };

  let res = clipEdge(
    poly,
    (p) => p.x >= minX,
    (a, b) => {
      const t = Math.abs(b.x - a.x) < 1e-6 ? 0 : (minX - a.x) / (b.x - a.x);
      return { x: minX, y: a.y + t * (b.y - a.y) };
    }
  );
  res = clipEdge(
    res,
    (p) => p.x <= maxX,
    (a, b) => {
      const t = Math.abs(b.x - a.x) < 1e-6 ? 0 : (maxX - a.x) / (b.x - a.x);
      return { x: maxX, y: a.y + t * (b.y - a.y) };
    }
  );
  res = clipEdge(
    res,
    (p) => p.y >= minY,
    (a, b) => {
      const t = Math.abs(b.y - a.y) < 1e-6 ? 0 : (minY - a.y) / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: minY };
    }
  );
  res = clipEdge(
    res,
    (p) => p.y <= maxY,
    (a, b) => {
      const t = Math.abs(b.y - a.y) < 1e-6 ? 0 : (maxY - a.y) / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: maxY };
    }
  );
  return res;
}

/**
 * Separates two adjacent corner controls along an axis only when clamping to a
 * boundary wall collapsed them closer than minSep while their raw box was wider.
 */
function separateClampedPair(
  c1: CanvasPoint2D,
  raw1: CanvasPoint2D,
  c2: CanvasPoint2D,
  raw2: CanvasPoint2D,
  axis: 'x' | 'y',
  minVal: number,
  maxVal: number,
  minSep: number
) {
  const other: 'x' | 'y' = axis === 'x' ? 'y' : 'x';
  const rawSpan = Math.hypot(raw2.x - raw1.x, raw2.y - raw1.y);
  if (rawSpan < minSep) return;

  const distNow = Math.hypot(c2.x - c1.x, c2.y - c1.y);
  if (distNow >= minSep || Math.abs(c2[other] - c1[other]) >= minSep) return;

  const firstSmaller = raw1[axis] <= raw2[axis];
  const lo = firstSmaller ? c1 : c2;
  const hi = firstSmaller ? c2 : c1;

  if (hi[axis] >= maxVal - 2) {
    hi[axis] = maxVal;
    lo[axis] = Math.max(minVal, maxVal - minSep);
  } else if (lo[axis] <= minVal + 2) {
    lo[axis] = minVal;
    hi[axis] = Math.min(maxVal, minVal + minSep);
  }
}

export function clampCornerControlsMap(
  coords: Record<string, { x: number; y: number }>,
  canvasWidth: number,
  canvasHeight: number,
  safePad: number,
  minPairSep: number
): Record<'tl' | 'tr' | 'bl' | 'br', boolean> {
  const clampedFlags: Record<'tl' | 'tr' | 'bl' | 'br', boolean> = {
    tl: false,
    tr: false,
    bl: false,
    br: false,
  };
  if (canvasWidth <= 0 || canvasHeight <= 0) return clampedFlags;

  const minX = Math.min(safePad, canvasWidth * 0.25);
  const maxX = Math.max(minX, canvasWidth - minX);
  const minY = Math.min(safePad, canvasHeight * 0.25);
  const maxY = Math.max(minY, canvasHeight - minY);

  const cornerKeys = ['tl', 'tr', 'bl', 'br'] as const;
  const rawMap: Partial<Record<(typeof cornerKeys)[number], CanvasPoint2D>> = {};

  for (const key of cornerKeys) {
    const pt = coords[key];
    if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;
    rawMap[key] = { x: pt.x, y: pt.y };
    const cx = Math.max(minX, Math.min(maxX, pt.x));
    const cy = Math.max(minY, Math.min(maxY, pt.y));
    clampedFlags[key] = cx !== pt.x || cy !== pt.y;
    pt.x = cx;
    pt.y = cy;
  }

  const pairs: Array<[(typeof cornerKeys)[number], (typeof cornerKeys)[number], 'x' | 'y', number, number]> = [
    ['tl', 'tr', 'x', minX, maxX],
    ['bl', 'br', 'x', minX, maxX],
    ['tl', 'bl', 'y', minY, maxY],
    ['tr', 'br', 'y', minY, maxY],
  ];

  for (const [k1, k2, axis, lo, hi] of pairs) {
    const p1 = coords[k1];
    const p2 = coords[k2];
    const r1 = rawMap[k1];
    const r2 = rawMap[k2];
    if (p1 && p2 && r1 && r2) {
      separateClampedPair(p1, r1, p2, r2, axis, lo, hi, minPairSep);
    }
  }

  return clampedFlags;
}

export function setupModernFabricControls(fabric: any) {
  if (!fabric || !fabric.Object || !fabric.Control) return;

  const controlsUtils = fabric.controlsUtils;
  if (!controlsUtils) return;

  // 1. Base Object Defaults
  fabric.Object.prototype.set({
    borderColor: '#2563EB',
    borderDashArray: [10, 8],
    borderScaleFactor: 1.8,
    padding: 12,
    transparentCorners: false,
    cornerSize: 42,
    touchCornerSize: 56,
    cornerStyle: 'circle',
    hasBorders: true,
    hasControls: true,
  });

  // 2. Generic White Circular Action Button Renderer with Resolution-Adaptive Scaling
  function renderActionCircle(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    _styleOverride: any,
    fabricObject: any,
    drawIcon: (ctx: CanvasRenderingContext2D, radius: number, scale: number) => void
  ) {
    const canvasWidth = fabricObject?.canvas?.getWidth ? fabricObject.canvas.getWidth() : (fabricObject?.canvas?.width || 400);
    const rawScale = Math.max(1, canvasWidth / 400);
    const scale = rawScale * 0.52; // Compact half-size scale factor
    const radius = Math.round(BASE_BUTTON_RADIUS * rawScale); // Exactly half diameter (~20px radius in 1000px canvas)

    ctx.save();
    ctx.translate(left, top);

    // Soft Subtle Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = Math.round(3.5 * scale);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(2 * scale);

    // White Circle Base
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Crisp Clean Border Ring
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#CBD5E1'; // slate-300
    ctx.lineWidth = Math.max(1.2, 1.3 * scale);
    ctx.stroke();

    // Render Inner Icon
    drawIcon(ctx, radius, scale);

    ctx.restore();
  }

  // 3. Icon Renderers
  // A. Delete Icon (Bold Red '✕')
  function renderDeleteIcon(ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) {
    renderActionCircle(ctx, left, top, styleOverride, fabricObject, (c, r, s) => {
      const iconSize = r * 0.44;
      c.strokeStyle = '#EF4444'; // red-500
      c.lineWidth = Math.max(1.8, 1.8 * s);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-iconSize, -iconSize);
      c.lineTo(iconSize, iconSize);
      c.moveTo(iconSize, -iconSize);
      c.lineTo(-iconSize, iconSize);
      c.stroke();
    });
  }

  // B. Clone / Duplicate Icon (Bold Blue '📑')
  function renderCloneIcon(ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) {
    renderActionCircle(ctx, left, top, styleOverride, fabricObject, (c, r, s) => {
      const w = r * 0.50;
      const h = r * 0.50;
      c.strokeStyle = '#2563EB'; // blue-600
      c.lineWidth = Math.max(1.5, 1.5 * s);
      c.lineCap = 'round';
      c.lineJoin = 'round';

      // Back Page
      c.strokeRect(-w * 0.3, -h * 0.8, w, h);

      // Front Page
      c.fillStyle = '#ffffff';
      c.fillRect(-w * 0.8, -h * 0.3, w, h);
      c.strokeRect(-w * 0.8, -h * 0.3, w, h);
    });
  }

  // C. Rotate Icon (Bold Indigo '↻')
  function renderRotateIcon(ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) {
    renderActionCircle(ctx, left, top, styleOverride, fabricObject, (c, r, s) => {
      const arcR = r * 0.48;
      c.strokeStyle = '#4F46E5'; // indigo-600
      c.lineWidth = Math.max(1.8, 1.6 * s);
      c.lineCap = 'round';

      // Circular arc
      c.beginPath();
      c.arc(0, 0, arcR, -Math.PI * 0.15, Math.PI * 1.35, false);
      c.stroke();

      // Arrowhead
      const arrowAngle = -Math.PI * 0.15;
      const ax = arcR * Math.cos(arrowAngle);
      const ay = arcR * Math.sin(arrowAngle);
      c.fillStyle = '#4F46E5';
      c.beginPath();
      c.moveTo(ax - 1.5 * s, ay - 3.5 * s);
      c.lineTo(ax + 4.5 * s, ay + 0.8 * s);
      c.lineTo(ax - 3.5 * s, ay + 2.8 * s);
      c.closePath();
      c.fill();
    });
  }

  // D. Scale / Resize Icon (Bold Emerald '⤢')
  function renderScaleIcon(ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) {
    renderActionCircle(ctx, left, top, styleOverride, fabricObject, (c, r, s) => {
      const iconSize = r * 0.48;
      c.strokeStyle = '#059669'; // emerald-600
      c.lineWidth = Math.max(1.8, 1.6 * s);
      c.lineCap = 'round';
      c.lineJoin = 'round';

      // Diagonal line
      c.beginPath();
      c.moveTo(-iconSize, iconSize);
      c.lineTo(iconSize, -iconSize);
      c.stroke();

      // Top-Right Arrowhead
      c.beginPath();
      c.moveTo(iconSize - 4 * s, -iconSize);
      c.lineTo(iconSize, -iconSize);
      c.lineTo(iconSize, -iconSize + 4 * s);
      c.stroke();

      // Bottom-Left Arrowhead
      c.beginPath();
      c.moveTo(-iconSize + 4 * s, iconSize);
      c.lineTo(-iconSize, iconSize);
      c.lineTo(-iconSize, iconSize - 4 * s);
      c.stroke();
    });
  }

  // 4. Action Event Handlers
  // Delete Object
  function deleteObjectAction(_eventData: any, transformData: any) {
    const target = transformData.target;
    const canvas = target?.canvas;
    if (canvas && target) {
      canvas.remove(target);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      return true;
    }
    return false;
  }

  // Clone Object
  function cloneObjectAction(_eventData: any, transformData: any) {
    const target = transformData.target;
    const canvas = target?.canvas;
    if (canvas && target) {
      target.clone((cloned: any) => {
        const canvasWidth = canvas.getWidth ? canvas.getWidth() : 400;
        const rawScale = Math.max(1, canvasWidth / 400);
        const scale = rawScale * 0.52;

        cloned.set({
          left: (target.left || 0) + Math.round(15 * rawScale),
          top: (target.top || 0) + Math.round(15 * rawScale),
          evented: true,
          borderColor: '#2563EB',
          borderDashArray: [Math.round(5 * rawScale), Math.round(4 * rawScale)],
          borderScaleFactor: Math.max(1.5, Math.round(1.6 * scale)),
          padding: Math.round(6 * rawScale),
          transparentCorners: false,
          cornerSize: Math.round(40 * (rawScale / 2.5)),
          touchCornerSize: Math.round(52 * (rawScale / 2.5)),
        });
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        cloned.setCoords();
        canvas.requestRenderAll();
      });
      return true;
    }
    return false;
  }

  // Clamped-safe corner scale handler: prevents abrupt scale jump when the bottom-right
  // resize handle was clamped inside canvas bounds while an image overflows the stage.
  const clampedCornerScaleAction = controlsUtils.wrapWithFireEvent(
    'scaling',
    controlsUtils.wrapWithFixedAnchor(function (_eventData: any, transform: any, x: number, y: number) {
      const target = transform.target;
      if (!target || target.lockScalingX || target.lockScalingY) return false;

      if (!transform._clampedAnchorPt) {
        const anchorPt = target.translateToOriginPoint(
          target.getCenterPoint(),
          transform.originX,
          transform.originY
        );
        const ex = typeof transform.ex === 'number' ? transform.ex : x;
        const ey = typeof transform.ey === 'number' ? transform.ey : y;
        const startDx = ex - anchorPt.x;
        const startDy = ey - anchorPt.y;
        const startDist = Math.max(12, Math.hypot(startDx, startDy));
        transform._clampedAnchorPt = anchorPt;
        transform._clampedStartDist = startDist;
        transform._clampedUnitX = startDx / startDist;
        transform._clampedUnitY = startDy / startDist;
      }

      const anchor = transform._clampedAnchorPt;
      const dx = x - anchor.x;
      const dy = y - anchor.y;
      const dot = dx * transform._clampedUnitX + dy * transform._clampedUnitY;
      // Guard against accidental image flip if dragged past the opposite corner anchor
      if (dot <= 8) return false;

      const curDist = Math.hypot(dx, dy);
      const ratio = Math.max(0.05, curDist / transform._clampedStartDist);
      const origScaleX = transform.original?.scaleX ?? target.scaleX ?? 1;
      const origScaleY = transform.original?.scaleY ?? target.scaleY ?? 1;

      const oldSX = target.scaleX;
      const oldSY = target.scaleY;
      target.set('scaleX', origScaleX * ratio);
      target.set('scaleY', origScaleY * ratio);
      return oldSX !== target.scaleX || oldSY !== target.scaleY;
    })
  );

  function smartScalingAction(eventData: any, transform: any, x: number, y: number) {
    if (transform._useClampedScale === undefined) {
      const cornerKey = transform.corner;
      transform._useClampedScale = Boolean(transform.target?.__clampedCorners?.[cornerKey]);
    }
    if (transform._useClampedScale) {
      return clampedCornerScaleAction(eventData, transform, x, y);
    }
    return controlsUtils.scalingEqually(eventData, transform, x, y);
  }

  // 5. Construct Controls Map (Fabric will use obj.cornerSize / obj.touchCornerSize for hit-testing bounds)
  const customControls: Record<string, any> = {
    // Top-Left: Delete button (✕)
    tl: new fabric.Control({
      x: -0.5,
      y: -0.5,
      cursorStyle: 'pointer',
      mouseUpHandler: deleteObjectAction,
      render: renderDeleteIcon,
    }),

    // Top-Right: Clone button (📑)
    tr: new fabric.Control({
      x: 0.5,
      y: -0.5,
      cursorStyle: 'pointer',
      mouseUpHandler: cloneObjectAction,
      render: renderCloneIcon,
    }),

    // Bottom-Left: Rotate button (↻)
    bl: new fabric.Control({
      x: -0.5,
      y: 0.5,
      cursorStyle: 'crosshair',
      actionHandler: controlsUtils.rotationWithSnapping,
      actionName: 'rotate',
      render: renderRotateIcon,
    }),

    // Bottom-Right: Scale button (⤢)
    br: new fabric.Control({
      x: 0.5,
      y: 0.5,
      cursorStyle: 'nwse-resize',
      actionHandler: smartScalingAction,
      actionName: 'scale',
      render: renderScaleIcon,
    }),
  };

  // Assign to Object prototypes
  fabric.Object.prototype.controls = customControls;
  if (fabric.IText) fabric.IText.prototype.controls = customControls;
  if (fabric.Textbox) fabric.Textbox.prototype.controls = customControls;
  if (fabric.Image) fabric.Image.prototype.controls = customControls;
  if (fabric.Path) fabric.Path.prototype.controls = customControls;

  // Idempotent guard so Next.js HMR never double-wraps Fabric prototypes
  if (!(fabric.Object.prototype as any).__modernClampedControlsPatched) {
    (fabric.Object.prototype as any).__modernClampedControlsPatched = true;

    const origCalcOCoords = fabric.Object.prototype.calcOCoords;
    fabric.Object.prototype.calcOCoords = function () {
      const coords = origCalcOCoords.call(this);
      if (!coords || this.group || !this.canvas) return coords;

      const cw = this.canvas.getWidth ? this.canvas.getWidth() : (this.canvas.width || 0);
      const ch = this.canvas.getHeight ? this.canvas.getHeight() : (this.canvas.height || 0);
      if (cw <= 0 || ch <= 0) return coords;

      const rawScale = Math.max(1, cw / 400);
      const radius = Math.round(BASE_BUTTON_RADIUS * rawScale);
      const safePad = radius + Math.max(4, Math.round(rawScale * 1.5));
      const minPairSep = Math.min(Math.min(cw, ch) * 0.35, radius * 2.15);

      (this as any).__clampedCorners = clampCornerControlsMap(coords, cw, ch, safePad, minPairSep);
      return coords;
    };

    const origDrawBorders = fabric.Object.prototype.drawBorders;
    fabric.Object.prototype.drawBorders = function (ctx: CanvasRenderingContext2D, styleOverride?: any) {
      if (!this.canvas || this.group || styleOverride?.forActiveSelection) {
        return origDrawBorders.call(this, ctx, styleOverride);
      }

      const cw = this.canvas.getWidth ? this.canvas.getWidth() : (this.canvas.width || 0);
      const ch = this.canvas.getHeight ? this.canvas.getHeight() : (this.canvas.height || 0);
      if (cw <= 0 || ch <= 0 || typeof (this as any)._calculateCurrentDimensions !== 'function') {
        return origDrawBorders.call(this, ctx, styleOverride);
      }

      const opts = styleOverride || {};
      const wh = (this as any)._calculateCurrentDimensions();
      const strokeWidth = this.borderScaleFactor || 1.5;
      const boxW = wh.x + strokeWidth;
      const boxH = wh.y + strokeWidth;
      const inset = Math.max(2, strokeWidth * 0.8 + 1);

      const vpt = this.getViewportTransform();
      const matrix = fabric.util.multiplyTransformMatrices(vpt, this.calcTransformMatrix());
      const decomp = fabric.util.qrDecompose(matrix);
      let angleDeg = this.angle || 0;
      if (this.flipX) angleDeg -= 180;
      const rad = fabric.util.degreesToRadians(angleDeg);
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const hw = boxW / 2;
      const hh = boxH / 2;
      const cx = decomp.translateX;
      const cy = decomp.translateY;

      const rawPoly: CanvasPoint2D[] = [
        { x: cx + (-hw * cosA + hh * sinA), y: cy + (-hw * sinA - hh * cosA) },
        { x: cx + (hw * cosA + hh * sinA), y: cy + (hw * sinA - hh * cosA) },
        { x: cx + (hw * cosA - hh * sinA), y: cy + (hw * sinA + hh * cosA) },
        { x: cx + (-hw * cosA - hh * sinA), y: cy + (-hw * sinA + hh * cosA) },
      ];

      const allInside = rawPoly.every(
        (p) => p.x >= inset && p.x <= cw - inset && p.y >= inset && p.y <= ch - inset
      );
      if (allInside) {
        return origDrawBorders.call(this, ctx, styleOverride);
      }

      const clippedPoly = clipPolygonToRect(rawPoly, inset, cw - inset, inset, ch - inset);
      if (clippedPoly.length < 2) {
        return this;
      }

      const retinaScaling = this.canvas.getRetinaScaling ? this.canvas.getRetinaScaling() : 1;
      const dashArray = opts.borderDashArray || this.borderDashArray;
      const strokeColor = opts.borderColor || this.borderColor || '#2563EB';

      ctx.save();
      ctx.setTransform(retinaScaling, 0, 0, retinaScaling, 0, 0);
      if (Array.isArray(dashArray) && dashArray.length > 0) {
        ctx.setLineDash(dashArray);
      } else {
        ctx.setLineDash([]);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(clippedPoly[0].x, clippedPoly[0].y);
      for (let i = 1; i < clippedPoly.length; i++) {
        ctx.lineTo(clippedPoly[i].x, clippedPoly[i].y);
      }
      ctx.closePath();

      // Subtle white contrast backing so clamped edges remain crisp on dark & light designs
      ctx.lineWidth = strokeWidth + 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.stroke();

      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      ctx.restore();

      return this;
    };
  }
}

/**
 * Apply adaptive modern styles to all objects in the canvas based on canvas resolution.
 */
export function applyModernObjectStyles(targetCanvas: any) {
  if (!targetCanvas || !targetCanvas.getObjects) return;
  const canvasWidth = targetCanvas.getWidth ? targetCanvas.getWidth() : (targetCanvas.width || 400);
  const rawScale = Math.max(1, canvasWidth / 400);
  const scale = rawScale * 0.52;

  const cornerSize = Math.round(40 * (rawScale / 2.5)); // Compact hit area
  const touchCornerSize = Math.round(52 * (rawScale / 2.5));
  const borderScaleFactor = Math.max(1.5, Math.round(1.6 * scale));
  const padding = Math.round(6 * rawScale); // Compact padding
  const borderDashArray = [Math.round(5 * rawScale), Math.round(4 * rawScale)];

  targetCanvas.getObjects().forEach((obj: any) => {
    obj.set({
      borderColor: '#2563EB',
      borderDashArray,
      borderScaleFactor,
      padding,
      transparentCorners: false,
      cornerSize,
      touchCornerSize,
      cornerStyle: 'circle',
      hasBorders: true,
      hasControls: true,
    });
    obj.setCoords();
  });
}

/**
 * Apply adaptive modern styles to a single object based on canvas resolution.
 */
export function applyModernStyleToObject(obj: any, targetCanvas?: any) {
  if (!obj) return;
  const canvasWidth = targetCanvas?.getWidth ? targetCanvas.getWidth() : (obj?.canvas?.getWidth ? obj.canvas.getWidth() : 400);
  const rawScale = Math.max(1, canvasWidth / 400);
  const scale = rawScale * 0.52;

  const cornerSize = Math.round(40 * (rawScale / 2.5));
  const touchCornerSize = Math.round(52 * (rawScale / 2.5));
  const borderScaleFactor = Math.max(1.5, Math.round(1.6 * scale));
  const padding = Math.round(6 * rawScale);
  const borderDashArray = [Math.round(5 * rawScale), Math.round(4 * rawScale)];

  obj.set({
    borderColor: '#2563EB',
    borderDashArray,
    borderScaleFactor,
    padding,
    transparentCorners: false,
    cornerSize,
    touchCornerSize,
    cornerStyle: 'circle',
    hasBorders: true,
    hasControls: true,
  });
  if (obj.setCoords) obj.setCoords();
}
