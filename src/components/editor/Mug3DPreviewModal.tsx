"use client";

import { MugPrintMode } from './MugStudioControls';
import React, { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  X,
  Rotate3d,
  Flame,
  Snowflake,
  Pause,
  Play,
  ShoppingBag,
  ArrowLeft,
  Coffee,
  Sparkles,
} from 'lucide-react';
import type { MugMeta } from '@/lib/productStudioProfile';
import {
  Mug3DCanvas,
  normalizeMugRad,
  MUG_CAMERA_ANGLES,
} from './Mug3DStage';

export interface Mug3DPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewIntent: 'cart_confirm' | 'inspect' | null;
  frontDesignUrl?: string | null;
  backDesignUrl?: string | null;
  isFullWrapMode: boolean;
  activeMode?: MugPrintMode;
  singleFaceName?: string;
  mugMeta: MugMeta;
  selectedColorHex?: string;
  selectedColorLabel?: string;
  selectedCapacity?: string;
  totalPrice?: number;
  priceCurrency?: string;
  onConfirmAddToCart?: () => void;
}

export default function Mug3DPreviewModal({
  isOpen,
  onClose,
  previewIntent,
  frontDesignUrl,
  backDesignUrl,
  isFullWrapMode,
  activeMode,
  singleFaceName,
  mugMeta,
  selectedColorHex = '#ffffff',
  selectedColorLabel,
  selectedCapacity = '11oz',
  totalPrice,
  priceCurrency = '₺',
  onConfirmAddToCart,
}: Mug3DPreviewModalProps) {
  const t = useTranslations('MugStudio');
  const tPreview = useTranslations('Preview');
  const locale = useLocale();
  const isRtl = locale === 'ar';

  const [yawRad, setYawRad] = useState<number>(() =>
    isFullWrapMode ? MUG_CAMERA_ANGLES.thumbnailHero : MUG_CAMERA_ANGLES.front
  );
  const [tiltRad, setTiltRad] = useState<number>(0.26);
  const [autoSpin, setAutoSpin] = useState<boolean>(false);

  const [heatRevealPct, setHeatRevealPct] = useState<number>(() =>
    mugMeta.mugStyle === 'magic' ? 25 : 100
  );
  const [isPouringAnim, setIsPouringAnim] = useState<boolean>(false);

  // Reset initial yaw cleanly whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setYawRad(isFullWrapMode ? MUG_CAMERA_ANGLES.thumbnailHero : MUG_CAMERA_ANGLES.front);
    setHeatRevealPct(mugMeta.mugStyle === 'magic' ? 15 : 100);
    setIsPouringAnim(false);
    setAutoSpin(false);
  }, [isOpen, isFullWrapMode, mugMeta.mugStyle]);

  // Auto-spin loop
  useEffect(() => {
    if (!isOpen || !autoSpin) return;
    let frameId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      setYawRad((prev) => normalizeMugRad(prev + dt * 0.85));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, autoSpin]);

  // Hot Drink Pour animation loop for Magic Mugs
  useEffect(() => {
    if (!isOpen || !isPouringAnim || mugMeta.mugStyle !== 'magic') return;
    let frameId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      setHeatRevealPct((prev) => {
        const next = prev + dt * 36;
        if (next >= 100) {
          setIsPouringAnim(false);
          return 100;
        }
        return next;
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, isPouringAnim, mugMeta.mugStyle]);

  if (!isOpen) return null;

  const isMagic = mugMeta.mugStyle === 'magic';

  return (
    <div
      className="fixed inset-0 z-[1200] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[95dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-r from-amber-50/70 via-white to-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${isMagic
                  ? 'bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white'
                  : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
                }`}
            >
              {isMagic ? <Sparkles className="w-5 h-5" /> : <Coffee className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 text-sm sm:text-base truncate">
                {previewIntent === 'cart_confirm' ? tPreview('confirmTitle') : t('modalTitle')}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                {isMagic ? t('modalMagicSubtitle') : t('modalStandardSubtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tPreview('close')}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Interactive 3D Viewport */}
        <div className="relative bg-slate-100 flex-1 min-h-[280px] sm:min-h-[360px] flex flex-col items-center justify-center overflow-hidden">
          <Mug3DCanvas
            active={isOpen}
            yawRad={yawRad}
            tiltRad={tiltRad}
            onYawChange={setYawRad}
            onTiltChange={setTiltRad}
            onStopAutoSpin={() => setAutoSpin(false)}
            mugMeta={mugMeta}
            selectedColorHex={selectedColorHex}
            selectedCapacity={selectedCapacity}
            isFullWrapMode={isFullWrapMode}
            heatRevealPct={heatRevealPct}
            frontDesignUrl={frontDesignUrl}
            backDesignUrl={backDesignUrl}
            className="w-full h-[290px] sm:h-[370px] cursor-grab active:cursor-grabbing touch-none block"
          />

          {/* Top-left Metadata Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2">
            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur border border-slate-200 text-[11px] font-bold text-slate-800 shadow-xs">
                <span>{t('capacityLabel')}</span>
                <span className="font-mono text-amber-700" dir="ltr">
                  {selectedCapacity}
                </span>
              </span>
              {selectedColorLabel && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur border border-slate-200 text-[11px] font-bold text-slate-800 shadow-xs">
                  <span
                    className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                    style={{ backgroundColor: selectedColorHex }}
                  />
                  <span>{selectedColorLabel}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAutoSpin((s) => !s)}
              className={`pointer-events-auto min-h-[34px] px-3 py-1 rounded-full text-[11px] font-extrabold border inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer ${autoSpin
                  ? 'bg-amber-500 text-white border-amber-600'
                  : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-white'
                }`}
            >
              {autoSpin ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{t('autoSpin')}</span>
            </button>
          </div>

          {/* Drag Hint Pill */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none bg-slate-900/75 text-white text-[10px] sm:text-[11px] font-bold px-3 py-1 rounded-full backdrop-blur-sm whitespace-nowrap flex items-center gap-1.5">
            <Rotate3d className="w-3.5 h-3.5 text-amber-300" />
            <span>{t('dragHint')}</span>
          </div>
        </div>

        {/* Magic Mug Hot Pour Simulator + Camera Angle Presets */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 space-y-3 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {isFullWrapMode ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAutoSpin(false);
                    setYawRad(MUG_CAMERA_ANGLES.left);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-amber-400 text-slate-800 whitespace-nowrap shadow-2xs cursor-pointer"
                >
                  {t('zoneLeft')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAutoSpin(false);
                    setYawRad(MUG_CAMERA_ANGLES.panorama);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-amber-400 text-slate-800 whitespace-nowrap shadow-2xs cursor-pointer"
                >
                  {t('anglePanorama')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAutoSpin(false);
                    setYawRad(MUG_CAMERA_ANGLES.right);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-amber-400 text-slate-800 whitespace-nowrap shadow-2xs cursor-pointer"
                >
                  {t('zoneRight')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAutoSpin(false);
                    setYawRad(MUG_CAMERA_ANGLES.front);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-amber-400 text-slate-800 whitespace-nowrap shadow-2xs cursor-pointer"
                >
                  {t('angleFront')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAutoSpin(false);
                    setYawRad(MUG_CAMERA_ANGLES.opposite);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-amber-400 text-slate-800 whitespace-nowrap shadow-2xs cursor-pointer"
                >
                  {t('angleOpposite')}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setAutoSpin(false);
                setYawRad(MUG_CAMERA_ANGLES.handle);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-amber-400 text-slate-800 whitespace-nowrap shadow-2xs cursor-pointer"
            >
              {t('angleHandle')}
            </button>
          </div>

          {isMagic && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-50 to-orange-50 border border-purple-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-purple-950">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>{t('hotPourTitle')}</span>
                  <span
                    className="font-mono text-[11px] bg-white px-2 py-0.5 rounded-md border border-purple-200 text-purple-700"
                    dir="ltr"
                  >
                    {Math.round(heatRevealPct)}%
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPouringAnim(false);
                      setHeatRevealPct(0);
                    }}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Snowflake className="w-3.5 h-3.5 text-sky-300" />
                    <span>{t('coolDown')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (heatRevealPct >= 95) setHeatRevealPct(5);
                      setIsPouringAnim(true);
                    }}
                    className="min-h-[32px] px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>{t('pourHotDrink')}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5" dir="ltr">
                <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">{t('coldState')}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(heatRevealPct)}
                  onChange={(e) => {
                    setIsPouringAnim(false);
                    setHeatRevealPct(Number(e.target.value));
                  }}
                  className="flex-1 accent-orange-500 cursor-pointer h-2 rounded-lg"
                />
                <span className="text-[10px] font-bold text-orange-700 whitespace-nowrap">{t('hotState')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {typeof totalPrice === 'number' && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-bold text-slate-500">{tPreview('totalPrice')}:</span>
              <span className="text-lg font-black text-slate-900 font-mono" dir="ltr">
                {totalPrice} {priceCurrency}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 ms-auto w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{tPreview('backToEditor')}</span>
            </button>

            {previewIntent === 'cart_confirm' && onConfirmAddToCart && (
              <button
                type="button"
                onClick={onConfirmAddToCart}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 cursor-pointer flex-1 sm:flex-initial"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{tPreview('confirmDesignAndAddToCart')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
