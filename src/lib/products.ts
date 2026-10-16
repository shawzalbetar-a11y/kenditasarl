import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

const FALLBACK_IMAGE = 'https://via.placeholder.com/800x1000?text=No+Image';

/**
 * Robust Product Media Extractor
 * Inspects all possible image storage formats:
 * 1. base_images object (front, back, left, right)
 * 2. images array (ProductImageItem[])
 * 3. variants subcollection
 * 4. customization_config.image_geometries
 * 5. legacy media subcollection
 */
export async function getProductMedia(productId: string) {
  if (!db) return { front: FALLBACK_IMAGE, back: '', left: '', right: '' };
  
  try {
    const prodRef = doc(db, 'products', productId);
    const docSnap = await getDoc(prodRef);
    if (!docSnap.exists()) {
      return { front: FALLBACK_IMAGE, back: '', left: '', right: '' };
    }

    const data = docSnap.data();
    let front = '';
    let back = '';
    let left = '';
    let right = '';

    // 1. Check base_images
    if (data.base_images && typeof data.base_images === 'object') {
      front = data.base_images.front || '';
      back = data.base_images.back || '';
      left = data.base_images.left || '';
      right = data.base_images.right || '';
    }

    // 2. Check images array
    if (Array.isArray(data.images) && data.images.length > 0) {
      if (!front) {
        const frontItem = data.images.find((img: any) => img.face === 'front') || data.images[0];
        if (frontItem?.url) front = frontItem.url;
      }
      if (!back) {
        const backItem = data.images.find((img: any) => img.face === 'back');
        if (backItem?.url) back = backItem.url;
      }
      if (!left) {
        const leftItem = data.images.find((img: any) => img.face === 'left' || img.face === 'left_shoulder');
        if (leftItem?.url) left = leftItem.url;
      }
      if (!right) {
        const rightItem = data.images.find((img: any) => img.face === 'right' || img.face === 'right_shoulder');
        if (rightItem?.url) right = rightItem.url;
      }
    }

    // 3. Check customization_config image_geometries
    if (!front && data.customization_config?.image_geometries) {
      const geoms = Object.values(data.customization_config.image_geometries) as any[];
      const frontGeom = geoms.find((g: any) => g.faceId === 'front' && g.imageUrl) || geoms[0];
      if (frontGeom?.imageUrl) front = frontGeom.imageUrl;
    }

    // 4. Check variants subcollection
    try {
      const variantsSnap = await getDocs(collection(prodRef, 'variants'));
      if (!variantsSnap.empty) {
        const firstVariant = variantsSnap.docs[0].data();
        if (!front && (firstVariant.image_front || firstVariant.mockup_front || firstVariant.image || firstVariant.url)) {
          front = firstVariant.image_front || firstVariant.mockup_front || firstVariant.image || firstVariant.url;
        }
        if (!back && (firstVariant.image_back || firstVariant.mockup_back)) {
          back = firstVariant.image_back || firstVariant.mockup_back;
        }
      }
    } catch (err) {
      console.error("Error fetching variants for media:", err);
    }

    // 5. Fallback to legacy media subcollection if still empty
    if (!front) {
      const mediaColl = collection(prodRef, 'media');
      try {
        const frontDoc = await getDoc(doc(mediaColl, 'front'));
        if (frontDoc.exists()) {
          const mediaDocs = await getDocs(mediaColl);
          mediaDocs.forEach(d => {
            const mData = d.data();
            if (mData.angle === 'front' && mData.url) front = mData.url;
            if (mData.angle === 'back' && mData.url) back = mData.url;
            if (mData.angle === 'left' && mData.url) left = mData.url;
            if (mData.angle === 'right' && mData.url) right = mData.url;
          });
        } else {
          const defaultDoc = await getDoc(doc(mediaColl, 'default'));
          if (defaultDoc.exists()) {
            const dData = defaultDoc.data();
            front = dData.front || '';
            back = dData.back || '';
            left = dData.left || '';
            right = dData.right || '';
          }
        }
      } catch (mediaErr) {
        console.warn("Legacy media subcollection error:", mediaErr);
      }
    }

    return {
      front: front || FALLBACK_IMAGE,
      back: back || '',
      left: left || '',
      right: right || ''
    };
  } catch (error) {
    console.error(`Error fetching media for product ${productId}:`, error);
    return { front: FALLBACK_IMAGE, back: '', left: '', right: '' };
  }
}

export async function getProductFrontImage(productId: string) {
  const media = await getProductMedia(productId);
  return media.front;
}

/**
 * Pure function to expand raw product data into discrete storefront items
 * separating Ready-to-sell products and Blank customizable products across all colors.
 */
