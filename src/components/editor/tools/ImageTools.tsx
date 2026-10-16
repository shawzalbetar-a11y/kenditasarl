import React, { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { 
  Copy, 
  FlipHorizontal, 
  FlipVertical, 
  Maximize, 
  AlignCenter, 
  Wand2, 
  Palette, 
  RotateCcw, 
  Eye,
  Sliders,
  Sparkles
} from 'lucide-react';
import { PrintArea } from '@/lib/customizationConfig';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface ImageToolsProps {
  canvas: fabric.Canvas | null;
  activeObject: fabric.Object | null;
  onSaveHistory: () => void;
  printArea: PrintArea;
}

const COLOR_SWATCHES = [
  '#000000',
  '#FFFFFF',
  '#FF5A36',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#6B7280',
];

export default function ImageTools({ canvas, activeObject, onSaveHistory, printArea }: ImageToolsProps) {
  const t = useTranslations('Editor');
  const [activeSubTab, setActiveSubTab] = useState<'color' | 'filters' | 'transform'>('color');
  const [opacity, setOpacity] = useState(1);
  const [currentColor, setCurrentColor] = useState<string>('#000000');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isEraserActive, setIsEraserActive] = useState<boolean>(false);
  const [eraserDistance, setEraserDistance] = useState<number>(0.2);

  useEffect(() => {
    if (activeObject) {
      setOpacity(activeObject.opacity ?? 1);
      if (activeObject.type === 'path' || activeObject.type === 'polygon') {
        setCurrentColor((activeObject.fill as string) || '#000000');
      }

      if (activeObject.type === 'image') {
        const img = activeObject as fabric.Image;
        const removeColorFilter = (img.filters || []).find(
          (f: any) => f?.type === 'RemoveColor' || f instanceof (fabric.Image.filters as any).RemoveColor
        );
        if (removeColorFilter) {
          setIsEraserActive(true);
          setEraserDistance(typeof (removeColorFilter as any).distance === 'number' ? (removeColorFilter as any).distance : 0.2);
        } else {
          setIsEraserActive(false);
          setEraserDistance(0.2);
        }
      }
    }
  }, [activeObject]);

  if (!activeObject || (
    activeObject.type !== 'image' && 
    activeObject.type !== 'path' && 
    activeObject.type !== 'group' && 
    activeObject.type !== 'rect' && 
    activeObject.type !== 'circle' && 
    activeObject.type !== 'triangle'
  )) {
    return null;
  }

  const isRasterImage = activeObject.type === 'image';
  const isVectorOrShape = activeObject.type !== 'image';

  const updateProp = (key: string, value: any) => {
    activeObject.set(key as keyof fabric.Object, value);
    canvas?.renderAll();
    onSaveHistory();
  };

  // 1. Smart Tint & Fill for Stickers, Shapes & SVGs
  const applyColor = (color: string) => {
    setCurrentColor(color);
    if (!canvas) return;

    if (isVectorOrShape) {
      if (activeObject.type === 'group') {
        (activeObject as fabric.Group).forEachObject((child: any) => {
          if (child.set) child.set({ fill: color });
        });
      } else {
        activeObject.set({ fill: color });
      }
      canvas.renderAll();
      onSaveHistory();
    } else if (isRasterImage) {
      const img = activeObject as fabric.Image;
      img.filters = (img.filters || []).filter((f: any) => !(f instanceof (fabric.Image.filters as any).BlendColor));
      
      if (color && color !== 'transparent') {
        img.filters.push(new (fabric.Image.filters as any).BlendColor({
          color: color,
          mode: 'tint',
          alpha: 0.85,
        }));
      }
      img.applyFilters();
      canvas.renderAll();
      onSaveHistory();
    }
  };

  // 2. Real-time Magic Eraser
  const updateEraserDistance = (newDistance: number) => {
    if (!canvas || !isRasterImage) return;
    const img = activeObject as fabric.Image;
    if (!img.filters) img.filters = [];

    const existingFilter = img.filters.find(
      (f: any) => f?.type === 'RemoveColor' || f instanceof (fabric.Image.filters as any).RemoveColor
    );

    if (existingFilter) {
      (existingFilter as any).distance = newDistance;
    } else {
      img.filters.push(new (fabric.Image.filters as any).RemoveColor({
        color: '#FFFFFF',
        distance: newDistance,
      }));
    }

    setIsEraserActive(true);
    setEraserDistance(newDistance);
    img.applyFilters();
    canvas.requestRenderAll();
    canvas.renderAll();
    onSaveHistory();
  };

  const toggleMagicEraser = () => {
    if (!canvas || !isRasterImage) return;
    const img = activeObject as fabric.Image;
    if (!img.filters) img.filters = [];

    if (isEraserActive) {
      img.filters = img.filters.filter(
        (f: any) => !(f?.type === 'RemoveColor' || f instanceof (fabric.Image.filters as any).RemoveColor)
      );
      setIsEraserActive(false);
      img.applyFilters();
      canvas.requestRenderAll();
      canvas.renderAll();
      onSaveHistory();
    } else {
      updateEraserDistance(eraserDistance || 0.2);
    }
  };

  // 3. Photo Filters
  const applyGrayscale = () => {
    if (!canvas || !isRasterImage) return;
    const img = activeObject as fabric.Image;
    img.filters = (img.filters || []).filter((f: any) => !(f instanceof (fabric.Image.filters as any).Grayscale));
    img.filters.push(new (fabric.Image.filters as any).Grayscale());
    img.applyFilters();
    setActiveFilter('grayscale');
    canvas.renderAll();
    onSaveHistory();
  };

  const applySepia = () => {
    if (!canvas || !isRasterImage) return;
    const img = activeObject as fabric.Image;
    img.filters = (img.filters || []).filter((f: any) => !(f instanceof (fabric.Image.filters as any).Sepia));
    img.filters.push(new (fabric.Image.filters as any).Sepia());
    img.applyFilters();
    setActiveFilter('sepia');
    canvas.renderAll();
    onSaveHistory();
  };

  const resetFilters = () => {
    if (!canvas || !isRasterImage) return;
    const img = activeObject as fabric.Image;
    img.filters = [];
    img.applyFilters();
    setActiveFilter(null);
    setIsEraserActive(false);
    canvas.renderAll();
    onSaveHistory();
  };

  const flipX = () => {
    activeObject.set('flipX', !activeObject.flipX);
    canvas?.renderAll();
    onSaveHistory();
  };

  const flipY = () => {
    activeObject.set('flipY', !activeObject.flipY);
    canvas?.renderAll();
    onSaveHistory();
  };

  const duplicate = () => {
    if (!canvas) return;
    activeObject.clone((cloned: fabric.Object) => {
      cloned.set({
        left: (cloned.left || 0) + 20,
        top: (cloned.top || 0) + 20,
        evented: true,
      });
      if (cloned.type === 'activeSelection') {
        cloned.canvas = canvas;
        (cloned as fabric.ActiveSelection).forEachObject((obj: any) => canvas.add(obj));
        cloned.setCoords();
      } else {
        canvas.add(cloned);
      }
      canvas.setActiveObject(cloned);
      onSaveHistory();
    });
  };

  const center = () => {
    if (!canvas) return;
    canvas.centerObject(activeObject);
    activeObject.setCoords();
    canvas.renderAll();
    onSaveHistory();
  };

  const fitToPrintArea = () => {
    if (!canvas || !activeObject) return;
    const targetW = printArea?.width || (canvas as any).printAreaWidth || 200;
    const targetH = printArea?.height || (canvas as any).printAreaHeight || 280;
    
    // Fit within 92% of actual print area while strictly preserving aspect ratio and leaving safe margins
    const maxW = targetW * 0.92;
    const maxH = targetH * 0.92;
    const originalW = activeObject.width || 1;
    const originalH = activeObject.height || 1;
    const scaleFactor = Math.min(maxW / originalW, maxH / originalH);
    
    activeObject.scale(scaleFactor);
    canvas.centerObject(activeObject);
    activeObject.setCoords();
    canvas.requestRenderAll();
    canvas.renderAll();
    canvas.fire('object:modified', { target: activeObject });
    onSaveHistory();
  };

  return (
    <div className="flex flex-col gap-3 w-full bg-gray-50/90 p-3 rounded-2xl border border-gray-200 shadow-xs">
      {/* Header & Sub-Tabs Navigation (Canva Style) */}
      <div className="flex items-center justify-between gap-1 pb-2 border-b border-gray-200">
        <div className="flex bg-gray-200/80 p-0.5 rounded-xl gap-1 w-full">
          <button 
            type="button"
            onClick={() => setActiveSubTab('color')}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
              activeSubTab === 'color' ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Palette size={13} className="text-[var(--color-primary)]" />
            <span>{t('colorTint')}</span>
          </button>
          
          {isRasterImage && (
            <button 
              type="button"
              onClick={() => setActiveSubTab('filters')}
              className={cn(
                "flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                activeSubTab === 'filters' ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Wand2 size={13} className="text-amber-600" />
              <span>{t('filtersAndEraser')}</span>
            </button>
          )}

          <button 
            type="button"
            onClick={() => setActiveSubTab('transform')}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
              activeSubTab === 'transform' ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Sliders size={13} className="text-blue-600" />
            <span>{t('transformAndOpacity')}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: COLOR PICKER & TINT */}
      {activeSubTab === 'color' && (
        <div className="flex flex-col gap-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Palette size={14} className="text-[var(--color-primary)]" />
              {t('colorTint')}
            </span>
            <input 
              type="color" 
              value={currentColor} 
              onChange={(e) => applyColor(e.target.value)}
              className="w-6 h-6 rounded-lg cursor-pointer border border-gray-300 p-0"
              title={t('customColor')}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                onClick={() => applyColor(swatch)}
                className="w-6 h-6 rounded-full border border-gray-300 shadow-xs transition-transform hover:scale-110"
                style={{ backgroundColor: swatch }}
                title={swatch}
              />
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: FILTERS & MAGIC ERASER (Raster Images only) */}
      {activeSubTab === 'filters' && isRasterImage && (
        <div className="flex flex-col gap-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Wand2 size={14} className="text-[var(--color-primary)]" />
              {t('imageFilters')}
            </span>
          </div>

          {/* Magic Eraser Toggle Button */}
          <button 
            onClick={toggleMagicEraser}
            className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all shadow-xs ${
              isEraserActive 
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/20 shadow-md' 
                : 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-900 hover:from-amber-100 hover:to-orange-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <Wand2 size={14} className={isEraserActive ? 'text-white' : 'text-amber-600'} />
              <span>{t('removeWhiteBackground')}</span>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isEraserActive ? 'bg-white/20 text-white' : 'bg-amber-200/60 text-amber-800'}`}>
              {isEraserActive ? t('active') : t('inactive')}
            </span>
          </button>

          {/* Real-time Tolerance Slider */}
          {isEraserActive && (
            <div className="flex flex-col gap-2 p-2.5 bg-white border border-amber-200/80 rounded-xl shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-700">{t('eraserTolerance')}:</span>
                <span className="text-xs font-mono font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  {Math.round(eraserDistance * 100)}%
                </span>
              </div>
              
              <input 
                type="range" 
                min="0.02" 
                max="0.80" 
                step="0.01" 
                value={eraserDistance} 
                onChange={(e) => updateEraserDistance(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />

              <div className="flex justify-between gap-1">
                {[
                  { label: t('light'), val: 0.10 },
                  { label: t('medium'), val: 0.22 },
                  { label: t('strong'), val: 0.38 },
                  { label: t('maximum'), val: 0.55 },
                ].map(preset => (
                  <button
                    key={preset.val}
                    onClick={() => updateEraserDistance(preset.val)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                      Math.abs(eraserDistance - preset.val) < 0.03
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Photo Filters */}
          <div className="grid grid-cols-3 gap-1.5">
            <button 
              onClick={applyGrayscale}
              className={`py-1.5 px-2 bg-white border rounded-lg text-xs font-semibold hover:bg-gray-100 transition-all ${activeFilter === 'grayscale' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-gray-200 text-gray-600'}`}
            >
              {t('grayscale')}
            </button>
            <button 
              onClick={applySepia}
              className={`py-1.5 px-2 bg-white border rounded-lg text-xs font-semibold hover:bg-gray-100 transition-all ${activeFilter === 'sepia' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-gray-200 text-gray-600'}`}
            >
              {t('sepia')}
            </button>
            <button 
              onClick={resetFilters}
              className="py-1.5 px-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center justify-center gap-1 transition-all"
              title={t('resetFilters')}
            >
              <RotateCcw size={12} />
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: TRANSFORM & OPACITY & QUICK ACTIONS */}
      {activeSubTab === 'transform' && (
        <div className="flex flex-col gap-2.5 animate-in fade-in duration-150">
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={duplicate} title={t('duplicate')} className="p-2 bg-white rounded-xl border border-gray-200 hover:bg-gray-100 flex justify-center text-gray-700 shadow-xs">
              <Copy size={15}/>
            </button>
            <button onClick={flipX} title={t('flipHorizontal')} className="p-2 bg-white rounded-xl border border-gray-200 hover:bg-gray-100 flex justify-center text-gray-700 shadow-xs">
              <FlipHorizontal size={15}/>
            </button>
            <button onClick={flipY} title={t('flipVertical')} className="p-2 bg-white rounded-xl border border-gray-200 hover:bg-gray-100 flex justify-center text-gray-700 shadow-xs">
              <FlipVertical size={15}/>
            </button>
            <button onClick={center} title={t('center')} className="p-2 bg-white rounded-xl border border-gray-200 hover:bg-gray-100 flex justify-center text-gray-700 shadow-xs">
              <AlignCenter size={15}/>
            </button>
          </div>
          
          <button onClick={fitToPrintArea} className="w-full py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1.5 shadow-xs">
            <Maximize size={14} className="text-[var(--color-primary)]" />
            {t('fitToPrintArea')}
          </button>

          <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-gray-200">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
              <Eye size={13} />
              {t('opacity')}
            </span>
            <div className="flex items-center gap-2">
              <input 
                type="range" min="0" max="1" step="0.05" 
                value={opacity} 
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setOpacity(val);
                  updateProp('opacity', val);
                }} 
                className="w-24 accent-[var(--color-primary)] cursor-pointer" 
              />
              <span className="text-xs font-mono text-gray-600 w-7 text-right">{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



