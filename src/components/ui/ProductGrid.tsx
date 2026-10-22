'use client';

import React, { useState, useEffect } from 'react';
import { Columns, LayoutGrid, Rows, Grid3x3 } from 'lucide-react';
import ProductCard from '@/components/ui/ProductCard';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface Product {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  adminBanner?: string;
}

interface ProductGridProps {
  products: Product[];
  emptyMessage?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
}

export default function ProductGrid({ products, emptyMessage, title, description }: ProductGridProps) {
  const [cols, setCols] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const t = useTranslations('Categories');

  useEffect(() => {
    setIsMounted(true);
    const savedCols = localStorage.getItem('product_grid_cols');
    if (savedCols) {
      setCols(Number(savedCols));
    }
  }, []);

  const handleSetCols = (num: number) => {
    setCols(num);
    localStorage.setItem('product_grid_cols', num.toString());
  };

  // Default responsive grid: 2 cols on mobile, 3 on md, 4 on lg/xl, 5 on 2xl
  let gridClass = "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5";
  
  if (isMounted && cols) {
    switch (cols) {
      case 1: gridClass = "grid-cols-1"; break;
      case 2: gridClass = "grid-cols-2"; break;
      case 3: gridClass = "grid-cols-3"; break;
      case 4: gridClass = "grid-cols-4"; break;
    }
  }

  // Determine active highlight. If not mounted or no selection, default highlight would technically match 2 columns on mobile, etc.
  // We'll highlight the active specific choice, or nothing if responsive fallback is running.
  return (
    <div className="w-full">
      {/* Header & View Toggler Row */}
      <div className={cn("flex flex-col md:flex-row md:items-end mb-6 gap-4 border-b border-gray-100 pb-4", (title || description) ? "justify-between" : "justify-end")}>
        
        {/* Left Side: Title & Description */}
        {(title || description) && (
          <div className="flex-1">
            {title && <h2 className="text-2xl sm:text-3xl font-black text-gray-900">{title}</h2>}
            {description && <p className="text-sm sm:text-base text-gray-600 mt-1 font-medium">{description}</p>}
          </div>
        )}

        {/* Right Side: View Toggler */}
        <div className="flex justify-end items-center gap-2">
          <span className="text-xs sm:text-sm font-bold text-gray-600 hidden sm:inline-block ml-auto mr-3">{t('viewAs')}</span>
          <button 
            onClick={() => handleSetCols(1)}
            className={cn("p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer", cols === 1 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700")}
            title={t('oneColumn')}
          >
            <Rows size={18} />
          </button>
          <button 
            onClick={() => handleSetCols(2)}
            className={cn("p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer", cols === 2 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700")}
            title={t('twoColumns')}
          >
            <Columns size={18} />
          </button>
          <button 
            onClick={() => handleSetCols(3)}
            className={cn("p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer hidden md:block", cols === 3 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700")}
            title={t('threeColumns')}
          >
            <LayoutGrid size={18} />
          </button>
          <button 
            onClick={() => handleSetCols(4)}
            className={cn("p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer hidden lg:block", cols === 4 ? "bg-primary text-white border-primary shadow-xs" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700")}
            title={t('fourColumns', { fallback: '4 Columns' })}
          >
            <Grid3x3 size={18} />
          </button>
        </div>
      </div>

      <div className={cn("grid gap-4 md:gap-6", gridClass)}>
        {products.map(product => (
          <ProductCard 
            key={product.id} 
            id={product.id}
            title={product.title}
            price={product.price}
            imageUrl={product.imageUrl}
            adminBanner={product.adminBanner}
          />
        ))}
        
        {products.length === 0 && emptyMessage && (
          <div className="col-span-full">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
