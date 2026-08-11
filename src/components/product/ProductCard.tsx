import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Edit2, Heart, Share2, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AuthModal from '@/components/auth/AuthModal';

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  hoverImageUrl?: string;
  badge?: 'new' | 'sale';
  inStock?: boolean;
}

export default function ProductCard({
  id,
  name,
  price,
  imageUrl,
  hoverImageUrl,
  badge,
  inStock = true,
}: ProductCardProps) {
  const t = useTranslations('ProductCard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUserId(user?.uid || null);
      if (user?.uid) {
        try {
          const wishDoc = await getDoc(doc(db, 'wishlists', `${user.uid}_${id}`));
          setIsFavorited(wishDoc.exists());
        } catch (err) {
          console.error(err);
        }
      } else {
        setIsFavorited(false);
      }
    });
    return () => unsubscribe();
  }, [id]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) {
      setIsAuthModalOpen(true);
      return;
    }
    
    setIsToggling(true);
    try {
      const docRef = doc(db, 'wishlists', `${userId}_${id}`);
      if (isFavorited) {
        await deleteDoc(docRef);
        setIsFavorited(false);
      } else {
        await setDoc(docRef, {
          user_id: userId,
          product_id: id,
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
      <div className="group relative bg-white border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300">
      
      {/* Badges */}
      {badge && (
        <div className={`absolute top-2 z-10 px-2 py-1 text-xs font-bold text-white rounded-md ${badge === 'new' ? 'bg-accent ltr:left-2 rtl:right-2' : 'bg-offer ltr:left-2 rtl:right-2'}`}>
          {badge === 'new' ? t('new') : t('sale')}
        </div>
      )}

      {/* Top Action Icons */}
      <div className="absolute top-2 z-10 flex flex-col gap-2 ltr:right-2 rtl:left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <Link 
          href={`/design-studio/${id}`} 
          className="bg-white p-2 rounded-full shadow-md text-textSecondary hover:text-primary transition-colors flex items-center justify-center" 
          title={t('edit')}
        >
          <Edit2 className="w-4 h-4" />
        </Link>
        <button 
          onClick={toggleFavorite}
          disabled={isToggling}
          className={`bg-white p-2 rounded-full shadow-md transition-colors disabled:opacity-50 ${isFavorited ? 'text-offer' : 'text-textSecondary hover:text-offer'}`} 
          title={t('favorite')}
        >
          <Heart className="w-4 h-4" fill={isFavorited ? "currentColor" : "none"} />
        </button>
        <button className="bg-white p-2 rounded-full shadow-md text-textSecondary hover:text-primary transition-colors" title={t('share')}>
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Product Image */}
      <Link href={`/product/${id}`} className="block relative h-64 overflow-hidden bg-gray-100">
        <Image 
          src={imageUrl} 
          alt={name} 
          fill
          className={`object-cover transition-transform duration-500 group-hover:scale-105 ${hoverImageUrl ? 'group-hover:opacity-0' : ''}`}
        />
        {hoverImageUrl && (
          <Image 
            src={hoverImageUrl} 
            alt={`${name} alt view`} 
            fill
            className="object-cover absolute top-0 left-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          />
        )}
        {!inStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm">
            <span className="bg-secondary text-white px-4 py-2 font-bold rounded-md">{t('outOfStock')}</span>
          </div>
        )}
      </Link>

      {/* Product Info */}
      <div className="p-4 flex flex-col gap-2">
        <Link href={`/product/${id}`}>
          <h3 className="font-semibold text-lg text-textPrimary hover:text-primary transition-colors line-clamp-1">{name}</h3>
        </Link>
        <p className="font-bold text-lg text-primary">{price.toLocaleString()} ₺</p>
        
        {/* Design and order via WhatsApp */}
        <a 
          href={`https://wa.me/?text=I%20want%20to%20order%20product%20${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white py-2 rounded-md font-medium transition-colors text-sm"
        >
          <MessageCircle className="w-4 h-4" />
          {t('designAndOrder')}
        </a>
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
