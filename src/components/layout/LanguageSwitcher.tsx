"use client";

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const switchLanguage = (newLocale: string) => {
    setIsOpen(false);
    if (newLocale !== locale) {
      document.cookie = `USER_EXPLICIT_LOCALE=${newLocale}; path=/; max-age=31536000`;
      
      if (pathname.includes('/design-studio')) {
        const event = new CustomEvent('force-save-design');
        window.dispatchEvent(event);
        setTimeout(() => {
          window.location.replace(`/${newLocale}${pathname.replace(/^\/(tr|ar|en)/, '')}`);
        }, 300);
      } else {
        window.location.replace(`/${newLocale}${pathname.replace(/^\/(tr|ar|en)/, '')}`);
      }
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 p-1.5 rounded-full hover:bg-gray-100/80 hover:text-primary transition-colors focus:outline-none cursor-pointer"
        aria-label="Change Language"
      >
        <Globe className="w-6 h-6 stroke-[2.2]" />
        <span className="text-[15px] lg:text-[16px] font-extrabold uppercase tracking-wider">{locale}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-32 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-xl overflow-hidden z-50 ltr:right-0 rtl:left-0 py-1.5">
          <button
            onClick={() => switchLanguage('tr')}
            className={`w-full text-start px-4 py-2.5 text-base hover:bg-orange-50 transition-colors ${locale === 'tr' ? 'font-black text-primary bg-orange-50/50' : 'font-bold text-textPrimary'}`}
          >
            Türkçe
          </button>
          <button
            onClick={() => switchLanguage('ar')}
            className={`w-full text-start px-4 py-2.5 text-base hover:bg-orange-50 transition-colors ${locale === 'ar' ? 'font-black text-primary bg-orange-50/50' : 'font-bold text-textPrimary'}`}
          >
            العربية
          </button>
          <button
            onClick={() => switchLanguage('en')}
            className={`w-full text-start px-4 py-2.5 text-base hover:bg-orange-50 transition-colors ${locale === 'en' ? 'font-black text-primary bg-orange-50/50' : 'font-bold text-textPrimary'}`}
          >
            English
          </button>
        </div>
      )}
    </div>
  );
}
