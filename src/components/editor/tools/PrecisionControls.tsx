import React, { useState } from 'react';
import { fabric } from 'fabric';
import { useTranslations } from 'next-intl';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  RotateCcw, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  AlignCenter, 
  FlipHorizontal, 
  FlipVertical,
  Move,
  Rotate3D,
  Crosshair,
  Maximize2
} from 'lucide-react';

interface PrecisionControlsProps {
  canvas: fabric.Canvas | null;
  activeObject: fabric.Object | null;
  onSaveHistory: () => void;
  getPrintZone?: (obj: fabric.Object) => { left: number; top: number; width: number; height: number } | null;
  onAfterTransform?: (obj: fabric.Object) => void;
}

export default function PrecisionControls({
  canvas,
  activeObject,
  onSaveHistory,
  getPrintZone,
  onAfterTransform,
}: PrecisionControlsProps) {
  const t = useTranslations('Editor');
  const [nudgeStep, setNudgeStep] = useState<number>(5); // 1px, 5px, 10px

  if (!canvas || !activeObject) return null;

  const isLocked = () =>
    (activeObject as any).isLocked === true ||
    activeObject.selectable === false ||
    (activeObject as any).lockMovementX === true;

  const resolveZone = () => {
    const z = getPrintZone?.(activeObject);
    if (z && Number.isFinite(z.left) && Number.isFinite(z.top) && z.width > 0 && z.height > 0) {
      return z;
    }
    return null;
  };

  const commitTransform = () => {
    activeObject.setCoords();
    canvas.requestRenderAll();
    canvas.renderAll();
    onAfterTransform?.(activeObject);
    (canvas as any).fire('object:modified', { target: activeObject, skipPlacementSwitch: true });
    onSaveHistory();
  };

  const moveObject = (dx: number, dy: number) => {
    if (isLocked()) return;
    const prevLeft = activeObject.left || 0;
    const prevTop = activeObject.top || 0;
    let nextLeft = prevLeft + dx;
    let nextTop = prevTop + dy;

    // Keep object center within its assigned print zone so nudging never migrates to another placement
    const zone = resolveZone();
    if (zone) {
      const center = activeObject.getCenterPoint();
      const targetCx = Math.max(zone.left, Math.min(zone.left + zone.width, center.x + dx));
      const targetCy = Math.max(zone.top, Math.min(zone.top + zone.height, center.y + dy));
      nextLeft = prevLeft + (targetCx - center.x);
      nextTop = prevTop + (targetCy - center.y);
    }

    activeObject.set({
      left: nextLeft,
      top: nextTop,
    });
    commitTransform();
  };

  const rotateObject = (deltaAngle: number) => {
    if (isLocked()) return;
    const currentAngle = activeObject.angle || 0;
    const newAngle = Math.round((currentAngle + deltaAngle) % 360);
    activeObject.set('angle', newAngle);
    commitTransform();
  };

  const resetRotation = () => {
    if (isLocked()) return;
    activeObject.set('angle', 0);
    commitTransform();
  };

  const scaleObject = (factor: number) => {
    if (isLocked()) return;
    const currentScaleX = activeObject.scaleX || 1;
    const currentScaleY = activeObject.scaleY || 1;
    activeObject.set({
      scaleX: Math.max(0.05, currentScaleX * factor),
      scaleY: Math.max(0.05, currentScaleY * factor),
    });
    commitTransform();
  };

  const centerHorizontal = () => {
    if (isLocked()) return;
    const zone = resolveZone();
    if (zone) {
      const center = activeObject.getCenterPoint();
      const targetCx = zone.left + zone.width / 2;
      activeObject.set('left', (activeObject.left || 0) + (targetCx - center.x));
    } else {
      (canvas as any).centerObjectH(activeObject);
    }
    commitTransform();
  };

  const centerVertical = () => {
    if (isLocked()) return;
    const zone = resolveZone();
    if (zone) {
      const center = activeObject.getCenterPoint();
      const targetCy = zone.top + zone.height / 2;
      activeObject.set('top', (activeObject.top || 0) + (targetCy - center.y));
    } else {
      (canvas as any).centerObjectV(activeObject);
    }
    commitTransform();
  };

  const centerBoth = () => {
    if (isLocked()) return;
    const zone = resolveZone();
    if (zone) {
      const center = activeObject.getCenterPoint();
      const targetCx = zone.left + zone.width / 2;
      const targetCy = zone.top + zone.height / 2;
      activeObject.set({
        left: (activeObject.left || 0) + (targetCx - center.x),
        top: (activeObject.top || 0) + (targetCy - center.y),
      });
    } else {
      canvas.centerObject(activeObject);
    }
    commitTransform();
  };

  return (
    <div className="flex flex-col gap-3.5 w-full bg-white p-4 rounded-2xl border border-blue-100 shadow-sm mt-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
          <Move size={14} className="text-blue-600" />
          {t('precisionTransform')}
        </h4>
        
        {/* Step Selector */}
        <div className="flex bg-gray-100 p-0.5 rounded-lg text-[10px] font-bold">
          {[1, 5, 15].map(step => (
            <button
              key={step}
              onClick={() => setNudgeStep(step)}
              className={`px-2 py-0.5 rounded-md transition-all ${nudgeStep === step ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:text-black'}`}
            >
              {step}px
            </button>
          ))}
        </div>
      </div>

      {/* D-Pad & Alignment Grid */}
      <div className="flex items-center justify-between gap-3">
        {/* D-Pad Nudge Controller */}
        <div className="grid grid-cols-3 gap-1.5 w-32 h-32 p-1.5 bg-gray-50 rounded-2xl border border-gray-200">
          <div />
          <button
            onClick={() => moveObject(0, -nudgeStep)}
            className="flex items-center justify-center bg-white rounded-xl border border-gray-200 text-gray-700 active:bg-blue-50 active:border-blue-400 active:text-blue-600 shadow-sm transition-all"
            title={t('moveUp')}
          >
            <ArrowUp size={18} />
          </button>
          <div />

          <button
            onClick={() => moveObject(-nudgeStep, 0)}
            className="flex items-center justify-center bg-white rounded-xl border border-gray-200 text-gray-700 active:bg-blue-50 active:border-blue-400 active:text-blue-600 shadow-sm transition-all"
            title={t('moveLeft')}
          >
            <ArrowLeft size={18} />
          </button>
          
          <button
            onClick={centerBoth}
            className="flex items-center justify-center bg-blue-50 rounded-xl border border-blue-200 text-blue-600 active:bg-blue-600 active:text-white shadow-sm transition-all font-bold text-xs"
            title={t('center')}
          >
            <Crosshair size={16} />
          </button>

          <button
            onClick={() => moveObject(nudgeStep, 0)}
            className="flex items-center justify-center bg-white rounded-xl border border-gray-200 text-gray-700 active:bg-blue-50 active:border-blue-400 active:text-blue-600 shadow-sm transition-all"
            title={t('moveRight')}
          >
            <ArrowRight size={18} />
          </button>

          <div />
          <button
            onClick={() => moveObject(0, nudgeStep)}
            className="flex items-center justify-center bg-white rounded-xl border border-gray-200 text-gray-700 active:bg-blue-50 active:border-blue-400 active:text-blue-600 shadow-sm transition-all"
            title={t('moveDown')}
          >
            <ArrowDown size={18} />
          </button>
          <div />
        </div>

        {/* Quick Alignment & Scaling Sidebar */}
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={centerHorizontal}
              className="py-2 px-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1 shadow-sm"
              title={t('centerHorizontal')}
            >
              <AlignCenter size={13} className="rotate-90" />
              {t('horizontal')}
            </button>
            <button
              onClick={centerVertical}
              className="py-2 px-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1 shadow-sm"
              title={t('centerVertical')}
            >
              <AlignCenter size={13} />
              {t('vertical')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => scaleObject(1.05)}
              className="py-2 px-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1 shadow-sm"
              title={t('zoomIn')}
            >
              <ZoomIn size={13} className="text-blue-600" />
              {t('zoomIn')}
            </button>
            <button
              onClick={() => scaleObject(0.95)}
              className="py-2 px-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1 shadow-sm"
              title={t('zoomOut')}
            >
              <ZoomOut size={13} className="text-blue-600" />
              {t('zoomOut')}
            </button>
          </div>

          {/* Precision Rotation Buttons */}
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => rotateObject(-15)}
              className="py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-0.5 shadow-sm"
              title={t('rotateCcw')}
            >
              <RotateCcw size={11} />
              -15°
            </button>
            <button
              onClick={resetRotation}
              className="py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center shadow-sm"
              title={t('resetRotation')}
            >
              0°
            </button>
            <button
              onClick={() => rotateObject(15)}
              className="py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-0.5 shadow-sm"
              title={t('rotateCw')}
            >
              +15°
              <RotateCw size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
