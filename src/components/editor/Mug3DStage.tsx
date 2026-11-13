"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Rotate3d,
  Flame,
  Snowflake,
  Pause,
  Play,
  Maximize2,
  EyeOff,
} from 'lucide-react';
import type { MugMeta } from '@/lib/productStudioProfile';

export const MUG_CAMERA_ANGLES = {
  front: 0,
  right: 0,
  panorama: -Math.PI / 2,
  left: Math.PI,
  opposite: Math.PI,
  handle: Math.PI / 2,
  thumbnailHero: -Math.PI * 0.72,
} as const;

export function normalizeMugRad(rad: number): number {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#ffffff').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
        .split('')
        .map((ch) => ch + ch)
        .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 245, g: 245, b: 244 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function shadeRgb(rgb: { r: number; g: number; b: number }, factor: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(rgb.r * factor)}, ${clamp(rgb.g * factor)}, ${clamp(rgb.b * factor)})`;
}

function mixRgbObj(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const u = Math.max(0, Math.min(1, t));
  return {
    r: clamp(a.r + (b.r - a.r) * u),
    g: clamp(a.g + (b.g - a.g) * u),
    b: clamp(a.b + (b.b - a.b) * u),
  };
}

export interface RenderMugSceneOptions {
  cssW: number;
  cssH: number;
  yawRad: number;
  tiltRad: number;
  mugMeta: MugMeta;
  selectedColorHex?: string;
  selectedCapacity?: string;
  isFullWrapMode: boolean;
  heatRevealPct: number;
  frontImg: HTMLImageElement | null;
  backImg: HTMLImageElement | null;
  bgStyle?: 'studio' | 'clean';
}

interface CylinderTextureLayer {
  img: HTMLImageElement;
  centerTheta: number;
  halfSpan: number;
  topPad: number;
  drawH: number;
}

/**
 * Computes aspect-locked cylindrical UV mapping so 2D canvas artwork never
 * stretches horizontally or compresses vertically when wrapped onto the 3D mug.
 * Compensates for camera tilt foreshortening so circumferential coverage matches
 * true physical centimeters around the cylinder.
 */
function resolveCylinderTextureLayer(
  img: HTMLImageElement | null,
  centerTheta: number,
  radiusPx: number,
  cylH: number,
  maxSpanDeg: number,
  maxHeightRatio: number,
  tiltRad: number = 0
): CylinderTextureLayer | null {
  if (!img || img.width <= 0 || img.height <= 0 || radiusPx <= 0 || cylH <= 0) {
    return null;
  }

  const imgAspect = img.width / img.height;
  const maxSpanRad = (maxSpanDeg * Math.PI) / 180;
  const maxDrawH = cylH * maxHeightRatio;
  const cosTilt = Math.max(0.84, Math.cos(tiltRad));
  const surfaceDrawH = maxDrawH / cosTilt;

  let spanRad = (surfaceDrawH * imgAspect) / radiusPx;
  let drawH = maxDrawH;

  if (spanRad > maxSpanRad) {
    spanRad = maxSpanRad;
    const clampedSurfaceH = (spanRad * radiusPx) / imgAspect;
    drawH = Math.min(maxDrawH, clampedSurfaceH * cosTilt);
  }

  return {
    img,
    centerTheta,
    halfSpan: spanRad / 2,
    topPad: (cylH - drawH) / 2,
    drawH,
  };
}

/**
 * Pure 2D-projected Cylindrical 3D Mug Renderer.
 * Projects flat 2D panoramic / single / two-sided artwork column-by-column around
 * a curved ceramic cylinder with realistic lighting, handle depth sorting, and glaze sheen.
 */
export function renderMugSceneToContext(
  ctx: CanvasRenderingContext2D,
  opts: RenderMugSceneOptions
) {
  const {
    cssW,
    cssH,
    yawRad,
    tiltRad,
    mugMeta,
    selectedColorHex = '#ffffff',
    selectedCapacity = '11oz',
    isFullWrapMode,
    heatRevealPct,
    frontImg,
    backImg,
    bgStyle = 'studio',
  } = opts;

  ctx.clearRect(0, 0, cssW, cssH);

  // Subtle studio pedestal backdrop
  const stageGrad = ctx.createRadialGradient(
    cssW * 0.5,
    cssH * 0.45,
    Math.min(cssW, cssH) * 0.06,
    cssW * 0.5,
    cssH * 0.5,
    Math.max(cssW, cssH) * 0.68
  );
  if (bgStyle === 'clean') {
    stageGrad.addColorStop(0, '#ffffff');
    stageGrad.addColorStop(1, '#f1f5f9');
  } else {
    stageGrad.addColorStop(0, '#ffffff');
    stageGrad.addColorStop(1, '#e2e8f0');
  }
  ctx.fillStyle = stageGrad;
  ctx.fillRect(0, 0, cssW, cssH);

  const isLarge15oz = selectedCapacity === '15oz';
  const cx = cssW * 0.5;
  const R = Math.min(cssW * 0.22, cssH * (isLarge15oz ? 0.25 : 0.275));
  // Real ceramic proportions: 11oz (~8.1x9.5 cm -> 2.30*R on tilted cylinder), 15oz (~8.5x11.4 cm -> 2.58*R)
  const cylH = R * (isLarge15oz ? 2.58 : 2.30);
  const ry = Math.max(6, R * Math.sin(tiltRad));
  const topCenterY = cssH * 0.5 - cylH * 0.48;
  const botCenterY = topCenterY + cylH;

  const isMagic = mugMeta.mugStyle === 'magic';
  const isInnerColor = mugMeta.mugStyle === 'inner_color';

  const whiteCeramic = { r: 247, g: 247, b: 246 };
  const coatRgb = parseHexToRgb(mugMeta.magicRevealCoverColor || selectedColorHex || '#141414');
  const selectedRgb = parseHexToRgb(selectedColorHex || '#ffffff');
  const rimAndHandleRgb = isInnerColor
    ? selectedRgb
    : isMagic
      ? coatRgb
      : whiteCeramic;
  const interiorRgb = isInnerColor ? selectedRgb : whiteCeramic;

  // Table contact shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, botCenterY + ry * 0.85, R * 1.18, ry * 1.1, 0, 0, Math.PI * 2);
  const shadowGrad = ctx.createRadialGradient(
    cx,
    botCenterY + ry * 0.85,
    R * 0.2,
    cx,
    botCenterY + ry * 0.85,
    R * 1.25
  );
  shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.26)');
  shadowGrad.addColorStop(0.65, 'rgba(15, 23, 42, 0.09)');
  shadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.fill();
  ctx.restore();

  // Handle depth sorting (handle sits at worldTheta = +PI/2)
  const handleAngleRelCam = normalizeMugRad(Math.PI / 2 - yawRad);
  const handleSinX = Math.sin(handleAngleRelCam);
  const handleCosZ = Math.cos(handleAngleRelCam);

  const renderHandle = () => {
    const sideSign = handleSinX >= 0 ? 1 : -1;
    const absProfile = Math.abs(handleSinX);
    if (handleCosZ < 0 && absProfile < 0.16) return;

    const attachX = cx + handleSinX * R * 0.96;
    const outerReach = R * (0.58 * absProfile);
    const yCurveShift = ry * (handleCosZ > 0 ? 0.55 * handleCosZ : 0.35);
    const yTop = topCenterY + cylH * 0.2 + yCurveShift;
    const yBot = topCenterY + cylH * 0.78 + yCurveShift;
    const strokeW = Math.max(8, R * 0.145);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(attachX, yTop);
    ctx.bezierCurveTo(
      attachX + sideSign * outerReach * 1.15,
      yTop - cylH * 0.04 * Math.min(1, absProfile * 2),
      attachX + sideSign * outerReach * 1.15,
      yBot + cylH * 0.04 * Math.min(1, absProfile * 2),
      attachX,
      yBot
    );
    ctx.lineWidth = strokeW + 3;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.stroke();

    const handleShade = handleCosZ > 0 ? 0.96 : 0.84;
    ctx.beginPath();
    ctx.moveTo(attachX, yTop);
    ctx.bezierCurveTo(
      attachX + sideSign * outerReach * 1.15,
      yTop - cylH * 0.04 * Math.min(1, absProfile * 2),
      attachX + sideSign * outerReach * 1.15,
      yBot + cylH * 0.04 * Math.min(1, absProfile * 2),
      attachX,
      yBot
    );
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = shadeRgb(rimAndHandleRgb, handleShade);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(attachX + (absProfile < 0.08 ? 0 : sideSign * 2), yTop + 3);
    ctx.bezierCurveTo(
      attachX + sideSign * outerReach * 1.05,
      yTop,
      attachX + sideSign * outerReach * 1.05,
      yBot,
      attachX + (absProfile < 0.08 ? 0 : sideSign * 2),
      yBot - 3
    );
    ctx.lineWidth = Math.max(2, strokeW * 0.24);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.stroke();
    ctx.restore();
  };

  if (handleCosZ < 0) {
    renderHandle();
  }

  // 1. Interior Bowl & Rim Lip
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, topCenterY, R, ry, 0, 0, Math.PI * 2);
  const rimGrad = ctx.createLinearGradient(cx - R, topCenterY, cx + R, topCenterY);
  rimGrad.addColorStop(0, shadeRgb(interiorRgb, 0.72));
  rimGrad.addColorStop(0.5, shadeRgb(interiorRgb, 0.92));
  rimGrad.addColorStop(1, shadeRgb(interiorRgb, 0.68));
  ctx.fillStyle = rimGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, topCenterY + 2, R * 0.91, Math.max(3, ry * 0.84), 0, 0, Math.PI * 2);
  const innerGrad = ctx.createRadialGradient(
    cx - R * 0.2,
    topCenterY + ry * 0.4,
    R * 0.1,
    cx,
    topCenterY,
    R * 0.95
  );
  innerGrad.addColorStop(0, shadeRgb(interiorRgb, 0.98));
  innerGrad.addColorStop(0.7, shadeRgb(interiorRgb, 0.75));
  innerGrad.addColorStop(1, shadeRgb(interiorRgb, 0.56));
  ctx.fillStyle = innerGrad;
  ctx.fill();

  if (isMagic && heatRevealPct > 5) {
    const liquidAlpha = Math.min(0.92, heatRevealPct / 70);
    ctx.beginPath();
    ctx.ellipse(
      cx,
      topCenterY + ry * 0.32,
      R * 0.85,
      Math.max(2.5, ry * 0.72),
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = `rgba(62, 34, 18, ${liquidAlpha})`;
    ctx.fill();
  }
  ctx.restore();

  // 2. Column-Projected Cylindrical Surface + Wrapped Artwork + Ceramic Glaze Blend
  // Full-wrap spans up to ~320 deg leaving <= 1 cm ceramic clearance on each side of handle
  const textureLayers: CylinderTextureLayer[] = (
    isFullWrapMode
      ? [
        resolveCylinderTextureLayer(
          frontImg,
          -Math.PI / 2,
          R,
          cylH,
          324,
          isLarge15oz ? 0.85 : 0.975,
          tiltRad
        ),
      ]
      : [
        resolveCylinderTextureLayer(
          frontImg,
          0,
          R,
          cylH,
          136,
          isLarge15oz ? 0.82 : 0.93,
          tiltRad
        ),
        resolveCylinderTextureLayer(
          backImg,
          Math.PI,
          R,
          cylH,
          136,
          isLarge15oz ? 0.82 : 0.93,
          tiltRad
        ),
      ]
  ).filter((layer): layer is CylinderTextureLayer => layer !== null);

  const minX = Math.floor(cx - R);
  const maxX = Math.ceil(cx + R);
  const stripW = 1.6;
  const revealedBottomY = botCenterY - cylH * (heatRevealPct / 100);
  const coldHideAlpha = isMagic ? 0.95 : 0;

  for (let x = minX; x <= maxX; x += 1) {
    const dx = Math.max(-1, Math.min(1, (x - cx) / R));
    const alpha = Math.asin(dx);
    const cosA = Math.cos(alpha);
    const curveY = ry * cosA;
    const topY = topCenterY + curveY;
    const botY = botCenterY + curveY;
    const colH = botY - topY;

    const lightAngle = -0.35;
    const diffuse = 0.74 + 0.26 * Math.max(0, Math.cos(alpha - lightAngle));

    ctx.fillStyle = shadeRgb(whiteCeramic, diffuse);
    ctx.fillRect(x, topY, stripW, colH);

    const worldTheta = normalizeMugRad(yawRad + alpha);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.96;

    for (const layer of textureLayers) {
      const deltaTheta = normalizeMugRad(worldTheta - layer.centerTheta);
      if (Math.abs(deltaTheta) <= layer.halfSpan) {
        const u = (deltaTheta + layer.halfSpan) / (layer.halfSpan * 2);
        const maxSrcX = Math.max(0, layer.img.width - 1.5);
        const sx = Math.max(0, Math.min(maxSrcX, u * maxSrcX));
        const sw = Math.min(1.5, layer.img.width - sx);
        ctx.drawImage(
          layer.img,
          sx,
          0,
          sw,
          layer.img.height,
          x,
          topY + layer.topPad,
          stripW,
          layer.drawH
        );
      }
    }
    ctx.restore();

    if (isMagic && heatRevealPct < 100) {
      const transBand = colH * 0.15;
      const yReveal = revealedBottomY + curveY;
      const grad = ctx.createLinearGradient(0, topY, 0, botY);
      const startRatio = Math.max(0, Math.min(1, (yReveal - transBand - topY) / colH));
      const endRatio = Math.max(0, Math.min(1, (yReveal + transBand - topY) / colH));

      const coldRgb = mixRgbObj(coatRgb, { r: 0, g: 0, b: 0 }, 1 - diffuse * 0.92);
      const hotAlpha = 0.0;

      grad.addColorStop(0, `rgba(${coldRgb.r}, ${coldRgb.g}, ${coldRgb.b}, ${coldHideAlpha})`);
      if (startRatio > 0.01) {
        grad.addColorStop(startRatio, `rgba(${coldRgb.r}, ${coldRgb.g}, ${coldRgb.b}, ${coldHideAlpha})`);
      }
      if (endRatio > startRatio + 0.01 && endRatio < 0.99) {
        grad.addColorStop(endRatio, `rgba(${coldRgb.r}, ${coldRgb.g}, ${coldRgb.b}, ${hotAlpha})`);
      }
      grad.addColorStop(
        1,
        heatRevealPct >= 99
          ? `rgba(0,0,0,0)`
          : `rgba(${coldRgb.r}, ${coldRgb.g}, ${coldRgb.b}, ${heatRevealPct > 0 ? 0.02 : coldHideAlpha})`
      );

      ctx.fillStyle = grad;
      ctx.fillRect(x, topY, stripW, colH);
    }

    // Glossy ceramic specular studio softbox highlight
    const specCenter = -0.44;
    const specDist = Math.abs(dx - specCenter);
    if (specDist < 0.14) {
      const specAlpha = (1 - specDist / 0.14) * (isMagic && heatRevealPct < 50 ? 0.12 : 0.25);
      ctx.fillStyle = `rgba(255, 255, 255, ${specAlpha.toFixed(3)})`;
      ctx.fillRect(x, topY, stripW, colH);
    }
    if (Math.abs(dx) > 0.85) {
      const edgeShade = ((Math.abs(dx) - 0.85) / 0.15) * 0.18;
      ctx.fillStyle = `rgba(15, 23, 42, ${edgeShade.toFixed(3)})`;
      ctx.fillRect(x, topY, stripW, colH);
    }
  }

  // Rim highlight & bottom bevel
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, topCenterY, R, ry, 0, 0, Math.PI);
  ctx.lineWidth = 2;
  ctx.strokeStyle = isInnerColor ? shadeRgb(selectedRgb, 0.88) : 'rgba(255,255,255,0.65)';
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, botCenterY, R, ry, 0, 0, Math.PI);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.stroke();
  ctx.restore();

  if (handleCosZ >= 0) {
    renderHandle();
  }

  // Rising steam effect when magic mug hot
  if (isMagic && heatRevealPct >= 45) {
    const steamAlpha = ((heatRevealPct - 45) / 55) * 0.22;
    const nowSec = performance.now() * 0.001;
    for (let i = 0; i < 3; i++) {
      const drift = Math.sin(nowSec * 1.4 + i * 2.1) * 10;
      const sy = topCenterY - 12 - i * 16;
      ctx.beginPath();
      ctx.ellipse(cx + drift + (i - 1) * 14, sy, 18 + i * 5, 7 + i * 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${steamAlpha.toFixed(3)})`;
      ctx.fill();
    }
  }
}

