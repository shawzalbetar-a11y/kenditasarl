"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  PlacementSpec,
  NormalizedProductType,
  PRINT_CONFIG,
  normalizeGarmentType,
  isFaceMatching,
} from '@/lib/printPlacementConfig';
import { resolveProductStudioProfile } from '@/lib/productStudioProfile';
import { Ruler, Check, Shirt, Coffee, Smartphone, ShoppingBag, X, ShieldAlert, CheckCircle2, Zap } from 'lucide-react';
import { getLocalizedColorName } from '@/lib/colorTranslations';

interface GarmentPlacementGuideProps {
  isOpen?: boolean;
  onClose?: () => void;
  garmentType?: string;
  allowedPlacements?: string[];
  activeFace: string;
  availableFaces?: string[];
  selectedColor?: string;
  selectedPlacementIds: string[];
  syncPlacementsAcrossColors?: boolean;
  onToggleSyncPlacements?: () => void;
  onTogglePlacement: (placement: PlacementSpec) => void;
  onSelectFace?: (face: string) => void;
  onClearAll?: () => void;
  locale?: string;
  className?: string;
  isFreeMode?: boolean;
  onToggleFreeMode?: (enabled: boolean) => void;
  allowFreeMode?: boolean;
  getPlacementPrice?: (spec: PlacementSpec) => number;
  printMethod?: string;
  allowPrintMethodChoice?: boolean;
  selectedPrintMethod?: 'DTF' | 'Sublimation';
  onSelectPrintMethod?: (method: 'DTF' | 'Sublimation') => void;
  isCurrentColorDark?: boolean;
}

/**
 * Clean SVG Mini Silhouette for T-Shirt and Hoodie with high-precision highlighted print areas
 */
