'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/routing';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { User, MapPin, Heart, ShoppingBag, Loader2, Brush, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname(); // Using next-intl usePathname so it doesn't include the locale prefix
  const t = useTranslations('Account');
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
        setLoading(false);
      } else {
        setIsAuthenticated(false);
        setLoading(false);
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  // Prevent flash of content before redirecting
  if (!isAuthenticated) {
    return null; 
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 md:py-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-8 text-secondary">{t('myAccount')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8">
        
        {/* Navigation Sidebar: Horizontal scrollable pills on mobile, vertical sticky sidebar on desktop */}
        <div className="col-span-1 flex flex-row md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none md:sticky md:top-32 md:self-start">
          <Link 
            href="/account" 
            className={`flex items-center gap-2.5 px-4 py-2.5 md:p-4 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 text-sm md:text-base ${
              pathname === '/account' 
                ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                : 'bg-white md:bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-200/70 md:border-0'
            }`}
          >
            <User size={18} className="shrink-0" />
            <span>{t('profile')}</span>
          </Link>
          <Link 
            href="/account/orders" 
            className={`flex items-center gap-2.5 px-4 py-2.5 md:p-4 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 text-sm md:text-base ${
              pathname.startsWith('/account/orders') 
                ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                : 'bg-white md:bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-200/70 md:border-0'
            }`}
          >
            <ShoppingBag size={18} className="shrink-0" />
            <span>{t('orders')}</span>
          </Link>
          <Link 
            href="/account/addresses" 
            className={`flex items-center gap-2.5 px-4 py-2.5 md:p-4 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 text-sm md:text-base ${
              pathname.startsWith('/account/addresses') 
                ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                : 'bg-white md:bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-200/70 md:border-0'
            }`}
          >
            <MapPin size={18} className="shrink-0" />
            <span>{t('addresses')}</span>
          </Link>
          <Link 
            href="/account/wishlists" 
            className={`flex items-center gap-2.5 px-4 py-2.5 md:p-4 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 text-sm md:text-base ${
              pathname.startsWith('/account/wishlists') 
                ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                : 'bg-white md:bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-200/70 md:border-0'
            }`}
          >
            <Heart size={18} className="shrink-0" />
            <span>{t('wishlists')}</span>
          </Link>
          <Link 
            href="/account/designs" 
            className={`flex items-center gap-2.5 px-4 py-2.5 md:p-4 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 text-sm md:text-base ${
              pathname.startsWith('/account/designs') 
                ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                : 'bg-white md:bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-200/70 md:border-0'
            }`}
          >
            <Brush size={18} className="shrink-0" />
            <span>{t('designs')}</span>
          </Link>
          
          <hr className="hidden md:block my-2 border-gray-200" />
          
          <button 
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-4 py-2.5 md:p-4 rounded-xl font-medium transition-all whitespace-nowrap shrink-0 text-sm md:text-base bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/60 md:border-0 text-start cursor-pointer md:w-full"
          >
            <LogOut size={18} className="shrink-0" />
            <span>{t('logout', { fallback: 'Logout' })}</span>
          </button>
        </div>

        {/* Dynamic Content */}
        <div className="col-span-1 md:col-span-3">
          {children}
        </div>

      </div>
    </div>
  );
}
