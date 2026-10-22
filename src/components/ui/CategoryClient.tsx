"use client";

import React, { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import ProductGrid from '@/components/ui/ProductGrid';

interface Product {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  adminBanner?: string;
  colors?: string[];
  created_at?: string;
  sales_count?: number;
}

interface CategoryClientProps {
  initialProducts: any[];
  categoryTitle: string;
}

const AVAILABLE_COLORS = [
  { id: 'white', class: 'bg-white' },
  { id: 'black', class: 'bg-black' },
  { id: 'blue', class: 'bg-blue-500' },
  { id: 'red', class: 'bg-red-500' },
];

export default function CategoryClient({ initialProducts, categoryTitle }: CategoryClientProps) {
  const t = useTranslations('Categories');
  const locale = useLocale();

  const [priceRange, setPriceRange] = useState<number>(2300);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('newest');

  // Format products to match ProductGrid requirements and add defaults for filtering
  const formattedProducts: Product[] = useMemo(() => {
    return initialProducts.map(p => ({
      id: p.id,
      title: p[`name_${locale}`] || p.name_en,
      price: p.base_price || 0,
      imageUrl: p.media?.front || 'https://via.placeholder.com/400x500?text=No+Image',
      adminBanner: p.badge,
      colors: p.colors || [], // fallback array if colors don't exist yet
      created_at: p.created_at || new Date().toISOString(),
      sales_count: p.sales_count || 0,
    }));
  }, [initialProducts, locale]);

  // Apply filters and sorting
  const filteredProducts = useMemo(() => {
    let result = [...formattedProducts];

    // 1. Price Filter
    result = result.filter(p => p.price <= priceRange);

    // 2. Color Filter
    if (selectedColors.length > 0) {
      result = result.filter(p => {
        // If the product has no colors defined, don't hide it for now (user request)
        if (!p.colors || p.colors.length === 0) return true; 
        return selectedColors.some(c => p.colors!.includes(c));
      });
    }

    // 3. Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'priceAsc':
          return a.price - b.price;
        case 'priceDesc':
          return b.price - a.price;
        case 'bestSelling':
          return (b.sales_count || 0) - (a.sales_count || 0);
        case 'newest':
        default:
          return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime();
      }
    });

    return result;
  }, [formattedProducts, priceRange, selectedColors, sortBy]);

  const toggleColor = (colorId: string) => {
    setSelectedColors(prev => 
      prev.includes(colorId) 
        ? prev.filter(c => c !== colorId)
        : [...prev, colorId]
    );
  };

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      <div className="flex justify-between items-end mb-8 border-b border-border pb-4">
        <h1 className="text-3xl font-bold text-secondary">{categoryTitle}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-secondary)]">{t('sort')}:</span>
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="newest">{t('newest')}</option>
            <option value="priceAsc">{t('priceAsc')}</option>
            <option value="priceDesc">{t('priceDesc')}</option>
            <option value="bestSelling">{t('bestSelling')}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Sidebar Filters */}
        <div className="w-full md:w-1/4">
          <div className="bg-white border border-border rounded-lg p-4 sticky top-24">
            <h2 className="font-bold text-lg mb-4">{t('filters')}</h2>
            
            <div className="mb-6">
              <h3 className="font-semibold mb-2">{t('colorFilter')}</h3>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_COLORS.map(color => (
                  <button 
                    key={color.id}
                    onClick={() => toggleColor(color.id)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${color.class} ${
                      selectedColors.includes(color.id) 
                        ? 'border-primary scale-110 shadow-sm' 
                        : 'border-gray-300 opacity-70 hover:opacity-100'
                    }`}
                    title={color.id}
                  />
                ))}
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">{t('priceFilter')}</h3>
                <span className="text-sm font-bold text-primary">{priceRange} ₺</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="2300" 
                step="50"
                value={priceRange}
                onChange={(e) => setPriceRange(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)] cursor-pointer" 
              />
              <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mt-1">
                <span>0 ₺</span>
                <span>2300 ₺</span>
              </div>
            </div>
            
          </div>
        </div>

        {/* Product Grid */}
        <div className="w-full md:w-3/4">
          <ProductGrid 
            products={filteredProducts}
            emptyMessage={t('noProductsFound', { fallback: 'No products found matching your filters.' })}
          />
        </div>

      </div>
    </div>
  );
}
