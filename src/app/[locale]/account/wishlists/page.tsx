"use client";

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Link } from '@/i18n/routing';
import ProductGrid from '@/components/ui/ProductGrid';
import { getProductFrontImage } from '@/lib/products';

export default function WishlistsPage() {
  const t = useTranslations('Account');
  const tc = useTranslations('Categories');
  const locale = useLocale();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(collection(db, 'wishlists'), where('user_id', '==', user.uid));
          const snap = await getDocs(q);
          const productPromises = snap.docs.map(async (wishDoc) => {
            const data = wishDoc.data();
            const prodRef = doc(db, 'products', data.product_id);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const prodData = prodSnap.data();
              const frontImage = await getProductFrontImage(prodSnap.id);
              return {
                id: prodSnap.id,
                title: prodData[`name_${locale}`] || prodData.name_en,
                price: prodData.base_price,
                imageUrl: frontImage || 'https://via.placeholder.com/400x500?text=No+Image',
                adminBanner: prodData.badge
              };
            }
            return null;
          });
          const resolvedProducts = (await Promise.all(productPromises)).filter(Boolean);
          setProducts(resolvedProducts);
        } catch (error) {
          console.error("Error fetching wishlists:", error);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [locale]);

  if (loading) {
    return <div className="text-center py-20">{tc('loading') || 'Loading...'}</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8 text-[var(--color-secondary)]">{t('wishlists')}</h1>
      
      {products.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border/50 text-center shadow-sm">
          <p className="text-gray-500 mb-6">{t('wishlistsEmpty')}</p>
          <Link href="/" className="inline-block bg-[var(--color-primary)] text-white px-8 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity">
            {t('startShopping')}
          </Link>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}

// Helper components for translations
function AccountTranslations() {
  return useTranslations('Account');
}
function CategoriesTranslations() {
  return useTranslations('Categories');
}
