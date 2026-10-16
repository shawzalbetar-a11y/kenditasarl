"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Search, 
  Sparkles, 
  Layers, 
  Tag, 
  Image as ImageIcon,
  Check,
  FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import { getCategoryLocalizedName } from '@/lib/categoryTranslations';

export interface GalleryAsset {
  id: string;
  url: string;
  name: string;
  category?: string;
  type?: "sticker" | "print";
  price?: number;
}

export interface GalleryCategory {
  id: string;
  name: string;
  order?: number;
}

interface AssetGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: GalleryCategory[];
  assets: GalleryAsset[];
  onSelectAsset: (asset: GalleryAsset) => void;
  initialCategory?: string;
}

export default function AssetGalleryModal({
  isOpen,
  onClose,
  categories,
  assets,
  onSelectAsset,
  initialCategory = 'all'
}: AssetGalleryModalProps) {
  const t = useTranslations('Editor');
  const locale = useLocale();
  
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null);

  // Sync initialCategory on open
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory(initialCategory);
      setSearchQuery('');
      setJustSelectedId(null);
    }
  }, [isOpen, initialCategory]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const categoryName = asset.category || 'أخرى';
      const localizedCat = getCategoryLocalizedName(categoryName, locale);
      const matchCategory = selectedCategory === 'all' || categoryName === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        asset.name.toLowerCase().includes(q) ||
        categoryName.toLowerCase().includes(q) ||
        localizedCat.toLowerCase().includes(q);
      
      return matchCategory && matchSearch;
    });
  }, [assets, selectedCategory, searchQuery, locale]);

  // Strictly deduplicated categories for pill bar
  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    const list: GalleryCategory[] = [];
    for (const cat of categories) {
      if (cat.id === 'all') continue;
      const cleanName = (cat.name || '').trim();
      if (cleanName && !seen.has(cleanName)) {
        seen.add(cleanName);
        list.push(cat);
      }
    }
    return list;
  }, [categories]);

  if (!isOpen) return null;

  const handleAssetClick = (asset: GalleryAsset) => {
    setJustSelectedId(asset.id);
    setTimeout(() => {
      onSelectAsset(asset);
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Modal Container */}
      <div 
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] sm:max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50/80 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[var(--color-primary)] flex items-center justify-center shadow-xs">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>{t('galleryModalTitle')}</span>
                <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full font-mono">
                  {assets.length}
                </span>
              </h2>
              <p className="text-xs text-gray-500 hidden sm:block">
                {t('galleryModalSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            title={t('close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Categories Bar */}
        <div className="px-5 sm:px-6 py-3 bg-white border-b border-gray-100 space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={t('searchGalleryPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-gray-50 hover:bg-gray-100/70 focus:bg-white border border-gray-200 focus:border-[var(--color-primary)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 text-xs font-medium cursor-pointer"
              >
                {t('clear')}
              </button>
            )}
          </div>

          {/* Category Tabs / Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0",
                selectedCategory === 'all'
                  ? "bg-[var(--color-primary)] text-white shadow-sm font-bold scale-[1.02]"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
              )}
            >
              <Layers size={14} />
              <span>{t('allCategories')}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.2 rounded-full",
                selectedCategory === 'all' ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
              )}>
                {assets.length}
              </span>
            </button>

            {uniqueCategories.map((cat) => {
              const count = assets.filter(a => (a.category || 'أخرى') === cat.name).length;
              const isSelected = selectedCategory === cat.name;
              const localizedName = getCategoryLocalizedName(cat, locale);

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0",
                    isSelected
                      ? "bg-[var(--color-primary)] text-white shadow-sm font-bold scale-[1.02]"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                  )}
                >
                  <Tag size={13} />
                  <span>{localizedName}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Assets Grid Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-gray-50/40">
          {filteredAssets.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <FolderOpen size={40} className="text-gray-300 mb-2" />
              <h4 className="text-sm font-bold text-gray-700">{t('noDesignsMatching')}</h4>
              <p className="text-xs text-gray-400 mt-1">
                {searchQuery 
                  ? `${t('noDesignsFoundFor')} "${searchQuery}"`
                  : t('noStickersInCategoryDesc')}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-3 text-xs font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
                >
                  {t('showAllDesigns')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
              {filteredAssets.map((asset) => {
                const isSelected = justSelectedId === asset.id;

                return (
                  <button
                    key={asset.id}
                    onClick={() => handleAssetClick(asset)}
                    className={cn(
                      "group bg-white rounded-2xl p-2.5 sm:p-3 border transition-all flex flex-col items-center justify-between gap-2 relative cursor-pointer text-right hover:shadow-md active:scale-95",
                      isSelected 
                        ? "ring-2 ring-emerald-500 border-transparent bg-emerald-50/40" 
                        : "border-gray-200/80 hover:border-[var(--color-primary)]"
                    )}
                  >
                    {/* Thumbnail Box */}
                    <div className="w-full aspect-square bg-[radial-gradient(#f1f5f9_1px,transparent_1px)] [background-size:8px_8px] bg-gray-50/80 rounded-2xl p-3 flex items-center justify-center overflow-hidden relative">
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="max-w-full max-h-full object-contain pointer-events-none group-hover:scale-110 transition-transform duration-200 drop-shadow-xs"
                        loading="lazy"
                      />

                      {/* Price Badge */}
                      {asset.price && asset.price > 0 ? (
                        <span className="absolute top-2 right-2 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-500 text-white shadow-xs">
                          +{asset.price} ₺
                        </span>
                      ) : (
                        <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                          {locale === 'tr' ? 'Ücretsiz' : locale === 'en' ? 'Free' : 'مجاني'}
                        </span>
                      )}

                      {/* Type Indicator */}
                      {asset.type === 'sticker' ? (
                        <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100/90 text-purple-700 backdrop-blur-xs">
                          SVG
                        </span>
                      ) : null}

                      {/* Green Selection Checkmark Overlay */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-emerald-500/25 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-in zoom-in-75">
                          <div className="w-9 h-9 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-lg ring-2 ring-white">
                            <Check size={20} strokeWidth={3} />
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info & Cancel */}
        <div className="px-5 sm:px-6 py-3 border-t border-gray-100 bg-white flex items-center justify-between text-xs text-gray-500">
          <span>{t('clickToInsertHint')}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
