"use client";

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Search, ShoppingCart, User, Menu, X } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AuthModal from '@/components/auth/AuthModal';
import { usePathname } from 'next/navigation';

export default function Header() {
  const t = useTranslations('Header');
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const pathname = usePathname();
  const isDesignStudio = pathname.includes('/design-studio');

  // Close mobile navigation drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let unsubscribeCart: () => void;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Enforce onboarding check globally
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (!userDocSnap.exists() || !userDocSnap.data().full_name || (!userDocSnap.data().email && !userDocSnap.data().phone)) {
            setIsAuthModalOpen(true);
          }
        } catch (err) {
          console.error("Error checking user profile:", err);
        }

        const q = query(collection(db, 'cart_items'), where('user_id', '==', currentUser.uid));
        unsubscribeCart = onSnapshot(q, (snapshot) => {
          let count = 0;
          snapshot.forEach((doc) => {
            count += doc.data().quantity || 1;
          });
          setCartCount(count);
        }, (error) => {
          console.error("Cart snapshot error:", error);
        });
      } else {
        setCartCount(0);
        if (unsubscribeCart) unsubscribeCart();
      }
    });
    
    return () => {
      unsubscribeAuth();
      if (unsubscribeCart) unsubscribeCart();
    };
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 20);

      if (window.innerWidth >= 768) {
        // Desktop: Hide if scrolled past 50px (hover logic will override visibility)
        setIsHidden(currentScrollY > 50);
      } else {
        // Mobile: Hide on scroll down in design studio
        if (isDesignStudio) {
          setIsHidden(currentScrollY > lastScrollY && currentScrollY > 100);
        } else {
          setIsHidden(false);
        }
      }
      
      lastScrollY = currentScrollY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth >= 768) {
        // Show header if mouse is in the top 150px
        setIsHovering(e.clientY < 150);
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDesignStudio]);

  const handleAccountClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) {
      router.push('/account');
    } else {
      setIsAuthModalOpen(true);
    }
  };

  const shouldHide = isHidden && !isHovering;

  return (
    <>
      <header className={`fixed top-1 md:top-3 left-0 right-0 z-50 w-full px-2 sm:px-4 lg:px-8 transition-all duration-500 flex flex-col items-center pointer-events-none ${shouldHide ? '-translate-y-[150%] opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div 
          className={`pointer-events-auto w-full max-w-[1720px] flex flex-col rounded-[2rem] border transition-all duration-500 shadow-xl ${
          isScrolled || isHovering
            ? 'bg-white/70 backdrop-blur-2xl border-white/40 shadow-black/5' 
            : 'bg-white/95 backdrop-blur-xl border-white/60 shadow-black/8'
        }`}
      >
        {/* Announcement Bar (Collapsed completely on Design Studio) */}
        {!isDesignStudio && (
          <div className={`transition-all duration-500 text-center py-2 text-xs font-bold px-4 flex items-center justify-center rounded-t-[2rem] tracking-wide ${
            (isScrolled || isHovering) ? 'bg-primary/90 text-white shadow-xs' : 'bg-primary text-white'
          }`}>
            {t('announcement')}
          </div>
        )}

        <div className="px-5 sm:px-8">
          <div className="flex justify-between items-center h-16 md:h-18">
            
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center">
                <img src="/images/logo.png" alt="Kenditasarl Logo" className={`w-auto object-contain transition-all duration-500 ${isScrolled ? 'h-8 md:h-10' : 'h-10 md:h-12'}`} />
              </Link>
            </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8 rtl:space-x-reverse">
            <Link href="/tshirts" className="text-gray-800 hover:text-primary transition-colors font-bold text-sm tracking-wide">
              {t('tshirts')}
            </Link>
            <Link href="/hats" className="text-gray-800 hover:text-primary transition-colors font-bold text-sm tracking-wide">
              {t('hats')}
            </Link>
            <Link href="/mugs" className="text-gray-800 hover:text-primary transition-colors font-bold text-sm tracking-wide">
              {t('mugs')}
            </Link>
            <Link href="/design-studio" className="bg-orange-50 hover:bg-orange-100 text-primary border border-orange-200 px-3.5 py-1.5 rounded-full transition-all font-black text-sm tracking-wide hover:scale-105 active:scale-95 shadow-2xs">
              ✨ {t('designYourself')}
            </Link>
          </nav>

          {/* Icons / Actions */}
          <div className="hidden md:flex items-center space-x-6 rtl:space-x-reverse">
            <button className="text-gray-700 hover:text-primary transition-colors p-1.5 rounded-full hover:bg-gray-100/80 cursor-pointer" aria-label={t('search')}>
              <Search className="w-5 h-5 stroke-[2.2]" />
            </button>
            <LanguageSwitcher />
            <button onClick={handleAccountClick} className="text-gray-700 hover:text-primary transition-colors p-1.5 rounded-full hover:bg-gray-100/80 cursor-pointer" aria-label={t('account')}>
              <User className="w-5 h-5 stroke-[2.2]" />
            </button>
            <Link href="/cart" className="text-gray-700 hover:text-primary transition-colors relative p-1.5 rounded-full hover:bg-gray-100/80 cursor-pointer" aria-label={t('cart')}>
              <ShoppingCart className="w-5 h-5 stroke-[2.2]" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-offer text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden gap-4">
            <LanguageSwitcher />
            <Link href="/cart" className="text-textPrimary relative">
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-offer text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-textPrimary hover:text-primary"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden mt-2 pointer-events-auto w-full max-w-6xl rounded-[2rem] bg-white/80 backdrop-blur-xl border border-white/50 shadow-lg overflow-hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 flex flex-col">
            <Link 
              href="/tshirts" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-textPrimary hover:bg-gray-50 hover:text-primary"
            >
              {t('tshirts')}
            </Link>
            <Link 
              href="/hats" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-textPrimary hover:bg-gray-50 hover:text-primary"
            >
              {t('hats')}
            </Link>
            <Link 
              href="/mugs" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-textPrimary hover:bg-gray-50 hover:text-primary"
            >
              {t('mugs')}
            </Link>
            <Link 
              href="/design-studio" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-bold text-accent hover:bg-gray-50"
            >
              {t('designYourself')}
            </Link>
            <div className="border-t border-border my-2"></div>
            <button onClick={(e) => { handleAccountClick(e); setIsMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium text-textPrimary hover:bg-gray-50 w-full text-left">
              <User className="w-5 h-5" /> {t('account')}
            </button>
          </div>
        </div>
      )}
      </header>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={() => {
          setIsAuthModalOpen(false);
          router.push('/account');
        }} 
      />
    </>
  );
}
