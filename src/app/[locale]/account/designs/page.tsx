"use client";

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Link, useRouter } from '@/i18n/routing';
import { Trash2, Edit } from 'lucide-react';
import Image from 'next/image';

export default function DesignsPage() {
  const t = useTranslations('Account');
  const locale = useLocale();
  const router = useRouter();
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(
            collection(db, 'designs'), 
            where('user_id', '==', user.uid)
          );
          const snap = await getDocs(q);
          const designPromises = snap.docs.map(async (designDoc) => {
            const data = designDoc.data();
            let productName = 'Unknown Product';
            if (data.product_id) {
              const prodRef = doc(db, 'products', data.product_id);
              const prodSnap = await getDoc(prodRef);
              if (prodSnap.exists()) {
                const prodData = prodSnap.data();
                productName = prodData[`name_${locale}`] || prodData.name_en || productName;
              }
            }
            return {
              id: designDoc.id,
              ...data,
              productName,
            };
          });
          const resolvedDesigns = await Promise.all(designPromises);
          // Sort in JS to avoid requiring a composite index in Firestore
          resolvedDesigns.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          setDesigns(resolvedDesigns);
        } catch (error) {
          console.error("Error fetching designs:", error);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [locale]);

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteConfirm'))) {
      try {
        await deleteDoc(doc(db, 'designs', id));
        setDesigns(prev => prev.filter(d => d.id !== id));
      } catch (err) {
        console.error("Failed to delete design", err);
      }
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8 text-[var(--color-secondary)]">{t('designs')}</h1>
      
      {designs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border/50 text-center shadow-sm">
          <p className="text-gray-500 mb-6">{t('designsEmpty')}</p>
          <Link href="/" className="inline-block bg-[var(--color-primary)] text-white px-8 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity">
            {t('startShopping')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {designs.map(design => (
            <div key={design.id} className="bg-white border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="h-48 bg-gray-100 relative">
                {design.preview_image_url ? (
                  <img src={design.preview_image_url} alt="Design preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    No Preview
                  </div>
                )}
                {design.status === 'draft' && (
                  <span className="absolute top-2 ltr:right-2 rtl:left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                    Draft
                  </span>
                )}
                {design.status === 'saved' && (
                  <span className="absolute top-2 ltr:right-2 rtl:left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                    Saved
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg mb-1 truncate">{design.productName}</h3>
                <p className="text-sm text-gray-500 mb-3">
                  {new Date(design.updated_at).toLocaleDateString()}
                </p>
                <div className="flex justify-between items-center mt-4">
                  <span className="font-bold text-[var(--color-primary)]">{design.totalPrice} ₺</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => router.push(`/design-studio/${design.product_id}?designId=${design.id}`)}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
                      title={t('continueEditing')}
                    >
                      <Edit size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(design.id)}
                      className="p-2 bg-red-50 hover:bg-red-100 rounded-lg text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountTranslations() {
  return useTranslations('Account');
}
