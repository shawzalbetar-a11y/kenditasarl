"use client";

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Minus, Plus, Paintbrush, ShieldCheck, Check, X, ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, useSearchParams } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where, limit, addDoc, updateDoc } from 'firebase/firestore';
import ProductCard from '@/components/ui/ProductCard';
import AuthModal from '@/components/auth/AuthModal';

const COLOR_MAP: any = {
  white: '#FFFFFF',
  black: '#000000',
  gray: '#9CA3AF',
  navy: '#1E3A8A',
  blue: '#3B82F6',
  red: '#EF4444'
};

const isColorEqual = (c1?: string | null, c2?: string | null): boolean => {
  if (!c1 || !c2) return false;
  const s1 = c1.trim().toLowerCase();
  const s2 = c2.trim().toLowerCase();
  if (s1 === s2) return true;
  
  const hex1 = COLOR_MAP[s1]?.toLowerCase() || s1;
  const hex2 = COLOR_MAP[s2]?.toLowerCase() || s2;
  if (hex1 === hex2) return true;

  const name1 = Object.keys(COLOR_MAP).find(k => COLOR_MAP[k]?.toLowerCase() === s1) || s1;
  const name2 = Object.keys(COLOR_MAP).find(k => COLOR_MAP[k]?.toLowerCase() === s2) || s2;
  return name1 === name2;
};

const isSizeEqual = (s1?: string | null, s2?: string | null): boolean => {
  if (!s1 || !s2) return false;
  return s1.trim().toLowerCase() === s2.trim().toLowerCase();
};

import { getProductMedia, getProductFrontImage } from '@/lib/products';

