import { getTranslations } from 'next-intl/server';
import CategoryClient from '@/components/ui/CategoryClient';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

import { getExpandedProducts } from '@/lib/products';

async function getHats() {
  if (!db) return [];
  try {
    const q1 = query(collection(db, 'products'), where('category_id', '==', 'hats'));
    const q2 = query(collection(db, 'products'), where('category', '==', 'hats'));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const docMap = new Map();
    snap1.docs.forEach(doc => docMap.set(doc.id, doc));
    snap2.docs.forEach(doc => docMap.set(doc.id, doc));
    
    const products = await getExpandedProducts(Array.from(docMap.values()));
    
    // Sort by newest first
    products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return products;
  } catch (error) {
    console.error("Error fetching hats:", error);
    return [];
  }
}

export default async function HatsPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('Categories');
  const products = await getHats();

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-28 pb-16 px-4 md:px-8">
      <div className="max-w-[100rem] mx-auto flex flex-col gap-8">
        
        {/* Header Section */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-secondary)]">{t('hatsTitle')}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t('hatsDesc')}</p>
          </div>
        </div>

        <CategoryClient initialProducts={products} categoryTitle={t('hats')} />
        
      </div>
    </div>
  );
}
