import { getTranslations } from 'next-intl/server';
import CategoryClient from '@/components/ui/CategoryClient';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

import { getExpandedProducts } from '@/lib/products';

async function getMugs() {
  if (!db) return [];
  try {
    const q1 = query(collection(db, 'products'), where('category_id', '==', 'mugs'));
    const q2 = query(collection(db, 'products'), where('category', '==', 'mugs'));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const docMap = new Map();
    snap1.docs.forEach(doc => docMap.set(doc.id, doc));
    snap2.docs.forEach(doc => docMap.set(doc.id, doc));
    
    const products = await getExpandedProducts(Array.from(docMap.values()));
    
    // Sort by newest first
    products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return products;
  } catch (error) {
    console.error("Error fetching mugs:", error);
    return [];
  }
}

export default async function MugsPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('Categories');
  const products = await getMugs();

  return (
    <CategoryClient 
      initialProducts={products}
      categoryTitle={t('mugsTitle')}
      categoryDesc={t('mugsDesc')}
    />
  );
}
