"use client";

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getProductMedia } from '@/lib/products';
import { getCustomizationConfig, CustomizationConfig } from '@/lib/customizationConfig';
import { resolveImagePrintAreaGeometry } from '@/lib/coordinateMapping';
import ProductSelector from '@/components/editor/ProductSelector';
import { Loader2, Upload, RefreshCw } from 'lucide-react';

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
  const quantityParam = searchParams.get('quantity');
  const initialQuantity = quantityParam ? Math.max(1, parseInt(quantityParam, 10) || 1) : 1;
  
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
  const tStudio = useTranslations('DesignStudio');

  const handleTopFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      window.dispatchEvent(new CustomEvent('STUDIO_EXTERNAL_UPLOAD_FILE', { detail: { file } }));
      e.target.value = '';
    }
  };

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
          
          // 1. Get raw product images array (from Admin Panel's unified ProductImageItem schema)
          const productImagesList = Array.isArray(data.images) ? data.images : [];
          
          // Canonical face normalizer to strictly merge 'left'/'left_shoulder' and 'right'/'right_shoulder'
          const canonicalFaceId = (face: string): string => {
            const f = (face || '').trim().toLowerCase();
            if (f === 'left' || f === 'left_side' || f === 'image_left' || f === 'left_sleeve' || f === 'left_shoulder') return 'left_shoulder';
            if (f === 'right' || f === 'right_side' || f === 'image_right' || f === 'right_sleeve' || f === 'right_shoulder') return 'right_shoulder';
            if (f === 'front' || f === 'front_face' || f === 'image_front') return 'front';
            if (f === 'back' || f === 'back_face' || f === 'image_back') return 'back';
            if (f === 'collar') return 'collar';
            if (f === 'other') return 'other';
            return f;
          };

          // Candidate canonical faces configured or available for this product
          const baseFaces = config.faces || {};
          const configuredCanonicalFaces = Object.keys(baseFaces).map(canonicalFaceId);
          
          const candidateFaces = Array.from(new Set([
            'front', 'back', 'right_shoulder', 'left_shoulder', 'collar', 'other',
            ...configuredCanonicalFaces,
            ...productImagesList.map((img: any) => canonicalFaceId(img.face))
          ])).filter(Boolean);

          const resolvedFaces: Record<string, string> = {};

          // Step 1: For each canonical face, prioritize BLANK mockups matching selectedColor, then any BLANK mockup
          candidateFaces.forEach(faceKey => {
            let matchingBlank = selectedColor
              ? productImagesList.find((img: any) => 
                  img.type === 'blank' && 
                  canonicalFaceId(img.face) === faceKey && 
                  img.colorHex && 
                  (img.colorHex.toLowerCase() === selectedColor.toLowerCase())
                )
              : null;

            if (!matchingBlank) {
              matchingBlank = productImagesList.find((img: any) => 
                img.type === 'blank' && canonicalFaceId(img.face) === faceKey
              );
            }

            if (matchingBlank && matchingBlank.url) {
              resolvedFaces[faceKey] = matchingBlank.url;
            }
          });

          // Step 2: Fetch and map all product variants
          let variantData: any = null;
          let allVariants: any[] = [];
          try {
            const variantsSnap = await getDocs(collection(db, 'products', activeProductId, 'variants'));
            allVariants = variantsSnap.docs.map(vDoc => ({ id: vDoc.id, ...vDoc.data() }));
          } catch (e) {
            console.warn("Could not fetch product variants subcollection:", e);
          }

          if (selectedColor && allVariants.length > 0) {
            const matchingVariant = allVariants.find((vd: any) => (
              vd.color?.toLowerCase() === selectedColor.toLowerCase() ||
              vd.hex?.toLowerCase() === selectedColor.toLowerCase() ||
              vd.colorName_ar?.toLowerCase() === selectedColor.toLowerCase() ||
              vd.colorName_tr?.toLowerCase() === selectedColor.toLowerCase() ||
              vd.colorName_en?.toLowerCase() === selectedColor.toLowerCase()
            ));
            if (matchingVariant) {
              variantData = matchingVariant;
              if (variantData.base_images) {
                Object.keys(variantData.base_images).forEach(f => {
                  const cFace = canonicalFaceId(f);
                  if (!resolvedFaces[cFace] && variantData.base_images[f]) {
                    resolvedFaces[cFace] = variantData.base_images[f];
                  }
                });
              } else if (variantData.image_front && !resolvedFaces.front) {
                resolvedFaces.front = variantData.image_front;
                if (variantData.image_back && !resolvedFaces.back) {
                  resolvedFaces.back = variantData.image_back;
                }
              }
            }
          }

          // Step 3: Fallback to product's legacy base_images
          if (data.base_images) {
            Object.keys(data.base_images).forEach(f => {
              const cFace = canonicalFaceId(f);
              if (!resolvedFaces[cFace] && data.base_images[f]) {
                resolvedFaces[cFace] = data.base_images[f];
              }
            });
          }

          // Step 4: Absolute Fallback: use product media ONLY if front is missing
          if (!resolvedFaces.front) {
            const media = await getProductMedia(activeProductId);
            if (media.front) resolvedFaces.front = media.front;
            if (media.back) resolvedFaces.back = media.back || media.front;
            if (media.left && !resolvedFaces.left_shoulder) resolvedFaces.left_shoulder = media.left;
            if (media.right && !resolvedFaces.right_shoulder) resolvedFaces.right_shoulder = media.right;
          }

          // Clean up: strictly purge any redundant legacy 'left' or 'right' keys
          delete resolvedFaces['left'];
          delete resolvedFaces['right'];

          // 5. Resolve Image-Driven print area geometry for each resolved face
          const resolvedFacesConfig: any = {};
          const activeFaceKeys = Object.keys(resolvedFaces).filter(f => resolvedFaces[f]);

          activeFaceKeys.forEach(faceId => {
            const faceImageUrl = resolvedFaces[faceId];
            const effectivePrintArea = resolveImagePrintAreaGeometry({
              config,
              faceId,
              currentImage: faceImageUrl,
            });

            const baseFaceConfig = baseFaces[faceId] || 
              (faceId === 'left_shoulder' ? (baseFaces['left'] || baseFaces['left_shoulder']) : null) ||
              (faceId === 'right_shoulder' ? (baseFaces['right'] || baseFaces['right_shoulder']) : null);

            resolvedFacesConfig[faceId] = {
              name: baseFaceConfig?.name || faceId.toUpperCase(),
              enabled: baseFaceConfig?.enabled ?? true,
              printArea: effectivePrintArea,
            };
          });

          const finalizedConfig: CustomizationConfig = {
            ...config,
            faces: resolvedFacesConfig,
          };

          const derivedColors = (Array.isArray(data.colors) && data.colors.length > 0)
            ? data.colors
            : allVariants.map((v: any) => v.hex || v.color).filter(Boolean);

          const derivedSizes = (Array.isArray(data.sizes) && data.sizes.length > 0)
            ? data.sizes
            : ['S', 'M', 'L', 'XL', '2XL'];

          setProductData({
            id: activeProductId,
            basePrice: data.base_price || 250,
            category_id: data.category_id,
            config: finalizedConfig,
            variant: variantData,
            variants: allVariants,
            colors: derivedColors.length > 0 ? derivedColors : ['white', 'black', 'navy', '#DC2626', '#4B5563'],
            sizes: derivedSizes,
            selectedColor: selectedColor || (derivedColors[0] || 'white'),
            selectedSize: selectedSize || (derivedSizes[0] || 'M'),
            initialQuantity: initialQuantity,
            faces: resolvedFaces,
            raw_images: productImagesList
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
    setError(null);
    setActiveProductId(id);
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-0 pb-16 px-2 sm:px-4 md:px-8">
      {/* Design Studio Layout Optimizations: Override Main Padding & Hide Footer */}
      <style>{`
        main {
          padding-top: 80px !important;
        }
        @media (min-width: 768px) {
          main {
            padding-top: 96px !important;
          }
        }
        footer, .site-footer, #footer {
          display: none !important;
        }
      `}</style>

      <div className="max-w-[95rem] mx-auto flex flex-col gap-1.5 md:gap-4">
        
        {/* Top Quick Actions Bar (Upload Design, Change Product, and Choose from Gallery - 3 Equal Columns in One Row) */}
        <div className="grid grid-cols-3 items-center gap-2 sm:gap-3 w-full px-1 sm:px-2 md:px-4 mt-0 mb-1">
          {/* 1. Upload Design Button */}
          <label className="flex items-center justify-center gap-1.5 sm:gap-2 bg-[var(--color-primary)] text-white shadow-sm rounded-xl py-2.5 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm transition-all active:scale-95 hover:opacity-90 cursor-pointer text-center truncate">
            <Upload size={17} className="shrink-0" />
            <span className="truncate">{tStudio('uploadDesign')}</span>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleTopFileUpload} 
            />
          </label>

          {/* 2. Change Product Button (Moved between Upload & Gallery, Equal Size) */}
          <button 
            type="button"
            onClick={() => {
              setActiveProductId('');
              setProductData(null);
            }}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white border border-gray-300 hover:border-gray-400 text-gray-700 shadow-sm rounded-xl py-2.5 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm transition-all active:scale-95 hover:bg-gray-50 text-center cursor-pointer truncate"
          >
            <RefreshCw size={16} className="shrink-0 text-gray-600" />
            <span className="truncate">{t('changeProduct', { fallback: 'تغيير المنتج' })}</span>
          </button>

          {/* 3. Choose from Gallery Button */}
          <button 
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('STUDIO_OPEN_GALLERY_MODAL'));
              }
            }}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white border border-[var(--color-primary)] text-[var(--color-primary)] shadow-sm rounded-xl py-2.5 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm transition-all active:scale-95 hover:bg-orange-50 text-center cursor-pointer truncate"
          >
            <img src="/images/logo.png" alt="Logo" className="w-4 h-4 sm:w-5 sm:h-5 object-contain shrink-0" />
            <span className="truncate">{tStudio('chooseFromGallery')}</span>
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center border border-red-100 font-medium mx-2 md:mx-0">
            {error}
          </div>
        )}
        
        {/* Main Content Area */}
        {loading ? (
          <div className="h-[70vh] md:min-h-[500px] flex flex-col items-center justify-center bg-white rounded-3xl shadow-sm border border-border/50">
            <Loader2 className="w-12 h-12 animate-spin text-[var(--color-primary)] mb-4" />
            <p className="font-bold text-gray-500">{t('initializingCanvas')}</p>
          </div>
        ) : !activeProductId || !productData ? (
          <div className="p-4 md:p-0">
            <ProductSelector onSelectProduct={handleSelectProduct} />
          </div>
        ) : (
          <div className="h-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <FabricCanvas 
              productId={activeProductId} 
              basePrice={productData.basePrice} 
              productFaces={productData.faces} 
              productData={productData}
              initialColor={productData.selectedColor}
              initialSize={productData.selectedSize}
              initialQuantity={productData.initialQuantity}
            />
          </div>
        )}
      </div>
    </div>
  );
}