/**
 * Generates an offscreen cylindrical 3D composite mug thumbnail (JPEG)
 * from a panoramic 23x9.5 wrap texture for cart thumbnails, saved designs & orders.
 */
export async function renderMugWrapThumbnailDataUrl(
  frontDesignUrl: string | null | undefined,
  mugMeta: MugMeta,
  selectedColorHex: string = '#ffffff',
  selectedCapacity: string = '11oz',
  sizePx: number = 900
): Promise<string> {
  if (typeof document === 'undefined') return frontDesignUrl || '';

  const frontImg = await new Promise<HTMLImageElement | null>((resolve) => {
    if (!frontDesignUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    if (!frontDesignUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = frontDesignUrl;
  });

  const off = document.createElement('canvas');
  off.width = sizePx;
  off.height = sizePx;
  const ctx = off.getContext('2d');
  if (!ctx) return frontDesignUrl || '';

  renderMugSceneToContext(ctx, {
    cssW: sizePx,
    cssH: sizePx,
    yawRad: MUG_CAMERA_ANGLES.thumbnailHero,
    tiltRad: 0.24,
    mugMeta,
    selectedColorHex,
    selectedCapacity,
    isFullWrapMode: true,
    heatRevealPct: 100,
    frontImg,
    backImg: null,
    bgStyle: 'clean',
  });

  try {
    return off.toDataURL('image/jpeg', 0.9);
  } catch {
    return frontDesignUrl || '';
  }
}

/** Hook managing zero-flicker async Image refs for Live / Modal 3D mug canvases */
export function useMugTextureImages(
  active: boolean,
  frontDesignUrl?: string | null,
  backDesignUrl?: string | null
) {
  const frontImgRef = useRef<HTMLImageElement | null>(null);
  const backImgRef = useRef<HTMLImageElement | null>(null);
  const [imagesVersion, setImagesVersion] = useState(0);

  useEffect(() => {
    if (!active) return;
    let alive = true;

    const loadImg = (
      src: string | null | undefined,
      targetRef: React.MutableRefObject<HTMLImageElement | null>
    ) => {
      if (!src) {
        if (targetRef.current !== null) {
          targetRef.current = null;
          if (alive) setImagesVersion((v) => v + 1);
        }
        return;
      }
      const img = new Image();
      if (!src.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        if (!alive) return;
        targetRef.current = img;
        setImagesVersion((v) => v + 1);
      };
      img.onerror = () => {
        if (!alive) return;
        // Keep previous texture instead of flashing empty on transient error
        setImagesVersion((v) => v + 1);
      };
      img.src = src;
    };

    loadImg(frontDesignUrl, frontImgRef);
    loadImg(backDesignUrl, backImgRef);

    return () => {
      alive = false;
    };
  }, [active, frontDesignUrl, backDesignUrl]);

  return { frontImgRef, backImgRef, imagesVersion };
}

export interface Mug3DCanvasProps {
  active?: boolean;
  yawRad: number;
  tiltRad: number;
  onYawChange: React.Dispatch<React.SetStateAction<number>>;
  onTiltChange?: React.Dispatch<React.SetStateAction<number>>;
  onStopAutoSpin?: () => void;
  mugMeta: MugMeta;
  selectedColorHex?: string;
  selectedCapacity?: string;
  isFullWrapMode: boolean;
  heatRevealPct: number;
  frontDesignUrl?: string | null;
  backDesignUrl?: string | null;
  className?: string;
}

export function Mug3DCanvas({
  active = true,
  yawRad,
  tiltRad,
  onYawChange,
  onTiltChange,
  onStopAutoSpin,
  mugMeta,
  selectedColorHex = '#ffffff',
  selectedCapacity = '11oz',
  isFullWrapMode,
  heatRevealPct,
  frontDesignUrl,
  backDesignUrl,
  className = 'w-full h-full cursor-grab active:cursor-grabbing touch-none block',
}: Mug3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { frontImgRef, backImgRef, imagesVersion } = useMugTextureImages(
    active,
    frontDesignUrl,
    backDesignUrl
  );

  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 360;
    const cssH = canvas.clientHeight || 220;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    renderMugSceneToContext(ctx, {
      cssW,
      cssH,
      yawRad,
      tiltRad,
      mugMeta,
      selectedColorHex,
      selectedCapacity,
      isFullWrapMode,
      heatRevealPct,
      frontImg: frontImgRef.current,
      backImg: backImgRef.current,
    });
    ctx.restore();
  }, [
    yawRad,
    tiltRad,
    mugMeta,
    selectedColorHex,
    selectedCapacity,
    isFullWrapMode,
    heatRevealPct,
    imagesVersion,
    frontImgRef,
    backImgRef,
  ]);

  useEffect(() => {
    if (!active) return;
    draw();
    if (mugMeta.mugStyle === 'magic' && heatRevealPct >= 45) {
      let id = 0;
      const loop = () => {
        draw();
        id = requestAnimationFrame(loop);
      };
      id = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(id);
    }
  }, [active, draw, mugMeta.mugStyle, heatRevealPct]);

  useEffect(() => {
    if (!active || !canvasRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [active, draw]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    onStopAutoSpin?.();
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch { }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;

    onYawChange((prev) => normalizeMugRad(prev - dx * 0.011));
    onTiltChange?.((prev) => Math.max(0.14, Math.min(0.42, prev + dy * 0.0025)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current.active = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={className}
    />
  );
}

interface MugLivePanoramaPanelProps {
  frontDesignUrl?: string | null;
  mugMeta: MugMeta;
  selectedColorHex?: string;
  selectedCapacity?: string;
  externalYawRequest?: { yaw: number; seq: number } | null;
  onExpand3DModal: () => void;
  onHideLive3D?: () => void;
  compact?: boolean;
}

/**
 * Synchronized Live 3D Wrap Preview Panel embedded directly inside the Panoramic Studio
 * so customers see stickers, photos & text wrapping around the ceramic mug in real time.
 */
export function MugLivePanoramaPanel({
  frontDesignUrl,
  mugMeta,
  selectedColorHex = '#ffffff',
  selectedCapacity = '11oz',
  externalYawRequest,
  onExpand3DModal,
  onHideLive3D,
  compact = true,
}: MugLivePanoramaPanelProps) {
  const t = useTranslations('MugStudio');
  const isMagic = mugMeta.mugStyle === 'magic';

  const [yawRad, setYawRad] = useState<number>(MUG_CAMERA_ANGLES.thumbnailHero);
  const [tiltRad, setTiltRad] = useState<number>(0.24);
  const [autoSpin, setAutoSpin] = useState<boolean>(false);
  const [heatRevealPct, setHeatRevealPct] = useState<number>(100);

  useEffect(() => {
    if (externalYawRequest && typeof externalYawRequest.yaw === 'number') {
      setAutoSpin(false);
      setYawRad(externalYawRequest.yaw);
    }
  }, [externalYawRequest]);

  useEffect(() => {
    if (!autoSpin) return;
    let frameId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      setYawRad((prev) => normalizeMugRad(prev + dt * 0.72));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [autoSpin]);

  const angleButtons = [
    { key: 'left', label: t('zoneLeft'), yaw: MUG_CAMERA_ANGLES.left },
    { key: 'center', label: t('zoneCenter'), yaw: MUG_CAMERA_ANGLES.panorama },
    { key: 'right', label: t('zoneRight'), yaw: MUG_CAMERA_ANGLES.right },
    { key: 'handle', label: t('angleHandle'), yaw: MUG_CAMERA_ANGLES.handle },
  ];

  return (
    <div
      className={
        compact
          ? 'w-full max-w-[820px] rounded-2xl bg-white/95 border border-slate-200/90 shadow-sm overflow-hidden flex flex-col sm:flex-row items-stretch shrink-0'
          : 'w-full h-full max-w-[760px] rounded-2xl bg-white border border-slate-200 shadow-md overflow-hidden flex flex-col'
      }
    >
      {/* Interactive Cylindrical 3D Viewport */}
      <div
        className={
          compact
            ? 'relative w-full sm:w-[225px] md:w-[240px] h-[122px] sm:h-[128px] bg-slate-100 shrink-0'
            : 'relative flex-1 min-h-[260px] sm:min-h-[340px] bg-slate-100'
        }
      >
        <Mug3DCanvas
          active={true}
          yawRad={yawRad}
          tiltRad={tiltRad}
          onYawChange={setYawRad}
          onTiltChange={setTiltRad}
          onStopAutoSpin={() => setAutoSpin(false)}
          mugMeta={mugMeta}
          selectedColorHex={selectedColorHex}
          selectedCapacity={selectedCapacity}
          isFullWrapMode={true}
          heatRevealPct={heatRevealPct}
          frontDesignUrl={frontDesignUrl}
        />

        <span className="pointer-events-none absolute top-2 start-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/80 text-white text-[9.5px] font-bold backdrop-blur-xs">
          <Rotate3d className="w-3 h-3 text-amber-300" />
          <span>{t('live3dTitle')}</span>
        </span>

        <button
          type="button"
          onClick={() => setAutoSpin((s) => !s)}
          aria-pressed={autoSpin}
          className={`absolute bottom-2 end-2 min-h-[26px] px-2 py-0.5 rounded-full text-[9.5px] font-extrabold border inline-flex items-center gap-1 shadow-2xs transition cursor-pointer ${autoSpin
              ? 'bg-amber-500 text-white border-amber-600'
              : 'bg-white/90 text-slate-700 border-slate-200 hover:bg-white'
            }`}
        >
          {autoSpin ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
          <span>{t('autoSpin')}</span>
        </button>
      </div>

      {/* Quick Camera Angles, Magic Heat Test & Actions */}
      <div className="flex-1 px-3 py-2.5 bg-gradient-to-br from-slate-50/90 to-white flex flex-col justify-between gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-black text-slate-800 truncate">
              {t('panoramaSheetTitle')}
            </div>
            <div className="text-[10px] text-slate-500 truncate">{t('dragHint')}</div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onHideLive3D && (
              <button
                type="button"
                onClick={onHideLive3D}
                title={t('hideLive3d')}
                className="min-h-[28px] px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <EyeOff className="w-3 h-3" />
                <span className="hidden md:inline">{t('hideLive3d')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExpand3DModal}
              className="min-h-[28px] px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 border border-amber-300/70 text-[10px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span>{t('expand3d')}</span>
            </button>
          </div>
        </div>

        {/* Camera angle presets matching Panorama zones */}
        <div className="flex flex-wrap items-center gap-1">
          {angleButtons.map((btn) => {
            const isSelected = !autoSpin && Math.abs(normalizeMugRad(yawRad - btn.yaw)) < 0.22;
            return (
              <button
                key={btn.key}
                type="button"
                onClick={() => {
                  setAutoSpin(false);
                  setYawRad(btn.yaw);
                }}
                className={`min-h-[28px] px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition cursor-pointer ${isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400 hover:text-amber-700'
                  }`}
              >
                {btn.label}
              </button>
            );
          })}

          {isMagic && (
            <button
              type="button"
              onClick={() => setHeatRevealPct((p) => (p < 50 ? 100 : 12))}
              className={`min-h-[28px] px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold border inline-flex items-center gap-1 transition cursor-pointer ${heatRevealPct >= 50
                  ? 'bg-orange-50 text-orange-700 border-orange-300'
                  : 'bg-slate-800 text-sky-200 border-slate-900'
                }`}
            >
              {heatRevealPct >= 50 ? (
                <>
                  <Flame className="w-3 h-3 text-orange-500" />
                  <span>{t('hotState')}</span>
                </>
              ) : (
                <>
                  <Snowflake className="w-3 h-3 text-sky-300" />
                  <span>{t('coldState')}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
