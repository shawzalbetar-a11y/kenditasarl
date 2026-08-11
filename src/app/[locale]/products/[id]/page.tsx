"use client";

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Minus, Plus, Paintbrush, ShieldCheck, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, useSearchParams } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where, limit, addDoc, updateDoc } from 'firebase/firestore';
import ProductCard from '@/components/ui/ProductCard';
import AuthModal from '@/components/auth/AuthModal';
import { ShoppingCart } from 'lucide-react';

const COLOR_MAP: any = {
  white: '#FFFFFF',
  black: '#000000',
  gray: '#9CA3AF',
  navy: '#1E3A8A',
  blue: '#3B82F6',
  red: '#EF4444'
};

import { getProductMedia, getProductFrontImage } from '@/lib/products';

export default function ProductDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const locale = params.locale as string;
  const t = useTranslations('ProductPage');
  
  const defaultColorParam = searchParams.get('color');
  
  const [product, setProduct] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      if (!db || !id) return;
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const variantsSnap = await getDocs(collection(docRef, 'variants'));
          
          let fetchedVariants: any[] = [];
          variantsSnap.docs.forEach(v => {
            const data = v.data();
            if (data.sizes) {
              // New schema from Admin Panel
              Object.keys(data.sizes).forEach(size => {
                fetchedVariants.push({
                  color: data.hex || data.colorName_en, // Use hex as color identifier
                  size: size,
                  stock: data.sizes[size],
                  // store translations just in case
                  name_ar: data.colorName_ar,
                  name_tr: data.colorName_tr,
                  name_en: data.colorName_en,
                  image_front: data.image_front || null,
                  image_back: data.image_back || null,
                });
              });
            } else {
              // Old schema
              fetchedVariants.push(data);
            }
          });
          
          setVariants(fetchedVariants);
          
          const media = await getProductMedia(id);
          const images = [
            media.front && { url: media.front, name: t('front') },
            media.back && { url: media.back, name: t('back') },
            media.right && { url: media.right, name: t('right') },
            media.left && { url: media.left, name: t('left') },
          ].filter(Boolean);

          setProduct({
            id: docSnap.id,
            ...data,
            images: images.length > 0 ? images : [{ url: 'https://via.placeholder.com/800', name: t('front') }],
          });
          
          // Initial selections
          if (fetchedVariants.length > 0) {
            if (defaultColorParam && fetchedVariants.some(v => v.color === defaultColorParam)) {
              setSelectedColor(defaultColorParam);
            } else {
              setSelectedColor(fetchedVariants[0].color);
            }
            setSelectedSize(fetchedVariants[0].size);
          }

          // Fetch similar products
          if (data.category_id) {
            const q = query(
              collection(db, 'products'),
              where('category_id', '==', data.category_id),
              where('is_active', '==', true),
              limit(5)
            );
            const simSnap = await getDocs(q);
            const simProds: any[] = [];
            for (const sDoc of simSnap.docs) {
              if (sDoc.id !== docSnap.id) {
                const sData = sDoc.data();
                const frontImage = await getProductFrontImage(sDoc.id);
                simProds.push({ id: sDoc.id, ...sData, media: { front: frontImage } });

              }
            }
            // limit to 4 if we got 5
            setSimilarProducts(simProds.slice(0, 4));
          }
        }
      } catch (error) {
        console.error("Error fetching product:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [id]);

  // Derived unique colors and sizes based on variants
  const uniqueColors = useMemo(() => Array.from(new Set(variants.map(v => v.color))), [variants]);
  const uniqueSizes = useMemo(() => Array.from(new Set(variants.map(v => v.size))), [variants]);

  // Get current variant to check stock
  const currentVariant = variants.find(v => v.color === selectedColor && v.size === selectedSize);
  const maxStock = currentVariant ? currentVariant.stock : 0;

  const isVariantInStock = (color: string, size: string) => {
    const v = variants.find(v => v.color === color && v.size === size);
    return v && v.stock > 0;
  };
  
  // Size Sorting
  const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
  const availableSizes = uniqueSizes
    .filter(size => isVariantInStock(selectedColor || '', size))
    .sort((a, b) => {
      const indexA = SIZE_ORDER.indexOf(a);
      const indexB = SIZE_ORDER.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

  // Reset size if selected is no longer available
  useEffect(() => {
    if (availableSizes.length > 0 && (!selectedSize || !availableSizes.includes(selectedSize))) {
      setSelectedSize(availableSizes[0]);
    }
  }, [availableSizes, selectedSize]);

  // Update URL parameter when color changes
  useEffect(() => {
    if (selectedColor) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('color') !== selectedColor) {
          url.searchParams.set('color', selectedColor);
          window.history.replaceState(null, '', url.toString());
        }
      } catch (e) {
        // Safe fallback if window is not available
      }
    }
  }, [selectedColor]);

  // Reset quantity if it exceeds new maxStock when color/size changes
  useEffect(() => {
    if (quantity > maxStock && maxStock > 0) {
      setQuantity(maxStock);
    }
    if (maxStock === 0) {
      setQuantity(1);
    }
  }, [maxStock, quantity]);

  // Derive images to show based on selected color
  const displayImages = useMemo(() => {
    if (!product) return [];
    let imgs = product.images || [];
    
    if (selectedColor) {
      const v = variants.find(v => v.color === selectedColor);
      if (v && (v.image_front || v.image_back)) {
        imgs = [
          v.image_front && { url: v.image_front, name: t('front') },
          v.image_back && { url: v.image_back, name: t('back') }
        ].filter(Boolean);
      }
    }
    
    return imgs.length > 0 ? imgs : [{ url: 'https://via.placeholder.com/800', name: t('front') }];
  }, [product, selectedColor, variants, t]);

  // Reset active image if display images change
  useEffect(() => {
    setActiveImage(0);
  }, [displayImages]);

  const handleQuantityChange = (type: 'increase' | 'decrease') => {
    if (type === 'increase' && quantity < maxStock) setQuantity(prev => prev + 1);
    if (type === 'decrease' && quantity > 1) setQuantity(prev => prev - 1);
  };

  const handleAddToCart = async () => {
    if (!auth.currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!selectedColor || !selectedSize || maxStock === 0) return;

    setIsAddingToCart(true);
    try {
      const variantId = `${selectedColor}_${selectedSize}`;
      
      // Check if this exact product+variant already exists in cart for this user (with design_id: null)
      const q = query(
        collection(db, 'cart_items'),
        where('user_id', '==', auth.currentUser.uid),
        where('product_id', '==', id),
        where('variant_id', '==', variantId),
        where('design_id', '==', null)
      );
      
      const snap = await getDocs(q);
      if (!snap.empty) {
        // Merge: Update quantity
        const existingDoc = snap.docs[0];
        const newQty = existingDoc.data().quantity + quantity;
        
        await updateDoc(doc(db, 'cart_items', existingDoc.id), {
          quantity: newQty > maxStock ? maxStock : newQty
        });
      } else {
        // Create new
        await addDoc(collection(db, 'cart_items'), {
          user_id: auth.currentUser.uid,
          product_id: id,
          variant_id: variantId,
          design_id: null,
          quantity: quantity,
          unit_price: product.base_price,
          created_at: new Date().toISOString()
        });
      }
      alert(t?.('addedToCartSuccess') || 'تمت الإضافة للسلة بنجاح!');
    } catch (err) {
      console.error("Add to cart error:", err);
      alert(t?.('errorAddingToCart') || 'حدث خطأ أثناء الإضافة للسلة');
    }
    setIsAddingToCart(false);
  };

  if (loading) {
    return <div className="min-h-screen pt-32 text-center text-gray-500">{t('loadingProduct')}</div>;
  }

  if (!product) {
    return <div className="min-h-screen pt-32 text-center text-red-500 font-bold">{t('productNotFound')}</div>;
  }

  const title = product[`name_${locale}`] || product.name_en;
  const description = product[`description_${locale}`] || product.description_en;

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-8 pb-32 md:pb-16 px-4 md:px-8">
      <div className="max-w-[95rem] mx-auto">
        
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-[var(--color-text)]">{title}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Image Gallery */}
          <div className="flex flex-col-reverse md:flex-row gap-4">
            {/* Thumbnails */}
            <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto scrollbar-hide py-2 md:py-0 md:w-24">
              {displayImages.map((img: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={cn(
                    "relative flex-shrink-0 w-20 h-24 md:w-full md:h-28 rounded-xl overflow-hidden border-2 transition-all group",
                    activeImage === idx ? "border-[var(--color-primary)] opacity-100" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                  title={img.name}
                >
                  <img src={img.url} alt={`Thumbnail ${img.name}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[10px] text-center py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {img.name}
                  </div>
                </button>
              ))}
            </div>
            {/* Main Image */}
            <div className="flex-1 bg-white rounded-3xl overflow-hidden border border-border/50 shadow-sm aspect-[4/5] md:aspect-auto relative">
              {displayImages[activeImage] && (
                <>
                  <img 
                    src={displayImages[activeImage].url} 
                    alt={title} 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur text-[var(--color-secondary)] px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                    {displayImages[activeImage].name}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Product Details */}
          <div className="flex flex-col">
            <p className="text-3xl font-black text-[var(--color-primary)] mb-6">{product.base_price} ₺</p>
            
            <p className="text-zinc-600 mb-8 leading-relaxed">
              {description}
            </p>

            <div className="h-px w-full bg-border/60 my-6"></div>

            {/* Color Selector */}
            {uniqueColors.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">{t?.('color') || 'اللون'}:</span>
                  <span className="text-sm font-bold text-zinc-700">
                    {variants.find(v => v.color === selectedColor)?.[`name_${locale}`] || variants.find(v => v.color === selectedColor)?.name_en || ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {uniqueColors.map((color: string) => {
                    const hasStockInAnySize = uniqueSizes.some(size => isVariantInStock(color, size));
                    return (
                      <button
                        key={color}
                        disabled={!hasStockInAnySize}
                        onClick={() => setSelectedColor(color)}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-transform shadow-sm border border-black/10",
                          selectedColor === color ? "ring-2 ring-offset-2 ring-[var(--color-primary)] scale-110" : "hover:scale-110",
                          !hasStockInAnySize && "opacity-30 cursor-not-allowed scale-100"
                        )}
                        style={{ backgroundColor: COLOR_MAP[color] || color }}
                        title={variants.find(v => v.color === color)?.[`name_${locale}`] || color}
                      >
                        {selectedColor === color && (
                          <Check size={16} className={COLOR_MAP[color] === '#FFFFFF' ? 'text-black' : 'text-white'} />
                        )}
                        {!hasStockInAnySize && (
                          <X size={16} className="text-red-500 absolute drop-shadow-md" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size Selector */}
            {uniqueSizes.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">{t?.('size') || 'المقاس'}:</span>
                  <button 
                    onClick={() => setIsSizeGuideOpen(true)}
                    className="text-sm text-[var(--color-primary)] underline font-medium hover:text-[var(--color-action)]"
                  >
                    {t?.('size_guide') || 'دليل المقاسات'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {availableSizes.map((size: string) => {
                    const inStock = true; // since we filter them above
                    return (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={cn(
                          "min-w-[3.5rem] h-12 px-4 rounded-xl font-bold transition-all border-2",
                          selectedSize === size 
                            ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-md shadow-[var(--color-primary)]/20" 
                            : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
                        )}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">{t?.('quantity') || 'الكمية'}:</span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {maxStock > 0 ? `${t('available')}: ${maxStock}` : <span className="text-red-500">{t('outOfStock')}</span>}
                </span>
              </div>
              <div className="flex items-center w-40 h-14 bg-gray-50 border-2 border-gray-200 rounded-2xl overflow-hidden">
                <button 
                  onClick={() => handleQuantityChange('decrease')}
                  disabled={maxStock === 0 || quantity <= 1}
                  className="w-14 h-full flex items-center justify-center text-gray-700 hover:bg-gray-200 hover:text-black disabled:opacity-30 transition-all font-bold"
                >
                  <Minus size={20} />
                </button>
                <div className="flex-1 h-full flex items-center justify-center font-black text-xl bg-white border-x-2 border-gray-200 text-[var(--color-primary)]">
                  {maxStock === 0 ? 0 : quantity}
                </div>
                <button 
                  onClick={() => handleQuantityChange('increase')}
                  disabled={maxStock === 0 || quantity >= maxStock}
                  className="w-14 h-full flex items-center justify-center text-gray-700 hover:bg-gray-200 hover:text-black disabled:opacity-30 transition-all font-bold"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Link 
                href={`/design-studio/${id}`}
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:opacity-90 text-white py-4 px-6 rounded-2xl font-bold text-lg transition-all hover:-translate-y-1 shadow-lg shadow-[var(--color-primary)]/30 disabled:opacity-50 disabled:pointer-events-none"
                style={{ pointerEvents: maxStock === 0 ? 'none' : 'auto', opacity: maxStock === 0 ? 0.5 : 1 }}
              >
                <Paintbrush size={22} />
                {t?.('design_it_now') || 'صمم بنفسك الآن'}
              </Link>
              
              <button 
                onClick={handleAddToCart}
                disabled={maxStock === 0 || isAddingToCart}
                className="flex-1 flex items-center justify-center gap-2 bg-white text-[var(--color-primary)] border-2 border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white py-4 px-6 rounded-2xl font-bold text-lg transition-all hover:-translate-y-1 shadow-lg shadow-black/5 disabled:opacity-50 disabled:pointer-events-none"
              >
                <ShoppingCart size={22} />
                {isAddingToCart ? (t?.('addingToCart') || 'جاري الإضافة...') : (t?.('addToCart') || 'أضف للسلة')}
              </button>
            </div>

            {/* Fabric & Print Quality */}
            {(() => {
              const isMug = product.category_id === 'mugs' || product.category === 'mugs';
              const isHat = product.category_id === 'hats' || product.category === 'hats';
              
              let qLabels = {
                ar: { fabric: "نوع القماش", print: "نوع الطباعة", features: "المميزات", instructions: "التعليمات", quality: "جودة القماش والطباعة" },
                en: { fabric: "Fabric Type", print: "Print Type", features: "Features", instructions: "Care Instructions", quality: "Material & Quality" },
                tr: { fabric: "Kumaş Türü", print: "Baskı Türü", features: "Özellikler", instructions: "Yıkama Talimatı", quality: "Kumaş ve Baskı Kalitesi" }
              };

              if (isMug) {
                qLabels = {
                  ar: { fabric: "نوع الخامة", print: "", features: "المميزات", instructions: "التعليمات", quality: "التفاصيل والمميزات" },
                  en: { fabric: "Material", print: "", features: "Features", instructions: "Care Instructions", quality: "Details & Features" },
                  tr: { fabric: "Malzeme", print: "", features: "Özellikler", instructions: "Yıkama Talimatı", quality: "Detaylar ve Özellikler" }
                };
              } else if (isHat) {
                qLabels = {
                  ar: { fabric: "نوع القبعة", print: "نوع الطباعة", features: "المميزات", instructions: "التعليمات", quality: "التفاصيل والمميزات" },
                  en: { fabric: "Hat Type", print: "Print Type", features: "Features", instructions: "Care Instructions", quality: "Details & Features" },
                  tr: { fabric: "Şapka Türü", print: "Baskı Türü", features: "Özellikler", instructions: "Yıkama Talimatı", quality: "Detaylar ve Özellikler" }
                };
              }

              const l = qLabels[locale as keyof typeof qLabels] || qLabels.en;

              if (!((product[`fabric_type_${locale}`] || product.fabric_type_en) || 
                  (product[`print_type_${locale}`] || product.print_type_en) ||
                  (product[`features_${locale}`] || product.features_en) ||
                  (product[`instructions_${locale}`] || product.instructions_en))) {
                return null;
              }

              return (
                <div className="bg-white p-6 rounded-2xl border border-border/50 shadow-sm mt-auto">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="text-[var(--color-primary)]" size={24} />
                    <h3 className="font-bold text-lg">{l.quality}</h3>
                  </div>
                  <ul className="space-y-3">
                    {(product[`fabric_type_${locale}`] || product.fabric_type_en) && (
                      <li className="flex items-start gap-3 text-zinc-600">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                        <span><strong>{l.fabric}:</strong> {product[`fabric_type_${locale}`] || product.fabric_type_en}</span>
                      </li>
                    )}
                    {(product[`print_type_${locale}`] || product.print_type_en) && (
                      <li className="flex items-start gap-3 text-zinc-600">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                        <span><strong>{l.print}:</strong> {product[`print_type_${locale}`] || product.print_type_en}</span>
                      </li>
                    )}
                    {(product[`features_${locale}`] || product.features_en) && (
                      <li className="flex items-start gap-3 text-zinc-600">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                        <span><strong>{l.features}:</strong> {product[`features_${locale}`] || product.features_en}</span>
                      </li>
                    )}
                    {(product[`instructions_${locale}`] || product.instructions_en) && (
                      <li className="flex items-start gap-3 text-zinc-600">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                        <span><strong>{l.instructions}:</strong> {product[`instructions_${locale}`] || product.instructions_en}</span>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })()}

          </div>
        </div>

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <div className="mt-24">
            <h2 className="text-2xl font-bold mb-8 text-[var(--color-secondary)]">{t('similarProducts')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {similarProducts.map(prod => (
                <ProductCard 
                  key={prod.id} 
                  id={prod.id}
                  title={prod[`name_${locale}`] || prod.name_en}
                  price={prod.base_price}
                  imageUrl={prod.media?.front || 'https://via.placeholder.com/400x500?text=No+Image'}
                  adminBanner={prod.badge}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Size Guide Modal */}
      {isSizeGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setIsSizeGuideOpen(false)}
              className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold mb-6 text-center">{t('sizeGuideTitle')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800 border-b border-border">
                    <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{t('size')}</th>
                    <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{t('widthChest')}</th>
                    <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{t('length')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-3 font-bold">S</td>
                    <td className="p-3">48</td>
                    <td className="p-3">68</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-3 font-bold">M</td>
                    <td className="p-3">51</td>
                    <td className="p-3">71</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-3 font-bold">L</td>
                    <td className="p-3">54</td>
                    <td className="p-3">74</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-3 font-bold">XL</td>
                    <td className="p-3">57</td>
                    <td className="p-3">76</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-3 font-bold">XXL</td>
                    <td className="p-3">60</td>
                    <td className="p-3">78</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-500 mt-4 text-center">
              {t('sizeWarning')}
            </p>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={() => {
          setIsAuthModalOpen(false);
          handleAddToCart();
        }}
      />

      {/* Mobile Fixed Price & Cart Bar */}
      {(() => {
        const pLabels = {
          ar: { total: "الإجمالي", add: "أضف للسلة", adding: "جاري الإضافة..." },
          en: { total: "Total", add: "Add to Cart", adding: "Adding..." },
          tr: { total: "Toplam", add: "Sepete Ekle", adding: "Ekleniyor..." }
        };
        const pt = pLabels[locale as keyof typeof pLabels] || pLabels.en;

        return (
          <div className="md:hidden fixed bottom-2 left-2 right-2 z-40 bg-white/70 backdrop-blur-xl border border-white/50 px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-3xl flex flex-row items-center justify-between overflow-hidden">
            
            {/* Animated Glow Effects on Sides */}
            <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent animate-pulse pointer-events-none"></div>
            <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[var(--color-primary)]/10 to-transparent animate-pulse pointer-events-none"></div>

            <div className="flex flex-col relative z-10">
              <span className="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">{pt.total}</span>
              <span className="text-2xl font-black text-[var(--color-primary)] leading-none">{product.base_price * quantity} ₺</span>
            </div>
            
            <button 
              onClick={handleAddToCart}
              disabled={maxStock === 0 || isAddingToCart}
              className="relative z-10 bg-[var(--color-primary)] text-white px-6 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-[var(--color-primary)]/30 disabled:opacity-50 transition-transform active:scale-95"
            >
              <ShoppingCart size={20} />
              {isAddingToCart ? pt.adding : pt.add}
            </button>
          </div>
        );
      })()}

    </div>
  );
}
