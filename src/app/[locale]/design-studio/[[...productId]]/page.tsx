"use client";

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getProductMedia } from '@/lib/products';
import { getCustomizationConfig } from '@/lib/customizationConfig';
import ProductSelector from '@/components/editor/ProductSelector';
import { Loader2 } from 'lucide-react';

const LoadingFallback = () => {
  const t = useTranslations('Editor');
  return <div className="h-[600px] w-full flex items-center justify-center font-bold text-xl text-zinc-500">{t('loadingCanvas')}</div>;
};

const FabricCanvas = dynamic(() => import('@/components/editor/FabricCanvas'), {
  ssr: false,
  loading: LoadingFallback
});

export default function DesignStudioPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const selectedColor = searchParams.get('color');
  const selectedSize = searchParams.get('size');
  
  // Safe parsing of productId for catch-all route [[...productId]]
  const paramId = params.productId;
  let initialProductId = '';
  
  if (Array.isArray(paramId)) {
    if (paramId.length > 1) {
      console.warn("Extra path segments ignored in design studio route.");
    }
    initialProductId = paramId[0];
  } else if (typeof paramId === 'string') {
    initialProductId = paramId;
  }

  const [activeProductId, setActiveProductId] = useState<string>(initialProductId);
  const [productData, setProductData] = useState<any>(null);
  const [loading, setLoading] = useState(!!initialProductId);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('Editor');

  useEffect(() => {
    async function loadProduct() {
      if (!db || !activeProductId) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const pDoc = await getDoc(doc(db, 'products', activeProductId));
        if (pDoc.exists()) {
          const data = pDoc.data();
          
          // Get customization config from product document or fallback to category defaults
          const config = data.customization_config || getCustomizationConfig(data.category_id);
          
          let resolvedFaces: any = { front: '', back: '', left: '', right: '' };
          
          // 1. Try to fetch the selected variant to get its specific base mockup if available
          let variantData = null;
          if (selectedColor) {
             const variantsSnap = await getDocs(collection(db, 'products', activeProductId, 'variants'));
             const matchingVariant = variantsSnap.docs.find(v => v.data().color === selectedColor || v.data().hex === selectedColor || v.data().colorName_en === selectedColor);
             if (matchingVariant) {
               variantData = matchingVariant.data();
               if (variantData.base_images) {
                  resolvedFaces = variantData.base_images;
               } else if (variantData.image_front) {
                  // Last resort: use variant's image (might have ready design)
                  resolvedFaces.front = variantData.image_front;
                  resolvedFaces.back = variantData.image_back || variantData.image_front;
               }
             }
          }

          // 2. If variant didn't provide a valid base mockup, use product's base_images
          if (!resolvedFaces.front && data.base_images && data.base_images.front) {
            resolvedFaces = data.base_images;
          }

          // 3. Absolute Fallback: use product media (which usually has the ready design) but log a warning
          if (!resolvedFaces.front) {
             console.warn("No base_images found. Falling back to product media (may contain ready design).");
             const media = await getProductMedia(activeProductId);
             resolvedFaces = {
               front: media.front,
               back: media.back || media.front,
               left: media.left || media.front,
               right: media.right || media.front
             };
          }

          setProductData({
            basePrice: data.base_price || 250,
            category_id: data.category_id,
            config,
            variant: variantData,
            selectedColor,
            selectedSize,
            faces: resolvedFaces
          });
        } else {
          // Handle invalid product ID
          console.error("Product not found");
          setError(t('productNotFound', { fallback: 'Product not found. Please select another one.' }));
          setActiveProductId(''); // Revert to empty state to show selector
        }
      } catch (err) {
        console.error("Failed to load product for editor", err);
        setError(t('errorLoadingProduct', { fallback: 'Failed to load product.' }));
      } finally {
        setLoading(false);
      }
    }
    
    loadProduct();
  }, [activeProductId, t]);

  const handleSelectProduct = (id: string) => {
    setActiveProductId(id);
    // Optionally update the URL without reloading to reflect the new ID
    // router.replace(`/design-studio/${id}`, undefined, { shallow: true });
    // Note: next/navigation router.replace does not support shallow in app router directly the same way, 
    // it's usually window.history.replaceState if we want to bypass nextjs routing overhead, 
    // but standard router.push is fine. We will just set the state for smooth transition.
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-28 pb-16 px-4 md:px-8">
      <div className="max-w-[95rem] mx-auto flex flex-col gap-6">
        
        {/* Header Section */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-border/50 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-secondary)]">{t('advancedDesignSpace')}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t('designSpaceDesc')}</p>
          </div>
          {activeProductId && productData && (
            <button 
              onClick={() => {
                setActiveProductId('');
                setProductData(null);
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors text-sm"
            >
              {t('changeProduct', { fallback: 'Change Product' })}
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center border border-red-100 font-medium">
            {error}
          </div>
        )}
        
        {/* Main Content Area */}
        {loading ? (
          <div className="min-h-[500px] flex flex-col items-center justify-center bg-white rounded-3xl shadow-sm border border-border/50">
            <Loader2 className="w-12 h-12 animate-spin text-[var(--color-primary)] mb-4" />
            <p className="font-bold text-gray-500">{t('initializingCanvas')}</p>
          </div>
        ) : !activeProductId || !productData ? (
          <ProductSelector onSelectProduct={handleSelectProduct} />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <FabricCanvas 
              productId={activeProductId} 
              basePrice={productData.basePrice} 
              productFaces={productData.faces} 
              productData={productData}
            />
          </div>
        )}
      </div>
    </div>
  );
}
