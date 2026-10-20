"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  PlacementSpec,
  PRINT_CONFIG,
  normalizeGarmentType,
  isFaceMatching,
} from '@/lib/printPlacementConfig';
import { Ruler, Check, ChevronDown, ChevronUp, Shirt, Sparkles, X, Copy } from 'lucide-react';
import { getLocalizedColorName } from '@/lib/colorTranslations';

interface GarmentPlacementGuideProps {
  garmentType?: string;
  allowedPlacements?: string[];
  activeFace: string;
  selectedColor?: string;
  selectedPlacementIds: string[];
  syncPlacementsAcrossColors?: boolean;
  onToggleSyncPlacements?: () => void;
  onApplyToAllColors?: () => void;
  onTogglePlacement: (placement: PlacementSpec) => void;
  onSelectFace?: (face: string) => void;
  onClearAll?: () => void;
  locale?: string;
  className?: string;
}

/**
 * Clean SVG Mini Silhouette for T-Shirt and Hoodie with high-precision highlighted print areas
 */
function GarmentMiniature({
  garmentType,
  placement,
  isActive,
}: {
  garmentType: 'tshirt' | 'hoodie' | 'sweatshirt' | 'generic';
  placement: PlacementSpec;
  isActive: boolean;
}) {
  const isBack = placement.targetFace === 'back';
  const isHoodie = garmentType === 'hoodie';
  const box = placement.canvasBox;

  return (
    <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center p-1 transition-all shrink-0 ${
      isActive
        ? 'bg-amber-500/15 border-2 border-amber-500 shadow-xs ring-2 ring-amber-400/30'
        : 'bg-slate-100 hover:bg-slate-200 border border-slate-300'
    }`}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full drop-shadow-2xs"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {isHoodie ? (
          /* Hoodie Vector Path */
          <g>
            <path
              d="M30 25 L10 42 L18 52 L28 44 L28 88 L72 88 L72 44 L82 52 L90 42 L70 25 L62 18 C58 22 42 22 38 18 Z"
              className={isActive ? "fill-slate-800 stroke-slate-900" : "fill-slate-300 stroke-slate-400"}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {!isBack ? (
              <path
                d="M38 18 C44 26 56 26 62 18 C58 10 42 10 38 18 Z"
                className={isActive ? "fill-slate-700 stroke-slate-900" : "fill-slate-400 stroke-slate-500"}
                strokeWidth="1.5"
              />
            ) : (
              <path
                d="M36 17 C42 12 58 12 64 17 C60 25 40 25 36 17 Z"
                className={isActive ? "fill-slate-700 stroke-slate-900" : "fill-slate-400 stroke-slate-500"}
                strokeWidth="1.5"
              />
            )}
            {!isBack && (
              <path
                d="M36 68 L64 68 L60 84 L40 84 Z"
                className={isActive ? "fill-slate-700/80 stroke-slate-600" : "fill-slate-400/80 stroke-slate-400"}
                strokeWidth="1.2"
              />
            )}
          </g>
        ) : (
          /* Classic T-Shirt Vector Path */
          <g>
            <path
              d="M32 20 L12 36 L20 46 L29 38 L29 86 L71 86 L71 38 L80 46 L88 36 L68 20 C62 26 38 26 32 20 Z"
              className={isActive ? "fill-slate-800 stroke-slate-900" : "fill-slate-300 stroke-slate-400"}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d={isBack ? "M36 19 C42 23 58 23 64 19" : "M34 20 C42 28 58 28 66 20"}
              className="stroke-slate-500"
              strokeWidth="1.5"
              fill="none"
            />
          </g>
        )}

        {/* Highlighted Official Print Area Box */}
        <rect
          x={box.leftPercent}
          y={box.topPercent}
          width={box.maxWidthPercent}
          height={box.maxHeightPercent}
          rx="1.5"
          className={
            isActive
              ? "fill-amber-400 stroke-amber-500 animate-pulse"
              : "fill-blue-500/70 stroke-blue-600"
          }
          strokeWidth="1.2"
        />

        {/* Distance from collar indicator line */}
        <line
          x1={box.leftPercent + box.maxWidthPercent / 2}
          y1={21}
          x2={box.leftPercent + box.maxWidthPercent / 2}
          y2={box.topPercent}
          stroke={isActive ? "#F59E0B" : "#3B82F6"}
          strokeWidth="1"
          strokeDasharray="1.5 1.5"
        />
      </svg>
    </div>
  );
}

export default function GarmentPlacementGuide({
  garmentType = 'tshirt',
  allowedPlacements,
  activeFace,
  selectedColor = 'black',
  selectedPlacementIds = [],
  syncPlacementsAcrossColors = false,
  onToggleSyncPlacements,
  onApplyToAllColors,
  onTogglePlacement,
  onSelectFace,
  onClearAll,
  locale = 'ar',
  className = '',
}: GarmentPlacementGuideProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'all' | 'front' | 'back' | 'sleeves'>('all');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const normalizedType = normalizeGarmentType(garmentType);
  const garmentConfig = PRINT_CONFIG[normalizedType] || PRINT_CONFIG.tshirt;
  const localizedColorName = getLocalizedColorName(selectedColor, locale);

  // Filter allowed placements
  const allPlacementsList = useMemo(() => {
    let list = garmentConfig.placements;
    if (allowedPlacements && allowedPlacements.length > 0) {
      list = list.filter((p) => allowedPlacements.includes(p.id));
    }
    return list;
  }, [garmentConfig, allowedPlacements]);

  // Sync initial tab with active face when guide is opened or activeFace changes
  useEffect(() => {
    if (activeFace === 'front') {
      setActiveTab('front');
    } else if (activeFace === 'back') {
      setActiveTab('back');
    } else if (activeFace === 'left' || activeFace === 'left_shoulder' || activeFace === 'right' || activeFace === 'right_shoulder') {
      setActiveTab('sleeves');
    }
  }, [activeFace]);

  // Selected specs
  const selectedSpecs = useMemo(() => {
    return allPlacementsList.filter((p) => selectedPlacementIds.includes(p.id));
  }, [allPlacementsList, selectedPlacementIds]);

  // Placements count per category
  const countsPerCategory = useMemo(() => {
    let front = 0;
    let back = 0;
    let sleeves = 0;
    selectedSpecs.forEach((p) => {
      if (p.targetFace === 'front') front++;
      else if (p.targetFace === 'back') back++;
      else if (p.targetFace === 'left' || p.targetFace === 'right' || p.targetFace === 'left_shoulder' || p.targetFace === 'right_shoulder') sleeves++;
    });
    return { front, back, sleeves, total: selectedSpecs.length };
  }, [selectedSpecs]);

  // Placements filtered by current tab
  const filteredPlacements = useMemo(() => {
    if (activeTab === 'front') {
      return allPlacementsList.filter((p) => p.targetFace === 'front');
    }
    if (activeTab === 'back') {
      return allPlacementsList.filter((p) => p.targetFace === 'back');
    }
    if (activeTab === 'sleeves') {
      return allPlacementsList.filter((p) =>
        p.targetFace === 'left' || p.targetFace === 'right' || p.targetFace === 'left_shoulder' || p.targetFace === 'right_shoulder'
      );
    }
    return allPlacementsList;
  }, [allPlacementsList, activeTab]);

  if (allPlacementsList.length === 0) return null;

  return (
    <div className={`relative ${className}`}>
      {/* 1. Quick Trigger Pill Bar on the Canvas (Compact, thumb-friendly, no overlap) */}
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="bg-white/95 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 border border-gray-200/90 shadow-md hover:shadow-lg flex items-center justify-between gap-2 max-w-full cursor-pointer select-none active:scale-[0.98] transition-all text-right"
        title={locale === 'tr' ? 'Baskı Konumlarını Seç' : locale === 'en' ? 'Select Print Placements' : 'فتح دليل واختيار مواضع الطباعة'}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
            <Shirt size={15} />
          </div>

          <div className="flex flex-col min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] sm:text-xs font-black text-gray-900 truncate">
                {selectedSpecs.length === 0
                  ? (locale === 'tr' ? 'Baskı Konumları' : locale === 'en' ? 'Print Placements' : 'مواضع الطباعة المعتمدة')
                  : (locale === 'tr' ? `Seçili Konumlar (${selectedSpecs.length})` : locale === 'en' ? `Selected Placements (${selectedSpecs.length})` : `المواضع المختارة (${selectedSpecs.length})`)}
              </span>

              {/* Color Scope Pill */}
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1 shrink-0">
                <span
                  className="w-2 h-2 rounded-full border border-gray-400 shrink-0"
                  style={{ backgroundColor: selectedColor === 'navy' ? '#000080' : selectedColor }}
                />
                <span className="truncate max-w-[65px]">
                  {syncPlacementsAcrossColors
                    ? (locale === 'tr' ? 'Tüm Renkler' : locale === 'en' ? 'All' : 'كافة الألوان')
                    : localizedColorName}
                </span>
              </span>

              {selectedSpecs.length > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-white shrink-0 shadow-2xs">
                  {selectedSpecs.length}
                </span>
              )}
            </div>

            {/* Subtitle / summary row */}
            <div className="flex items-center gap-1 text-[10px] text-gray-500 truncate mt-0.5">
              {selectedSpecs.length === 0 ? (
                <span className="truncate">
                  {locale === 'tr' ? 'Konum seçmek için tıklayın' : locale === 'en' ? 'Tap to select placements' : 'اضغط لاختيار موضع أو أكثر (الصدر، الظهر، الأكمام)'}
                </span>
              ) : (
                <span className="truncate text-amber-700 font-semibold">
                  {selectedSpecs.map((s) => (locale === 'tr' ? s.nameTr : locale === 'en' ? s.nameEn : s.nameAr)).join(' • ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Small Open Arrow */}
        <div className="p-1 rounded-xl bg-gray-100 text-gray-500 shrink-0">
          <ChevronUp size={15} />
        </div>
      </button>

      {/* 2. Professional Native-Feel Mobile Bottom Sheet & Desktop Modal (Rendered via React Portal) */}
      {isExpanded && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col justify-end sm:justify-center sm:items-center">
          {/* Dim Backdrop with blur */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsExpanded(false)}
          />

          {/* Bottom Sheet Card on Mobile / Centered Modal on Desktop */}
          <div
            className="relative w-full sm:max-w-[480px] bg-white rounded-t-[32px] sm:rounded-3xl max-h-[88vh] sm:max-h-[82vh] flex flex-col shadow-2xl z-10 overflow-hidden animate-in slide-in-from-bottom duration-300"
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            {/* Mobile Drag Indicator Handle */}
            <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 shrink-0">
                  <Shirt size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-black text-gray-900">
                      {locale === 'tr' ? 'Onaylı Termal Baskı Konumları' : locale === 'en' ? 'Approved DTF Print Placements' : 'دليل مواضع الطباعة الحرارية (DTF)'}
                    </h3>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      DTF
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {locale === 'tr' ? 'Bir veya birden fazla konum seçebilirsiniz' : locale === 'en' ? 'Select single or multiple positions per face' : 'يمكنك اختيار موضع واحد أو عدة مواضع لكل واجهة'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-all cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Color Scope & Unification Toggle Banner */}
            <div className="px-4 sm:px-5 py-2.5 bg-amber-50/70 border-b border-amber-200/70 flex items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-4 h-4 rounded-full border border-gray-400 block shadow-2xs shrink-0"
                  style={{ backgroundColor: selectedColor === 'navy' ? '#000080' : selectedColor }}
                  title={localizedColorName}
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-gray-900 truncate text-[11px]">
                    {syncPlacementsAcrossColors
                      ? (locale === 'tr' ? 'Tüm Renkler İçin Ortak' : locale === 'en' ? 'Unified for All Colors' : 'المواضع موحدة لكافة الألوان')
                      : (locale === 'tr' ? `Yalnızca Seçili Renk: ${localizedColorName}` : locale === 'en' ? `Only for Selected Color: ${localizedColorName}` : `مواضع خاصة باللون الحالي: ${localizedColorName}`)}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate">
                    {syncPlacementsAcrossColors
                      ? (locale === 'tr' ? 'Tüm renklerde aynı uygulanır' : locale === 'en' ? 'Applied to all colors' : 'أي موضع يتم اختياره يُطبّق على جميع ألوان التيشيرت')
                      : (locale === 'tr' ? 'Her rengin bağımsız konumu korunur' : locale === 'en' ? 'Each color has independent placements' : 'كل لون له مواضع طباعة مستقلة خاصة به')}
                  </span>
                </div>
              </div>

              {/* Toggle switch for Unifying / Independence */}
              <div className="flex items-center gap-1.5 shrink-0">
                {onToggleSyncPlacements && (
                  <button
                    type="button"
                    onClick={onToggleSyncPlacements}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                      syncPlacementsAcrossColors ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                    title={locale === 'tr' ? 'Renkler arası birleştir/ayır' : locale === 'en' ? 'Toggle unify across colors' : 'تبديل التوحيد / الاستقلالية لكل لون'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                        syncPlacementsAcrossColors
                          ? (locale === 'ar' ? '-translate-x-5' : 'translate-x-5')
                          : (locale === 'ar' ? '-translate-x-1' : 'translate-x-1')
                      }`}
                    />
                  </button>
                )}

                {/* Instant copy button when in independent mode */}
                {!syncPlacementsAcrossColors && onApplyToAllColors && selectedSpecs.length > 0 && (
                  <button
                    type="button"
                    onClick={onApplyToAllColors}
                    className="p-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    title={locale === 'tr' ? 'Bu rengin konumlarını diğer tüm renklere kopyala' : locale === 'en' ? 'Copy this color placements to all other colors' : 'نسخ مواضع هذا اللون لباقي الألوان'}
                  >
                    <Copy size={11} />
                    <span className="hidden sm:inline">{locale === 'tr' ? 'Kopyala' : locale === 'en' ? 'Copy' : 'نسخ للكل'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Face Filter Tabs */}
            <div className="px-4 sm:px-5 py-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-white text-gray-900 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span>{locale === 'tr' ? 'Tümü' : locale === 'en' ? 'All' : 'الكل'}</span>
                  {countsPerCategory.total > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono">
                      {countsPerCategory.total}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('front');
                    if (onSelectFace && activeFace !== 'front') onSelectFace('front');
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === 'front'
                      ? 'bg-white text-gray-900 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span>{locale === 'tr' ? 'Ön' : locale === 'en' ? 'Front' : 'الصدر (الأمام)'}</span>
                  {countsPerCategory.front > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono">
                      {countsPerCategory.front}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('back');
                    if (onSelectFace && activeFace !== 'back') onSelectFace('back');
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === 'back'
                      ? 'bg-white text-gray-900 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span>{locale === 'tr' ? 'Arka' : locale === 'en' ? 'Back' : 'الظهر (الخلف)'}</span>
                  {countsPerCategory.back > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono">
                      {countsPerCategory.back}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('sleeves');
                    if (onSelectFace && activeFace !== 'left' && activeFace !== 'right' && activeFace !== 'left_shoulder' && activeFace !== 'right_shoulder') {
                      onSelectFace('left');
                    }
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === 'sleeves'
                      ? 'bg-white text-gray-900 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span>{locale === 'tr' ? 'Kollar' : locale === 'en' ? 'Sleeves' : 'الأكمام'}</span>
                  {countsPerCategory.sleeves > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono">
                      {countsPerCategory.sleeves}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Scrollable Placements Cards Area */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-2.5">
              {filteredPlacements.map((placement) => {
                const isSelected = selectedPlacementIds.includes(placement.id);

                return (
                  <button
                    key={placement.id}
                    type="button"
                    onClick={() => {
                      onTogglePlacement(placement);
                      if (onSelectFace && !isFaceMatching(placement.targetFace, activeFace)) {
                        onSelectFace(placement.targetFace);
                      }
                    }}
                    className={`w-full p-3 rounded-2xl border transition-all flex items-center gap-3 text-right cursor-pointer select-none active:scale-[0.99] ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-400/25 shadow-xs'
                        : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Multi-Select Checkbox Box */}
                    <div className="shrink-0">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                          <Check size={13} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-lg border-2 border-gray-300 bg-white hover:border-amber-400" />
                      )}
                    </div>

                    {/* Miniature SVG Garment with Glowing Highlight */}
                    <GarmentMiniature
                      garmentType={normalizedType}
                      placement={placement}
                      isActive={isSelected}
                    />

                    {/* Placement Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="text-xs sm:text-sm font-black text-gray-900 truncate">
                          {locale === 'tr' ? placement.nameTr : locale === 'en' ? placement.nameEn : placement.nameAr}
                        </span>
                        <span className="text-[11px] font-mono font-black text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-md shrink-0" dir="ltr">
                          {placement.dimensions.recommended.widthCm}×{placement.dimensions.recommended.heightCm} cm
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-1 flex-wrap">
                        <span className="flex items-center gap-0.5 text-indigo-700 font-bold shrink-0">
                          <Ruler size={11} />
                          {locale === 'tr' ? `${placement.offsetFromCollarCm} cm yaka altı` : locale === 'en' ? `${placement.offsetFromCollarCm} cm below collar` : `نزولاً ${placement.offsetFromCollarCm} سم من الياقة`}
                        </span>
                        <span>•</span>
                        <span className="text-gray-400 font-medium">
                          {placement.targetFace === 'front'
                            ? (locale === 'tr' ? 'Ön Yüz' : locale === 'en' ? 'Front' : 'الواجهة الأمامية')
                            : placement.targetFace === 'back'
                              ? (locale === 'tr' ? 'Arka Yüz' : locale === 'en' ? 'Back' : 'الواجهة الخلفية')
                              : (locale === 'tr' ? 'Kol / Omuz' : locale === 'en' ? 'Sleeve' : 'الكتف / الكم')}
                        </span>
                      </div>

                      <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">
                        {locale === 'tr' ? placement.descriptionTr : locale === 'en' ? placement.descriptionEn : placement.descriptionAr}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sticky Bottom Actions Bar */}
            <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-700 font-bold truncate">
                  {selectedSpecs.length === 0
                    ? (locale === 'tr' ? 'Konum seçilmedi' : locale === 'en' ? 'No placement' : 'لم يتم اختيار مواضع')
                    : (locale === 'tr' ? `${selectedSpecs.length} konum seçildi` : locale === 'en' ? `${selectedSpecs.length} selected` : `تم اختيار (${selectedSpecs.length}) مواضع`)}
                </span>

                {selectedSpecs.length > 0 && onClearAll && (
                  <button
                    type="button"
                    onClick={onClearAll}
                    className="text-xs text-red-500 hover:text-red-700 underline font-semibold cursor-pointer shrink-0"
                  >
                    {locale === 'tr' ? 'Temizle' : locale === 'en' ? 'Clear' : 'إلغاء التحديد'}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="py-2 px-5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Check size={14} strokeWidth={3} />
                <span>{locale === 'tr' ? 'Konumları Onayla' : locale === 'en' ? 'Confirm Placements' : 'تأكيد المواضع'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
