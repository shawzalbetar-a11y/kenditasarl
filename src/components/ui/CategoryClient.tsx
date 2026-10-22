"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Filter, ArrowUpDown, Check, Sparkles, RotateCcw, Rows, Columns, LayoutGrid, Grid3x3 } from 'lucide-react';
import { Link } from '@/i18n/routing';
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
  categoryDesc?: string;
}

const AVAILABLE_COLORS = [
  { id: 'white', label: 'أبيض', class: 'bg-white border-gray-300' },
  { id: 'black', label: 'أسود', class: 'bg-black text-white' },
  { id: 'blue', label: 'أزرق', class: 'bg-blue-600 text-white' },
  { id: 'red', label: 'أحمر', class: 'bg-red-600 text-white' },
];

export default function CategoryClient({ initialProducts, categoryTitle, categoryDesc }: CategoryClientProps) {
  const t = useTranslations('Categories');
  const locale = useLocale();

  const [priceRange, setPriceRange] = useState<number>(2300);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [cols, setCols] = useState<number | null>(null);

  useEffect(() => {
    const savedCols = localStorage.getItem('product_grid_cols');
    if (savedCols) {
      setCols(Number(savedCols));
    }
  }, []);

  const handleSetCols = (num: number) => {
    setCols(num);
    localStorage.setItem('product_grid_cols', num.toString());
  };

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

  const resetFilters = () => {
    setSelectedColors([]);
    setPriceRange(2300);
  };

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      
      {/* Category Header Banner with Typography Hierarchy & Action Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-6 sm:mb-8 pb-6 border-b border-gray-200/80">
        <div>
          <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200/80 text-primary px-3.5 py-1 rounded-full text-xs font-black tracking-wide mb-2.5 shadow-2xs">
            <span>✨</span>
            <span>{categoryTitle}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight">
            {categoryTitle}
          </h1>
          {categoryDesc && (
            <p className="text-base sm:text-lg text-gray-600 mt-2.5 font-medium max-w-2xl leading-relaxed">
              {categoryDesc}
            </p>
          )}
        </div>

        {/* Action Controls Cluster: View Toggler & Sort Selector Side by Side */}
        <div className="flex flex-wrap items-center gap-3 self-start lg:self-end">
          
          {/* View Toggler (عرض كـ: 1, 2, 3, 4 أعمدة) */}
          <div className="flex items-center gap-2.5 bg-white border border-gray-200/90 shadow-2xs rounded-2xl px-3.5 py-2">
            <span className="text-xs sm:text-sm font-bold text-gray-600 whitespace-nowrap">{t('viewAs')}</span>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => handleSetCols(1)}
                className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer ${cols === 1 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200/80 hover:bg-gray-50 text-gray-700"}`}
                title={t('oneColumn')}
                aria-label={t('oneColumn')}
              >
                <Rows size={16} />
              </button>
              <button 
                onClick={() => handleSetCols(2)}
                className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer ${cols === 2 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200/80 hover:bg-gray-50 text-gray-700"}`}
                title={t('twoColumns')}
                aria-label={t('twoColumns')}
              >
                <Columns size={16} />
              </button>
              <button 
                onClick={() => handleSetCols(3)}
                className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer hidden md:flex items-center justify-center ${cols === 3 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200/80 hover:bg-gray-50 text-gray-700"}`}
                title={t('threeColumns')}
                aria-label={t('threeColumns')}
              >
                <LayoutGrid size={16} />
              </button>
              <button 
                onClick={() => handleSetCols(4)}
                className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer hidden xl:flex items-center justify-center ${cols === 4 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200/80 hover:bg-gray-50 text-gray-700"}`}
                title={t('fourColumns', { fallback: '4 Columns' })}
                aria-label={t('fourColumns', { fallback: '4 Columns' })}
              >
                <Grid3x3 size={16} />
              </button>
            </div>
          </div>

          {/* Modern Sort selector */}
          <div className="flex items-center gap-2 bg-white border border-gray-200/90 shadow-2xs rounded-2xl px-3.5 py-2 shrink-0">
            <ArrowUpDown className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-gray-600 whitespace-nowrap">{t('sort')}:</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-sm lg:text-base font-extrabold text-gray-900 focus:outline-none cursor-pointer pr-1"
            >
              <option value="newest">{t('newest')}</option>
              <option value="priceAsc">{t('priceAsc')}</option>
              <option value="priceDesc">{t('priceDesc')}</option>
              <option value="bestSelling">{t('bestSelling')}</option>
            </select>
          </div>

        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">
        
        {/* Sidebar Filters */}
        <div className="w-full md:w-80 shrink-0">
          <div className="bg-white/95 backdrop-blur-xl border border-gray-200/90 rounded-3xl p-5 sm:p-6 shadow-sm sticky top-28">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
              <div className="flex items-center gap-2.5">
                <Filter className="w-5 h-5 text-primary stroke-[2.2]" />
                <h2 className="font-black text-lg sm:text-xl text-gray-900">{t('filters')}</h2>
              </div>
              {(selectedColors.length > 0 || priceRange < 2300) && (
                <button 
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-[#e04826] hover:underline cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t('clearFilters')}</span>
                </button>
              )}
            </div>
            
            {/* Color Filter */}
            <div className="mb-6">
              <h3 className="font-black text-xs sm:text-sm text-gray-800 uppercase tracking-wider mb-3">
                {t('colorFilter')}
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {AVAILABLE_COLORS.map(color => {
                  const isSelected = selectedColors.includes(color.id);
                  return (
                    <button 
                      key={color.id}
                      onClick={() => toggleColor(color.id)}
                      className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${color.class} ${
                        isSelected 
                          ? 'ring-2 ring-primary ring-offset-2 scale-110 shadow-sm border-primary' 
                          : 'opacity-85 hover:opacity-100 border-gray-300'
                      }`}
                      title={color.id}
                      aria-label={color.id}
                    >
                      {isSelected && (
                        <Check className={`w-4 h-4 ${color.id === 'white' ? 'text-gray-900' : 'text-white'} drop-shadow-xs`} strokeWidth={3} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Price Filter */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-xs sm:text-sm text-gray-800 uppercase tracking-wider">
                  {t('priceFilter')}
                </h3>
                <span className="text-sm sm:text-base font-black text-primary bg-orange-50 px-3 py-1 rounded-xl border border-orange-200/60 shadow-2xs">
                  {priceRange} ₺
                </span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="2300" 
                step="50"
                value={priceRange}
                onChange={(e) => setPriceRange(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-gray-100 rounded-lg cursor-pointer" 
              />
              <div className="flex justify-between text-xs font-bold text-gray-400 mt-2">
                <span>0 ₺</span>
                <span>2300 ₺</span>
              </div>
            </div>
            
          </div>
        </div>

        {/* Product Grid (Directly aligned with divider line, zero extra gap) */}
        <div className="flex-1 min-w-0">
          <ProductGrid 
            products={filteredProducts}
            hideHeader={true}
            cols={cols}
            onColsChange={handleSetCols}
            emptyMessage={
              <div className="py-16 px-6 bg-white/70 backdrop-blur-sm border border-dashed border-gray-300 rounded-3xl flex flex-col items-center justify-center text-center shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200/80 flex items-center justify-center text-primary mb-4 shadow-xs">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">
                  {t('noProductsFound')}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 max-w-md mb-6 font-medium leading-relaxed">
                  {t('noProductsHatsHint')}
                </p>
                <Link 
                  href="/design-studio" 
                  className="inline-flex items-center gap-2 bg-primary hover:bg-[#e04826] text-white px-7 py-3.5 rounded-full font-black text-base shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>{t('startCustomizing')}</span>
                </Link>
              </div>
            }
          />
        </div>

      </div>
    </div>
  );
}
