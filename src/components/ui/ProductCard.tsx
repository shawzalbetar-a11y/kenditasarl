"use client";

import { useTranslations } from 'next-intl';
import { Heart, Share2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AuthModal from '@/components/auth/AuthModal';

interface ProductCardProps {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  adminBanner?: string;
}

export default function ProductCard({ id, title, price, imageUrl, adminBanner }: ProductCardProps) {
  const t = useTranslations('ProductCard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Parse baseId and query string (e.g. "prod_123?color=%23000000&type=blank")
  const [baseId, queryPart] = id.includes('?') ? id.split('?') : [id, ''];
  const productHref = queryPart ? `/products/${baseId}?${queryPart}` : `/products/${baseId}`;
  const designStudioHref = queryPart ? `/design-studio/${baseId}?${queryPart}` : `/design-studio/${baseId}`;
  const isBlankCustomizable = id.includes('type=blank') || (adminBanner && (adminBanner.includes('صمم بنفسك') || adminBanner.includes('Kendin Tasarla') || adminBanner.includes('Design Yourself') || adminBanner === 'CUSTOMIZABLE_BADGE'));

  // Helper to translate adminBanner to the current locale
  const getTranslatedBanner = (banner?: string) => {
    if (!banner) return null;
    const lower = banner.toLowerCase();
    if (lower.includes('صمم بنفسك') || lower.includes('design yourself') || lower.includes('kendin tasarla') || banner === 'CUSTOMIZABLE_BADGE') {
      return t('customizableBadge');
    }
    if (lower.includes('جاهز') || lower.includes('ready') || lower.includes('hazır')) {
      return t('readyBadge');
    }
    if (lower.includes('çok satan') || lower.includes('best seller') || lower.includes('الاكثر')) return t('bestSeller');
    if (lower.includes('yeni') || lower.includes('new') || lower.includes('جديد')) return t('new');
    if (lower.includes('i̇ndi̇ri̇m') || lower.includes('indirim') || lower.includes('sale') || lower.includes('تنزيلات')) return t('sale');
    return banner; // Fallback to the original text
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUserId(user?.uid || null);
      if (user?.uid) {
        try {
          const wishDoc = await getDoc(doc(db, 'wishlists', `${user.uid}_${baseId}`));
          setIsFavorited(wishDoc.exists());
        } catch (err) {
          console.error(err);
        }
      } else {
        setIsFavorited(false);
      }
    });
    return () => unsubscribe();
  }, [baseId]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) {
      setIsAuthModalOpen(true);
      return;
    }
    
    setIsToggling(true);
    try {
      const docRef = doc(db, 'wishlists', `${userId}_${baseId}`);
      if (isFavorited) {
        await deleteDoc(docRef);
        setIsFavorited(false);
      } else {
        await setDoc(docRef, {
          user_id: userId,
          product_id: baseId,
          created_at: new Date().toISOString()
        });
        setIsFavorited(true);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error saving to wishlist: ' + err.message);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <>
      <div className="group relative w-full max-w-sm rounded-2xl bg-white border border-border/50 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col">
        {/* Top Badges / Banners */}
        <div className="absolute top-4 start-4 z-10 flex flex-col gap-2">
          {isBlankCustomizable ? (
            <span className="text-white text-xs font-bold px-3 py-1 rounded-full shadow-md uppercase bg-gradient-to-r from-purple-600 to-indigo-600">
              {t('customizableBadge')}
            </span>
          ) : adminBanner ? (
            <span className="text-white text-xs font-bold px-3 py-1 rounded-full shadow-md uppercase bg-[var(--color-action)]">
              {getTranslatedBanner(adminBanner)}
            </span>
          ) : null}
        </div>

        {/* Top Action Icons (Transparent overlay) */}
        <div className="absolute top-4 end-4 z-20 flex flex-col gap-2 opacity-100 translate-x-0 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-300 lg:translate-x-4 lg:group-hover:translate-x-0">
          <Link 
            href={designStudioHref}
            title={t('edit')}
            className="p-2 bg-white/80 backdrop-blur-md rounded-full text-zinc-700 hover:text-[var(--color-primary)] transition-colors shadow-sm flex items-center justify-center"
          >
            <Edit2 size={16} />
          </Link>
          <button 
            onClick={toggleFavorite}
            disabled={isToggling}
            title={t('favorite')}
            className={cn(
              "p-2 bg-white/80 backdrop-blur-md rounded-full transition-colors shadow-sm",
              isFavorited ? "text-red-500" : "text-zinc-700 hover:text-red-500",
              isToggling && "opacity-50 cursor-not-allowed"
            )}
          >
            <Heart size={16} fill={isFavorited ? "currentColor" : "none"} />
          </button>
          <button title={t('share')} className="p-2 bg-white/80 backdrop-blur-md rounded-full text-zinc-700 hover:text-blue-500 transition-colors shadow-sm flex items-center justify-center">
            <Share2 size={16} />
          </button>
        </div>

        {/* Product Image */}
        <Link href={productHref} className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100 block">
          <img
            src={imageUrl}
            alt={title}
            className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-700 ease-in-out"
          />
        </Link>

        {/* Product Details */}
        <div className="p-5 flex flex-col grow">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-lg line-clamp-1 text-zinc-900">{title}</h3>
            <span className="font-bold text-lg text-[var(--color-primary)]">
              {price}₺
            </span>
          </div>

          <div className="mt-auto pt-4">
            <Link 
              href={productHref}
              className={cn(
                "w-full flex items-center justify-center gap-2 text-white py-3 px-4 rounded-xl font-bold transition-all hover:-translate-y-1 shadow-md hover:shadow-lg",
                isBlankCustomizable 
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700" 
                  : "bg-[var(--color-primary)] hover:bg-opacity-90"
              )}
            >
              {isBlankCustomizable ? t('customizeAndDetails') : t('details')}
            </Link>
          </div>
        </div>
      </div>
      
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={() => setIsAuthModalOpen(false)} 
      />
    </>
  );
}
