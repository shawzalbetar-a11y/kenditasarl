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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-secondary">{t('myAccount')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Navigation Sidebar */}
        <div className="col-span-1 flex flex-col gap-2 sticky top-24 self-start">
          <Link 
            href="/account" 
            className={`flex items-center gap-3 p-4 rounded-xl font-medium transition-colors ${
              pathname === '/account' 
                ? 'bg-[var(--color-primary)] text-white shadow-md' 
                : 'hover:bg-gray-100'
            }`}
          >
            <User size={20} />
            {t('profile')}
          </Link>
          <Link 
            href="/account/orders" 
            className={`flex items-center gap-3 p-4 rounded-xl font-medium transition-colors ${
              pathname.startsWith('/account/orders') 
                ? 'bg-[var(--color-primary)] text-white shadow-md' 
                : 'hover:bg-gray-100'
            }`}
          >
            <ShoppingBag size={20} />
            {t('orders')}
          </Link>
          <Link 
            href="/account/addresses" 
            className={`flex items-center gap-3 p-4 rounded-xl font-medium transition-colors ${
              pathname.startsWith('/account/addresses') 
                ? 'bg-[var(--color-primary)] text-white shadow-md' 
                : 'hover:bg-gray-100'
            }`}
          >
            <MapPin size={20} />
            {t('addresses')}
          </Link>
          <Link 
            href="/account/wishlists" 
            className={`flex items-center gap-3 p-4 rounded-xl font-medium transition-colors ${
              pathname.startsWith('/account/wishlists') 
                ? 'bg-[var(--color-primary)] text-white shadow-md' 
                : 'hover:bg-gray-100'
            }`}
          >
            <Heart size={20} />
            {t('wishlists')}
          </Link>
          <Link 
            href="/account/designs" 
            className={`flex items-center gap-3 p-4 rounded-xl font-medium transition-colors ${
              pathname.startsWith('/account/designs') 
                ? 'bg-[var(--color-primary)] text-white shadow-md' 
                : 'hover:bg-gray-100'
            }`}
          >
            <Brush size={20} />
            {t('designs')}
          </Link>
          <hr className="my-2 border-gray-200" />
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 p-4 rounded-xl font-medium transition-colors hover:bg-red-50 text-red-600 text-start w-full"
          >
            <LogOut size={20} />
            {t('logout', { fallback: 'Logout' })}
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
