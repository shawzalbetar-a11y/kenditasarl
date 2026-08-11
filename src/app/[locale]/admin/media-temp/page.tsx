"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

const ANGLE_SORT_MAP: Record<string, number> = {
  front: 1,
  back: 2,
  left: 3,
  right: 4
};

export default function AdminMediaTempPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchProducts() {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const prods = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(prods);
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const handleUpload = async (productId: string, angle: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const uploadKey = `${productId}-${angle}`;
    setUploading(prev => ({ ...prev, [uploadKey]: true }));

    try {
      // 1. Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to upload image');
      const { url } = await res.json();

      // 2. Save to Firestore in new structure
      const mediaRef = doc(db, 'products', productId, 'media', angle);
      await setDoc(mediaRef, {
        url,
        media_type: 'image',
        angle,
        sort_order: ANGLE_SORT_MAP[angle]
      }, { merge: true });

      alert(`تم رفع وتحديث الصورة للزاوية (${angle}) بنجاح!`);
    } catch (err: any) {
      alert("حدث خطأ أثناء الرفع: " + err.message);
    } finally {
      setUploading(prev => ({ ...prev, [uploadKey]: false }));
      // Reset input
      e.target.value = '';
    }
  };

  if (loading) return <div className="p-10 text-center">جاري التحميل...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto min-h-screen">
      <div className="bg-red-100 text-red-800 p-4 rounded-lg mb-8 border border-red-200">
        <h2 className="font-bold text-lg mb-2">⚠️ تنبيه أمني: أداة مؤقتة للتطوير</h2>
        <p>هذه الصفحة عبارة عن أداة مؤقتة لرفع الوسائط لتسهيل عملية التطوير والاختبار. لا تحتوي على أي نظام حماية (صلاحيات)، وسيتم استبدالها لاحقاً بلوحة تحكم إدارة كاملة ومحمية في المرحلة 5.</p>
      </div>

      <h1 className="text-3xl font-bold mb-8">إدارة صور المنتجات (أداة مؤقتة)</h1>

      <div className="space-y-6">
        {products.map(prod => (
          <div key={prod.id} className="bg-white border rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-2">{prod.name_ar || prod.name_en} <span className="text-sm font-normal text-gray-500">({prod.id})</span></h2>
            <p className="text-sm text-gray-600 mb-6">SKU: {prod.sku} | Category: {prod.category_id}</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {['front', 'back', 'left', 'right'].map(angle => (
                <div key={angle} className="border rounded-lg p-4 flex flex-col items-center justify-center bg-gray-50">
                  <span className="font-bold uppercase text-gray-700 mb-4">{angle}</span>
                  
                  <label className="cursor-pointer relative">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => handleUpload(prod.id, angle, e)}
                      disabled={uploading[`${prod.id}-${angle}`]}
                    />
                    <div className={`px-4 py-2 rounded-md font-bold text-sm text-white text-center transition-colors ${
                      uploading[`${prod.id}-${angle}`] 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}>
                      {uploading[`${prod.id}-${angle}`] ? 'جاري الرفع...' : 'اختر صورة'}
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
