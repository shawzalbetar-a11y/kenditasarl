"use client";

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Shirt, RotateCcw, RotateCw, AlignCenter, AlignLeft, AlignRight, Undo2, Redo2, Trash2 } from 'lucide-react';

interface EditorToolbarProps {
  activeFace: 'front' | 'back' | 'left' | 'right';
  onFaceChange: (face: 'front' | 'back' | 'left' | 'right') => void;
  productColors: { name: string; value: string }[];
  activeColor: string;
  onColorChange: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelection: boolean;
  onAlign: (alignment: 'left' | 'center' | 'right') => void;
  onDelete: () => void;
}

export default function EditorToolbar({
  activeFace,
  onFaceChange,
  productColors,
  activeColor,
  onColorChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasSelection,
  onAlign,
  onDelete
}: EditorToolbarProps) {
  const t = useTranslations('Editor');

  const faces = [
    { id: 'front', label: t('front') },
    { id: 'back', label: t('back') },
    { id: 'left', label: t('left') },
    { id: 'right', label: t('right') },
  ] as const;

  return (
    <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-6 shadow-sm">
      
      {/* Faces Selection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('productView')}</h3>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          {faces.map((face) => (
            <button
              key={face.id}
              onClick={() => onFaceChange(face.id)}
              className={cn(
                "flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-all",
                activeFace === face.id ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {face.label}
            </button>
          ))}
        </div>
      </div>

      {/* Colors Selection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('productColor')}</h3>
        <div className="flex flex-wrap gap-2">
          {productColors.map((color) => (
            <button
              key={color.value}
              onClick={() => onColorChange(color.value)}
              className={cn(
                "w-8 h-8 rounded-full border shadow-sm transition-transform hover:scale-110",
                activeColor === color.value ? "ring-2 ring-primary ring-offset-2 scale-110" : "border-gray-200"
              )}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
        </div>
      </div>

      <div className="h-px bg-gray-200 w-full my-2"></div>

      {/* Tools / Actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('controlTools')}</h3>
        
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button 
            onClick={onUndo} 
            disabled={!canUndo}
            className="flex items-center justify-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-md text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            <Undo2 size={16} /> {t('undo')}
          </button>
          <button 
            onClick={onRedo} 
            disabled={!canRedo}
            className="flex items-center justify-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-md text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            <Redo2 size={16} /> {t('redo')}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button 
            onClick={() => onAlign('left')} 
            disabled={!hasSelection}
            className="flex items-center justify-center p-2 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
            title={t('alignLeft')}
          >
            <AlignLeft size={18} />
          </button>
          <button 
            onClick={() => onAlign('center')} 
            disabled={!hasSelection}
            className="flex items-center justify-center p-2 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
            title={t('alignCenter')}
          >
            <AlignCenter size={18} />
          </button>
          <button 
            onClick={() => onAlign('right')} 
            disabled={!hasSelection}
            className="flex items-center justify-center p-2 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
            title={t('alignRight')}
          >
            <AlignRight size={18} />
          </button>
          <button 
            onClick={onDelete} 
            disabled={!hasSelection}
            className="flex items-center justify-center p-2 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
            title={t('delete')}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

    </div>
  );
}
