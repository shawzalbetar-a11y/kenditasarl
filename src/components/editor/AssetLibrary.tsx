"use client";

import { useTranslations } from 'next-intl';
import { Type, Image as ImageIcon, Smile, LayoutTemplate } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AssetLibraryProps {
  onAddText: () => void;
  onAddImage: (file: File) => void;
  onAddSticker: (url: string) => void;
  onAddTemplate: (templateId: string) => void;
}

const MOCK_STICKERS = [
  'https://cdn-icons-png.flaticon.com/512/1077/1077114.png',
  'https://cdn-icons-png.flaticon.com/512/1077/1077035.png',
  'https://cdn-icons-png.flaticon.com/512/1077/1077042.png',
  'https://cdn-icons-png.flaticon.com/512/1077/1077086.png',
];

const MOCK_TEMPLATES = [
  { id: 't1', name: 'Vintage', thumb: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=100&q=60' },
  { id: 't2', name: 'Minimal', thumb: 'https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?w=100&q=60' },
];

export default function AssetLibrary({ onAddText, onAddImage, onAddSticker, onAddTemplate }: AssetLibraryProps) {
  const t = useTranslations('Editor');
  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'stickers' | 'templates'>('text');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAddImage(e.target.files[0]);
    }
  };

  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm h-[600px] flex flex-col">
      <div className="flex justify-between border-b pb-2 mb-4">
        <button onClick={() => setActiveTab('text')} className={cn("flex flex-col items-center gap-1 p-2 rounded-lg", activeTab === 'text' ? "text-primary bg-primary/5" : "text-gray-500 hover:bg-gray-50")}>
          <Type size={20} />
          <span className="text-xs">{t('addText')}</span>
        </button>
        <button onClick={() => setActiveTab('image')} className={cn("flex flex-col items-center gap-1 p-2 rounded-lg", activeTab === 'image' ? "text-primary bg-primary/5" : "text-gray-500 hover:bg-gray-50")}>
          <ImageIcon size={20} />
          <span className="text-xs">{t('addImage')}</span>
        </button>
        <button onClick={() => setActiveTab('stickers')} className={cn("flex flex-col items-center gap-1 p-2 rounded-lg", activeTab === 'stickers' ? "text-primary bg-primary/5" : "text-gray-500 hover:bg-gray-50")}>
          <Smile size={20} />
          <span className="text-xs">{t('addSticker')}</span>
        </button>
        <button onClick={() => setActiveTab('templates')} className={cn("flex flex-col items-center gap-1 p-2 rounded-lg", activeTab === 'templates' ? "text-primary bg-primary/5" : "text-gray-500 hover:bg-gray-50")}>
          <LayoutTemplate size={20} />
          <span className="text-xs">{t('templates')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'text' && (
          <div className="flex flex-col gap-3">
            <button 
              onClick={onAddText}
              className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary hover:text-primary transition-colors font-bold text-lg"
            >
              + {t('addText')}
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">
              {t('addTextHint')}
            </p>
          </div>
        )}

        {activeTab === 'image' && (
          <div className="flex flex-col gap-3">
            <label className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary hover:text-primary transition-colors cursor-pointer flex flex-col items-center justify-center gap-2">
              <ImageIcon size={32} className="text-gray-400" />
              <span className="font-medium text-sm text-gray-600">{t('addImage')}</span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleImageUpload} 
              />
            </label>
          </div>
        )}

        {activeTab === 'stickers' && (
          <div className="grid grid-cols-2 gap-3">
            {MOCK_STICKERS.map((sticker, idx) => (
              <button
                key={idx}
                onClick={() => onAddSticker(sticker)}
                className="aspect-square border border-gray-200 rounded-lg p-2 hover:border-primary transition-colors flex items-center justify-center bg-gray-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sticker} alt="Sticker" className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="flex flex-col gap-3">
            {MOCK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => onAddTemplate(tpl.id)}
                className="w-full aspect-video rounded-lg overflow-hidden border border-gray-200 hover:border-primary transition-colors relative group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tpl.thumb} alt={tpl.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white font-medium">{tpl.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
