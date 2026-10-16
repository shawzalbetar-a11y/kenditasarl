import React, { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { useTranslations } from 'next-intl';
import { 
  Bold, 
  Italic, 
  Underline,
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Type, 
  Search, 
  Sparkles,
  Palette,
  Sun,
  Plus,
  Minus
} from 'lucide-react';

interface TextToolsProps {
  canvas: fabric.Canvas | null;
  activeObject: fabric.Object | null;
  onSaveHistory: () => void;
}

const FONTS = [
  // Arabic Master Fonts
  { name: 'Cairo', category: 'Arabic' },
  { name: 'Tajawal', category: 'Arabic' },
  { name: 'Almarai', category: 'Arabic' },
  { name: 'Changa', category: 'Arabic' },
  
  // Latin / Turkish / Universal Modern Fonts
  { name: 'Montserrat', category: 'Modern Sans' },
  { name: 'Roboto', category: 'Clean Sans' },
  { name: 'Open Sans', category: 'Balanced' },
  { name: 'Ubuntu', category: 'Dynamic' },
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'Inter', category: 'Tech' },
  { name: 'Arial', category: 'Standard' },
  { name: 'Times New Roman', category: 'Classic Serif' },
  { name: 'Courier New', category: 'Monospace' },
];

const TEXT_COLOR_SWATCHES = [
  '#000000',
  '#FFFFFF',
  '#FF5A36',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#6B7280',
];