export default function ProductDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const locale = params.locale as string;
  const t = useTranslations('ProductPage');
  const tDetails = useTranslations('ProductDetails');
  
  const defaultColorParam = searchParams.get('color');
  const defaultSizeParam = searchParams.get('size');
  const defaultQtyParam = searchParams.get('quantity');
  const defaultTypeParam = (searchParams.get('type') as 'ready' | 'blank') || null;
  
  const [product, setProduct] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [viewType, setViewType] = useState<'ready' | 'blank'>(defaultTypeParam || 'ready');
  const [selectedColor, setSelectedColor] = useState<string | null>(defaultColorParam || null);
  const [selectedSize, setSelectedSize] = useState<string | null>(defaultSizeParam || null);
  const [quantity, setQuantity] = useState<number>(() => {
    if (defaultQtyParam) {
      const q = parseInt(defaultQtyParam, 10);
      if (!isNaN(q) && q > 0) return q;
    }
    return 1;
  });
  const [activeImage, setActiveImage] = useState(0);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  
  const [readyDesigns, setReadyDesigns] = useState<any[]>([]);
  const [selectedReadyDesignId, setSelectedReadyDesignId] = useState<string | null>(null);

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
              // Legacy schema
              fetchedVariants.push(data);
            }
          });
          
          setVariants(fetchedVariants);
          
          const images = Array.isArray(data.images) ? data.images.map((img: any) => ({
            url: typeof img === 'string' ? img : img.url,
            name: (typeof img === 'object' && img.face) ? t(img.face) : t('front')
          })) : [];

          setProduct({
            id: docSnap.id,
            ...data,
            raw_images: data.images || [],
            images: images.length > 0 ? images : [{ url: 'https://via.placeholder.com/800', name: t('front') }],
          });
          
          // Fetch Ready Designs
          let linkedIds = data.linked_ready_designs || [];
          if (linkedIds.length === 0 && data.ready_design_id) {
            linkedIds = [data.ready_design_id];
          }
          if (linkedIds.length > 0) {
            const rdDocs = await Promise.all(linkedIds.map((rid: string) => getDoc(doc(db, 'designs', rid))));
            const rdData = rdDocs
              .filter(d => d.exists() && d.data().is_template === true) // Strict check
              .map(d => ({ id: d.id, ...d.data() }));
            setReadyDesigns(rdData);
            if (rdData.length > 0) {
              setSelectedReadyDesignId(rdData[0].id);
            }
          }
          
          // Initial selections prioritizing URL params then localStorage
          if (fetchedVariants.length > 0) {
            let savedPref: any = null;
            if (typeof window !== 'undefined') {
              try {
                const raw = localStorage.getItem(`product_pref_${id}`);
                if (raw) savedPref = JSON.parse(raw);
              } catch (e) {}
            }

            const targetColorParam = defaultColorParam || savedPref?.color;
            const targetSizeParam = defaultSizeParam || savedPref?.size;
            const targetQtyParam = defaultQtyParam || savedPref?.quantity;

            const matchedColorVariant = targetColorParam 
              ? fetchedVariants.find(v => isColorEqual(v.color, targetColorParam))
              : null;
            const initialColor = matchedColorVariant ? matchedColorVariant.color : fetchedVariants[0].color;
            setSelectedColor(initialColor);

            const matchedSizeVariant = targetSizeParam 
              ? (fetchedVariants.find(v => isColorEqual(v.color, initialColor) && isSizeEqual(v.size, targetSizeParam)) ||
                 fetchedVariants.find(v => isSizeEqual(v.size, targetSizeParam)))
              : null;
            const initialSize = matchedSizeVariant ? matchedSizeVariant.size : fetchedVariants[0].size;
            setSelectedSize(initialSize);

            if (targetQtyParam) {
              const q = parseInt(targetQtyParam, 10);
              if (!isNaN(q) && q > 0) {
                setQuantity(q);
              }
            }
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
  }, [id, defaultColorParam, defaultSizeParam, defaultQtyParam]);

  // Derived unique colors and sizes based on variants
  const uniqueColors = useMemo(() => Array.from(new Set(variants.map(v => v.color))), [variants]);
  const uniqueSizes = useMemo(() => Array.from(new Set(variants.map(v => v.size))), [variants]);

  // Check if ready or blank options exist for current product & color
  const { hasReadyOption, hasBlankOption } = useMemo(() => {
    if (!product?.raw_images || !Array.isArray(product.raw_images)) {
      return { hasReadyOption: false, hasBlankOption: false };
    }
    const catalog = product.raw_images as any[];
    const colorImages = selectedColor 
      ? catalog.filter(img => img.colorHex?.toLowerCase() === selectedColor.toLowerCase())
      : catalog;
    
    return {
      hasReadyOption: colorImages.some(img => img.type === 'ready') || catalog.some(img => img.type === 'ready'),
      hasBlankOption: colorImages.some(img => img.type === 'blank') || catalog.some(img => img.type === 'blank')
    };
  }, [product, selectedColor]);

  // Auto-switch viewType if one doesn't exist
  useEffect(() => {
    if (hasBlankOption && !hasReadyOption && viewType !== 'blank') {
      setViewType('blank');
    } else if (hasReadyOption && !hasBlankOption && viewType !== 'ready') {
      setViewType('ready');
    }
  }, [hasReadyOption, hasBlankOption, viewType]);

  // Localized Face Name Helper
  const getFaceLabel = (face: string) => {
    const cleanFace = face === 'left_shoulder' ? 'left' : face === 'right_shoulder' ? 'right' : face;
    switch (cleanFace) {
      case 'front': return t('frontFace');
      case 'back': return t('backFace');
      case 'left': return t('leftShoulder');
      case 'right': return t('rightShoulder');
      default: return cleanFace;
    }
  };

  const getLocalizedImageName = (img: { face: string; type?: string }) => {
    const typeLabel = img.type === 'ready' ? t('readyType') : t('blankType');
    const faceLabel = getFaceLabel(img.face);
    return `${typeLabel} • ${faceLabel}`;
  };

  // Get current variant to check stock
  const currentVariant = variants.find(v => isColorEqual(v.color, selectedColor) && isSizeEqual(v.size, selectedSize));
  const maxStock = currentVariant ? currentVariant.stock : 0;

  const isVariantInStock = (color: string, size: string) => {
    const v = variants.find(v => isColorEqual(v.color, color) && isSizeEqual(v.size, size));
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

  // Keep size valid if stock is empty for selected
  useEffect(() => {
    if (availableSizes.length > 0 && selectedSize && !availableSizes.some(s => isSizeEqual(s, selectedSize))) {
      setSelectedSize(availableSizes[0]);
    }
  }, [availableSizes, selectedSize]);

  // Save preferences and update URL parameters when color, size, or quantity changes
  useEffect(() => {
    if (typeof window === 'undefined' || !id) return;
    try {
      if (selectedColor || selectedSize || quantity) {
        localStorage.setItem(`product_pref_${id}`, JSON.stringify({
          color: selectedColor,
          size: selectedSize,
          quantity: quantity
        }));
      }

      const url = new URL(window.location.href);
      let changed = false;
      if (selectedColor && url.searchParams.get('color') !== selectedColor) {
        url.searchParams.set('color', selectedColor);
        changed = true;
      }
      if (selectedSize && url.searchParams.get('size') !== selectedSize) {
        url.searchParams.set('size', selectedSize);
        changed = true;
      }
      if (quantity && url.searchParams.get('quantity') !== String(quantity)) {
        url.searchParams.set('quantity', String(quantity));
        changed = true;
      }
      if (viewType && url.searchParams.get('type') !== viewType) {
        url.searchParams.set('type', viewType);
        changed = true;
      }
      if (changed) {
        window.history.replaceState(null, '', url.toString());
      }
    } catch (e) {
      // Safe fallback if window is not available
    }
  }, [id, selectedColor, selectedSize, quantity, viewType]);

  // Reset quantity if it exceeds new maxStock when color/size changes
  useEffect(() => {
    if (quantity > maxStock && maxStock > 0) {
      setQuantity(maxStock);
    }
    if (maxStock === 0) {
      setQuantity(1);
    }
  }, [maxStock, quantity]);

  // Derive images to show based on selected color and ready/blank type
  const displayImages = useMemo(() => {
    if (!product) return [];

    // 1. Structured product images from Admin Panel
    if (Array.isArray(product.raw_images) && product.raw_images.length > 0) {
      const catalog = product.raw_images as Array<{
        id: string;
        url: string;
        type: 'ready' | 'blank';
        face: string;
        colorHex?: string;
        title?: string;
      }>;

      const FACE_ORDER = ['front', 'back', 'left', 'left_shoulder', 'right', 'right_shoulder'];
      const sortFaces = (list: typeof catalog) => {
        return [...list].sort((a, b) => {
          const idxA = FACE_ORDER.indexOf(a.face);
          const idxB = FACE_ORDER.indexOf(b.face);
          return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });
      };

      if (selectedColor) {
        const colorImgs = catalog.filter(img => img.colorHex?.toLowerCase() === selectedColor.toLowerCase());
        
        // Priority: target viewType for this color
        const colorTargetType = colorImgs.filter(img => img.type === viewType);
        if (colorTargetType.length > 0) {
          return sortFaces(colorTargetType).map(img => ({
            url: img.url,
            name: getLocalizedImageName(img),
            type: img.type,
            face: img.face
          }));
        }

        // Secondary: other type for this color
        const otherType = viewType === 'ready' ? 'blank' : 'ready';
        const colorOtherType = colorImgs.filter(img => img.type === otherType);
        if (colorOtherType.length > 0) {
          return sortFaces(colorOtherType).map(img => ({
            url: img.url,
            name: getLocalizedImageName(img),
            type: img.type,
            face: img.face
          }));
        }
      }

      // Fallback across any items matching target viewType
      const anyTargetType = catalog.filter(img => img.type === viewType);
      if (anyTargetType.length > 0) {
        return sortFaces(anyTargetType).map(img => ({
          url: img.url,
          name: getLocalizedImageName(img),
          type: img.type,
          face: img.face
        }));
      }

      // All images in catalog
      return sortFaces(catalog).map(img => ({
        url: img.url,
        name: getLocalizedImageName(img),
        type: img.type,
        face: img.face
      }));
    }

    // 2. Legacy fallback from variant images or base media
    let imgs: any[] = [];
    if (selectedColor) {
      const v = variants.find(v => v.color === selectedColor);
      if (v && (v.image_front || v.image_back)) {
        imgs = [
          v.image_front && { url: v.image_front, name: getFaceLabel('front'), face: 'front' },
          v.image_back && { url: v.image_back, name: getFaceLabel('back'), face: 'back' }
        ].filter(Boolean);
      }
    }
    
    if (imgs.length === 0 && product.images) {
      imgs = product.images;
    }
    
    return imgs.length > 0 ? imgs : [{ url: 'https://via.placeholder.com/800', name: getFaceLabel('front'), face: 'front' }];
  }, [product, selectedColor, viewType, variants, locale, t]);

  // Reset active image if display images change
  useEffect(() => {
    setActiveImage(0);
  }, [displayImages]);

  // Gallery Navigation Handlers (Prev / Next)
  const handleNextImage = () => {
    if (displayImages.length <= 1) return;
    setActiveImage((prev) => (prev + 1) % displayImages.length);
  };

  const handlePrevImage = () => {
    if (displayImages.length <= 1) return;
    setActiveImage((prev) => (prev - 1 + displayImages.length) % displayImages.length);
  };

  // Mobile Touch Swipe Handling
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const minSwipeDistance = 40;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    const distance = touchStartX - touchEndX;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (locale === 'ar') {
      // In RTL layout
      if (isLeftSwipe) {
        handlePrevImage();
      } else if (isRightSwipe) {
        handleNextImage();
      }
    } else {
      // In LTR layout
      if (isLeftSwipe) {
        handleNextImage();
      } else if (isRightSwipe) {
        handlePrevImage();
      }
    }
  };

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
          design_id: selectedReadyDesignId || product.ready_design_id || null,
          design_type: (selectedReadyDesignId || product.ready_design_id) ? 'ready' : null,
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
  const activeFace = displayImages[activeImage]?.face || 'front';

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-8 pb-32 md:pb-16 px-4 md:px-8">
      <div className="max-w-[95rem] mx-auto">
        
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-[var(--color-text)]">{title}</h1>
          </div>

          {/* View Type Toggle: Ready vs Blank */}
          {hasReadyOption && hasBlankOption && (
            <div className="flex items-center gap-1.5 p-1.5 bg-gray-100 rounded-2xl w-fit border border-gray-200 shadow-inner">
              <button
                type="button"
                onClick={() => setViewType('ready')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2",
                  viewType === 'ready' 
                    ? "bg-white text-zinc-900 shadow-sm border border-black/5" 
                    : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                <span>👕</span>
                <span>{t('readyProduct')}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewType('blank')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2",
                  viewType === 'blank' 
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20" 
                    : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                <span>🎨</span>
                <span>{t('blankProduct')}</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Image Gallery */}
          <div className="flex flex-col gap-4">
            {/* Main Image Container with Swipe & Arrow Navigation */}
            <div 
              className="w-full bg-white rounded-3xl overflow-hidden border border-border/50 shadow-sm aspect-[4/5] md:aspect-[4/4] lg:aspect-[4/5] relative select-none group/mainimg"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {displayImages[activeImage] && (
                <>
                  <img 
                    src={displayImages[activeImage].url} 
                    alt={title} 
                    className="w-full h-full object-cover transition-opacity duration-300"
                  />
                  <div className="absolute top-4 start-4 bg-white/90 backdrop-blur text-[var(--color-secondary)] px-3 py-1 rounded-full text-sm font-bold shadow-sm z-10">
                    {displayImages[activeImage].name}
                  </div>
                </>
              )}

              {/* Navigation Arrows for multi-image gallery */}
              {displayImages.length > 1 && (
                <>
                  {/* Previous Button */}
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    aria-label="Previous image"
                    className="absolute top-1/2 -translate-y-1/2 start-3 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/85 hover:bg-white text-zinc-800 backdrop-blur-md shadow-md hover:shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 border border-black/5 opacity-90 sm:opacity-75 sm:group-hover/mainimg:opacity-100"
                  >
                    <ChevronLeft size={22} className="rtl:rotate-180" />
                  </button>

                  {/* Next Button */}
                  <button
                    type="button"
                    onClick={handleNextImage}
                    aria-label="Next image"
                    className="absolute top-1/2 -translate-y-1/2 end-3 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/85 hover:bg-white text-zinc-800 backdrop-blur-md shadow-md hover:shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 border border-black/5 opacity-90 sm:opacity-75 sm:group-hover/mainimg:opacity-100"
                  >
                    <ChevronRight size={22} className="rtl:rotate-180" />
                  </button>

                  {/* Bottom Indicator Dots */}
                  <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-1.5 z-20 pointer-events-none">
                    {displayImages.map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "h-1.5 sm:h-2 rounded-full transition-all duration-300 shadow-sm",
                          activeImage === idx ? "w-6 sm:w-7 bg-white" : "w-1.5 sm:w-2 bg-white/50"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails + Magic "Design it Yourself" CTA Container */}
            <div className="flex flex-row items-center justify-between gap-3 sm:gap-4 w-full mt-2">
              {/* Thumbnails List */}
              <div className="shrink-0 flex gap-2 overflow-x-auto scrollbar-hide py-1 max-w-[55%] sm:max-w-[50%]">
                {displayImages.map((img: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={cn(
                      "relative shrink-0 w-16 h-20 sm:w-20 sm:h-24 rounded-xl overflow-hidden border-2 transition-all group",
                      activeImage === idx ? "border-[var(--color-primary)] opacity-100 shadow-sm" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                    title={img.name}
                  >
                    <img src={img.url} alt={`Thumbnail ${img.name}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] font-bold text-center py-0.5 group-hover:bg-black/80 transition-colors truncate px-0.5">
                      {img.name}
                    </div>
                  </button>
                ))}
              </div>

              {/* Magic CTA Button */}
              <Link 
                href={
                  `/design-studio/${id}?color=${encodeURIComponent(selectedColor || '')}&size=${encodeURIComponent(selectedSize || '')}&quantity=${quantity}&face=${activeFace}${selectedReadyDesignId || product.ready_design_id ? `&designId=${selectedReadyDesignId || product.ready_design_id}&mode=remix` : ''}`
                }
                className="flex-1 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-white text-sm sm:text-base bg-gradient-to-r from-purple-600 via-pink-600 to-[var(--color-primary)] shadow-lg shadow-purple-500/30 transform transition-all hover:-translate-y-1 active:scale-95 text-center"
              >
                <Paintbrush size={20} className="shrink-0" />
                <span className="truncate">{locale === 'ar' ? 'صمم هذا المنتج بنفسك 🎨' : locale === 'tr' ? 'Kendin Tasarla 🎨' : 'Design It Yourself 🎨'}</span>
              </Link>
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
                href={
                  selectedReadyDesignId || product.ready_design_id 
                  ? `/design-studio/${id}?color=${encodeURIComponent(selectedColor || '')}&size=${encodeURIComponent(selectedSize || '')}&quantity=${quantity}&designId=${selectedReadyDesignId || product.ready_design_id}&mode=remix`
                  : `/design-studio/${id}?color=${encodeURIComponent(selectedColor || '')}&size=${encodeURIComponent(selectedSize || '')}&quantity=${quantity}`
                }
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:opacity-90 text-white py-4 px-6 rounded-2xl font-bold text-lg transition-all hover:-translate-y-1 shadow-lg shadow-[var(--color-primary)]/30 disabled:opacity-50 disabled:pointer-events-none"
                style={{ pointerEvents: maxStock === 0 ? 'none' : 'auto', opacity: maxStock === 0 ? 0.5 : 1 }}
              >
                <Paintbrush size={22} />
                {product.ready_design_id && !selectedReadyDesignId ? (t?.('customize_this_design') || 'خصص هذا التصميم 🎨') : 
                 selectedReadyDesignId ? (t?.('customize_this_design') || 'خصص هذا التصميم 🎨') : 
                 (t?.('design_it_now') || 'صمم بنفسك الآن')}
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

            {/* Ready Designs Gallery */}
            {readyDesigns.length > 0 && (
              <div className="mb-10 bg-gray-50 border rounded-2xl p-4 md:p-6">
                <h3 className="text-lg font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
                  <Paintbrush className="text-[var(--color-primary)]" size={20} />
                  {t?.('readyDesigns') || 'تصاميم جاهزة (اختر واحدًا)'}
                </h3>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                  {readyDesigns.map((rd) => (
                    <button
                      key={rd.id}
                      onClick={() => setSelectedReadyDesignId(rd.id)}
                      className={`flex-shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-xl border-2 overflow-hidden relative transition-all ${
                        selectedReadyDesignId === rd.id ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {rd.preview_image_url ? (
                        <img src={rd.preview_image_url} alt="Ready Design" className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">بدون صورة</div>
                      )}
                      {selectedReadyDesignId === rd.id && (
                        <div className="absolute top-2 right-2 bg-[var(--color-primary)] text-white rounded-full p-1 shadow-sm">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {selectedReadyDesignId && (
                  <button 
                    onClick={() => setSelectedReadyDesignId(null)}
                    className="text-sm text-red-500 font-semibold hover:text-red-700 mt-2 flex items-center gap-1"
                  >
                    <X size={16} /> {t?.('cancel_selection') || 'إلغاء التحديد (شراء منتج سادة)'}
                  </button>
                )}
              </div>
            )}

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
