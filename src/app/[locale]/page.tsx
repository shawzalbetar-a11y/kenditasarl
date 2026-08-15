import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import ProductGrid from '@/components/ui/ProductGrid';
import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';

import { getExpandedProducts } from '@/lib/products';

async function getFeaturedProducts() {
  if (!db) return [];
  try {
    const q = query(
      collection(db, 'products'),
      where('is_active', '==', true),
      orderBy('created_at', 'desc'),
      limit(8)
    );
    const snapshot = await getDocs(q);
    
    // We pass the docs array to getExpandedProducts
    const products = await getExpandedProducts(snapshot.docs);
    
    // Limit to 8 expanded products just in case one product had many colors
    return products.slice(0, 8);
  } catch (error) {
    console.error("Error fetching featured products:", error);
    return [];
  }
}

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('Home');
  const featuredProducts = await getFeaturedProducts();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Featured Products */}
      <section className="pt-8 pb-16 px-4 max-w-[100rem] mx-auto w-full">
        <ProductGrid 
          title={t('featuredProducts')}
          products={featuredProducts.map((p: any) => ({
            id: p.id,
            title: p[`name_${locale}`] || p.name_en,
            price: p.base_price,
            imageUrl: p.media?.front || 'https://via.placeholder.com/400x500?text=No+Image',
            adminBanner: p.badge
          }))}
          emptyMessage={t('noFeaturedProducts')}
        />
      </section>
    </div>
  );
}