export function getExpandedProductsFromData(productDataList: any[]) {
  const expandedProducts: any[] = [];

  for (const data of productDataList) {
    if (data.is_active === false || data.isActive === false) continue;

    const productId = data.id || data.original_id || 'prod_' + Math.random().toString(36).substring(2);
    const images: any[] = Array.isArray(data.images) ? data.images : [];
    
    // Check if images have structured colorHex and type
    const structuredImages = images.filter((img: any) => img && img.url && img.colorHex);

    if (structuredImages.length > 0) {
      // Find all unique colors
      const uniqueColors = Array.from(new Set(structuredImages.map((img: any) => img.colorHex)));

      uniqueColors.forEach((colorHex) => {
        const colorImgs = structuredImages.filter((img: any) => img.colorHex === colorHex);
        const readyImgs = colorImgs.filter((img: any) => img.type === 'ready');
        const blankImgs = colorImgs.filter((img: any) => img.type === 'blank');
        const untypedImgs = colorImgs.filter((img: any) => !img.type);

        // Helper to extract 4 faces
        const extractFaces = (imgList: any[]) => {
          const front = imgList.find((i: any) => i.face === 'front') || imgList[0];
          const back = imgList.find((i: any) => i.face === 'back');
          const left = imgList.find((i: any) => i.face === 'left' || i.face === 'left_shoulder');
          const right = imgList.find((i: any) => i.face === 'right' || i.face === 'right_shoulder');
          return {
            front: front?.url || FALLBACK_IMAGE,
            back: back?.url || '',
            left: left?.url || '',
            right: right?.url || ''
          };
        };

        // 1. Ready-to-sell variant card
        if (readyImgs.length > 0) {
          const faces = extractFaces(readyImgs);
          expandedProducts.push({
            id: `${productId}?color=${encodeURIComponent(colorHex)}&type=ready`,
            original_id: productId,
            name_en: data.name_en || '',
            name_ar: data.name_ar || '',
            name_tr: data.name_tr || '',
            base_price: data.base_price || 0,
            badge: data.badge || 'READY_BADGE',
            colors: data.colors || uniqueColors,
            sales_count: data.sales_count || 0,
            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.created_at || new Date().toISOString()),
            media: faces,
            specificColor: colorHex,
            productType: 'ready',
            isCustomizable: false
          });
        }

        // 2. Blank customizable mockup card
        if (blankImgs.length > 0) {
          const faces = extractFaces(blankImgs);
          expandedProducts.push({
            id: `${productId}?color=${encodeURIComponent(colorHex)}&type=blank`,
            original_id: productId,
            name_en: `${data.name_en || ''} (Design Yourself)`,
            name_ar: `${data.name_ar || ''} (صمم بنفسك)`,
            name_tr: `${data.name_tr || ''} (Kendin Tasarla)`,
            base_price: data.base_price || 0,
            badge: 'CUSTOMIZABLE_BADGE',
            colors: data.colors || uniqueColors,
            sales_count: data.sales_count || 0,
            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.created_at || new Date().toISOString()),
            media: faces,
            specificColor: colorHex,
            productType: 'blank',
            isCustomizable: true
          });
        }

        // 3. Untyped fallback
        if (readyImgs.length === 0 && blankImgs.length === 0 && untypedImgs.length > 0) {
          const faces = extractFaces(untypedImgs);
          expandedProducts.push({
            id: `${productId}?color=${encodeURIComponent(colorHex)}`,
            original_id: productId,
            name_en: data.name_en || '',
            name_ar: data.name_ar || '',
            name_tr: data.name_tr || '',
            base_price: data.base_price || 0,
            badge: data.badge || '',
            colors: data.colors || uniqueColors,
            sales_count: data.sales_count || 0,
            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.created_at || new Date().toISOString()),
            media: faces,
            specificColor: colorHex,
            productType: 'ready',
            isCustomizable: false
          });
        }
      });
    } else {
      // Legacy fallback
      let baseFrontImage = FALLBACK_IMAGE;
      if (data.base_images && typeof data.base_images === 'object') {
        baseFrontImage = data.base_images.front || FALLBACK_IMAGE;
      } else if (images.length > 0 && images[0]?.url) {
        baseFrontImage = images[0].url;
      }

      expandedProducts.push({
        id: productId,
        original_id: productId,
        name_en: data.name_en || '',
        name_ar: data.name_ar || '',
        name_tr: data.name_tr || '',
        base_price: data.base_price || 0,
        badge: data.badge || '',
        colors: data.colors || [],
        sales_count: data.sales_count || 0,
        created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.created_at || new Date().toISOString()),
        media: { front: baseFrontImage },
        productType: 'ready',
        isCustomizable: false
      });
    }
  }

  return expandedProducts;
}

/**
 * Expands a list of Firestore product documents into a list of products where each unique color
 * and type (ready vs blank) is treated as a separate item for the storefront.
 */
export async function getExpandedProducts(productDocs: any[]) {
  const rawProductList = [];

  for (const docSnap of productDocs) {
    const data = docSnap.data();
    if (data.is_active === false || data.isActive === false) continue;

    const prodItem: any = {
      id: docSnap.id,
      ...data,
    };

    // If no images array but variants subcollection exists, load variants
    if (!Array.isArray(data.images) || data.images.length === 0) {
      try {
        const variantsSnap = await getDocs(collection(db, 'products', docSnap.id, 'variants'));
        if (!variantsSnap.empty) {
          const variantImages: any[] = [];
          variantsSnap.docs.forEach((v) => {
            const vData = v.data();
            const color = vData.hex || vData.colorName_en || vData.color || vData.colorName_ar;
            if (vData.image_front || vData.mockup_front || vData.image || vData.url) {
              variantImages.push({
                url: vData.image_front || vData.mockup_front || vData.image || vData.url,
                face: 'front',
                colorHex: color,
                type: 'blank',
              });
            }
            if (vData.image_back || vData.mockup_back) {
              variantImages.push({
                url: vData.image_back || vData.mockup_back,
                face: 'back',
                colorHex: color,
                type: 'blank',
              });
            }
          });
          if (variantImages.length > 0) {
            prodItem.images = variantImages;
          }
        }
      } catch (varErr) {
        console.warn(`Variants query error for product ${docSnap.id}:`, varErr);
      }
    }

    rawProductList.push(prodItem);
  }

  return getExpandedProductsFromData(rawProductList);
}
