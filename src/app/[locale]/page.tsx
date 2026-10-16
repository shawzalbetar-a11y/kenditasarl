import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import ProductGrid from '@/components/ui/ProductGrid';
import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';

import { getExpandedProducts } from '@/lib/products';

async function getFeaturedProducts() {
  if (!db) return [];
  try {
    // 1. Fetch products (resilient query avoiding missing composite index failures)
    const snapshot = await getDocs(collection(db, 'products'));
    
    // 2. Expand products with variants
    const products = await getExpandedProducts(snapshot.docs);
    
    // 3. Sort by newest creation date descending
    products.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });
    
    // Limit to 12 featured items
    return products.slice(0, 12);
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
