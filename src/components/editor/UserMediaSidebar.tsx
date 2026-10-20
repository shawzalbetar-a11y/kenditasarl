"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderHeart, 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Sparkles, 
  Image as ImageIcon, 
  Clock, 
  EyeOff,
  Eye,
  Plus,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';

export interface UserUploadItem {
  id: string;
  url: string;
  name?: string;
  createdAt?: string;
  size?: number;
}

export interface RecentAssetItem {
  id: string;
  url: string;
  name?: string;
  price?: number;
  category?: string;
  usedAt: string;
}

interface UserMediaSidebarProps {
  userUploads: UserUploadItem[];
  recentAssets: RecentAssetItem[];
  onSelectUpload: (item: UserUploadItem) => void;
  onSelectRecentAsset: (item: RecentAssetItem) => void;
  onUploadFile: (file: File) => void;
  onDeleteUpload?: (id: string) => void;
  onDeleteRecent?: (id: string) => void;
  isUploading?: boolean;
}

export default function UserMediaSidebar({
  userUploads,
  recentAssets,
  onSelectUpload,
  onSelectRecentAsset,
  onUploadFile,
  onDeleteUpload,
  onDeleteRecent,
  isUploading = false,
}: UserMediaSidebarProps) {
  const t = useTranslations('Editor');
  const locale = useLocale();
  const isRtl = locale === 'ar';

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'uploads' | 'recents'>('uploads');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved collapsed state from localStorage (default collapsed on mobile to keep t-shirt visible)
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('studio_user_media_collapsed');
      if (savedState !== null) {
        setIsCollapsed(savedState === 'true');
      } else if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    } catch {}
  }, []);

  const toggleCollapse = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    try {
      localStorage.setItem('studio_user_media_collapsed', String(collapsed));
    } catch {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const totalItemsCount = userUploads.length + recentAssets.length;

  // Render Collapsed Pill Button
  if (isCollapsed) {
    return (
      <div className="absolute top-14 left-3 z-30">
        <button
          type="button"
          onClick={() => toggleCollapse(false)}
          className="group flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg border border-gray-200/80 hover:border-blue-500 hover:bg-white text-gray-800 transition-all duration-200 active:scale-95 cursor-pointer"
          title={t('showMyDesigns')}
        >
          <div className="relative">
            <FolderHeart size={16} className="text-blue-600 group-hover:scale-110 transition-transform" />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1.5 -end-1.5 w-2.5 h-2.5 bg-blue-600 rounded-full ring-2 ring-white animate-pulse" />
            )}
          </div>
          <span className="text-xs font-black font-sans">
            {t('myDesigns')}
          </span>
          {totalItemsCount > 0 && (
            <span className="text-[10px] font-bold font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
              {totalItemsCount}
            </span>
          )}
          {isRtl ? (
            <ChevronLeft size={14} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
          ) : (
            <ChevronRight size={14} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
          )}
        </button>
      </div>
    );
  }

  // Render Expanded 2-Column Grid Drawer Panel
  return (
    <div className="absolute top-14 left-3 z-30 w-60 sm:w-68 max-w-[calc(100vw-24px)] max-h-[calc(100%-195px)] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200/80 flex flex-col transition-all duration-300 animate-in fade-in slide-in-from-left-3 select-none">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderHeart size={16} className="text-blue-600 shrink-0" />
          <h3 className="font-bold text-xs text-gray-900 truncate">
            {t('myDesigns')}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {/* Hide / Collapse Button */}
          <button
            type="button"
            onClick={() => toggleCollapse(true)}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            title={t('hidePanel')}
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Quick Upload Action Button */}
      <div className="p-2 border-b border-gray-100">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full py-2 px-2.5 bg-blue-50 hover:bg-blue-100/90 text-blue-700 active:scale-98 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-blue-200/70 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 size={13} className="animate-spin text-blue-600 shrink-0" />
              <span className="truncate">{t('uploadingDesign')}</span>
            </>
          ) : (
            <>
              <Plus size={14} className="text-blue-600 shrink-0" />
              <span className="truncate">{t('uploadDesign')}</span>
            </>
          )}
        </button>
      </div>

      {/* Segmented Tabs: Uploads vs Recents */}
      <div className="flex bg-gray-100/90 p-1 mx-2 my-1.5 rounded-xl text-xs gap-1 font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('uploads')}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 min-w-0 cursor-pointer text-[11px]",
            activeTab === 'uploads'
              ? "bg-white text-gray-900 shadow-2xs font-black"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <Upload size={12} className="shrink-0" />
          <span className="truncate">{t('myUploads')}</span>
          <span className="font-mono text-[9px] bg-gray-200/90 text-gray-700 px-1.5 py-0.2 rounded-full shrink-0 font-bold">
            {userUploads.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('recents')}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 min-w-0 cursor-pointer text-[11px]",
            activeTab === 'recents'
              ? "bg-white text-gray-900 shadow-2xs font-black"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <Sparkles size={12} className="shrink-0" />
          <span className="truncate">{t('libraryRecents')}</span>
          <span className="font-mono text-[9px] bg-gray-200/90 text-gray-700 px-1.5 py-0.2 rounded-full shrink-0 font-bold">
            {recentAssets.length}
          </span>
        </button>
      </div>

      {/* 2-Column Grid Layout ("على شكل شبكة من صفين") */}
      <div className="flex-1 overflow-y-auto p-2 max-h-56 sm:max-h-72 custom-scrollbar">
        {activeTab === 'uploads' ? (
          userUploads.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center py-6 px-3 text-center border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/40 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2 shadow-2xs">
                <Upload size={16} />
              </div>
              <p className="text-[11px] font-bold text-gray-700 mb-0.5">
                {t('noUploadsYet')}
              </p>
              <p className="text-[9px] text-gray-400">
                {t('clickToUpload')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {userUploads.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectUpload(item)}
                  className="group relative aspect-square bg-gray-50 hover:bg-blue-50/30 rounded-xl border border-gray-200 hover:border-blue-500 transition-all p-1.5 flex items-center justify-center shadow-2xs hover:shadow-md cursor-pointer overflow-hidden"
                  title={item.name || t('clickToAddCanvas')}
                >
                  <img
                    src={item.url}
                    alt={item.name || "Upload"}
                    className="w-full h-full object-contain pointer-events-none group-hover:scale-108 transition-transform duration-200"
                    loading="lazy"
                  />

                  {/* Delete Button on Hover */}
                  {onDeleteUpload && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteUpload(item.id);
                      }}
                      className="absolute top-1 end-1 w-5 h-5 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                      title={t('delete', { fallback: 'حذف' })}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}

                  {/* Subtle Add Badge */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center pointer-events-none">
                    <span className="text-[9px] text-white font-bold">
                      {t('addToCanvas')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          recentAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-3 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
              <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
                <Sparkles size={16} />
              </div>
              <p className="text-[11px] font-bold text-gray-700 mb-0.5">
                {t('noRecentStickers')}
              </p>
              <p className="text-[9px] text-gray-400">
                {t('recentStickersDesc')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {recentAssets.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectRecentAsset(item)}
                  className="group relative aspect-square bg-gray-50 hover:bg-amber-50/30 rounded-xl border border-gray-200 hover:border-amber-500 transition-all p-1.5 flex items-center justify-center shadow-2xs hover:shadow-md cursor-pointer overflow-hidden"
                  title={item.name || t('clickToAddCanvas')}
                >
                  <img
                    src={item.url}
                    alt={item.name || "Sticker"}
                    className="w-full h-full object-contain pointer-events-none group-hover:scale-108 transition-transform duration-200"
                    loading="lazy"
                  />

                  {/* Price Tag if paid */}
                  {typeof item.price === 'number' && item.price > 0 && (
                    <span className="absolute bottom-1 start-1 text-[8px] bg-amber-500 text-white font-black px-1 rounded shadow-xs font-mono">
                      +{item.price} ₺
                    </span>
                  )}

                  {/* Delete Button on Hover */}
                  {onDeleteRecent && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRecent(item.id);
                      }}
                      className="absolute top-1 end-1 w-5 h-5 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                      title={t('removeFromHistory')}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}

                  {/* Subtle Add Badge */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center pointer-events-none">
                    <span className="text-[9px] text-white font-bold">
                      {t('addToCanvas')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
