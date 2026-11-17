"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  FolderHeart,
  Upload,
  Trash2,
  Sparkles,
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
  type?: string;
  version?: number | string;
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
  locale?: string;
}

// Complete fallback translations dictionary across all 3 supported languages
const TRANSLATIONS: Record<string, Record<string, string>> = {
  myDesigns: {
    ar: 'تصاميمي',
    tr: 'Tasarımlarım',
    en: 'My Designs',
  },
  showMyDesigns: {
    ar: 'إظهار تصاميمي',
    tr: 'Tasarımlarımı Göster',
    en: 'Show My Designs',
  },
  hidePanel: {
    ar: 'إخفاء اللوحة',
    tr: 'Paneli Gizle',
    en: 'Hide Panel',
  },
  uploadDesign: {
    ar: 'ارفع تصميمك',
    tr: 'Tasarım Yükle',
    en: 'Upload Design',
  },
  uploadingDesign: {
    ar: 'جاري الرفع...',
    tr: 'Yükleniyor...',
    en: 'Uploading...',
  },
  myUploads: {
    ar: 'تصاميمي المرفوعة',
    tr: 'Yüklemeler',
    en: 'Uploads',
  },
  libraryRecents: {
    ar: 'المكتبة',
    tr: 'Kütüphane',
    en: 'Library',
  },
  noUploadsYet: {
    ar: 'لا توجد تصاميم مرفوعة بعد',
    tr: 'Henüz yüklenmiş tasarım yok',
    en: 'No uploads yet',
  },
  clickToUpload: {
    ar: 'اضغط هنا لرفع صورتك',
    tr: 'Görselinizi yüklemek için tıklayın',
    en: 'Click to upload your image',
  },
  noRecentStickers: {
    ar: 'لم تستخدم ملصقات بعد',
    tr: 'Henüz etiket kullanılmadı',
    en: 'No recent stickers',
  },
  recentStickersDesc: {
    ar: 'الملصقات التي تختارها من مكتبتنا ستظهر هنا',
    tr: 'Kütüphanemizden kullandığınız etiketler burada görünecektir',
    en: 'Stickers you use from our library will appear here',
  },
  clickToAddCanvas: {
    ar: 'انقر للإضافة إلى مساحة العمل',
    tr: 'Tasarıma eklemek için tıklayın',
    en: 'Click to add to canvas',
  },
  addToCanvas: {
    ar: '+ إضافة',
    tr: '+ Ekle',
    en: '+ Add',
  },
  removeFromHistory: {
    ar: 'إزالة من السجل',
    tr: 'Geçmişten Kaldır',
    en: 'Remove from history',
  },
  delete: {
    ar: 'حذف',
    tr: 'Sil',
    en: 'Delete',
  },
};

