"use client";

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getProductFrontImage } from '@/lib/products';
import { useTranslations } from 'next-intl';
import { Loader2, Shirt, ShoppingBag, Coffee, ArrowRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import Image from 'next/image';

interface ProductSelectorProps {
  onSelectProduct: (productId: string) => void;
}

const CATEGORIES = [
  { id: 'tshirts', icon: Shirt, labelKey: 'tshirts' },
  { id: 'hoodies', icon: Shirt, labelKey: 'hoodies' },
  { id: 'hats', icon: ShoppingBag, labelKey: 'hats' },
  { id: 'mugs', icon: Coffee, labelKey: 'mugs' },
];

export default function ProductSelector({ onSelectProduct }: ProductSelectorProps) {
  const t = useTranslations('Editor');
  const tNav = useTranslations('Header');
  const locale = useLocale();
  const [activeCategory, setActiveCategory] = useState<string>('tshirts');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchProducts() {
      if (!db) return;
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'products'));
        
        const matchedDocs = snap.docs.filter(doc => {
          const d = doc.data();
          if (d.is_active === false || d.isActive === false) return false;
          const cat = (d.category_id || d.category || '').toLowerCase().trim();
          const target = activeCategory.toLowerCase().trim();
          return cat === target || (target === 'tshirts' && cat === 't-shirts');
        });

        const fetchedProducts = await Promise.all(
          matchedDocs.map(async (doc) => {
            const data = doc.data();
            const frontImage = await getProductFrontImage(doc.id);
            return {
              id: doc.id,
              name: data[`name_${locale}`] || data.name_en || data.name_ar || 'Product',
              price: data.base_price || 0,
              image: frontImage,
            };
          })
        );
        setProducts(fetchedProducts);
      } catch (err) {
        console.error("Error fetching products for selector:", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchProducts();
  }, [activeCategory, locale]);

  return (
    <div className="w-full max-w-5xl mx-auto bg-white rounded-3xl shadow-lg border border-border overflow-hidden flex flex-col md:flex-row min-h-[600px]">
      
      {/* Sidebar Categories */}
      <div className="w-full md:w-64 bg-gray-50 p-6 border-b md:border-b-0 md:border-r md:rtl:border-l md:rtl:border-r-0 border-border">
        <h2 className="text-xl font-bold text-gray-900 mb-6">{t('selectCategory', { fallback: 'Select Category' })}</h2>
        <div className="flex md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap md:whitespace-normal font-medium ${
                activeCategory === cat.id 
                  ? 'bg-[var(--color-primary)] text-white shadow-md' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <cat.icon className="w-5 h-5" />
              {tNav(cat.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="flex-1 p-6 md:p-8 bg-gray-50/50">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t('chooseProductToDesign', { fallback: 'Choose a product to design' })}</h2>
            <p className="text-gray-500 mt-1">{t('chooseProductDesc', { fallback: 'Select any product below to start adding your custom text, images, and stickers.' })}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
                <div className="w-full aspect-[4/5] bg-gray-200 rounded-xl mb-4"></div>
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(product => (
              <div 
                key={product.id} 
                onClick={() => onSelectProduct(product.id)}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-xl hover:border-[var(--color-primary)] transition-all group relative overflow-hidden"
              >
                <div className="relative w-full aspect-[4/5] bg-gray-50 rounded-xl mb-4 overflow-hidden flex items-center justify-center p-4">
                  <Image 
                    src={product.image} 
                    alt={product.name}
                    fill
                    className="object-contain group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <h3 className="font-bold text-gray-900 truncate">{product.name}</h3>
                <p className="text-[var(--color-primary)] font-bold">{product.price} ₺</p>
                
                <div className="absolute inset-0 bg-[var(--color-primary)]/90 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl">
                  <ArrowRight className="text-white w-10 h-10 mb-2 rtl:rotate-180" />
                  <span className="text-white font-bold">{t('startDesigning', { fallback: 'Start Designing' })}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('noProductsFound', { fallback: 'No products found' })}</h3>
            <p className="text-gray-500">{t('checkAnotherCategory', { fallback: 'Please check another category.' })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
