import React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Shield, Unlock } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 text-orange-600">
            <AlertTriangle size={24} />
            <h3 className="text-xl font-bold">{t('validationTitle', { fallback: 'Design Review' })}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800">✕</button>
        </div>

        <p className="text-gray-600 text-sm mb-4">
          {t('validationDesc', { fallback: 'Your design looks great! However, we noticed a few details that might affect the final print quality.' })}
        </p>

        <div className="bg-orange-50/50 rounded-xl p-4 mb-6 max-h-48 overflow-y-auto border border-orange-100">
          <ul className="flex flex-col gap-2">
            {issues.map((issue, idx) => (
              <li key={idx} className="flex gap-2 text-sm">
                <span className={issue.type === 'error' ? 'text-red-500' : 'text-orange-500'}>•</span>
                <span className="text-gray-700">{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={onSafeMode}
            className="flex items-center gap-3 w-full bg-[var(--color-primary)] hover:opacity-90 text-white p-4 rounded-xl transition-colors text-left"
          >
            <Shield size={24} className="flex-shrink-0" />
            <div>
              <div className="font-bold">{t('safeModeTitle', { fallback: 'Auto Fix (Recommended)' })}</div>
              <div className="text-xs opacity-90">{t('safeModeDesc', { fallback: 'Automatically resize and center elements to fit perfectly within the safe print area.' })}</div>
            </div>
          </button>

          <button 
            onClick={onFreeMode}
            className="flex items-center gap-3 w-full bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-200 p-4 rounded-xl transition-colors text-left"
          >
            <Unlock size={24} className="text-gray-400 flex-shrink-0" />
            <div>
              <div className="font-bold">{t('freeModeTitle', { fallback: 'Keep as is (Free Mode)' })}</div>
              <div className="text-xs text-gray-500">{t('freeModeDesc', { fallback: 'I understand elements outside the safe area might be cropped. Print exactly as shown.' })}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
