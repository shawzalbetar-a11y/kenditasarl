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
        className="flex items-center gap-1 hover:text-primary transition-colors focus:outline-none"
        aria-label="Change Language"
      >
        <Globe className="w-5 h-5" />
        <span className="text-sm font-medium uppercase">{locale}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-24 bg-white border border-border rounded-md shadow-lg overflow-hidden z-50 ltr:right-0 rtl:left-0">
          <button
            onClick={() => switchLanguage('tr')}
            className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${locale === 'tr' ? 'font-bold text-primary' : 'text-textPrimary'}`}
          >
            Türkçe
          </button>
          <button
            onClick={() => switchLanguage('ar')}
            className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${locale === 'ar' ? 'font-bold text-primary' : 'text-textPrimary'}`}
          >
            العربية
          </button>
          <button
            onClick={() => switchLanguage('en')}
            className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${locale === 'en' ? 'font-bold text-primary' : 'text-textPrimary'}`}
          >
            English
          </button>
        </div>
      )}
    </div>
  );
}
