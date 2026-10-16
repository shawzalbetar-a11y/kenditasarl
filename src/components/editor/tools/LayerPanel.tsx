import React, { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

interface LayerPanelProps {
  canvas: fabric.Canvas | null;
  activeObject: fabric.Object | null;
  onSaveHistory: () => void;
}

export default function LayerPanel({ canvas, activeObject, onSaveHistory }: LayerPanelProps) {
  const t = useTranslations('Editor');
  const [layers, setLayers] = useState<fabric.Object[]>([]);

  const updateLayers = () => {
    if (!canvas) return;
    setLayers([...canvas.getObjects()].reverse());
  };

  useEffect(() => {
    if (!canvas) return;
    updateLayers();
    canvas.on('object:added', updateLayers);
    canvas.on('object:removed', updateLayers);
    canvas.on('object:modified', updateLayers);
    return () => {
      canvas.off('object:added', updateLayers);
      canvas.off('object:removed', updateLayers);
      canvas.off('object:modified', updateLayers);
    };
  }, [canvas]);

  const toggleVisibility = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    obj.set('visible', !obj.visible);
    canvas?.renderAll();
    onSaveHistory();
    updateLayers();
  };

  const toggleLock = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    const isLocked = obj.selectable === false;
    obj.set({ selectable: isLocked, evented: isLocked });
    canvas?.renderAll();
    onSaveHistory();
    updateLayers();
  };

  const moveUp = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    obj.bringForward();
    onSaveHistory();
    updateLayers();
  };

  const moveDown = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    obj.sendBackwards();
    onSaveHistory();
    updateLayers();
  };

  const deleteObj = (obj: fabric.Object, e: React.MouseEvent) => {
    e.stopPropagation();
    canvas?.remove(obj);
    canvas?.discardActiveObject();
    onSaveHistory();
  };

  const selectLayer = (obj: fabric.Object) => {
    if (obj.selectable === false) return;
    canvas?.setActiveObject(obj);
    canvas?.renderAll();
  };

  if (!layers.length) return null;

  return (
    <div className="flex flex-col gap-2 w-full mt-4">
      <h4 className="text-sm font-bold text-gray-700">{t('layers', { fallback: 'إدارة الطبقات' })}</h4>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
        {layers.map((obj, idx) => {
          const isActive = activeObject === obj;
          const isLocked = obj.selectable === false;
          const isVisible = obj.visible !== false;
          const name = obj.type === 'i-text' ? ((obj as fabric.IText).text?.substring(0, 10) || 'Text') : (obj.name || obj.type);
          
          return (
            <div 
              key={idx} 
              onClick={() => selectLayer(obj)}
              className={`flex items-center justify-between p-2 rounded-lg text-sm border transition-colors ${isActive ? 'border-[var(--color-primary)] bg-blue-50' : 'border-gray-100 hover:bg-gray-50 cursor-pointer'}`}
            >
              <span className="font-medium truncate flex-1">{name}</span>
              <div className="flex items-center gap-1">
                <button onClick={(e) => moveUp(obj, e)} className="p-1 text-gray-400 hover:text-black"><ArrowUp size={14}/></button>
                <button onClick={(e) => moveDown(obj, e)} className="p-1 text-gray-400 hover:text-black"><ArrowDown size={14}/></button>
                <button onClick={(e) => toggleVisibility(obj, e)} className="p-1 text-gray-400 hover:text-black">
                  {isVisible ? <Eye size={14}/> : <EyeOff size={14}/>}
                </button>
                <button onClick={(e) => toggleLock(obj, e)} className="p-1 text-gray-400 hover:text-black">
                  {isLocked ? <Lock size={14}/> : <Unlock size={14}/>}
                </button>
                <button onClick={(e) => deleteObj(obj, e)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
