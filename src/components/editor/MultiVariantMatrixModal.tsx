"use client";

import React, { useState } from 'react';
import { X, Plus, Minus, Check, ShoppingBag, Layers, Tag, Trash2, AlertCircle, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { getLocalizedColorName } from '@/lib/colorTranslations';

export interface VariantMatrixItem {
  color: string;
  size: string;
  quantity: number;
}

interface MultiVariantMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSizes: string[];
  availableColors: string[];
  unitPrice: number;
  selectedColor: string;
  selectedSize: string;
  currentMatrix?: VariantMatrixItem[] | null;
  totalOrderQuantity?: number;
  getStockForVariant?: (color: string, size: string) => number;
  onApplyMatrix: (breakdown: VariantMatrixItem[], totalQuantity: number) => void;
  onAddToCartDirect?: (breakdown: VariantMatrixItem[], totalQuantity: number) => void;
  syncAllColors?: boolean;
  onToggleSyncAllColors?: (sync: boolean) => void;
}

const COLOR_MAP: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  gray: '#9CA3AF',
  navy: '#1E3A8A',
  blue: '#3B82F6',
  red: '#EF4444'
};

const isColorEqual = (c1?: string | null, c2?: string | null): boolean => {
  if (!c1 || !c2) return false;
  const s1 = c1.trim().toLowerCase();
  const s2 = c2.trim().toLowerCase();
  if (s1 === s2) return true;
  
  const hex1 = COLOR_MAP[s1]?.toLowerCase() || s1;
  const hex2 = COLOR_MAP[s2]?.toLowerCase() || s2;
  if (hex1 === hex2) return true;

  const name1 = Object.keys(COLOR_MAP).find(k => COLOR_MAP[k]?.toLowerCase() === s1) || s1;
  const name2 = Object.keys(COLOR_MAP).find(k => COLOR_MAP[k]?.toLowerCase() === s2) || s2;
  return name1 === name2;
};

const isSizeEqual = (s1?: string | null, s2?: string | null): boolean => {
  if (!s1 || !s2) return false;
  return s1.trim().toLowerCase() === s2.trim().toLowerCase();
};

const getMatrixKey = (color?: string | null, size?: string | null): string => {
  const c = (color || 'white').trim().toLowerCase();
  const s = (size || 'M').trim().toLowerCase();
  const canonicalColor = Object.keys(COLOR_MAP).find(k => COLOR_MAP[k]?.toLowerCase() === c || k === c) || c;
  return `${canonicalColor}_${s}`;
};

