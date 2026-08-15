"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  calculateDisplayBounds,
  nativeToDisplayRect,
  displayToNativePoint,
  moveRectWithClamp,
  resizeRectWithHandle,
  calculatePhysicalDimensions,
  validatePrintAreaCoordinates,
  Rect,
  ResizeHandle,
  DisplayBounds,
} from '@/lib/coordinateMapping';
import { PrintArea } from '@/lib/customizationConfig';
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  Lock,
  Unlock,
  AlignCenter,
  ZoomIn,
  ZoomOut,
  Info,
  CheckCircle2,
  AlertTriangle,
  Move,
} from 'lucide-react';

export interface PrintAreaEditorProps {
  imageUrl: string;
  nativeWidth: number;
  nativeHeight: number;
  initialPrintArea: PrintArea;
  faceId: string;
  faceName?: string;
  targetDpi?: number;
  printMethod?: string;
  onChange?: (updatedPrintArea: PrintArea) => void;
  onValidationChange?: (isValid: boolean) => void;
  disabled?: boolean;
}

const RESIZE_HANDLES: Array<{ handle: ResizeHandle; cursor: string; positionClass: string }> = [
  { handle: 'nw', cursor: 'nwse-resize', positionClass: '-top-1.5 -left-1.5' },
  { handle: 'n', cursor: 'ns-resize', positionClass: '-top-1.5 left-1/2 -translate-x-1/2' },
  { handle: 'ne', cursor: 'nesw-resize', positionClass: '-top-1.5 -right-1.5' },
  { handle: 'e', cursor: 'ew-resize', positionClass: 'top-1/2 -right-1.5 -translate-y-1/2' },
  { handle: 'se', cursor: 'nwse-resize', positionClass: '-bottom-1.5 -right-1.5' },
  { handle: 's', cursor: 'ns-resize', positionClass: '-bottom-1.5 left-1/2 -translate-x-1/2' },
  { handle: 'sw', cursor: 'nesw-resize', positionClass: '-bottom-1.5 -left-1.5' },
  { handle: 'w', cursor: 'ew-resize', positionClass: 'top-1/2 -left-1.5 -translate-y-1/2' },
];