export default function TextTools({ canvas, activeObject, onSaveHistory }: TextToolsProps) {
  const t = useTranslations('Editor');
  const [textProps, setTextProps] = useState({
    fontFamily: 'Arial',
    fontSize: 24,
    fill: '#000000',
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'left',
    charSpacing: 0,
    lineHeight: 1.16,
    opacity: 1,
    stroke: '',
    strokeWidth: 0,
  });
  
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontSearch, setFontSearch] = useState('');
  const [hasShadow, setHasShadow] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(0);

  // Sync state with active text object & selection
  useEffect(() => {
    if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'textbox')) {
      const txt = activeObject as fabric.Textbox;
      setTextProps({
        fontFamily: txt.fontFamily || 'Arial',
        fontSize: txt.fontSize || 24,
        fill: (txt.fill as string) || '#000000',
        fontWeight: (txt.fontWeight as string) || 'normal',
        fontStyle: (txt.fontStyle as string) || 'normal',
        underline: !!txt.underline,
        textAlign: txt.textAlign || 'left',
        charSpacing: txt.charSpacing || 0,
        lineHeight: txt.lineHeight || 1.16,
        opacity: txt.opacity ?? 1,
        stroke: (txt.stroke as string) || '',
        strokeWidth: txt.strokeWidth || 0,
      });
      setHasShadow(!!txt.shadow);
      setStrokeWidth(txt.strokeWidth || 0);
      if (txt.stroke) setStrokeColor(txt.stroke as string);
    }
  }, [activeObject]);

  // Listen to character selection changes inside the active textbox
  useEffect(() => {
    if (!canvas) return;
    const handleSelectionChange = () => {
      if (activeObject && (activeObject.type === 'textbox' || activeObject.type === 'i-text')) {
        const txt = activeObject as fabric.Textbox;
        const currentStyles = txt.getSelectionStyles();
        if (currentStyles && currentStyles.length > 0) {
          const firstStyle = currentStyles[0];
          setTextProps(p => ({
            ...p,
            fontFamily: firstStyle.fontFamily || txt.fontFamily || 'Arial',
            fontSize: firstStyle.fontSize || txt.fontSize || 24,
            fill: (firstStyle.fill as string) || (txt.fill as string) || '#000000',
            fontWeight: (firstStyle.fontWeight as string) || (txt.fontWeight as string) || 'normal',
            fontStyle: (firstStyle.fontStyle as string) || (txt.fontStyle as string) || 'normal',
            underline: firstStyle.underline !== undefined ? !!firstStyle.underline : !!txt.underline,
          }));
        }
      }
    };
    canvas.on('text:selection:changed', handleSelectionChange);
    return () => {
      canvas.off('text:selection:changed', handleSelectionChange);
    };
  }, [canvas, activeObject]);

  if (!activeObject || (activeObject.type !== 'i-text' && activeObject.type !== 'textbox')) return null;

  // 🎯 Character-Level Styling vs Full Textbox update
  const updateProp = (key: string, value: any) => {
    const txt = activeObject as fabric.Textbox;
    if (!txt) return;

    // Check if the user has selected/highlighted a specific character or substring
    const hasSelection = 
      typeof txt.selectionStart === 'number' && 
      typeof txt.selectionEnd === 'number' && 
      txt.selectionStart !== txt.selectionEnd;

    if (hasSelection) {
      // Apply strictly to highlighted characters!
      txt.setSelectionStyles({ [key]: value });
    } else {
      // Apply to entire textbox
      txt.set(key as any, value);
    }
    
    // Auto RTL detection when text changes
    if (key === 'text') {
      const isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(value);
      if (isRtl !== (txt.direction === 'rtl')) {
        txt.set('direction', isRtl ? 'rtl' : 'ltr');
        txt.set('textAlign', isRtl ? 'right' : 'left');
      }
    }
    
    canvas?.requestRenderAll();
    canvas?.renderAll();
    onSaveHistory();
    setTextProps(p => ({ ...p, [key]: value }));
  };

  // Toggle Drop Shadow Effect
  const toggleShadow = () => {
    const txt = activeObject as fabric.Textbox;
    if (!txt) return;

    if (hasShadow) {
      txt.set('shadow', null as any);
      setHasShadow(false);
    } else {
      txt.set('shadow', new fabric.Shadow({
        color: 'rgba(0, 0, 0, 0.45)',
        blur: 6,
        offsetX: 3,
        offsetY: 3
      }));
      setHasShadow(true);
    }
    canvas?.renderAll();
    onSaveHistory();
  };

  // Update Text Stroke (Outline)
  const updateStroke = (color: string, width: number) => {
    const txt = activeObject as fabric.Textbox;
    if (!txt) return;

    txt.set({
      stroke: width > 0 ? color : '',
      strokeWidth: width
    });
    setStrokeColor(color);
    setStrokeWidth(width);
    canvas?.renderAll();
    onSaveHistory();
  };

  const filteredFonts = FONTS.filter(f => 
    f.name.toLowerCase().includes(fontSearch.toLowerCase()) || 
    f.category.toLowerCase().includes(fontSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 w-full bg-gray-50 p-4 rounded-2xl mt-3 relative border border-gray-200/80">
      <div className="flex items-center justify-between border-b pb-2">
        <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Type size={16} className="text-[var(--color-primary)]" />
          {t('textProperties')}
        </h4>
        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
          {typeof (activeObject as any).selectionStart === 'number' && (activeObject as any).selectionStart !== (activeObject as any).selectionEnd ? t('selectionFormatted') : t('fullFormatted')}
        </span>
      </div>
      
      {/* Live Text Content Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
          <span>{t('textContent')}</span>
          <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">{t('instantSync')}</span>
        </label>
        <div className="relative">
          <textarea
            rows={2}
            value={(activeObject as any)?.text || ''}
            onChange={(e) => updateProp('text', e.target.value)}
            placeholder={t('typeHerePlaceholder')}
            className="w-full p-3 bg-white border-2 border-blue-200 focus:border-blue-500 rounded-xl text-sm font-bold text-gray-900 outline-none shadow-xs resize-none transition-all"
            dir="auto"
          />
        </div>
      </div>

      {/* Font Picker & Size */}
      <div className="flex gap-2 relative">
        <button 
          onClick={() => setShowFontPicker(!showFontPicker)}
          className="flex-1 p-2.5 border border-gray-300 rounded-xl text-sm bg-white flex justify-between items-center shadow-sm hover:border-gray-400 transition-all"
        >
          <span style={{ fontFamily: textProps.fontFamily }} className="font-semibold text-gray-800 truncate">
            {textProps.fontFamily}
          </span>
          <Type size={14} className="text-gray-400" />
        </button>
        {/* Font Size Stepper Control (Strictly formatted with Western numerals) */}
        <div className="flex items-center bg-white border border-gray-300 rounded-xl p-1 shadow-sm gap-1" dir="ltr">
          <button
            type="button"
            onClick={() => updateProp('fontSize', Math.max(8, (Number(textProps.fontSize) || 24) - 2))}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 active:scale-95 transition-all text-xs font-bold"
            title="Decrease font size"
          >
            <Minus size={13} />
          </button>

          <input 
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            lang="en-US"
            dir="ltr"
            style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            className="w-8 bg-transparent text-sm font-bold text-center outline-none select-all"
            value={String(textProps.fontSize || 24)}
            onChange={e => {
              const raw = e.target.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
              const num = parseInt(raw.replace(/\D/g, '')) || 8;
              updateProp('fontSize', Math.min(150, Math.max(8, num)));
            }}
          />

          <span className="text-[10px] text-gray-400 font-semibold select-none pr-0.5" dir="ltr">px</span>

          <button
            type="button"
            onClick={() => updateProp('fontSize', Math.min(150, (Number(textProps.fontSize) || 24) + 2))}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 active:scale-95 transition-all text-xs font-bold"
            title="Increase font size"
          >
            <Plus size={13} />
          </button>
        </div>
        
        {/* Custom Font Picker Dropdown */}
        {showFontPicker && (
          <div className="absolute top-full left-0 w-full mt-1.5 bg-white border border-gray-200 shadow-2xl rounded-2xl z-50 max-h-64 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-2 border-b flex items-center gap-2 bg-gray-50">
              <Search size={14} className="text-gray-400" />
              <input 
                type="text" 
                placeholder={t('searchFont')} 
                className="w-full bg-transparent outline-none text-xs font-medium"
                value={fontSearch}
                onChange={e => setFontSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1 p-1">
              {filteredFonts.map(font => (
                <div 
                  key={font.name}
                  onClick={() => {
                    updateProp('fontFamily', font.name);
                    setShowFontPicker(false);
                  }}
                  className={`p-2.5 rounded-xl border-b border-gray-50 cursor-pointer hover:bg-blue-50 transition-colors flex justify-between items-center ${textProps.fontFamily === font.name ? 'bg-blue-50/80 font-bold' : ''}`}
                >
                  <span style={{ fontFamily: font.name }} className="text-sm">{font.name}</span>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{font.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Styles & Alignment Bar */}
      <div className="flex gap-1.5 justify-between bg-white p-1.5 rounded-xl border border-gray-300 shadow-sm">
        <div className="flex gap-1">
          <button 
            onClick={() => updateProp('fontWeight', textProps.fontWeight === 'bold' ? 'normal' : 'bold')}
            className={`p-2 rounded-lg transition-colors ${textProps.fontWeight === 'bold' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
            title={t('bold')}
          >
            <Bold size={15}/>
          </button>
          <button 
            onClick={() => updateProp('fontStyle', textProps.fontStyle === 'italic' ? 'normal' : 'italic')}
            className={`p-2 rounded-lg transition-colors ${textProps.fontStyle === 'italic' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
            title={t('italic')}
          >
            <Italic size={15}/>
          </button>
          <button 
            onClick={() => updateProp('underline', !textProps.underline)}
            className={`p-2 rounded-lg transition-colors ${textProps.underline ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
            title={t('underline')}
          >
            <Underline size={15}/>
          </button>
        </div>

        <div className="flex gap-1 border-r pr-1.5">
          <button 
            onClick={() => updateProp('textAlign', 'right')} 
            className={`p-2 rounded-lg transition-colors ${textProps.textAlign === 'right' ? 'bg-gray-200 text-gray-900 font-bold' : 'hover:bg-gray-100 text-gray-600'}`}
            title={t('alignRight')}
          >
            <AlignRight size={15}/>
          </button>
          <button 
            onClick={() => updateProp('textAlign', 'center')} 
            className={`p-2 rounded-lg transition-colors ${textProps.textAlign === 'center' ? 'bg-gray-200 text-gray-900 font-bold' : 'hover:bg-gray-100 text-gray-600'}`}
            title={t('alignCenter')}
          >
            <AlignCenter size={15}/>
          </button>
          <button 
            onClick={() => updateProp('textAlign', 'left')} 
            className={`p-2 rounded-lg transition-colors ${textProps.textAlign === 'left' ? 'bg-gray-200 text-gray-900 font-bold' : 'hover:bg-gray-100 text-gray-600'}`}
            title={t('alignLeft')}
          >
            <AlignLeft size={15}/>
          </button>
        </div>
      </div>

      {/* Color Swatches & Custom Picker */}
      <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <Palette size={14} className="text-[var(--color-primary)]" />
            {t('textColor')}
          </span>
          <input 
            type="color" 
            value={textProps.fill} 
            onChange={e => updateProp('fill', e.target.value)}
            className="w-6 h-6 rounded-lg cursor-pointer border border-gray-300 p-0"
            title={t('textColor')}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TEXT_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              onClick={() => updateProp('fill', swatch)}
              className="w-6 h-6 rounded-full border border-gray-300 shadow-sm transition-transform hover:scale-110"
              style={{ backgroundColor: swatch }}
              title={swatch}
            />
          ))}
        </div>
      </div>

      {/* Text Effects (Shadow & Outline Stroke) */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-gray-200">
        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          {t('textEffects')}
        </span>

        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={toggleShadow}
            className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${hasShadow ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
          >
            <Sun size={14} />
            {hasShadow ? t('removeShadow') : t('enableShadow')}
          </button>

          <div className="flex items-center justify-between bg-white border border-gray-300 rounded-xl px-2.5 py-1">
            <span className="text-[11px] font-bold text-gray-600">{t('stroke')}</span>
            <input 
              type="color" 
              value={strokeColor} 
              onChange={e => updateStroke(e.target.value, strokeWidth || 1)}
              className="w-5 h-5 rounded cursor-pointer border-0 p-0"
              title={t('stroke')}
            />
          </div>
        </div>

        {/* Stroke Width Slider */}
        <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-gray-200">
          <span className="text-[11px] font-medium text-gray-600">{t('strokeWidth')}</span>
          <div className="flex items-center gap-2">
            <input 
              type="range" min="0" max="10" step="1" 
              value={strokeWidth} 
              onChange={e => updateStroke(strokeColor, parseInt(e.target.value) || 0)} 
              className="w-24 accent-[var(--color-primary)] cursor-pointer" 
            />
            <span className="text-[11px] font-mono text-gray-700 w-5">{strokeWidth}px</span>
          </div>
        </div>
      </div>

      {/* Spacing & Opacity */}
      <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600 font-medium">{t('opacity')}</span>
          <input 
            type="range" min="0" max="1" step="0.05" 
            value={textProps.opacity} 
            onChange={e => updateProp('opacity', parseFloat(e.target.value))} 
            className="w-28 accent-[var(--color-primary)] cursor-pointer" 
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600 font-medium">{t('charSpacing')}</span>
          <input 
            type="range" min="-50" max="400" step="10" 
            value={textProps.charSpacing} 
            onChange={e => updateProp('charSpacing', parseInt(e.target.value))} 
            className="w-28 accent-[var(--color-primary)] cursor-pointer" 
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600 font-medium">{t('lineHeight')}</span>
          <input 
            type="range" min="0.8" max="2.5" step="0.1" 
            value={textProps.lineHeight} 
            onChange={e => updateProp('lineHeight', parseFloat(e.target.value))} 
            className="w-28 accent-[var(--color-primary)] cursor-pointer" 
          />
        </div>
      </div>
    </div>
  );
}

