import React, { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { useTranslations } from 'next-intl';
import { Copy, FlipHorizontal, FlipVertical, Maximize, Minimize, AlignCenter } from 'lucide-react';
import { PrintArea } from '@/lib/customizationConfig';

interface ImageToolsProps {
  canvas: fabric.Canvas | null;
  activeObject: fabric.Object | null;
  onSaveHistory: () => void;
  printArea: PrintArea;
}

export default function ImageTools({ canvas, activeObject, onSaveHistory, printArea }: ImageToolsProps) {
  const t = useTranslations('Editor');
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (activeObject && (activeObject.type === 'image' || activeObject.type === 'path')) {
      setOpacity(activeObject.opacity ?? 1);
    }
  }, [activeObject]);

  if (!activeObject || (activeObject.type !== 'image' && activeObject.type !== 'path')) return null;

  const updateProp = (key: string, value: any) => {
    activeObject.set(key as keyof fabric.Object, value);
    canvas?.renderAll();
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
    activeObject.center();
    activeObject.setCoords();
    canvas.renderAll();
    onSaveHistory();
  };

  const fitToPrintArea = () => {
    if (!canvas) return;
    
    // Scale object to fit canvas dimensions
    const canvasWidth = canvas.getWidth();
    const canvasHeight = canvas.getHeight();
    
    const objWidth = activeObject.width! * activeObject.scaleX!;
    const objHeight = activeObject.height! * activeObject.scaleY!;
    
    const scaleX = canvasWidth / activeObject.width!;
    const scaleY = canvasHeight / activeObject.height!;
    const scale = Math.min(scaleX, scaleY) * 0.95; // 95% to leave a tiny margin
    
    activeObject.set({ scaleX: scale, scaleY: scale });
    activeObject.center();
    activeObject.setCoords();
    canvas.renderAll();
    onSaveHistory();
  };

  return (
    <div className="flex flex-col gap-4 w-full bg-gray-50 p-4 rounded-xl mt-4">
      <h4 className="text-sm font-bold text-[var(--color-secondary)]">{t('imageProperties', { fallback: 'Object Properties' })}</h4>
      
      <div className="grid grid-cols-4 gap-2">
        <button onClick={duplicate} title="Duplicate" className="p-2 bg-white rounded-lg border hover:bg-gray-100 flex justify-center"><Copy size={16}/></button>
        <button onClick={flipX} title="Flip X" className="p-2 bg-white rounded-lg border hover:bg-gray-100 flex justify-center"><FlipHorizontal size={16}/></button>
        <button onClick={flipY} title="Flip Y" className="p-2 bg-white rounded-lg border hover:bg-gray-100 flex justify-center"><FlipVertical size={16}/></button>
        <button onClick={center} title="Center" className="p-2 bg-white rounded-lg border hover:bg-gray-100 flex justify-center"><AlignCenter size={16}/></button>
      </div>
      
      <button onClick={fitToPrintArea} className="w-full py-2 bg-white border rounded-lg text-sm font-medium hover:bg-gray-100 flex items-center justify-center gap-2">
        <Maximize size={16} /> Fit to Area
      </button>

      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-500">Opacity</span>
        <input 
          type="range" min="0" max="1" step="0.1" 
          value={opacity} 
          onChange={e => {
            setOpacity(parseFloat(e.target.value));
            updateProp('opacity', parseFloat(e.target.value));
          }} 
          className="w-32" 
        />
      </div>
    </div>
  );
}
