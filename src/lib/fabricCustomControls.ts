/**
 * Modern Global Brand Fabric.js Custom Controls & Selection Frame (Resolution-Independent Adaptive Edition)
 * Inspired by Canva, Printify, Printful, and Figma design platforms.
 * 
 * Features:
 * - Dynamically adapts handle size & border thickness to canvas resolution
 * - Guaranteed identical on-screen visual scale across all mockups (400px to 3000px)
 * - Top-Left: Red Delete (✕) action button
 * - Top-Right: Blue Duplicate / Clone (📑) action button
 * - Bottom-Left: Indigo Rotate (↻) interactive handle
 * - Bottom-Right: Emerald Scale / Resize (⤢) interactive handle
 */

export const BASE_BUTTON_SIZE = 32; // Touch-friendly base handle size (at 400px reference)
export const BASE_BUTTON_RADIUS = BASE_BUTTON_SIZE / 2;

export function setupModernFabricControls(fabric: any) {
  if (!fabric || !fabric.Object || !fabric.Control) return;

  const controlsUtils = fabric.controlsUtils;
  if (!controlsUtils) return;

  // 1. Base Object Defaults
  fabric.Object.prototype.set({
    borderColor: '#2563EB',
    borderDashArray: [8, 6],
    borderScaleFactor: 2.5,
    padding: 10,
    transparentCorners: false,
    cornerSize: BASE_BUTTON_SIZE,
    touchCornerSize: 44,
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
    const scale = Math.max(1, canvasWidth / 400);
    const radius = BASE_BUTTON_RADIUS * scale;

    ctx.save();
    ctx.translate(left, top);

    // Soft Subtle Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = Math.round(5 * scale);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(2.5 * scale);

    // White Circle Base
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Crisp Clean Border Ring
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#94A3B8'; // slate-400
    ctx.lineWidth = Math.max(1.8, 1.8 * scale);
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
      c.lineWidth = Math.max(2.8, 2.8 * s);
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
      const w = r * 0.52;
      const h = r * 0.52;
      c.strokeStyle = '#2563EB'; // blue-600
      c.lineWidth = Math.max(2.2, 2.2 * s);
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
      c.lineWidth = Math.max(2.5, 2.5 * s);
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
      c.moveTo(ax - 2 * s, ay - 4.5 * s);
      c.lineTo(ax + 5.5 * s, ay + 1 * s);
      c.lineTo(ax - 4.5 * s, ay + 3.5 * s);
      c.closePath();
      c.fill();
    });
  }

  // D. Scale / Resize Icon (Bold Emerald '⤢')
  function renderScaleIcon(ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) {
    renderActionCircle(ctx, left, top, styleOverride, fabricObject, (c, r, s) => {
      const iconSize = r * 0.48;
      c.strokeStyle = '#059669'; // emerald-600
      c.lineWidth = Math.max(2.5, 2.5 * s);
      c.lineCap = 'round';
      c.lineJoin = 'round';

      // Diagonal line
      c.beginPath();
      c.moveTo(-iconSize, iconSize);
      c.lineTo(iconSize, -iconSize);
      c.stroke();

      // Top-Right Arrowhead
      c.beginPath();
      c.moveTo(iconSize - 5 * s, -iconSize);
      c.lineTo(iconSize, -iconSize);
      c.lineTo(iconSize, -iconSize + 5 * s);
      c.stroke();

      // Bottom-Left Arrowhead
      c.beginPath();
      c.moveTo(-iconSize + 5 * s, iconSize);
      c.lineTo(-iconSize, iconSize);
      c.lineTo(-iconSize, iconSize - 5 * s);
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
        const scale = Math.max(1, canvasWidth / 400);

        cloned.set({
          left: (target.left || 0) + Math.round(20 * scale),
          top: (target.top || 0) + Math.round(20 * scale),
          evented: true,
          borderColor: '#2563EB',
          borderDashArray: [Math.round(8 * scale), Math.round(6 * scale)],
          borderScaleFactor: Math.max(2, Math.round(2.5 * scale)),
          padding: Math.round(10 * scale),
          transparentCorners: false,
          cornerSize: Math.round(32 * scale),
          touchCornerSize: Math.round(44 * scale),
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
      actionHandler: controlsUtils.scalingEqually,
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
}

/**
 * Apply adaptive modern styles to all objects in the canvas based on canvas resolution.
 */
export function applyModernObjectStyles(targetCanvas: any) {
  if (!targetCanvas || !targetCanvas.getObjects) return;
  const canvasWidth = targetCanvas.getWidth ? targetCanvas.getWidth() : (targetCanvas.width || 400);
  const scale = Math.max(1, canvasWidth / 400);

  const cornerSize = Math.round(32 * scale);
  const touchCornerSize = Math.round(44 * scale);
  const borderScaleFactor = Math.max(2, Math.round(2.5 * scale));
  const padding = Math.round(10 * scale);
  const borderDashArray = [Math.round(8 * scale), Math.round(6 * scale)];

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
  const scale = Math.max(1, canvasWidth / 400);

  obj.set({
    borderColor: '#2563EB',
    borderDashArray: [Math.round(8 * scale), Math.round(6 * scale)],
    borderScaleFactor: Math.max(2, Math.round(2.5 * scale)),
    padding: Math.round(10 * scale),
    transparentCorners: false,
    cornerSize: Math.round(32 * scale),
    touchCornerSize: Math.round(44 * scale),
    cornerStyle: 'circle',
    hasBorders: true,
    hasControls: true,
  });
  if (obj.setCoords) obj.setCoords();
}