export default function PrintAreaEditor({
  imageUrl,
  nativeWidth,
  nativeHeight,
  initialPrintArea,
  faceId,
  faceName,
  targetDpi = 300,
  printMethod,
  onChange,
  onValidationChange,
  disabled = false,
}: PrintAreaEditorProps) {
  // Container & DOM Refs
  const containerRef = useRef<HTMLDivElement>(null);

  // Native Coordinate Rect: { x, y, width, height }
  const [nativeRect, setNativeRect] = useState<Rect>(() => ({
    x: initialPrintArea.left ?? 0,
    y: initialPrintArea.top ?? 0,
    width: initialPrintArea.width || Math.min(400, nativeWidth || 400),
    height: initialPrintArea.height || Math.min(500, nativeHeight || 500),
  }));

  // Initial Reference for Reset
  const initialRectRef = useRef<Rect>({
    x: initialPrintArea.left ?? 0,
    y: initialPrintArea.top ?? 0,
    width: initialPrintArea.width || Math.min(400, nativeWidth || 400),
    height: initialPrintArea.height || Math.min(500, nativeHeight || 500),
  });

  // Editor UI State
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 600, height: 600 });
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 0.5 to 2.0
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(false);
  const [aspectRatioValue, setAspectRatioValue] = useState<number>(() => {
    const w = initialPrintArea.width || 400;
    const h = initialPrintArea.height || 500;
    return h > 0 ? w / h : 1;
  });

  // Interaction State (Dragging / Resizing)
  const interactionRef = useRef<{
    type: 'drag' | 'resize' | null;
    handle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    startRect: Rect;
  }>({
    type: null,
    startClientX: 0,
    startClientY: 0,
    startRect: nativeRect,
  });

  const [isInteracting, setIsInteracting] = useState(false);

  // Sync state when initialPrintArea or faceId changes
  useEffect(() => {
    const freshRect: Rect = {
      x: initialPrintArea.left ?? 0,
      y: initialPrintArea.top ?? 0,
      width: initialPrintArea.width || Math.min(400, nativeWidth || 400),
      height: initialPrintArea.height || Math.min(500, nativeHeight || 500),
    };
    setNativeRect(freshRect);
    initialRectRef.current = freshRect;
    if (freshRect.height > 0) {
      setAspectRatioValue(freshRect.width / freshRect.height);
    }
  }, [faceId, initialPrintArea.left, initialPrintArea.top, initialPrintArea.width, initialPrintArea.height, nativeWidth, nativeHeight]);

  // Observe Container Dimensions Responsively
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDims = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDims({ width: rect.width, height: rect.height });
      }
    };

    updateDims();

    const resizeObserver = new ResizeObserver(() => {
      updateDims();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Display Bounds Geometry
  const displayBounds: DisplayBounds = useMemo(() => {
    const baseBounds = calculateDisplayBounds(
      containerDims.width,
      containerDims.height,
      nativeWidth > 0 ? nativeWidth : 1000,
      nativeHeight > 0 ? nativeHeight : 1000
    );

    if (zoomLevel === 1.0) return baseBounds;

    // Apply preview zoom scaling
    const zoomedScale = baseBounds.scale * zoomLevel;
    const zoomedDisplayW = baseBounds.nativeWidth * zoomedScale;
    const zoomedDisplayH = baseBounds.nativeHeight * zoomedScale;
    const zoomedOffsetX = (containerDims.width - zoomedDisplayW) / 2;
    const zoomedOffsetY = (containerDims.height - zoomedDisplayH) / 2;

    return {
      containerWidth: containerDims.width,
      containerHeight: containerDims.height,
      nativeWidth: baseBounds.nativeWidth,
      nativeHeight: baseBounds.nativeHeight,
      displayWidth: zoomedDisplayW,
      displayHeight: zoomedDisplayH,
      offsetX: zoomedOffsetX,
      offsetY: zoomedOffsetY,
      scale: zoomedScale,
    };
  }, [containerDims.width, containerDims.height, nativeWidth, nativeHeight, zoomLevel]);

  // Display-Space Rectangle
  const displayRect = useMemo(() => {
    return nativeToDisplayRect(nativeRect, displayBounds);
  }, [nativeRect, displayBounds]);

  // Physical Dimensions Calculation
  const physical = useMemo(() => {
    return calculatePhysicalDimensions(nativeRect.width, nativeRect.height, targetDpi);
  }, [nativeRect.width, nativeRect.height, targetDpi]);

  // Validation
  const validation = useMemo(() => {
    return validatePrintAreaCoordinates(nativeRect, nativeWidth, nativeHeight);
  }, [nativeRect, nativeWidth, nativeHeight]);

  useEffect(() => {
    onValidationChange?.(validation.isValid);
  }, [validation.isValid, onValidationChange]);

  // Notify parent on rect change
  const notifyChange = useCallback((updatedRect: Rect) => {
    if (!onChange) return;
    const phys = calculatePhysicalDimensions(updatedRect.width, updatedRect.height, targetDpi);
    const updated: PrintArea = {
      ...initialPrintArea,
      id: faceId,
      name: faceName || initialPrintArea.name || faceId,
      left: Math.round(updatedRect.x),
      top: Math.round(updatedRect.y),
      width: Math.round(updatedRect.width),
      height: Math.round(updatedRect.height),
      physicalWidthCm: phys.physicalWidthCm,
      physicalHeightCm: phys.physicalHeightCm,
      targetDPI: targetDpi,
      printMethod: printMethod || initialPrintArea.printMethod || 'DTF',
    };
    onChange(updated);
  }, [onChange, initialPrintArea, faceId, faceName, targetDpi, printMethod]);

  // Pointer Interaction Handlers
  const handlePointerDown = (
    e: React.PointerEvent,
    type: 'drag' | 'resize',
    handle?: ResizeHandle
  ) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    interactionRef.current = {
      type,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: { ...nativeRect },
    };
    setIsInteracting(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const { type, handle, startClientX, startClientY, startRect } = interactionRef.current;
      if (!type || displayBounds.scale <= 0) return;

      const deltaDispX = moveEvent.clientX - startClientX;
      const deltaDispY = moveEvent.clientY - startClientY;

      const deltaNativeX = deltaDispX / displayBounds.scale;
      const deltaNativeY = deltaDispY / displayBounds.scale;

      if (type === 'drag') {
        const nextRect = moveRectWithClamp(
          startRect,
          deltaNativeX,
          deltaNativeY,
          nativeWidth,
          nativeHeight
        );
        setNativeRect(nextRect);
        notifyChange(nextRect);
      } else if (type === 'resize' && handle) {
        let nextRect = resizeRectWithHandle(
          startRect,
          handle,
          deltaNativeX,
          deltaNativeY,
          nativeWidth,
          nativeHeight,
          30,
          30
        );

        if (lockAspectRatio && aspectRatioValue > 0) {
          // Adjust secondary dimension to keep aspect ratio
          if (handle === 'e' || handle === 'w') {
            const targetH = Math.min(nativeHeight - nextRect.y, nextRect.width / aspectRatioValue);
            nextRect.height = targetH;
          } else if (handle === 'n' || handle === 's') {
            const targetW = Math.min(nativeWidth - nextRect.x, nextRect.height * aspectRatioValue);
            nextRect.width = targetW;
          } else {
            // Corner handles
            const targetH = Math.min(nativeHeight - nextRect.y, nextRect.width / aspectRatioValue);
            nextRect.height = targetH;
          }
        }

        setNativeRect(nextRect);
        notifyChange(nextRect);
      }
    };

    const onPointerUp = () => {
      interactionRef.current.type = null;
      setIsInteracting(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Alignment Helpers
  const handleCenterHorizontally = () => {
    const newX = Math.max(0, Math.round((nativeWidth - nativeRect.width) / 2));
    const nextRect: Rect = { ...nativeRect, x: newX };
    setNativeRect(nextRect);
    notifyChange(nextRect);
  };

  const handleCenterVertically = () => {
    const newY = Math.max(0, Math.round((nativeHeight - nativeRect.height) / 2));
    const nextRect: Rect = { ...nativeRect, y: newY };
    setNativeRect(nextRect);
    notifyChange(nextRect);
  };

  const handleCenterBoth = () => {
    const newX = Math.max(0, Math.round((nativeWidth - nativeRect.width) / 2));
    const newY = Math.max(0, Math.round((nativeHeight - nativeRect.height) / 2));
    const nextRect: Rect = { ...nativeRect, x: newX, y: newY };
    setNativeRect(nextRect);
    notifyChange(nextRect);
  };

  // Reset Helpers
  const handleResetAll = () => {
    setNativeRect(initialRectRef.current);
    notifyChange(initialRectRef.current);
  };

  const handleResetPosition = () => {
    handleCenterBoth();
  };

  const handleResetSize = () => {
    const nextRect: Rect = {
      ...nativeRect,
      width: initialRectRef.current.width,
      height: initialRectRef.current.height,
    };
    setNativeRect(nextRect);
    notifyChange(nextRect);
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 w-full bg-slate-50 border border-slate-200 rounded-3xl p-4 md:p-6 shadow-sm">
      
      {/* Visual Canvas Viewport Section */}
      <div className="flex-1 flex flex-col gap-3 min-h-[520px] md:min-h-[620px]">
        
        {/* Top Control Bar (Zoom, Alignment, Aspect Ratio Lock) */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-700">
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100))}
              disabled={zoomLevel <= 0.5 || disabled}
              className="p-1.5 hover:bg-white rounded-lg transition text-slate-600 disabled:opacity-40"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="px-2 font-mono text-[11px] min-w-[45px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(2.0, Math.round((prev + 0.25) * 100) / 100))}
              disabled={zoomLevel >= 2.0 || disabled}
              className="p-1.5 hover:bg-white rounded-lg transition text-slate-600 disabled:opacity-40"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            {zoomLevel !== 1.0 && (
              <button
                type="button"
                onClick={() => setZoomLevel(1.0)}
                className="px-2 py-1 text-[10px] bg-white rounded-md text-blue-600 hover:bg-blue-50 font-bold"
              >
                Fit
              </button>
            )}
          </div>

          {/* Alignment Tools */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={handleCenterHorizontally}
              disabled={disabled}
              className="px-2 py-1 hover:bg-white rounded-lg transition text-slate-700 hover:text-blue-600 flex items-center gap-1"
              title="Center Horizontally"
            >
              <AlignCenter size={14} />
              <span>Center X</span>
            </button>
            <button
              type="button"
              onClick={handleCenterVertically}
              disabled={disabled}
              className="px-2 py-1 hover:bg-white rounded-lg transition text-slate-700 hover:text-blue-600 flex items-center gap-1"
              title="Center Vertically"
            >
              <AlignCenter size={14} className="rotate-90" />
              <span>Center Y</span>
            </button>
            <button
              type="button"
              onClick={handleCenterBoth}
              disabled={disabled}
              className="px-2 py-1 bg-white shadow-xs rounded-lg transition text-slate-800 hover:text-blue-600"
              title="Center in Mockup"
            >
              Center Both
            </button>
          </div>

          {/* Aspect Ratio Lock Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextLock = !lockAspectRatio;
                setLockAspectRatio(nextLock);
                if (nextLock && nativeRect.height > 0) {
                  setAspectRatioValue(nativeRect.width / nativeRect.height);
                }
              }}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition ${
                lockAspectRatio
                  ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {lockAspectRatio ? <Lock size={14} /> : <Unlock size={14} />}
              <span>{lockAspectRatio ? 'Locked Aspect' : 'Free Resize'}</span>
            </button>
          </div>
        </div>

        {/* Interactive Viewport Area */}
        <div
          ref={containerRef}
          className="flex-1 w-full h-full bg-slate-900/5 rounded-2xl relative overflow-hidden border border-slate-200 flex items-center justify-center select-none"
          style={{ minHeight: '480px' }}
        >
          {/* Base Product Mockup Image */}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Product Mockup"
              draggable={false}
              className="absolute pointer-events-none transition-all duration-75"
              style={{
                width: `${displayBounds.displayWidth}px`,
                height: `${displayBounds.displayHeight}px`,
                left: `${displayBounds.offsetX}px`,
                top: `${displayBounds.offsetY}px`,
                objectFit: 'contain',
              }}
            />
          ) : (
            <div className="text-slate-400 font-medium text-sm flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <span>No mockup image provided</span>
            </div>
          )}

          {/* Outer Image Boundary Frame */}
          {displayBounds.displayWidth > 0 && (
            <div
              className="absolute border border-slate-400/40 pointer-events-none"
              style={{
                width: `${displayBounds.displayWidth}px`,
                height: `${displayBounds.displayHeight}px`,
                left: `${displayBounds.offsetX}px`,
                top: `${displayBounds.offsetY}px`,
              }}
            />
          )}

          {/* Interactive Print Area Rectangle */}
          {displayBounds.scale > 0 && (
            <div
              onPointerDown={e => handlePointerDown(e, 'drag')}
              className={`absolute cursor-move transition-shadow ${
                disabled ? 'pointer-events-none opacity-60' : ''
              } ${
                validation.isValid
                  ? 'border-2 border-blue-600 bg-blue-500/15 ring-4 ring-blue-500/20'
                  : 'border-2 border-red-600 bg-red-500/20 ring-4 ring-red-500/30'
              }`}
              style={{
                width: `${displayRect.width}px`,
                height: `${displayRect.height}px`,
                left: `${displayRect.x}px`,
                top: `${displayRect.y}px`,
                touchAction: 'none',
              }}
            >
              {/* Center Crosshair & Drag Badge */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-blue-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 backdrop-blur-xs">
                  <Move size={10} />
                  <span>{faceName || faceId.toUpperCase()} PRINT AREA</span>
                </div>
              </div>

              {/* 8 Resizing Handles */}
              {!disabled &&
                RESIZE_HANDLES.map(({ handle, cursor, positionClass }) => (
                  <div
                    key={handle}
                    onPointerDown={e => handlePointerDown(e, 'resize', handle)}
                    className={`absolute w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm shadow-md transition-transform hover:scale-125 ${positionClass}`}
                    style={{ cursor, touchAction: 'none' }}
                  />
                ))}

              {/* Safe Area Sub-boundary if defined */}
              {initialPrintArea.safeArea && (
                <div
                  className="absolute border border-dashed border-emerald-500/80 pointer-events-none"
                  style={{
                    left: `${(initialPrintArea.safeArea.left / initialPrintArea.width) * 100}%`,
                    top: `${(initialPrintArea.safeArea.top / initialPrintArea.height) * 100}%`,
                    width: `${(initialPrintArea.safeArea.width / initialPrintArea.width) * 100}%`,
                    height: `${(initialPrintArea.safeArea.height / initialPrintArea.height) * 100}%`,
                  }}
                >
                  <span className="absolute top-1 left-1 text-[9px] font-bold text-emerald-700 bg-white/80 px-1 rounded-xs">
                    Safe Zone
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Technical Feedback & Measurement Sidebar */}
      <div className="w-full xl:w-80 flex flex-col gap-4">
        
        {/* Status Card */}
        <div className={`p-4 rounded-2xl border ${
          validation.isValid
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-red-50/80 border-red-200 text-red-900'
        }`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            {validation.isValid ? (
              <>
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span>Print Area Configured Safely</span>
              </>
            ) : (
              <>
                <AlertTriangle size={18} className="text-red-600" />
                <span>Boundary Violation Detected</span>
              </>
            )}
          </div>
          {!validation.isValid && (
            <ul className="mt-2 text-xs space-y-1 text-red-700 font-medium">
              {validation.errors.map((err, idx) => (
                <li key={idx}>• {err}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Live Native Coordinate Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <Info size={16} className="text-blue-600" />
              Native Image Coordinates
            </span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {nativeWidth} × {nativeHeight} px
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">Position X</span>
              <span className="text-base font-black text-slate-800 font-mono">{Math.round(nativeRect.x)}</span>
              <span className="text-slate-400 text-[10px] ml-1">px</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">Position Y</span>
              <span className="text-base font-black text-slate-800 font-mono">{Math.round(nativeRect.y)}</span>
              <span className="text-slate-400 text-[10px] ml-1">px</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">Width</span>
              <span className="text-base font-black text-blue-700 font-mono">{Math.round(nativeRect.width)}</span>
              <span className="text-slate-400 text-[10px] ml-1">px</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">Height</span>
              <span className="text-base font-black text-blue-700 font-mono">{Math.round(nativeRect.height)}</span>
              <span className="text-slate-400 text-[10px] ml-1">px</span>
            </div>
          </div>
        </div>

        {/* Physical Print Specifications Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-800 text-sm">Physical Print Dimensions</span>
            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              @{targetDpi} DPI
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100/80">
              <span className="text-indigo-600 block text-[10px] font-bold uppercase">Physical Width</span>
              <span className="text-base font-black text-indigo-900 font-mono">{physical.physicalWidthCm}</span>
              <span className="text-indigo-400 text-[10px] ml-1">cm</span>
            </div>
            <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100/80">
              <span className="text-indigo-600 block text-[10px] font-bold uppercase">Physical Height</span>
              <span className="text-base font-black text-indigo-900 font-mono">{physical.physicalHeightCm}</span>
              <span className="text-indigo-400 text-[10px] ml-1">cm</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex justify-between pt-1 font-medium">
            <span>Print Method:</span>
            <span className="font-bold text-slate-700">{printMethod || initialPrintArea.printMethod || 'DTF'}</span>
          </div>
        </div>

        {/* Reset Actions Group */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-700 mb-1">Reset Controls</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleResetPosition}
              disabled={disabled}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition"
            >
              Reset Position
            </button>
            <button
              type="button"
              onClick={handleResetSize}
              disabled={disabled}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition"
            >
              Reset Size
            </button>
          </div>
          <button
            type="button"
            onClick={handleResetAll}
            disabled={disabled}
            className="w-full py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-transparent rounded-xl text-xs font-bold text-slate-700 transition flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={14} />
            <span>Reset All to Initial Values</span>
          </button>
        </div>

      </div>

    </div>
  );
}