export default function UserMediaSidebar({
  userUploads,
  recentAssets,
  onSelectUpload,
  onSelectRecentAsset,
  onUploadFile,
  onDeleteUpload,
  onDeleteRecent,
  isUploading = false,
  locale: propLocale,
}: UserMediaSidebarProps) {
  const t = useTranslations('Editor');
  const hookLocale = useLocale();
  const currentLocale = propLocale || hookLocale || 'ar';
  const isRtl = currentLocale === 'ar';

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'uploads' | 'recents'>('uploads');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multilingual label getter with robust fallback
  const getLabel = (key: string): string => {
    try {
      const val = t(key);
      if (val && !val.includes(key)) return val;
    } catch { }
    return TRANSLATIONS[key]?.[currentLocale] || TRANSLATIONS[key]?.['ar'] || key;
  };

  // Default open on desktop so user immediately sees their designs, collapsed on mobile
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('studio_user_media_collapsed');
        if (saved !== null) {
          setIsCollapsed(saved === 'true');
        } else if (window.innerWidth < 1024) {
          setIsCollapsed(true);
        } else {
          setIsCollapsed(false);
        }
      }
    } catch { }
  }, []);

  const toggleCollapse = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    try {
      localStorage.setItem('studio_user_media_collapsed', String(collapsed));
    } catch { }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFile(e.target.files[0]);
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        toggleCollapse(true);
      }
      e.target.value = '';
    }
  };

  const totalItemsCount = userUploads.length + recentAssets.length;

  // Render Collapsed Pill Button (Hidden on Mobile, Desktop Only)
  if (isCollapsed) {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="hidden lg:block absolute top-3 sm:top-4 end-3 xl:end-4 z-40 pointer-events-auto"
      >
        <button
          type="button"
          onClick={() => toggleCollapse(false)}
          className="group flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-xl border border-gray-200/90 hover:border-blue-500 hover:bg-white text-gray-800 transition-all duration-200 active:scale-95 cursor-pointer"
          title={getLabel('showMyDesigns')}
        >
          <div className="relative">
            <FolderHeart size={18} className="text-blue-600 group-hover:scale-110 transition-transform" />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1 -end-1 w-2.5 h-2.5 bg-blue-600 rounded-full ring-2 ring-white animate-pulse" />
            )}
          </div>
          <span className="text-xs font-black font-sans">
            {getLabel('myDesigns')}
          </span>
          {totalItemsCount > 0 && (
            <span className="text-[10px] font-bold font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
              {totalItemsCount}
            </span>
          )}
          <Eye size={14} className="text-blue-500 group-hover:scale-110 transition-transform" />
        </button>
      </div>
    );
  }

  // Render Expanded 2-Column Grid Drawer Panel (Hidden on Mobile, Desktop Only)
  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        "hidden lg:flex absolute top-3 sm:top-4 end-3 xl:end-4 z-40",
        "w-72 sm:w-80 max-w-[calc(100vw-24px)]",
        "bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-200/90",
        "flex-col transition-all duration-300 animate-in fade-in select-none pointer-events-auto",
        "max-h-[calc(100vh-200px)] sm:max-h-[calc(100%-24px)]"
      )}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <FolderHeart size={18} />
          </div>
          <h3 className="font-black text-sm text-gray-900 tracking-wide truncate">
            {getLabel('myDesigns')}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {/* Eye Hide / Collapse Toggle Button */}
          <button
            type="button"
            onClick={() => toggleCollapse(true)}
            className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all cursor-pointer active:scale-90"
            title={getLabel('hidePanel')}
          >
            <EyeOff size={17} className="text-gray-500 hover:text-blue-600" />
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
      <div className="p-3 border-b border-gray-100">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100/80 text-blue-800 active:scale-98 rounded-2xl font-black text-xs flex items-center justify-center gap-2 border border-blue-200/80 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 size={15} className="animate-spin text-blue-600 shrink-0" />
              <span className="truncate">{getLabel('uploadingDesign')}</span>
            </>
          ) : (
            <>
              <Plus size={16} className="text-blue-600 shrink-0 stroke-[2.5]" />
              <span className="truncate">{getLabel('uploadDesign')}</span>
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
          <span className="truncate">{getLabel('myUploads')}</span>
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
          <span className="truncate">{getLabel('libraryRecents')}</span>
          <span className="font-mono text-[9px] bg-gray-200/90 text-gray-700 px-1.5 py-0.2 rounded-full shrink-0 font-bold">
            {recentAssets.length}
          </span>
        </button>
      </div>

      {/* 2-Column Grid Layout - Solid minimum height and scrollable area */}
      <div className="flex-1 overflow-y-auto p-2.5 min-h-[190px] max-h-[min(380px,calc(100vh-340px))] custom-scrollbar">
        {activeTab === 'uploads' ? (
          userUploads.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center py-7 px-3 text-center border-2 border-dashed border-gray-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/40 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2 shadow-2xs">
                <Upload size={18} />
              </div>
              <p className="text-[11px] font-bold text-gray-700 mb-0.5">
                {getLabel('noUploadsYet')}
              </p>
              <p className="text-[9px] text-gray-400">
                {getLabel('clickToUpload')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {userUploads.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectUpload(item);
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      toggleCollapse(true);
                    }
                  }}
                  className="group relative aspect-square bg-gray-50/80 hover:bg-blue-50/30 rounded-2xl border border-gray-200/90 hover:border-blue-500 transition-all p-2 flex items-center justify-center shadow-xs hover:shadow-md cursor-pointer overflow-hidden"
                  title={item.name || getLabel('clickToAddCanvas')}
                >
                  <img
                    src={item.url}
                    alt={item.name || "Upload"}
                    className="w-full h-full object-contain pointer-events-none group-hover:scale-105 transition-transform duration-200"
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
                      className="absolute top-1.5 end-1.5 w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                      title={getLabel('delete')}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}

                  {/* Subtle Add Badge */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center pointer-events-none">
                    <span className="text-[10px] text-white font-bold tracking-tight">
                      {getLabel('addToCanvas')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          recentAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-7 px-3 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
                <Sparkles size={18} />
              </div>
              <p className="text-[11px] font-bold text-gray-700 mb-0.5">
                {getLabel('noRecentStickers')}
              </p>
              <p className="text-[9px] text-gray-400">
                {getLabel('recentStickersDesc')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {recentAssets.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectRecentAsset(item);
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      toggleCollapse(true);
                    }
                  }}
                  className="group relative aspect-square bg-gray-50/80 hover:bg-amber-50/30 rounded-2xl border border-gray-200/90 hover:border-amber-500 transition-all p-2 flex items-center justify-center shadow-xs hover:shadow-md cursor-pointer overflow-hidden"
                  title={item.name || getLabel('clickToAddCanvas')}
                >
                  <img
                    src={item.url}
                    alt={item.name || "Sticker"}
                    className="w-full h-full object-contain pointer-events-none group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />

                  {/* Price Tag if paid */}
                  {typeof item.price === 'number' && item.price > 0 && (
                    <span className="absolute bottom-1.5 start-1.5 text-[8px] bg-amber-500 text-white font-black px-1.5 py-0.5 rounded-md shadow-xs font-mono">
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
                      className="absolute top-1.5 end-1.5 w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                      title={getLabel('removeFromHistory')}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}

                  {/* Subtle Add Badge */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center pointer-events-none">
                    <span className="text-[10px] text-white font-bold tracking-tight">
                      {getLabel('addToCanvas')}
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
