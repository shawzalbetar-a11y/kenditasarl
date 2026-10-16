import React from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Info, ArrowRight, X, CheckCircle2 } from 'lucide-react';

interface ValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSafeMode: () => void;
  onFreeMode: () => void;
  issues: { type: 'error' | 'warning', message: string }[];
}

export default function ValidationModal({ isOpen, onClose, onSafeMode, onFreeMode, issues }: ValidationModalProps) {
  const t = useTranslations('Editor');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <Sparkles size={22} />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900">
              {t('validationTitle', { fallback: 'Design Review & Confirmation' })}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-4">
          {t('validationDesc', { fallback: 'Your design looks great! We noticed a small detail to help you get the best print quality:' })}
        </p>

        {/* Issues List Box */}
        <div className="bg-blue-50/60 rounded-2xl p-3.5 mb-5 max-h-48 overflow-y-auto border border-blue-100/80">
          <ul className="flex flex-col gap-2.5">
            {issues.map((issue, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed text-blue-950 font-medium">
                <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Options */}
        <div className="flex flex-col gap-3">
          {/* Option 1: Recommended Auto-fit */}
          <button 
            type="button"
            onClick={onSafeMode}
            className="flex items-center gap-3.5 w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl transition-all shadow-md shadow-blue-600/20 text-start group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
              <CheckCircle2 size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm sm:text-base leading-tight">
                {t('safeModeTitle', { fallback: 'Auto-fit to Safe Area (Recommended)' })}
              </div>
              <div className="text-xs text-blue-100/90 leading-normal mt-1">
                {t('safeModeDesc', { fallback: 'Automatically resize and center elements to fit perfectly within the print area.' })}
              </div>
            </div>
          </button>

          {/* Option 2: Keep current layout */}
          <button 
            type="button"
            onClick={onFreeMode}
            className="flex items-center gap-3.5 w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/90 p-4 rounded-2xl transition-all text-start group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-200/70 flex items-center justify-center text-slate-600 shrink-0 group-hover:bg-slate-300/70 transition-colors">
              <ArrowRight size={20} className="rtl:rotate-180" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xs sm:text-sm text-slate-800 leading-tight">
                {t('freeModeTitle', { fallback: 'Continue with Current Layout' })}
              </div>
              <div className="text-xs text-slate-500 leading-normal mt-0.5">
                {t('freeModeDesc', { fallback: 'Keep elements placed exactly as you arranged them.' })}
              </div>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