function GarmentMiniature({
  garmentType,
  placement,
  isActive,
}: {
  garmentType: NormalizedProductType;
  placement: PlacementSpec;
  isActive: boolean;
}) {
  const isBack = placement.targetFace === 'back';
  const isHoodie = garmentType === 'hoodie';
  const isMug = garmentType === 'mug';
  const isHat = garmentType === 'hat';
  const isPhoneCase = garmentType === 'phone_case';
  const isGeneric = garmentType === 'generic';
  const box = placement.canvasBox;

  // Precise sleeve / side panel detection
  const isLeftSleeve = placement.id === 'left_sleeve' || placement.targetFace === 'left' || placement.targetFace === 'left_shoulder';
  const isRightSleeve = placement.id === 'right_sleeve' || placement.targetFace === 'right' || placement.targetFace === 'right_shoulder';
  const isSleeve = isLeftSleeve || isRightSleeve;

  return (
    <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center p-1 transition-all shrink-0 ${isActive
        ? 'bg-amber-500/15 border-2 border-amber-500 shadow-xs ring-2 ring-amber-400/30'
        : 'bg-slate-100 hover:bg-slate-200 border border-slate-300'
      }`}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full drop-shadow-2xs"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {isMug ? (
          /* Mug Silhouette with D-Handle & Panoramic / Side Zones */
          <g>
            <path
              d="M72 32 H82 C89 32 89 68 82 68 H72"
              className={isActive ? "stroke-slate-800" : "stroke-slate-400"}
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <rect
              x="16"
              y="22"
              width="56"
              height="60"
              rx="5"
              className={isActive ? "fill-slate-800 stroke-slate-900" : "fill-slate-300 stroke-slate-400"}
              strokeWidth="2"
            />
            <ellipse
              cx="44"
              cy="22"
              rx="28"
              ry="4.5"
              className={isActive ? "fill-slate-700 stroke-slate-900" : "fill-slate-200 stroke-slate-400"}
              strokeWidth="1.5"
            />
            {placement.isWrapAround ? (
              <rect
                x="20"
                y="32"
                width="48"
                height="40"
                rx="2"
                className={isActive ? "fill-amber-400/45 stroke-amber-400 animate-pulse" : "fill-blue-500/25 stroke-blue-500"}
                strokeWidth="1.6"
                strokeDasharray={isActive ? "none" : "2.5 2"}
              />
            ) : (
              <rect
                x={isBack ? "44" : "24"}
                y="33"
                width="26"
                height="38"
                rx="2"
                className={isActive ? "fill-amber-400/45 stroke-amber-400 animate-pulse" : "fill-blue-500/25 stroke-blue-500"}
                strokeWidth="1.6"
                strokeDasharray={isActive ? "none" : "2 2"}
              />
            )}
          </g>
        ) : isHat ? (
          /* Structured Cap Silhouette with Crown & Visor */
          <g>
            <path
              d="M22 60 C22 30 34 20 50 20 C66 20 78 30 78 60 Z"
              className={isActive ? "fill-slate-800 stroke-slate-900" : "fill-slate-300 stroke-slate-400"}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <line x1="50" y1="20" x2="50" y2="56" className="stroke-slate-500/50" strokeWidth="1.2" strokeDasharray="1.5 1.5" />
            <circle cx="50" cy="19" r="2.2" className="fill-slate-500" />
            {!isBack ? (
              <path
                d="M14 60 Q50 50 86 60 Q50 72 14 60 Z"
                className={isActive ? "fill-slate-700 stroke-slate-900" : "fill-slate-200 stroke-slate-400"}
                strokeWidth="1.8"
              />
            ) : (
              <path
                d="M36 60 A14 12 0 0 1 64 60 Z"
                className="fill-white/80 stroke-slate-400"
                strokeWidth="1.3"
              />
            )}
            {isRightSleeve ? (
              <rect x="25" y="37" width="14" height="14" rx="2" className={isActive ? "fill-amber-400 stroke-amber-300 animate-pulse" : "fill-blue-500/60 stroke-blue-600"} strokeWidth="1.5" />
            ) : isLeftSleeve ? (
              <rect x="61" y="37" width="14" height="14" rx="2" className={isActive ? "fill-amber-400 stroke-amber-300 animate-pulse" : "fill-blue-500/60 stroke-blue-600"} strokeWidth="1.5" />
            ) : isBack ? (
              <rect x="34" y="32" width="32" height="14" rx="2" className={isActive ? "fill-amber-400 stroke-amber-300 animate-pulse" : "fill-blue-500/40 stroke-blue-500"} strokeWidth="1.5" />
            ) : (
              <rect x="32" y="31" width="36" height="21" rx="2" className={isActive ? "fill-amber-400 stroke-amber-300 animate-pulse" : "fill-blue-500/40 stroke-blue-500"} strokeWidth="1.5" />
            )}
          </g>
        ) : isPhoneCase ? (
          /* Phone Case Silhouette with Top-Left Camera Cutout */
          <g>
            <rect
              x="27"
              y="10"
              width="46"
              height="80"
              rx="8"
              className={isActive ? "fill-slate-800 stroke-slate-900" : "fill-slate-300 stroke-slate-400"}
              strokeWidth="2"
            />
            {placement.id === 'phone_lower_badge' ? (
              <rect
                x="33"
                y="40"
                width="34"
                height="42"
                rx="3"
                className={isActive ? "fill-amber-400/45 stroke-amber-400 animate-pulse" : "fill-blue-500/25 stroke-blue-500"}
                strokeWidth="1.6"
              />
            ) : (
              <rect
                x="30"
                y="13"
                width="40"
                height="74"
                rx="6"
                className={isActive ? "fill-amber-400/35 stroke-amber-400 animate-pulse" : "fill-blue-500/20 stroke-blue-500"}
                strokeWidth="1.5"
                strokeDasharray={isActive ? "none" : "2 2"}
              />
            )}
            <rect x="32" y="15" width="16" height="18" rx="3.5" className="fill-white stroke-slate-500" strokeWidth="1.3" />
            <circle cx="37" cy="20" r="2.2" className="fill-slate-700" />
            <circle cx="37" cy="28" r="2.2" className="fill-slate-700" />
            <circle cx="43.5" cy="24" r="2" className="fill-slate-700" />
          </g>
        ) : isGeneric ? (
          /* Generic Product Tile */
          <g>
            <rect
              x="16"
              y="16"
              width="68"
              height="68"
              rx="8"
              className={isActive ? "fill-slate-800 stroke-slate-900" : "fill-slate-300 stroke-slate-400"}
              strokeWidth="2"
            />
            <rect
              x="28"
              y="28"
              width="44"
              height="44"
              rx="3"
              className={isActive ? "fill-amber-400/40 stroke-amber-400 animate-pulse" : "fill-blue-500/25 stroke-blue-500"}
              strokeWidth="1.6"
            />
          </g>
        ) : isHoodie ? (
          /* Hoodie Vector Path */
          <g>
            <path
              d="M30 25 L10 42 L18 52 L28 44 L28 88 L72 88 L72 44 L82 52 L90 42 L70 25 L62 18 C58 22 42 22 38 18 Z"
              className={isActive ? "fill-slate-800 stroke-slate-900" : "fill-slate-300 stroke-slate-400"}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Shoulder Seams */}
            <line x1="30" y1="25" x2="28" y2="44" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1.5 1.5" />
            <line x1="70" y1="25" x2="72" y2="44" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1.5 1.5" />

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

            {/* Sleeve specific highlights & boxes for Hoodie */}
            {isRightSleeve && (
              <g>
                <path d="M30 25 L10 42 L18 52 L28 44 Z" className={isActive ? "fill-amber-400/25" : "fill-blue-500/20"} />
                <line x1="12" y1="44" x2="17" y2="50" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1 1" />
                <rect
                  x="13"
                  y="34"
                  width="13"
                  height="13"
                  rx="1.5"
                  transform="rotate(-30 19.5 40.5)"
                  className={isActive ? "fill-amber-400 stroke-amber-500 animate-pulse" : "fill-blue-500/80 stroke-blue-600"}
                  strokeWidth="1.2"
                />
                <line
                  x1="30"
                  y1="25"
                  x2="22"
                  y2="35"
                  stroke={isActive ? "#F59E0B" : "#3B82F6"}
                  strokeWidth="1"
                  strokeDasharray="1.5 1.5"
                />
              </g>
            )}

            {isLeftSleeve && (
              <g>
                <path d="M70 25 L90 42 L82 52 L72 44 Z" className={isActive ? "fill-amber-400/25" : "fill-blue-500/20"} />
                <line x1="88" y1="44" x2="83" y2="50" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1 1" />
                <rect
                  x="74"
                  y="34"
                  width="13"
                  height="13"
                  rx="1.5"
                  transform="rotate(30 80.5 40.5)"
                  className={isActive ? "fill-amber-400 stroke-amber-500 animate-pulse" : "fill-blue-500/80 stroke-blue-600"}
                  strokeWidth="1.2"
                />
                <line
                  x1="70"
                  y1="25"
                  x2="78"
                  y2="35"
                  stroke={isActive ? "#F59E0B" : "#3B82F6"}
                  strokeWidth="1"
                  strokeDasharray="1.5 1.5"
                />
              </g>
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
            {/* Shoulder Seams */}
            <line x1="32" y1="20" x2="29" y2="38" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1.5 1.5" />
            <line x1="68" y1="20" x2="71" y2="38" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1.5 1.5" />

            <path
              d={isBack ? "M36 19 C42 23 58 23 64 19" : "M34 20 C42 28 58 28 66 20"}
              className="stroke-slate-500"
              strokeWidth="1.5"
              fill="none"
            />

            {/* Sleeve specific highlights & boxes for T-Shirt */}
            {isRightSleeve && (
              <g>
                <path d="M32 20 L12 36 L20 46 L29 38 Z" className={isActive ? "fill-amber-400/25" : "fill-blue-500/20"} />
                <line x1="14" y1="38" x2="20" y2="44" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1.5 1.5" />
                <rect
                  x="14"
                  y="28"
                  width="13"
                  height="13"
                  rx="1.5"
                  transform="rotate(-28 20.5 34.5)"
                  className={isActive ? "fill-amber-400 stroke-amber-500 animate-pulse" : "fill-blue-500/80 stroke-blue-600"}
                  strokeWidth="1.2"
                />
                <line
                  x1="32"
                  y1="20"
                  x2="23"
                  y2="29"
                  stroke={isActive ? "#F59E0B" : "#3B82F6"}
                  strokeWidth="1"
                  strokeDasharray="1.5 1.5"
                />
              </g>
            )}

            {isLeftSleeve && (
              <g>
                <path d="M68 20 L88 36 L80 46 L71 38 Z" className={isActive ? "fill-amber-400/25" : "fill-blue-500/20"} />
                <line x1="86" y1="38" x2="80" y2="44" className="stroke-slate-400" strokeWidth="1" strokeDasharray="1.5 1.5" />
                <rect
                  x="73"
                  y="28"
                  width="13"
                  height="13"
                  rx="1.5"
                  transform="rotate(28 79.5 34.5)"
                  className={isActive ? "fill-amber-400 stroke-amber-500 animate-pulse" : "fill-blue-500/80 stroke-blue-600"}
                  strokeWidth="1.2"
                />
                <line
                  x1="68"
                  y1="20"
                  x2="77"
                  y2="29"
                  stroke={isActive ? "#F59E0B" : "#3B82F6"}
                  strokeWidth="1"
                  strokeDasharray="1.5 1.5"
                />
              </g>
            )}
          </g>
        )}

        {/* Highlighted Official Print Area Box for Front/Back Apparel (Non-sleeve) Placements */}
        {!isSleeve && !isMug && !isHat && !isPhoneCase && !isGeneric && (
          <>
            <rect
              x={box.leftPercent}
              y={box.topPercent}
              width={box.maxWidthPercent}
              height={box.maxHeightPercent}
              rx="1.5"
              className={isActive ? "fill-amber-400/35 stroke-amber-500 animate-pulse" : "fill-blue-500/20 stroke-blue-500/80"}
              strokeWidth="1.5"
              strokeDasharray={isActive ? "none" : "2 2"}
            />
            {isActive && (
              <circle
                cx={box.leftPercent + box.maxWidthPercent / 2}
                cy={box.topPercent + box.maxHeightPercent / 2}
                r="3"
                className="fill-amber-500 animate-ping"
              />
            )}
          </>
        )}
      </svg>
    </div>
  );
}

export default function GarmentPlacementGuide({
  isOpen = true,
  onClose,
  garmentType = 'tshirt',
  allowedPlacements,
  activeFace,
  availableFaces = [],
  selectedColor = 'black',
  selectedPlacementIds = [],
  syncPlacementsAcrossColors = false,
  onToggleSyncPlacements,
  onTogglePlacement,
  onSelectFace,
  onClearAll,
  locale = 'ar',
  className = '',
  isFreeMode = false,
  onToggleFreeMode,
  allowFreeMode = true,
  getPlacementPrice,
  printMethod = 'DTF',
  allowPrintMethodChoice = false,
  selectedPrintMethod = 'DTF',
  onSelectPrintMethod,
  isCurrentColorDark = false,
}: GarmentPlacementGuideProps) {
  const isSublimationActive = /sublim|süblim|سبلم|تسام/i.test(printMethod || '');
  const [activeTab, setActiveTab] = useState<'all' | 'front' | 'back' | 'sleeves'>('all');

  const normalizedType = normalizeGarmentType(garmentType);
  const garmentConfig = PRINT_CONFIG[normalizedType] || PRINT_CONFIG.tshirt;
  const productProfile = useMemo(
    () => resolveProductStudioProfile({ category: normalizedType, config: { garmentType: normalizedType } }),
    [normalizedType]
  );
  const ProductIcon =
    productProfile.family === 'mug'
      ? Coffee
      : productProfile.family === 'phone_case'
        ? Smartphone
        : productProfile.family === 'hat'
          ? ShoppingBag
          : Shirt;
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

  if (!isOpen || allPlacementsList.length === 0) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none ${className}`}>
      {/* Dim Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Centered Modal Card (Bottom sheet on mobile, centered modal on desktop) */}
      <div
        className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl h-[82dvh] max-h-[82dvh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl z-10 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 border border-gray-100"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 px-5 sm:px-6 py-4 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-orange-500/25 shrink-0">
              <ProductIcon size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-gray-900 font-heading">
                  {locale === 'tr' ? `${printMethod || 'DTF'} Baskı ve Yerleşim Rehberi` : locale === 'en' ? 'Print & Placement Guide' : 'دليل مواضع الطباعة والتصميم'}
                </h3>
                <span
                  dir="ltr"
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 transition-colors ${isSublimationActive
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    }`}
                >
                  {printMethod || 'DTF'} 300DPI
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {productProfile.getPlacementGuideSubtitle(locale)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-all cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Switcher: Approved Standards vs Free Mode */}
        {allowFreeMode && (
          <div className="px-5 sm:px-6 py-3 bg-slate-50 border-b border-gray-200/80 flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isFreeMode && onToggleFreeMode) {
                  onToggleFreeMode(false);
                }
              }}
              className={`flex-1 py-2.5 px-3 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98 ${!isFreeMode
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                }`}
            >
              <ProductIcon size={16} className={!isFreeMode ? 'text-white' : 'text-gray-500'} />
              <span>{locale === 'tr' ? 'Onaylı Baskı Alanları' : locale === 'en' ? 'Approved Standards' : 'المواضع المعتمدة عالمياً'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isFreeMode && onToggleFreeMode) {
                  onToggleFreeMode(true);
                }
              }}
              className={`flex-1 py-2.5 px-3 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98 ${isFreeMode
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/25 ring-2 ring-amber-400/40'
                  : 'bg-white hover:bg-amber-50/80 text-amber-800 border border-amber-200'
                }`}
            >
              <Zap size={16} className={isFreeMode ? 'text-white fill-white' : 'text-amber-500'} />
              <span>{locale === 'tr' ? 'Serbest Mod ⚡' : locale === 'en' ? 'Free Mode ⚡' : 'الوضع الحر ⚡'}</span>
            </button>
          </div>
        )}

        {/* Print Method Switcher Bar (When product supports Customer Choice) */}
        {allowPrintMethodChoice && onSelectPrintMethod && (
          <div className="px-5 sm:px-6 py-2 bg-white border-b border-gray-100 flex items-center justify-between gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold text-gray-700">
                {locale === 'tr' ? 'Baskı Yöntemi:' : locale === 'en' ? 'Print Method:' : 'نوع الطباعة:'}
              </span>
              {isCurrentColorDark && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  {locale === 'tr' ? 'Koyu renk: DTF' : locale === 'en' ? 'Dark: DTF only' : 'داكن: DTF فقط'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onSelectPrintMethod('DTF')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${selectedPrintMethod !== 'Sublimation'
                    ? 'bg-orange-50 border-orange-400 text-orange-900 shadow-2xs ring-1 ring-orange-200'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <span>🔥</span>
                <span>DTF</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectPrintMethod('Sublimation')}
                disabled={isCurrentColorDark}
                title={
                  isCurrentColorDark
                    ? (locale === 'tr' ? 'Koyu kumaşlarda süblimasyon yapılamaz' : locale === 'en' ? 'Sublimation requires light fabrics' : 'السبليميشن يتطلب ألواناً فاتحة')
                    : undefined
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 ${isCurrentColorDark
                    ? 'bg-gray-100 border-dashed border-gray-300 text-gray-400 opacity-60 cursor-not-allowed'
                    : selectedPrintMethod === 'Sublimation'
                      ? 'bg-sky-50 border-sky-400 text-sky-900 shadow-2xs ring-1 ring-sky-200 cursor-pointer'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer'
                  }`}
              >
                <span>☕</span>
                <span>{locale === 'tr' ? 'Süblimasyon' : locale === 'en' ? 'Sublimation' : 'سبليميشن'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Content */}
        {isFreeMode ? (
          <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto min-h-0 flex-1">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50/40 to-amber-50 border border-amber-200 flex flex-col gap-3.5 shadow-xs">
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shrink-0 shadow-md">
                  <Zap size={24} className="fill-white" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black text-amber-950 font-heading">
                    {locale === 'tr' ? 'Serbest Yerleşim Modu Aktif' : locale === 'en' ? 'Free Placement Mode Active' : 'الوضع الحر مفعّل حالياً'}
                  </h4>
                  <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                    {locale === 'tr'
                      ? 'Tüm yüzey baskı alanına açıldı. Tasarımınızı dilediğiniz gibi büyütebilir, döndürebilir ve taşıyabilirsiniz.'
                      : locale === 'en'
                        ? 'Full garment face boundary is unlocked. You can freely resize, rotate, and move your designs anywhere across the piece.'
                        : 'تم فتح كامل حدود الواجهة لتصميمك. يمكنك تحريك، تدوير، وتكبير عناصرك بحرية تامة في أي مكان على القطعة.'}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/95 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
                <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold block text-xs">
                    {locale === 'tr' ? 'Sorumluluk Reddi Onaylandı:' : locale === 'en' ? 'Disclaimer Acknowledged:' : 'إخلاء المسؤولية معتمد:'}
                  </strong>
                  <span className="text-gray-600 text-[11px] leading-relaxed block mt-0.5">
                    {locale === 'tr'
                      ? 'Standart dışı yerleşimlerin sorumluluğu size aittir. Mağaza ve atölye ideal görünmeme konusunda sorumluluk taşımaz.'
                      : locale === 'en'
                        ? 'Full responsibility for non-standard placement lies with you. Store and workshop are disclaimed from non-ideal placement outcomes.'
                        : 'المتجر والمطبعة يخليان مسؤوليتهما تماماً عن عدم ظهور التصميم بالمكان المعتاد عند الخروج عن المقاييس الفنية العالمية.'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-black text-xs sm:text-sm shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
              >
                <CheckCircle2 size={16} />
                <span>{locale === 'tr' ? 'Serbest Mod ile Devam Et' : locale === 'en' ? 'Continue in Free Mode' : 'متابعة التصميم بالوضع الحر'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onToggleFreeMode) onToggleFreeMode(false);
                }}
                className="py-3 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-gray-300"
              >
                <ProductIcon size={15} />
                <span>
                  {locale === 'tr' ? 'Onaylı Baskı Alanlarına Geri Dön' : locale === 'en' ? 'Return to Approved Standards' : 'الرجوع للمواضع القياسية المعتمدة'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Color Scope & Unification Toggle Banner */}
            <div className="px-5 sm:px-6 py-2.5 bg-amber-50/70 border-b border-amber-200/70 flex items-center justify-between gap-2 text-xs shrink-0">
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
                      : (locale === 'tr' ? 'Her rengin bağımsız baskı alanı korunur' : locale === 'en' ? 'Each color has independent placements' : 'كل لون له مواضع طباعة مستقلة خاصة به')}
                  </span>
                </div>
              </div>

              {/* Toggle switch for Unifying / Independence */}
              <div className="flex items-center gap-1.5 shrink-0">
                {onToggleSyncPlacements && (
                  <button
                    type="button"
                    onClick={onToggleSyncPlacements}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${syncPlacementsAcrossColors ? 'bg-amber-500' : 'bg-gray-300'
                      }`}
                    title={locale === 'tr' ? 'Renkler arası birleştir/ayır' : locale === 'en' ? 'Toggle unify across colors' : 'تبديل التوحيد / الاستقلالية لكل لون'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${syncPlacementsAcrossColors
                          ? (locale === 'ar' ? '-translate-x-5' : 'translate-x-5')
                          : (locale === 'ar' ? '-translate-x-1' : 'translate-x-1')
                        }`}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-gray-100 bg-white shrink-0">
              <div className="flex items-center bg-gray-100 p-1 rounded-2xl gap-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${activeTab === 'all'
                      ? 'bg-white text-gray-900 shadow-2xs font-black'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <span>{locale === 'tr' ? 'Tümü' : locale === 'en' ? 'All' : 'جميع المواضع'}</span>
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
                    if (onSelectFace && !isFaceMatching(activeFace, 'front')) {
                      onSelectFace('front');
                    }
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${activeTab === 'front'
                      ? 'bg-white text-gray-900 shadow-2xs font-black'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <span>
                    {productProfile.family === 'mug'
                      ? (locale === 'tr' ? 'Ön / 360°' : locale === 'en' ? 'Front / 360°' : 'الأمام / 360°')
                      : productProfile.family === 'phone_case'
                        ? (locale === 'tr' ? 'Arka Yüzey' : locale === 'en' ? 'Case Back' : 'ظهر الغلاف')
                        : (locale === 'tr' ? 'Ön Yüz' : locale === 'en' ? 'Front' : 'الواجهة الأمامية')}
                  </span>
                  {countsPerCategory.front > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono">
                      {countsPerCategory.front}
                    </span>
                  )}
                </button>

                {productProfile.family !== 'phone_case' && productProfile.family !== 'generic' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('back');
                      if (onSelectFace && !isFaceMatching(activeFace, 'back')) {
                        onSelectFace('back');
                      }
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${activeTab === 'back'
                        ? 'bg-white text-gray-900 shadow-2xs font-black'
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <span>
                      {productProfile.family === 'mug'
                        ? (locale === 'tr' ? 'Karşı Yüz' : locale === 'en' ? 'Opposite' : 'الجهة المقابلة')
                        : (locale === 'tr' ? 'Arka Yüz' : locale === 'en' ? 'Back' : 'الجهة الخلفية')}
                    </span>
                    {countsPerCategory.back > 0 && (
                      <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono">
                        {countsPerCategory.back}
                      </span>
                    )}
                  </button>
                )}

                {(productProfile.hasSleeves || productProfile.family === 'hat') && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('sleeves');
                      if (onSelectFace && availableFaces && availableFaces.length > 0) {
                        const preferredTarget = activeFace.includes('shoulder') || activeFace.includes('sleeve') ? activeFace : 'right_shoulder';
                        const availableSleeveFace = availableFaces.find(
                          (af) =>
                            isFaceMatching(af, preferredTarget) ||
                            isFaceMatching(af, 'right') ||
                            isFaceMatching(af, 'left')
                        );
                        onSelectFace(availableSleeveFace || preferredTarget || 'right_shoulder');
                      }
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${activeTab === 'sleeves'
                        ? 'bg-white text-gray-900 shadow-2xs font-black'
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <span>
                      {productProfile.family === 'hat'
                        ? (locale === 'tr' ? 'Yanlar' : locale === 'en' ? 'Sides' : 'الجانبين')
                        : (locale === 'tr' ? 'Kollar' : locale === 'en' ? 'Sleeves' : 'الأكمام')}
                    </span>
                    {countsPerCategory.sleeves > 0 && (
                      <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono">
                        {countsPerCategory.sleeves}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Placements Cards Area */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 space-y-3">
              {filteredPlacements.map((placement) => {
                const isSelected = selectedPlacementIds.includes(placement.id);

                return (
                  <button
                    key={placement.id}
                    type="button"
                    onClick={() => {
                      onTogglePlacement(placement);
                      if (onSelectFace) {
                        let targetFace = placement.targetFace;
                        if (availableFaces && availableFaces.length > 0) {
                          const matched = availableFaces.find(af => isFaceMatching(af, targetFace));
                          if (matched) {
                            targetFace = matched as any;
                          } else if (isFaceMatching(targetFace, 'right') || isFaceMatching(targetFace, 'left')) {
                            const anySleeve = availableFaces.find(af => isFaceMatching(af, 'right') || isFaceMatching(af, 'left'));
                            if (anySleeve) targetFace = anySleeve as any;
                          }
                        }
                        if (!isFaceMatching(targetFace, activeFace)) {
                          onSelectFace(targetFace);
                        }
                      }
                    }}
                    className={`w-full p-3.5 rounded-2xl border transition-all flex items-center gap-3.5 text-right cursor-pointer select-none active:scale-[0.99] ${isSelected
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          {getPlacementPrice && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${getPlacementPrice(placement) === 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                              }`}>
                              {getPlacementPrice(placement) === 0
                                ? (locale === 'tr' ? 'Dahil' : locale === 'en' ? 'Included' : 'مشمول')
                                : `+${getPlacementPrice(placement)} ₺`}
                            </span>
                          )}
                          <span className="text-[11px] font-mono font-black text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-md" dir="ltr">
                            {placement.dimensions.recommended.widthCm}×{placement.dimensions.recommended.heightCm} cm
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-1 flex-wrap">
                        {placement.offsetFromCollarCm > 0 && productProfile.hasCollarOffset && (
                          <>
                            <span className="flex items-center gap-0.5 text-indigo-700 font-bold shrink-0">
                              <Ruler size={11} />
                              {locale === 'tr' ? `${placement.offsetFromCollarCm} cm yaka altı` : locale === 'en' ? `${placement.offsetFromCollarCm} cm below collar` : `نزولاً ${placement.offsetFromCollarCm} سم من الياقة`}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        {placement.isWrapAround && (
                          <>
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[9.5px] shrink-0">
                              {locale === 'tr' ? '360° Tam Çevre' : locale === 'en' ? '360° Wrap' : 'دوران كامل 360°'}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span className="text-gray-500 font-medium">
                          {placement.targetFace === 'front'
                            ? (productProfile.family === 'mug'
                              ? (locale === 'tr' ? 'Ön / Çevre' : locale === 'en' ? 'Front / Wrap' : 'الأمام / البانوراما')
                              : productProfile.family === 'phone_case'
                                ? (locale === 'tr' ? 'Arka Yüzey' : locale === 'en' ? 'Case Back' : 'ظهر الغلاف')
                                : (locale === 'tr' ? 'Ön Yüz' : locale === 'en' ? 'Front' : 'الواجهة الأمامية'))
                            : placement.targetFace === 'back'
                              ? (productProfile.family === 'mug'
                                ? (locale === 'tr' ? 'Karşı Yüz' : locale === 'en' ? 'Opposite Side' : 'الجهة المقابلة')
                                : (locale === 'tr' ? 'Arka Yüz' : locale === 'en' ? 'Back' : 'الجهة الخلفية'))
                              : productProfile.family === 'hat'
                                ? (locale === 'tr' ? 'Yan Panel' : locale === 'en' ? 'Side Panel' : 'اللوح الجانبي')
                                : (locale === 'tr' ? 'Kollar' : locale === 'en' ? 'Sleeve' : 'الكتف / الكم')}
                        </span>
                      </div>

                      <p className="text-[10.5px] text-gray-400 mt-1 line-clamp-1">
                        {locale === 'tr' ? placement.descriptionTr : locale === 'en' ? placement.descriptionEn : placement.descriptionAr}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sticky Bottom Actions Bar */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs sm:text-sm text-gray-800 font-bold truncate">
                  {selectedSpecs.length === 0
                    ? (locale === 'tr' ? 'Baskı alanı seçilmedi' : locale === 'en' ? 'No placement' : 'لم يتم اختيار مواضع')
                    : (locale === 'tr' ? `${selectedSpecs.length} alan seçildi` : locale === 'en' ? `${selectedSpecs.length} selected` : `تم اختيار (${selectedSpecs.length}) مواضع`)}
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
                onClick={onClose}
                className="py-2.5 px-6 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-black shadow-md transition-all cursor-pointer flex items-center gap-2 shrink-0"
              >
                <Check size={16} strokeWidth={3} />
                <span>{locale === 'tr' ? 'Baskı Alanlarını Onayla' : locale === 'en' ? 'Confirm Placements' : 'تأكيد المواضع'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
