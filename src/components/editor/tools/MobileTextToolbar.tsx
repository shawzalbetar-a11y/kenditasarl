"use client";

import React, { useState, useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import {
  Check,
  Type,
  Palette,
  Bold,
  Italic,
  Underline,
  AlignRight,
  AlignCenter,
  AlignLeft,
  Plus,
  Minus,
  Sparkles,
  Sun,
  Target,
  Copy,
  Trash2,
  X,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileTextToolbarProps {
  canvas: fabric.Canvas | null;
  activeObject: fabric.Object | null;
  onSaveHistory: () => void;
  locale?: string;
  onDeselect: () => void;
  onDelete: () => void;
  onCenter?: () => void;
  onDuplicate?: () => void;
  onAddNewText?: () => void;
}

export interface FontItem {
  name: string;
  label: string;
  category: 'arabic' | 'latin' | 'display';
}

const FONTS: FontItem[] = [
  // 1. الخطوط العربية الفاخرة (Arabic Master Fonts)
  { name: 'Cairo', label: 'Cairo (كوفي حديث)', category: 'arabic' },
  { name: 'Alexandria', label: 'Alexandria (هندسي فخم)', category: 'arabic' },
  { name: 'Tajawal', label: 'Tajawal (عصري متوازن)', category: 'arabic' },
  { name: 'Almarai', label: 'Almarai (رسمي أنيق)', category: 'arabic' },
  { name: 'Changa', label: 'Changa (ستريت وير عريض)', category: 'arabic' },
  { name: 'Lalezar', label: 'Lalezar (عريض مسرحي)', category: 'arabic' },
  { name: 'Amiri', label: 'Amiri (نسخ كلاسيكي)', category: 'arabic' },
  { name: 'Aref Ruqaa', label: 'Aref Ruqaa (رقعة تراثي)', category: 'arabic' },
  { name: 'Marhey', label: 'Marhey (حر مرح)', category: 'arabic' },
  { name: 'Readex Pro', label: 'Readex Pro (مودرن نظيف)', category: 'arabic' },
  { name: 'Reem Kufi', label: 'Reem Kufi (كوفي أصيل)', category: 'arabic' },
  { name: 'El Messiri', label: 'El Messiri (فني انسيابي)', category: 'arabic' },
  { name: 'Rubik', label: 'Rubik (ناعم عربي/تركي)', category: 'arabic' },

  // 2. خطوط التيشيرتات والستريت وير الإنجليزية والتركية (Streetwear, Bold & Display - Latin Extended)
  { name: 'Bebas Neue', label: 'Bebas Neue (كابيتال بارز)', category: 'display' },
  { name: 'Anton', label: 'Anton (عريض وجريء)', category: 'display' },
  { name: 'Oswald', label: 'Oswald (رياضي مكثف)', category: 'display' },
  { name: 'Permanent Marker', label: 'Permanent Marker (جرافيتي)', category: 'display' },
  { name: 'Righteous', label: 'Righteous (ريترو مستقبلي)', category: 'display' },
  { name: 'Pacifico', label: 'Pacifico (يدوي متصل Script)', category: 'display' },

  // 3. الخطوط العالمية والحديثة (Modern Clean Latin & Turkish)
  { name: 'Montserrat', label: 'Montserrat (مودرن عالمي)', category: 'latin' },
  { name: 'Playfair Display', label: 'Playfair (سيريف فخم)', category: 'latin' },
  { name: 'Inter', label: 'Inter (تكنولوجي واضح)', category: 'latin' },
  { name: 'Roboto', label: 'Roboto (نظيف ومتوازن)', category: 'latin' },
  { name: 'Ubuntu', label: 'Ubuntu (حيوي جذاب)', category: 'latin' },
  { name: 'Open Sans', label: 'Open Sans (بسيط وناعم)', category: 'latin' },
  { name: 'Arial', label: 'Arial (قياسي)', category: 'latin' },
];

const QUICK_COLORS = [
  { hex: '#000000', label: 'أسود' },
  { hex: '#FFFFFF', label: 'أبيض', border: true },
  { hex: '#FF5A36', label: 'برتقالي' },
  { hex: '#EF4444', label: 'أحمر' },
  { hex: '#3B82F6', label: 'أزرق' },
  { hex: '#10B981', label: 'أخضر' },
  { hex: '#F59E0B', label: 'ذهبي' },
  { hex: '#8B5CF6', label: 'بنفسجي' },
  { hex: '#EC4899', label: 'وردي' },
  { hex: '#1E293B', label: 'كحلي' },
  { hex: '#6B7280', label: 'رمادي' },
];

export default function MobileTextToolbar({
  canvas,
  activeObject,
  onSaveHistory,
  locale = 'ar',
  onDeselect,
  onDelete,
  onCenter,
  onDuplicate,
  onAddNewText,
}: MobileTextToolbarProps) {
  const isRtl = locale === 'ar';
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [textProps, setTextProps] = useState({
    text: '',
    fontFamily: 'Cairo',
    fontSize: 28,
    fill: '#000000',
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'center',
    hasShadow: false,
    hasStroke: false,
  });

  const [isEditingText, setIsEditingText] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [selectedFontCategory, setSelectedFontCategory] = useState<'all' | 'arabic' | 'display' | 'latin'>('all');

  const filteredFonts = FONTS.filter(f => selectedFontCategory === 'all' || f.category === selectedFontCategory);

  const handleSelectFont = (fontName: string) => {
    if (typeof document !== 'undefined' && (document as any).fonts) {
      (document as any).fonts.load(`16px "${fontName}"`).then(() => {
        canvas?.requestRenderAll();
        canvas?.renderAll();
      }).catch(() => { });
    }
    updateProp('fontFamily', fontName);
    setShowFontPicker(false);
  };

  // Sync state whenever activeObject changes or updates
  useEffect(() => {
    if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'textbox')) {
      const txt = activeObject as fabric.Textbox;
      setTextProps({
        text: txt.text || '',
        fontFamily: txt.fontFamily || 'Cairo',
        fontSize: txt.fontSize || 28,
        fill: (txt.fill as string) || '#000000',
        fontWeight: (txt.fontWeight as string) || 'normal',
        fontStyle: (txt.fontStyle as string) || 'normal',
        underline: !!txt.underline,
        textAlign: txt.textAlign || 'center',
        hasShadow: !!txt.shadow,
        hasStroke: Boolean(txt.stroke && (txt.strokeWidth || 0) > 0),
      });
    }
  }, [activeObject]);

  // Listen to live text edits on canvas
  useEffect(() => {
    if (!canvas) return;
    const handleTextChange = () => {
      if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'textbox')) {
        const txt = activeObject as fabric.Textbox;
        setTextProps(prev => ({
          ...prev,
          text: txt.text || '',
          fontSize: txt.fontSize || prev.fontSize,
        }));
      }
    };
    canvas.on('text:changed', handleTextChange);
    return () => {
      canvas.off('text:changed', handleTextChange);
    };
  }, [canvas, activeObject]);

  if (!activeObject || (activeObject.type !== 'i-text' && activeObject.type !== 'textbox')) {
    return null;
  }

  // Update property directly on Fabric active text
  const updateProp = (key: string, value: any) => {
    const txt = activeObject as fabric.Textbox;
    if (!txt || !canvas) return;

    if (key === 'text') {
      txt.set('text', value);
      const isArabic = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(value);
      if (isArabic !== (txt.direction === 'rtl')) {
        txt.set('direction', isArabic ? 'rtl' : 'ltr');
        txt.set('textAlign', isArabic ? 'right' : 'left');
      }
    } else {
      txt.set(key as any, value);
    }

    txt.setCoords();
    canvas.requestRenderAll();
    canvas.renderAll();
    onSaveHistory();
    setTextProps(p => ({ ...p, [key]: value }));
  };

  // Toggle Bold
  const toggleBold = () => {
    const next = textProps.fontWeight === 'bold' ? 'normal' : 'bold';
    updateProp('fontWeight', next);
  };

  // Toggle Italic
  const toggleItalic = () => {
    const next = textProps.fontStyle === 'italic' ? 'normal' : 'italic';
    updateProp('fontStyle', next);
  };

  // Toggle Underline
  const toggleUnderline = () => {
    const next = !textProps.underline;
    updateProp('underline', next);
  };

  // Toggle Shadow
  const toggleShadow = () => {
    const txt = activeObject as fabric.Textbox;
    if (!txt || !canvas) return;
    if (textProps.hasShadow) {
      txt.set('shadow', null as any);
      setTextProps(p => ({ ...p, hasShadow: false }));
    } else {
      txt.set('shadow', new fabric.Shadow({
        color: 'rgba(0, 0, 0, 0.45)',
        blur: 6,
        offsetX: 3,
        offsetY: 3
      }));
      setTextProps(p => ({ ...p, hasShadow: true }));
    }
    txt.setCoords();
    canvas.requestRenderAll();
    onSaveHistory();
  };

  // Toggle Outline / Stroke
  const toggleStroke = () => {
    const txt = activeObject as fabric.Textbox;
    if (!txt || !canvas) return;
    if (textProps.hasStroke) {
      txt.set({ stroke: '', strokeWidth: 0 });
      setTextProps(p => ({ ...p, hasStroke: false }));
    } else {
      const strokeColor = textProps.fill.toLowerCase() === '#000000' ? '#FFFFFF' : '#000000';
      txt.set({ stroke: strokeColor, strokeWidth: 2 });
      setTextProps(p => ({ ...p, hasStroke: true }));
    }
    txt.setCoords();
    canvas.requestRenderAll();
    onSaveHistory();
  };

  // Adjust Font Size
  const adjustFontSize = (delta: number) => {
    const newSize = Math.max(10, Math.min(140, Math.round((Number(textProps.fontSize) || 28) + delta)));
    updateProp('fontSize', newSize);
  };

  return (
    <div className="relative w-full">
      {/* 1. FLOATING LIVE INLINE TEXT CONTENT INPUT */}
      {isEditingText && (
        <div className="absolute bottom-full mb-2 inset-x-2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/90 p-2.5 flex items-center gap-2 z-50 animate-in slide-in-from-bottom-2 duration-150">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Type size={16} />
          </div>
          <input
            type="text"
            autoFocus
            value={textProps.text}
            onChange={(e) => updateProp('text', e.target.value)}
            placeholder={locale === 'tr' ? 'Metninizi yazın...' : locale === 'en' ? 'Type your text...' : 'اكتب نصك هنا...'}
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 focus:border-purple-500 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none transition-all"
            dir="auto"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsEditingText(false);
            }}
          />
          <button
            type="button"
            onClick={() => setIsEditingText(false)}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1 shrink-0 active:scale-95 shadow-xs cursor-pointer"
          >
            <Check size={14} strokeWidth={2.5} />
            <span>{locale === 'tr' ? 'Tamam' : locale === 'en' ? 'Done' : 'تطبيق'}</span>
          </button>
        </div>
      )}

      {/* 2. FLOATING FONT SELECTOR CAROUSEL */}
      {showFontPicker && (
        <div className="absolute bottom-full mb-2 inset-x-2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/90 p-2.5 z-50 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Type size={14} className="text-[var(--color-primary)]" />
              <span>{locale === 'tr' ? 'Yazı Tipi (25 Font)' : locale === 'en' ? 'Fonts (25 Available)' : 'مكتبة الخطوط (25 خط مميز)'}</span>
            </span>
            <button
              type="button"
              onClick={() => setShowFontPicker(false)}
              className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1.5 mb-1.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setSelectedFontCategory('all')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer",
                selectedFontCategory === 'all' ? "bg-slate-900 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {locale === 'tr' ? 'Tümü' : locale === 'en' ? 'All' : 'الكل'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedFontCategory('arabic')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer",
                selectedFontCategory === 'arabic' ? "bg-amber-500 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {locale === 'tr' ? 'Arapça' : locale === 'en' ? 'Arabic' : 'عربي'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedFontCategory('display')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer",
                selectedFontCategory === 'display' ? "bg-purple-600 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {locale === 'tr' ? 'Sokak Stili' : locale === 'en' ? 'Streetwear' : 'ستريت وير وعناوين'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedFontCategory('latin')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer",
                selectedFontCategory === 'latin' ? "bg-blue-600 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {locale === 'tr' ? 'Türkçe & İngilizce' : locale === 'en' ? 'Latin & Turkish' : 'تركي وإنجليزي'}
            </button>
          </div>

          {/* Fonts List */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1">
            {filteredFonts.map(f => (
              <button
                key={f.name}
                type="button"
                onClick={() => handleSelectFont(f.name)}
                style={{ fontFamily: f.name }}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer",
                  textProps.fontFamily === f.name
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs scale-102"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. MAIN HORIZONTAL SCROLLABLE TEXT CONTROL TOOLBAR */}
      <div
        ref={scrollContainerRef}
        className="w-full flex items-center gap-2 overflow-x-auto no-scrollbar touch-pan-x px-2.5 py-1.5 scroll-smooth select-none"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Module 1: Done / Deselect Button */}
        <button
          type="button"
          onClick={onDeselect}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shrink-0 active:scale-95 shadow-xs cursor-pointer"
          title={locale === 'tr' ? 'Düzenlemeyi Tamamla' : locale === 'en' ? 'Finish Editing' : 'إنهاء وتأكيد'}
        >
          <Check size={14} strokeWidth={2.5} className="text-emerald-400" />
          <span>{locale === 'tr' ? 'Tamam' : locale === 'en' ? 'Done' : 'تم'}</span>
        </button>

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        {/* Module 2: Edit Text Content Button */}
        <button
          type="button"
          onClick={() => {
            setShowFontPicker(false);
            setIsEditingText(!isEditingText);
          }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition active:scale-95 border cursor-pointer",
            isEditingText
              ? "bg-purple-600 text-white border-purple-600 shadow-xs"
              : "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200/80"
          )}
          title={locale === 'tr' ? 'Metni Değiştir' : locale === 'en' ? 'Edit Text' : 'تعديل محتوى النص'}
        >
          <Type size={14} />
          <span className="max-w-[75px] truncate">{textProps.text || (locale === 'tr' ? 'Metin' : locale === 'en' ? 'Text' : 'نصك')}</span>
        </button>

        {onAddNewText && (
          <button
            type="button"
            onClick={onAddNewText}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition active:scale-95 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
            title={locale === 'tr' ? 'Yeni Metin Ekle' : locale === 'en' ? 'Add New Text' : 'إضافة نص جديد'}
          >
            <Plus size={13} className="text-purple-600" />
            <span>{locale === 'tr' ? '+Metin' : locale === 'en' ? '+Text' : '+نص'}</span>
          </button>
        )}

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        {/* Module 3: Colors (Current + Quick Swatches + Custom Picker) */}
        <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 border border-slate-200/90 rounded-2xl p-1 shadow-2xs">
          <Palette size={13} className="text-amber-500 shrink-0 mx-0.5" />

          {/* Quick Swatches */}
          <div className="flex items-center gap-1">
            {QUICK_COLORS.map(c => {
              const isSelected = textProps.fill.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => updateProp('fill', c.hex)}
                  className={cn(
                    "w-6 h-6 rounded-full transition-all shrink-0 active:scale-90 cursor-pointer relative",
                    c.border ? "border border-gray-300" : "",
                    isSelected ? "ring-2 ring-offset-1 ring-amber-500 scale-110 shadow-xs z-10" : "hover:scale-105"
                  )}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                />
              );
            })}

            {/* Custom Hex Color Picker */}
            <label
              className="relative w-6 h-6 rounded-full bg-gradient-to-tr from-rose-500 via-amber-500 to-indigo-500 flex items-center justify-center cursor-pointer shadow-xs active:scale-90 shrink-0"
              title={locale === 'tr' ? 'Özel Renk' : locale === 'en' ? 'Custom Color' : 'لون مخصص'}
            >
              <Plus size={11} className="text-white font-black stroke-[3]" />
              <input
                type="color"
                value={textProps.fill}
                onChange={(e) => updateProp('fill', e.target.value)}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        {/* Module 4: Font Family Selector Button */}
        <button
          type="button"
          onClick={() => {
            setIsEditingText(false);
            setShowFontPicker(!showFontPicker);
          }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition active:scale-95 border cursor-pointer",
            showFontPicker
              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
              : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200"
          )}
          style={{ fontFamily: textProps.fontFamily }}
          title={locale === 'tr' ? 'Yazı Tipi' : locale === 'en' ? 'Font' : 'نوع الخط'}
        >
          <span>{textProps.fontFamily}</span>
          <ChevronDown size={13} className={cn("transition-transform", showFontPicker && "rotate-180")} />
        </button>

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        {/* Module 5: Typography Styles (Bold, Italic, Underline) */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-100 rounded-xl p-0.5 border border-slate-200 shadow-2xs">
          <button
            type="button"
            onClick={toggleBold}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-90 font-black text-xs cursor-pointer",
              textProps.fontWeight === 'bold'
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-700 hover:bg-white"
            )}
            title={locale === 'tr' ? 'Kalın (Bold)' : locale === 'en' ? 'Bold' : 'عريض (سماكة)'}
          >
            <Bold size={13} strokeWidth={2.8} />
          </button>

          <button
            type="button"
            onClick={toggleItalic}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-90 text-xs cursor-pointer font-serif italic",
              textProps.fontStyle === 'italic'
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-700 hover:bg-white"
            )}
            title={locale === 'tr' ? 'İtalik' : locale === 'en' ? 'Italic' : 'مائل'}
          >
            <Italic size={13} />
          </button>

          <button
            type="button"
            onClick={toggleUnderline}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-90 text-xs cursor-pointer",
              textProps.underline
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-700 hover:bg-white"
            )}
            title={locale === 'tr' ? 'Altı Çizili' : locale === 'en' ? 'Underline' : 'تسطير'}
          >
            <Underline size={13} />
          </button>
        </div>

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        {/* Module 6: Font Size Stepper */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-100 rounded-xl p-0.5 border border-slate-200 shadow-2xs" dir="ltr">
          <button
            type="button"
            onClick={() => adjustFontSize(-2)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white hover:bg-slate-200 text-slate-700 active:scale-90 transition cursor-pointer shadow-2xs font-bold"
            title="تصغير الخط"
          >
            <Minus size={13} />
          </button>

          <span className="font-mono text-xs font-bold text-slate-800 px-1.5 min-w-[32px] text-center select-none">
            {textProps.fontSize}px
          </span>

          <button
            type="button"
            onClick={() => adjustFontSize(2)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white hover:bg-slate-200 text-slate-700 active:scale-90 transition cursor-pointer shadow-2xs font-bold"
            title="تكبير الخط"
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        {/* Module 7: Alignment (Right, Center, Left) */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-100 rounded-xl p-0.5 border border-slate-200 shadow-2xs">
          <button
            type="button"
            onClick={() => updateProp('textAlign', 'right')}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-90 cursor-pointer",
              textProps.textAlign === 'right' ? "bg-slate-900 text-white shadow-xs" : "text-slate-700 hover:bg-white"
            )}
            title={locale === 'tr' ? 'Sağa Hizala' : locale === 'en' ? 'Align Right' : 'محاذاة لليمين'}
          >
            <AlignRight size={13} />
          </button>

          <button
            type="button"
            onClick={() => updateProp('textAlign', 'center')}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-90 cursor-pointer",
              textProps.textAlign === 'center' ? "bg-slate-900 text-white shadow-xs" : "text-slate-700 hover:bg-white"
            )}
            title={locale === 'tr' ? 'Ortala' : locale === 'en' ? 'Align Center' : 'توسيط'}
          >
            <AlignCenter size={13} />
          </button>

          <button
            type="button"
            onClick={() => updateProp('textAlign', 'left')}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-90 cursor-pointer",
              textProps.textAlign === 'left' ? "bg-slate-900 text-white shadow-xs" : "text-slate-700 hover:bg-white"
            )}
            title={locale === 'tr' ? 'Sola Hizala' : locale === 'en' ? 'Align Left' : 'محاذاة لليسار'}
          >
            <AlignLeft size={13} />
          </button>
        </div>

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        {/* Module 8: Effects (Shadow & Stroke) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleShadow}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 border cursor-pointer",
              textProps.hasShadow
                ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            )}
            title={locale === 'tr' ? 'Gölge Efekti' : locale === 'en' ? 'Shadow' : 'تأثير الظل'}
          >
            <Sparkles size={13} />
            <span>{locale === 'tr' ? 'Gölge' : locale === 'en' ? 'Shadow' : 'ظل'}</span>
          </button>

          <button
            type="button"
            onClick={toggleStroke}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 border cursor-pointer",
              textProps.hasStroke
                ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            )}
            title={locale === 'tr' ? 'Kontur Çizgisi' : locale === 'en' ? 'Outline' : 'إطار خارجي'}
          >
            <Sun size={13} />
            <span>{locale === 'tr' ? 'Kontur' : locale === 'en' ? 'Outline' : 'إطار'}</span>
          </button>
        </div>

        {/* Module 9: Center in placement (if provided) */}
        {onCenter && (
          <>
            <div className="w-px h-6 bg-slate-200 shrink-0" />
            <button
              type="button"
              onClick={onCenter}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition active:scale-95 cursor-pointer shrink-0"
              title={locale === 'tr' ? 'Baskı Alanına Ortala' : locale === 'en' ? 'Center in Placement' : 'توسيط في الموضع'}
            >
              <Target size={13} className="text-amber-500" />
              <span>{locale === 'tr' ? 'Ortala' : locale === 'en' ? 'Center' : 'توسيط'}</span>
            </button>
          </>
        )}

        {/* Module 10: Duplicate (if provided) */}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition active:scale-95 cursor-pointer shrink-0"
            title={locale === 'tr' ? 'Çoğalt' : locale === 'en' ? 'Duplicate' : 'تكرار'}
          >
            <Copy size={13} />
          </button>
        )}

        {/* Module 11: Delete Button */}
        <div className="w-px h-6 bg-slate-200 shrink-0" />
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200/80 transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
          title={locale === 'tr' ? 'Sil' : locale === 'en' ? 'Delete' : 'حذف'}
        >
          <Trash2 size={13} />
          <span>{locale === 'tr' ? 'Sil' : locale === 'en' ? 'Delete' : 'حذف'}</span>
        </button>
      </div>
    </div>
  );
}
