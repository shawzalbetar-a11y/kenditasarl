import React, { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { useTranslations } from 'next-intl';
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Type, Search } from 'lucide-react';

interface TextToolsProps {
  canvas: fabric.Canvas | null;
  activeObject: fabric.Object | null;
  onSaveHistory: () => void;
}

const FONTS = [
  { name: 'Arial', category: 'Basic' },
  { name: 'Times New Roman', category: 'Basic' },
  { name: 'Courier New', category: 'Basic' },
  { name: 'Tajawal', category: 'Arabic' },
  { name: 'Cairo', category: 'Arabic' },
  { name: 'Almarai', category: 'Arabic' },
  { name: 'Inter', category: 'Modern' },
  { name: 'Roboto', category: 'Modern' },
  { name: 'Playfair Display', category: 'Modern' },
];

export default function TextTools({ canvas, activeObject, onSaveHistory }: TextToolsProps) {
  const t = useTranslations('Editor');
  const [textProps, setTextProps] = useState({
    fontFamily: 'Arial',
    fontSize: 24,
    fill: '#000000',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    charSpacing: 0,
    lineHeight: 1.16,
    opacity: 1
  });
  
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontSearch, setFontSearch] = useState('');

  useEffect(() => {
    if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'textbox')) {
      const txt = activeObject as fabric.Textbox;
      setTextProps({
        fontFamily: txt.fontFamily || 'Arial',
        fontSize: txt.fontSize || 24,
        fill: (txt.fill as string) || '#000000',
        fontWeight: txt.fontWeight as string || 'normal',
        fontStyle: txt.fontStyle as string || 'normal',
        textAlign: txt.textAlign || 'left',
        charSpacing: txt.charSpacing || 0,
        lineHeight: txt.lineHeight || 1.16,
        opacity: txt.opacity ?? 1
      });
    }
  }, [activeObject]);

  if (!activeObject || (activeObject.type !== 'i-text' && activeObject.type !== 'textbox')) return null;

  const updateProp = (key: string, value: any) => {
    const txt = activeObject as fabric.Textbox;
    txt.set(key as keyof fabric.Textbox, value);
    
    // Auto RTL detection when text changes
    if (key === 'text') {
      const isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(value);
      if (isRtl !== (txt.direction === 'rtl')) {
        txt.set('direction', isRtl ? 'rtl' : 'ltr');
        txt.set('textAlign', isRtl ? 'right' : 'left');
      }
    }
    
    canvas?.renderAll();
    onSaveHistory();
    setTextProps(p => ({ ...p, [key]: value }));
  };

  const filteredFonts = FONTS.filter(f => f.name.toLowerCase().includes(fontSearch.toLowerCase()));

  return (
    <div className="flex flex-col gap-4 w-full bg-gray-50 p-4 rounded-xl mt-4 relative">
      <h4 className="text-sm font-bold text-[var(--color-secondary)]">{t('textProperties', { fallback: 'Text Properties' })}</h4>
      
      {/* Font & Size */}
      <div className="flex gap-2 relative">
        <button 
          onClick={() => setShowFontPicker(!showFontPicker)}
          className="flex-1 p-2 border border-gray-200 rounded-lg text-sm bg-white flex justify-between items-center"
        >
          <span style={{ fontFamily: textProps.fontFamily }}>{textProps.fontFamily}</span>
          <Type size={14} className="text-gray-400" />
        </button>
        <input 
          type="number" 
          className="w-16 p-2 border border-gray-200 rounded-lg text-sm"
          value={textProps.fontSize}
          onChange={e => updateProp('fontSize', parseInt(e.target.value))}
        />
        
        {/* Custom Font Picker Dropdown */}
        {showFontPicker && (
          <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 shadow-xl rounded-xl z-50 max-h-64 flex flex-col overflow-hidden">
            <div className="p-2 border-b flex items-center gap-2 bg-gray-50">
              <Search size={14} className="text-gray-400" />
              <input 
                type="text" 
                placeholder="Search fonts..." 
                className="w-full bg-transparent outline-none text-sm"
                value={fontSearch}
                onChange={e => setFontSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredFonts.map(font => (
                <div 
                  key={font.name}
                  onClick={() => {
                    updateProp('fontFamily', font.name);
                    setShowFontPicker(false);
                  }}
                  className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-blue-50 transition-colors flex justify-between items-center ${textProps.fontFamily === font.name ? 'bg-blue-50' : ''}`}
                >
                  <span style={{ fontFamily: font.name }} className="text-base">{font.name}</span>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{font.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Styles & Alignment */}
      <div className="flex gap-2 justify-between bg-white p-1 rounded-lg border border-gray-200">
        <div className="flex">
          <button 
            onClick={() => updateProp('fontWeight', textProps.fontWeight === 'bold' ? 'normal' : 'bold')}
            className={`p-2 rounded ${textProps.fontWeight === 'bold' ? 'bg-gray-200' : ''}`}
          ><Bold size={16}/></button>
          <button 
            onClick={() => updateProp('fontStyle', textProps.fontStyle === 'italic' ? 'normal' : 'italic')}
            className={`p-2 rounded ${textProps.fontStyle === 'italic' ? 'bg-gray-200' : ''}`}
          ><Italic size={16}/></button>
        </div>
        <div className="flex border-l pl-2">
          <button onClick={() => updateProp('textAlign', 'left')} className={`p-2 rounded ${textProps.textAlign === 'left' ? 'bg-gray-200' : ''}`}><AlignLeft size={16}/></button>
          <button onClick={() => updateProp('textAlign', 'center')} className={`p-2 rounded ${textProps.textAlign === 'center' ? 'bg-gray-200' : ''}`}><AlignCenter size={16}/></button>
          <button onClick={() => updateProp('textAlign', 'right')} className={`p-2 rounded ${textProps.textAlign === 'right' ? 'bg-gray-200' : ''}`}><AlignRight size={16}/></button>
        </div>
      </div>

      {/* Color */}
      <div className="flex items-center justify-between">
        <span className="text-sm">{t('color')}</span>
        <input 
          type="color" 
          value={textProps.fill} 
          onChange={e => updateProp('fill', e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0"
        />
      </div>

      {/* Spacing & Opacity */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Opacity</span>
          <input type="range" min="0" max="1" step="0.1" value={textProps.opacity} onChange={e => updateProp('opacity', parseFloat(e.target.value))} className="w-24" />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Char Space</span>
          <input type="range" min="-100" max="500" step="10" value={textProps.charSpacing} onChange={e => updateProp('charSpacing', parseInt(e.target.value))} className="w-24" />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Line Height</span>
          <input type="range" min="0.5" max="3" step="0.1" value={textProps.lineHeight} onChange={e => updateProp('lineHeight', parseFloat(e.target.value))} className="w-24" />
        </div>
      </div>
    </div>
  );
}