export default function MultiVariantMatrixModal({
  isOpen,
  onClose,
  availableSizes,
  availableColors,
  unitPrice,
  selectedColor,
  selectedSize,
  currentMatrix,
  totalOrderQuantity,
  getStockForVariant,
  onApplyMatrix,
  onAddToCartDirect,
  syncAllColors,
  onToggleSyncAllColors,
}: MultiVariantMatrixModalProps) {
  const t = useTranslations('Editor');
  const locale = useLocale();

  const resolveColor = (c?: string | null): string => {
    if (!c) return availableColors[0] || 'white';
    const match = availableColors.find(ac => isColorEqual(ac, c));
    return match || c;
  };

  const resolveSize = (s?: string | null): string => {
    if (!s) return availableSizes[0] || 'M';
    const match = availableSizes.find(as => isSizeEqual(as, s));
    return match || s;
  };

  const buildInitialState = () => {
    let colors: string[] = [];
    const map: Record<string, number> = {};

    if (currentMatrix && currentMatrix.length > 0) {
      currentMatrix.forEach(item => {
        if (item.quantity > 0) {
          const matchedC = resolveColor(item.color);
          const matchedS = resolveSize(item.size);
          const key = getMatrixKey(matchedC, matchedS);
          map[key] = (map[key] || 0) + item.quantity;
          if (!colors.some(c => isColorEqual(c, matchedC))) {
            colors.push(matchedC);
          }
        }
      });
    }

    if (colors.length === 0 || Object.keys(map).length === 0) {
      const defaultColor = resolveColor(selectedColor);
      const defaultSize = resolveSize(selectedSize);
      const defaultQty = Math.max(1, totalOrderQuantity || 1);
      colors = [defaultColor];
      map[getMatrixKey(defaultColor, defaultSize)] = defaultQty;
    }

    return { colors, map };
  };

  // Active matrix colors rows
  const [activeColors, setActiveColors] = useState<string[]>(() => buildInitialState().colors);
  
  // Matrix quantities mapped by canonical key
  const [quantities, setQuantities] = useState<Record<string, number>>(() => buildInitialState().map);

  // Re-synchronize state whenever modal opens or props update
  React.useEffect(() => {
    if (!isOpen) return;
    const { colors, map } = buildInitialState();
    setActiveColors(colors);
    setQuantities(map);
  }, [isOpen, selectedColor, selectedSize, currentMatrix, totalOrderQuantity, availableColors, availableSizes]);

  if (!isOpen) return null;

  const getMaxStock = (color: string, size: string) => {
    if (!getStockForVariant) return 999;
    return getStockForVariant(color, size);
  };

  const handleQtyChange = (color: string, size: string, delta: number) => {
    const key = getMatrixKey(color, size);
    const maxStock = getMaxStock(color, size);
    if (maxStock <= 0) return;

    const current = quantities[key] || 0;
    const next = Math.max(0, Math.min(maxStock, current + delta));
    setQuantities(prev => ({
      ...prev,
      [key]: next
    }));
  };

  const handleSetDirectQty = (color: string, size: string, val: string) => {
    const key = getMatrixKey(color, size);
    const maxStock = getMaxStock(color, size);
    if (maxStock <= 0) return;

    const num = parseInt(val.replace(/\D/g, ''), 10);
    setQuantities(prev => ({
      ...prev,
      [key]: isNaN(num) ? 0 : Math.max(0, Math.min(maxStock, num))
    }));
  };

  const handleAddColorRow = (colorToAdd: string) => {
    if (!activeColors.some(c => isColorEqual(c, colorToAdd))) {
      setActiveColors(prev => [...prev, colorToAdd]);
    }
  };

  const handleRemoveColorRow = (colorToRemove: string) => {
    if (activeColors.length <= 1) return;
    setActiveColors(prev => prev.filter(c => !isColorEqual(c, colorToRemove)));
    // Clear quantities for this color
    setQuantities(prev => {
      const next = { ...prev };
      availableSizes.forEach(s => {
        delete next[getMatrixKey(colorToRemove, s)];
      });
      return next;
    });
  };

  const handleResetMatrix = () => {
    const defaultColor = resolveColor(selectedColor);
    const defaultSize = resolveSize(selectedSize);
    const defaultQty = Math.max(1, totalOrderQuantity || 1);
    setActiveColors([defaultColor]);
    setQuantities({
      [getMatrixKey(defaultColor, defaultSize)]: defaultQty,
    });
    onApplyMatrix([{ color: defaultColor, size: defaultSize, quantity: defaultQty }], defaultQty);
  };

  // Compute total pieces and breakdown
  const breakdown: VariantMatrixItem[] = [];
  let totalPieces = 0;

  activeColors.forEach(color => {
    availableSizes.forEach(size => {
      const key = getMatrixKey(color, size);
      const maxStock = getMaxStock(color, size);
      const qty = quantities[key] || 0;
      const validQty = Math.min(qty, maxStock > 0 ? maxStock : 0);
      if (validQty > 0) {
        breakdown.push({ color, size, quantity: validQty });
        totalPieces += validQty;
      }
    });
  });

  // Total amount based on total pieces
  const effectiveTotalPieces = totalPieces > 0 ? totalPieces : Math.max(1, totalOrderQuantity || 1);
  const totalPrice = effectiveTotalPieces * unitPrice;

  const unusedColors = availableColors.filter(c => !activeColors.some(ac => isColorEqual(ac, c)));

  const handleConfirm = () => {
    if (breakdown.length === 0) {
      const defaultColor = resolveColor(selectedColor);
      const defaultSize = resolveSize(selectedSize);
      const defaultQty = Math.max(1, totalOrderQuantity || 1);
      const primaryStock = getMaxStock(defaultColor, defaultSize);
      if (primaryStock > 0) {
        onApplyMatrix([{ color: defaultColor, size: defaultSize, quantity: defaultQty }], defaultQty);
      } else {
        alert(locale === 'tr' ? 'Lütfen stokta olan bir beden ve renk seçiniz' : locale === 'en' ? 'Please select an available in-stock item' : 'يرجى اختيار مقاس ولون متوفر في المخزون');
        return;
      }
    } else {
      onApplyMatrix(breakdown, totalPieces);
    }
    onClose();
  };

  const handleDirectAdd = () => {
    const defaultColor = resolveColor(selectedColor);
    const defaultSize = resolveSize(selectedSize);
    const defaultQty = Math.max(1, totalOrderQuantity || 1);
    const items = breakdown.length > 0 
      ? breakdown 
      : [{ color: defaultColor, size: defaultSize, quantity: defaultQty }];
    const count = totalPieces > 0 ? totalPieces : defaultQty;
    if (onAddToCartDirect) {
      onAddToCartDirect(items, count);
    } else {
      onApplyMatrix(items, count);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center font-bold">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-gray-900">
                {locale === 'tr' ? 'Çoklu Beden ve Adet Seçimi' : locale === 'en' ? 'Multi-Size & Quantity Selection' : 'تحديد مقاسات وكميات متعددة'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {locale === 'tr' ? 'Aynı tasarımdan farklı beden ve renklerde dilediğiniz adetlerde sipariş verin' : locale === 'en' ? 'Order multiple sizes & colors for this design in bulk' : 'اطلب من نفس تصميمك بمقاسات وألوان وكميات مختلفة بسهولة'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetMatrix}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-red-300 bg-white hover:bg-red-50 text-gray-500 hover:text-red-600 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title={locale === 'tr' ? 'Varsayılana Sıfırla' : locale === 'en' ? 'Reset to Default' : 'تصفير وإعادة تعيين'}
            >
              <RotateCcw size={13} />
              <span>{locale === 'tr' ? 'Sıfırla' : locale === 'en' ? 'Reset' : 'تصفير'}</span>
            </button>
            <button 
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Matrix Body (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {activeColors.map((color) => {
            const colorName = getLocalizedColorName(color, locale);
            const bgColor = color === 'white' ? '#ffffff' : color === 'black' ? '#000000' : color === 'navy' ? '#1E3A8A' : color;
            
            // Subtotal for this color
            const colorSubtotal = availableSizes.reduce((sum, size) => sum + (quantities[getMatrixKey(color, size)] || 0), 0);

            return (
              <div key={color} className="bg-gray-50/80 border border-gray-200/80 rounded-2xl p-4 sm:p-5 space-y-3.5">
                {/* Color Row Header */}
                <div className="flex justify-between items-center border-b border-gray-200/60 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div 
                      className="w-5 h-5 rounded-full border border-gray-300 shadow-xs shrink-0"
                      style={{ backgroundColor: bgColor }}
                    />
                    <span className="font-bold text-sm text-gray-900">{colorName}</span>
                    <span className="text-xs text-gray-500">
                      ({colorSubtotal} {locale === 'tr' ? 'Adet' : locale === 'en' ? 'Pieces' : 'قطع'})
                    </span>
                  </div>

                  {activeColors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveColorRow(color)}
                      className="text-gray-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      title={locale === 'tr' ? 'Bu rengi kaldır' : locale === 'en' ? 'Remove color' : 'حذف هذا اللون'}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {/* Size Quantity Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                  {availableSizes.map((size) => {
                    const key = getMatrixKey(color, size);
                    const maxStock = getMaxStock(color, size);
                    const isOutOfStock = maxStock <= 0;
                    const qty = isOutOfStock ? 0 : (quantities[key] || 0);
                    const hasQty = qty > 0;

                    return (
                      <div 
                        key={size}
                        className={cn(
                          "flex flex-col items-center justify-between p-2.5 rounded-2xl border transition-all bg-white relative",
                          isOutOfStock 
                            ? "border-dashed border-gray-200 bg-gray-50/60 opacity-60" 
                            : hasQty 
                              ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/10 shadow-xs" 
                              : "border-gray-200 hover:border-gray-300"
                        )}
                      >
                        <div className="flex items-center justify-between w-full mb-1.5 px-0.5">
                          <span className={cn("font-black text-xs uppercase", isOutOfStock ? "text-gray-400 line-through" : "text-gray-800")}>
                            {size}
                          </span>
                          
                          {isOutOfStock ? (
                            <span className="text-[9px] text-red-500 font-bold bg-red-50 px-1 py-0.2 rounded">
                              {locale === 'tr' ? 'Tükendi' : locale === 'en' ? 'Out' : 'نفذ'}
                            </span>
                          ) : maxStock < 50 ? (
                            <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1 py-0.2 rounded">
                              {maxStock} {locale === 'tr' ? 'stok' : locale === 'en' ? 'left' : 'متوفر'}
                            </span>
                          ) : null}
                        </div>
                        
                        {/* Stepper */}
                        <div className={cn("flex items-center gap-1 w-full justify-between rounded-xl p-1", isOutOfStock ? "bg-gray-100 opacity-50" : "bg-gray-100")}>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(color, size, -1)}
                            disabled={isOutOfStock || qty <= 0}
                            className="w-6 h-6 rounded-lg bg-white shadow-xs flex items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Minus size={12} />
                          </button>
                          
                          <input
                            type="text"
                            inputMode="numeric"
                            lang="en-US"
                            dir="ltr"
                            disabled={isOutOfStock}
                            value={qty}
                            onChange={(e) => handleSetDirectQty(color, size, e.target.value)}
                            className={cn("w-8 text-center font-mono font-black text-xs bg-transparent outline-none", isOutOfStock ? "text-gray-400 cursor-not-allowed" : "text-gray-900")}
                          />

                          <button
                            type="button"
                            onClick={() => handleQtyChange(color, size, 1)}
                            disabled={isOutOfStock || qty >= maxStock}
                            className="w-6 h-6 rounded-lg bg-white shadow-xs flex items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Add Another Color Option */}
          {unusedColors.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-bold text-gray-500">
                {locale === 'tr' ? '+ Farklı bir renk ekle:' : locale === 'en' ? '+ Add another color:' : '+ إضافة لون آخر للطلب:'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {unusedColors.map(c => {
                  const cName = getLocalizedColorName(c, locale);
                  const cBg = c === 'white' ? '#ffffff' : c === 'black' ? '#000000' : c === 'navy' ? '#1E3A8A' : c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleAddColorRow(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:border-[var(--color-primary)] hover:bg-orange-50 text-xs font-semibold text-gray-700 transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="w-3.5 h-3.5 rounded-full border border-gray-300" style={{ backgroundColor: cBg }} />
                      <span>{cName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sync All Colors Toggle if 2+ colors are selected */}
          {activeColors.length > 1 && onToggleSyncAllColors && (
            <div className="flex items-center justify-between p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-2xl animate-in fade-in duration-200 mt-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <Sparkles size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black text-amber-950">
                    {t('syncAllColors', { fallback: 'تطبيق التعديلات على كافة الألوان' })} ({activeColors.length} {locale === 'tr' ? 'Renk' : locale === 'en' ? 'Colors' : 'ألوان'})
                  </span>
                  <span className="text-[11px] text-amber-800">
                    {t('syncAllColorsDesc', { fallback: 'تطبيق نفس الملصقات والتعديلات على جميع الألوان المختارة' })}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleSyncAllColors(!syncAllColors)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  syncAllColors ? "bg-amber-500" : "bg-gray-200 hover:bg-gray-300"
                )}
                role="switch"
                aria-checked={syncAllColors}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out",
                    syncAllColors ? (locale === 'ar' ? "-translate-x-5" : "translate-x-5") : "translate-x-0"
                  )}
                />
              </button>
            </div>
          )}
        </div>

        {/* Footer with Live Summary & CTA */}
        <div className="p-4 sm:p-5 border-t border-gray-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex flex-col">
              <span className="text-[11px] text-gray-500 font-medium">
                {locale === 'tr' ? 'Toplam Adet' : locale === 'en' ? 'Total Quantity' : 'إجمالي القطع'}
              </span>
              <span className="text-sm font-black text-gray-900 font-mono">
                {effectiveTotalPieces} {locale === 'tr' ? 'Adet' : locale === 'en' ? 'Pcs' : 'قطع'}
              </span>
            </div>

            <div className="h-8 w-px bg-gray-200" />

            <div className="flex flex-col">
              <span className="text-[11px] text-gray-500 font-medium">
                {locale === 'tr' ? 'Toplam Tutar' : locale === 'en' ? 'Total Amount' : 'المبلغ الإجمالي'}
              </span>
              <span className="text-base sm:text-lg font-black text-[var(--color-primary)] font-mono">
                {totalPrice} ₺
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-xs transition-all cursor-pointer"
            >
              {locale === 'tr' ? 'Uygula ve Kapat' : locale === 'en' ? 'Apply Matrix' : 'تطبيق التحديد'}
            </button>
            
            <button
              type="button"
              onClick={handleDirectAdd}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:opacity-90 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag size={15} />
              <span>{locale === 'tr' ? 'Tümünü Sepete Ekle' : locale === 'en' ? 'Add All to Cart' : 'إضافة الكل للسلة'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
