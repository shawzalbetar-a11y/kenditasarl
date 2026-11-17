"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Copy,
  Rotate3d,
  Sparkles,
  Coffee,
  Layers,
  Maximize,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { MugMeta } from '@/lib/productStudioProfile';

export type MugPrintMode = 'mug_full_wrap' | 'mug_front' | 'mug_two_sided';
export type MugPanoramaZone = 'left' | 'center' | 'right';

interface MugStudioControlsBarProps {
  allowedPlacements?: string[];
  activeMode: MugPrintMode;
  activeFace: string;
  mugMeta: MugMeta;
  onSelectMode: (mode: MugPrintMode) => void;
  onDuplicateToOpposite: () => void;
  onOpen3DPreview: () => void;
  showLive3DPanel?: boolean;
  onToggleLive3DPanel?: () => void;
  centerSlot?: React.ReactNode;
}

export function MugStudioControlsBar({
  allowedPlacements,
  activeMode,
  activeFace,
  mugMeta,
  onSelectMode,
  onDuplicateToOpposite,
  onOpen3DPreview,
  showLive3DPanel = true,
  onToggleLive3DPanel,
  centerSlot,
}: MugStudioControlsBarProps) {
  const t = useTranslations('MugStudio');

  const isMagic = mugMeta.mugStyle === 'magic';
  const isInnerColor = mugMeta.mugStyle === 'inner_color';

  return (
    <div className="w-full bg-white/95 backdrop-blur-md border-b border-gray-200 px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar z-20 shrink-0">
      {/* Left group: Mug Type Badge + 3 Print Modes */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span
          className={`${centerSlot ? 'hidden 2xl:inline-flex' : 'hidden md:inline-flex'} items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border shrink-0 ${isMagic
              ? 'bg-purple-50 text-purple-800 border-purple-200'
              : isInnerColor
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
        >
          {isMagic ? <Sparkles className="w-3.5 h-3.5 text-purple-600" /> : <Coffee className="w-3.5 h-3.5" />}
          <span>
            {isMagic ? t('badgeMagic') : isInnerColor ? t('badgeInnerColor') : t('badgeStandard')}
          </span>
        </span>

        {/* Mode Segmented Buttons */}
        <div
          role="group"
          className="inline-flex items-center bg-gray-100/90 p-0.5 rounded-xl border border-gray-200/80 gap-0.5 shrink-0"
        >
          {mugMeta.supportsFullWrap && (
            <button
              type="button"
              hidden={!!allowedPlacements && !['mug_full_wrap'].every(id=>allowedPlacements.includes(id))}
            aria-pressed={activeMode === 'mug_full_wrap'}
              onClick={() => onSelectMode('mug_full_wrap')}
              className={`min-h-[34px] sm:min-h-[36px] px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-extrabold transition-all whitespace-nowrap cursor-pointer ${activeMode === 'mug_full_wrap'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-gray-700 hover:bg-white/80'
                }`}
            >
              {t('modeFullWrap')}
            </button>
          )}
          <button
            type="button"
            hidden={!!allowedPlacements && !['mug_front'].every(id=>allowedPlacements.includes(id))}
            aria-pressed={activeMode === 'mug_front'}
            onClick={() => onSelectMode('mug_front')}
            className={`min-h-[34px] sm:min-h-[36px] px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-extrabold transition-all whitespace-nowrap cursor-pointer ${activeMode === 'mug_front'
                ? 'bg-gray-900 text-white shadow-xs'
                : activeMode === 'mug_full_wrap'
                  ? 'opacity-45 bg-gray-200/60 text-gray-500 hover:opacity-80 hover:bg-white/80 hover:text-gray-800'
                  : 'text-gray-700 hover:bg-white/80'
              }`}
          >
            {t('modeSingleFront')}
          </button>
          <button
            type="button"
            hidden={!!allowedPlacements && !['mug_front', 'mug_back'].every(id=>allowedPlacements.includes(id))}
            aria-pressed={activeMode === 'mug_two_sided'}
            onClick={() => onSelectMode('mug_two_sided')}
            className={`min-h-[34px] sm:min-h-[36px] px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-extrabold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1 ${activeMode === 'mug_two_sided'
                ? 'bg-blue-600 text-white shadow-xs'
                : activeMode === 'mug_full_wrap'
                  ? 'opacity-45 bg-gray-200/60 text-gray-500 hover:opacity-80 hover:bg-white/80 hover:text-gray-800'
                  : 'text-gray-700 hover:bg-white/80'
              }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span>{t('modeTwoSided')}</span>
          </button>
        </div>
      </div>

      {/* Optional Docked Center Slot (Desktop Transform Controls Bar) */}
      {centerSlot && (
        <div className="hidden lg:flex flex-1 min-w-0 items-center justify-center px-1 overflow-x-auto no-scrollbar">
          {centerSlot}
        </div>
      )}

      {/* Right group: Mirror/Duplicate Opposite + Live 3D Toggle + Full 3D Modal */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {activeMode === 'mug_two_sided' && (
          <button
            type="button"
            onClick={onDuplicateToOpposite}
            title={t('duplicateToOpposite')}
            className="min-h-[34px] sm:min-h-[36px] px-2 sm:px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] sm:text-xs font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0"
          >
            <Copy className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t('duplicateToOpposite')} ({activeFace === 'back' ? '→' : '←'})
            </span>
          </button>
        )}

        {activeMode === 'mug_full_wrap' && onToggleLive3DPanel && (
          <button
            type="button"
            onClick={onToggleLive3DPanel}
            aria-pressed={showLive3DPanel}
            className={`inline-flex min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-bold border items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${showLive3DPanel
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
          >
            {showLive3DPanel ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showLive3DPanel ? t('hideLive3d') : t('showLive3d')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpen3DPreview}
          className={`min-h-[34px] sm:min-h-[36px] px-2.5 sm:px-3.5 py-1 rounded-xl text-[11px] sm:text-xs font-black inline-flex items-center gap-1.5 transition-all whitespace-nowrap shadow-xs cursor-pointer shrink-0 ${isMagic
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
            }`}
        >
          <Rotate3d className="w-4 h-4 shrink-0" />
          <span>{isMagic ? t('preview3dMagicBtn') : t('preview3dBtn')}</span>
        </button>
      </div>
    </div>
  );
}

interface MugPanoramicQuickBarProps {
  hasActiveObject: boolean;
  mobileView: '2d' | '3d';
  onChangeMobileView: (view: '2d' | '3d') => void;
  onFillPanorama: () => void;
  onSnapToZone: (zone: MugPanoramaZone) => void;
}

/**
 * Compact quick-actions strip for 360° Mug Panorama:
 * - Mobile 2D Canvas <-> 3D Wrap switcher
 * - Instant Full-Wrap Fill & Left / Center / Right placement alignment buttons
 */
export function MugPanoramicQuickBar({
  hasActiveObject,
  mobileView,
  onChangeMobileView,
  onFillPanorama,
  onSnapToZone,
}: MugPanoramicQuickBarProps) {
  const t = useTranslations('MugStudio');

  const zoneActions: Array<{
    zone: MugPanoramaZone;
    label: string;
    icon: React.ReactNode;
  }> = [
      {
        zone: 'left',
        label: t('actionSnapLeft'),
        icon: <AlignHorizontalJustifyStart className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
      },
      {
        zone: 'center',
        label: t('actionSnapCenter'),
        icon: <AlignHorizontalJustifyCenter className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
      },
      {
        zone: 'right',
        label: t('actionSnapRight'),
        icon: <AlignHorizontalJustifyEnd className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
      },
    ];

  return (
    <div className="w-full max-w-[820px] flex flex-wrap items-center justify-between gap-1.5 px-1.5 py-1 z-25 shrink-0 lg:w-auto lg:max-w-none lg:absolute lg:end-3 xl:end-4 lg:top-[54%] lg:-translate-y-1/2 lg:flex-col lg:items-stretch lg:bg-white/95 lg:backdrop-blur-md lg:border lg:border-slate-200/90 lg:rounded-2xl lg:p-2 lg:shadow-lg lg:gap-1.5">
      {/* Mobile-only 2D Canvas <-> Live 3D Mug Switcher */}
      <div className="lg:hidden inline-flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs gap-0.5">
        <button
          type="button"
          onClick={() => onChangeMobileView('2d')}
          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition cursor-pointer ${mobileView === '2d' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'
            }`}
        >
          {t('tabEditSheet')}
        </button>
        <button
          type="button"
          onClick={() => onChangeMobileView('3d')}
          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-extrabold whitespace-nowrap inline-flex items-center gap-1 transition cursor-pointer ${mobileView === '3d' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600'
            }`}
        >
          <Rotate3d className="w-3.5 h-3.5" />
          <span>{t('tabLive3D')}</span>
        </button>
      </div>

      {/* Panoramic Quick Placement Presets (Horizontal on Mobile, Vertical Side Dock on Desktop Left) */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar ms-auto lg:ms-0 lg:flex-col lg:items-stretch lg:gap-1.5 lg:overflow-visible lg:min-w-[128px]">
        <button
          type="button"
          disabled={!hasActiveObject}
          onClick={onFillPanorama}
          className={`min-h-[32px] lg:min-h-[40px] px-2.5 py-1 lg:px-3 lg:py-2 rounded-lg lg:rounded-xl text-[10.5px] sm:text-[11px] font-extrabold border inline-flex items-center justify-center lg:justify-start gap-1.5 whitespace-nowrap transition ${hasActiveObject
              ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 cursor-pointer active:scale-95 shadow-2xs'
              : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-65'
            }`}
        >
          <Maximize className="w-3.5 h-3.5 shrink-0" />
          <span>{t('actionFillPanorama')}</span>
        </button>

        <div className="hidden lg:block h-px bg-slate-200/80 my-0.5" />

        {zoneActions.map((item) => (
          <button
            key={item.zone}
            type="button"
            onClick={() => onSnapToZone(item.zone)}
            className="min-h-[32px] lg:min-h-[38px] px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg lg:rounded-xl text-[10.5px] sm:text-[11px] font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 inline-flex items-center justify-center lg:justify-start gap-1.5 whitespace-nowrap transition cursor-pointer active:scale-95 shadow-2xs"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface MugPanoramicSheetBackdropProps {
  mugMeta: MugMeta;
  selectedColorHex?: string;
}

/**
 * Photorealistic ceramic unwrapped sheet backdrop + outer handle margin visuals
 * displayed directly behind the 23x9.5 cm transparent Fabric canvas in 360° wrap mode.
 */
export function MugPanoramicSheetBackdrop({
  mugMeta,
  selectedColorHex = '#ffffff',
}: MugPanoramicSheetBackdropProps) {
  const isInnerColor = mugMeta.mugStyle === 'inner_color';
  const accentHex = isInnerColor && selectedColorHex ? selectedColorHex : '#e2e8f0';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-xl shadow-lg border-2 border-slate-300/90 overflow-visible"
      style={{
        background:
          'linear-gradient(90deg, #e5e7eb 0%, #f8fafc 10%, #ffffff 34%, #ffffff 66%, #f8fafc 90%, #e5e7eb 100%)',
      }}
    >
      {/* Top & Bottom Colored Ceramic Rim Accent */}
      {isInnerColor && (
        <>
          <div
            className="absolute inset-x-0 -top-1.5 h-1.5 rounded-t-lg opacity-90 shadow-xs"
            style={{ backgroundColor: accentHex }}
          />
          <div
            className="absolute inset-x-0 -bottom-1 h-1 rounded-b-lg opacity-75"
            style={{ backgroundColor: accentHex }}
          />
        </>
      )}

      {/* Outer Left & Right Visual Handle Ears so users feel where the wrap ends meet the handle */}
      <div
        className="hidden sm:block absolute -left-5 top-[22%] bottom-[22%] w-5 rounded-l-full border-4 border-r-0 opacity-85 shadow-xs"
        style={{
          borderColor: isInnerColor ? accentHex : '#cbd5e1',
          backgroundColor: 'transparent',
        }}
      />
      <div
        className="hidden sm:block absolute -right-5 top-[22%] bottom-[22%] w-5 rounded-r-full border-4 border-l-0 opacity-85 shadow-xs"
        style={{
          borderColor: isInnerColor ? accentHex : '#cbd5e1',
          backgroundColor: 'transparent',
        }}
      />
    </div>
  );
}

interface MugPanoramicGuidesOverlayProps {
  canvasBox: {
    leftPercent: number;
    topPercent: number;
    maxWidthPercent: number;
    maxHeightPercent: number;
  };
  handleMarginCm?: number;
  visible: boolean;
}

/**
 * Non-exportable DOM guide overlay displayed ONLY when 360° Panoramic Full-Wrap is active.
 * Renders Left / Front Center / Right dashed columns and <=1cm handle trim guides.
 */
export function MugPanoramicGuidesOverlay({
  canvasBox,
  handleMarginCm = 1.0,
  visible,
}: MugPanoramicGuidesOverlayProps) {
  const t = useTranslations('MugStudio');

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute z-[9]"
      style={{
        left: `${canvasBox.leftPercent}%`,
        top: `${canvasBox.topPercent}%`,
        width: `${canvasBox.maxWidthPercent}%`,
        height: `${canvasBox.maxHeightPercent}%`,
      }}
    >
      {/* Slim outer handle-clearance trim indicator (~2% border, keeping total handle gap <= 1 cm) */}
      <div
        className="absolute inset-y-0 left-0 border-r border-dashed border-amber-400/75 bg-amber-400/8 flex flex-col justify-between items-start py-1.5 pl-0.5"
        style={{ width: '2%' }}
      >
        <span className="text-[7px] sm:text-[8px] font-mono font-bold text-amber-900 bg-amber-200/90 px-1 rounded leading-tight shadow-2xs whitespace-nowrap">
          ≤{handleMarginCm}cm
        </span>
      </div>
      <div
        className="absolute inset-y-0 right-0 border-l border-dashed border-amber-400/75 bg-amber-400/8 flex flex-col justify-between items-end py-1.5 pr-0.5"
        style={{ width: '2%' }}
      >
        <span className="text-[7px] sm:text-[8px] font-mono font-bold text-amber-900 bg-amber-200/90 px-1 rounded leading-tight shadow-2xs whitespace-nowrap">
          ≤{handleMarginCm}cm
        </span>
      </div>

      {/* 3-Zone Panoramic Vertical Dividers (Left 35% | Center 30% | Right 35%) */}
      <div
        className="absolute inset-y-0 border-l border-dashed border-sky-500/55"
        style={{ left: '35%' }}
      />
      <div
        className="absolute inset-y-0 border-l border-dashed border-sky-500/55"
        style={{ left: '65%' }}
      />

      {/* Clean Readable Footer Zone Labels Placed Outside Below the Bottom Edge */}
      <div className="absolute -bottom-6 inset-x-0 grid grid-cols-3 text-center gap-1 px-1">
        <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 bg-white/95 rounded-md px-1.5 py-0.5 truncate border border-slate-200 shadow-2xs">
          {t('zoneLeft')}
        </span>
        <span className="text-[9px] sm:text-[10px] font-extrabold text-amber-800 bg-amber-50 rounded-md px-1.5 py-0.5 truncate border border-amber-300 shadow-2xs">
          {t('zoneCenter')} • {t('panoramaOppositeHint')}
        </span>
        <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 bg-white/95 rounded-md px-1.5 py-0.5 truncate border border-slate-200 shadow-2xs">
          {t('zoneRight')}
        </span>
      </div>
    </div>
  );
}
