import { getTranslations } from 'next-intl/server';
import CategoryClient from '@/components/ui/CategoryClient';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { getExpandedProducts } from '@/lib/products';

async function getAllProducts() {
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    const products = await getExpandedProducts(snapshot.docs);
    
    // Sort by newest first
    products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return products;
  } catch (error) {
    console.error("Error fetching all products:", error);
    return [];
  }
}

export default async function AllProductsPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('Header');
  const products = await getAllProducts();

  return (
    <CategoryClient 
      initialProducts={products}
      categoryTitle={t('products', { fallback: 'جميع المنتجات' })}
    />
  );
}
