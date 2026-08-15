import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

const FALLBACK_IMAGE = 'https://via.placeholder.com/800x1000?text=No+Image';

/**
 * Fetches the media for a product, handling both the old schema (media/default)
 * and the new schema (media/{angle}). Returns a structured object with front, back, left, right.
 */
export async function getProductMedia(productId: string) {
  if (!db) return { front: FALLBACK_IMAGE, back: '', left: '', right: '' };
  
  try {
    const prodRef = doc(db, 'products', productId);
    const docSnap = await getDoc(prodRef);
    if (docSnap.exists() && docSnap.data().base_images) {
      const baseImages = docSnap.data().base_images;
      let mediaMap = {
        front: baseImages.front || FALLBACK_IMAGE,
        back: baseImages.back || '',
        left: baseImages.left || '',
        right: baseImages.right || ''
      };
      
      // Try to get the first variant's images if they exist
      try {
        const variantsSnap = await getDocs(collection(prodRef, 'variants'));
        if (!variantsSnap.empty) {
          const firstVariant = variantsSnap.docs[0].data();
          if (firstVariant.image_front) {
            mediaMap.front = firstVariant.image_front;
          }
          if (firstVariant.image_back) {
            mediaMap.back = firstVariant.image_back;
          }
        }
      } catch (err) {
        console.error("Error fetching variants for media:", err);
      }
      
      return mediaMap;
    }

    const mediaColl = collection(prodRef, 'media');
    
    // Check if new schema exists by getting the 'front' angle
    const frontDoc = await getDoc(doc(mediaColl, 'front'));
    
    if (frontDoc.exists()) {
      // New schema: Fetch all angles (they should be named front, back, left, right)
      const mediaDocs = await getDocs(mediaColl);
      const mediaMap: any = { front: FALLBACK_IMAGE, back: '', left: '', right: '' };
      
      mediaDocs.forEach(d => {
        const data = d.data();
        if (data.angle && data.url) {
          mediaMap[data.angle] = data.url;
        }
      });
      return mediaMap;
    } else {
      // Fallback to old schema (media/default)
      const defaultDoc = await getDoc(doc(mediaColl, 'default'));
      if (defaultDoc.exists()) {
        const data = defaultDoc.data();
        return {
          front: data.front || FALLBACK_IMAGE,
          back: data.back || '',
          left: data.left || '',
          right: data.right || ''
        };
      }
      
      return { front: FALLBACK_IMAGE, back: '', left: '', right: '' };
    }
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
 * Expands a list of product documents into a list of products where each unique color
 * variant is treated as a separate product for the storefront.
 */
export async function getExpandedProducts(productDocs: any[]) {
  const expandedProducts = [];
  
  for (const doc of productDocs) {
    const data = doc.data();
    if (!data.is_active) continue;

    const variantsSnap = await getDocs(collection(db, 'products', doc.id, 'variants'));
    const colorMap = new Map();

    variantsSnap.docs.forEach(v => {
      const vData = v.data();
      // Try to get color code (hex) or name
      const color = vData.hex || vData.colorName_en;
      if (color && !colorMap.has(color)) {
        colorMap.set(color, vData.image_front || null);
      }
    });

    const baseFrontImage = await getProductFrontImage(doc.id);

    if (colorMap.size > 0) {
      Array.from(colorMap.entries()).forEach(([color, image_front]) => {
        expandedProducts.push({
          id: `${doc.id}?color=${encodeURIComponent(color)}`,
          original_id: doc.id,
          name_en: data.name_en || '',
          name_ar: data.name_ar || '',
          name_tr: data.name_tr || '',
          base_price: data.base_price || 0,
          badge: data.badge || '',
          colors: data.colors || [],
          sales_count: data.sales_count || 0,
          created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.created_at || new Date().toISOString()),
          media: { front: image_front || baseFrontImage },
          specificColor: color
        });
      });
    } else {
      expandedProducts.push({
        id: doc.id,
        original_id: doc.id,
        name_en: data.name_en || '',
        name_ar: data.name_ar || '',
        name_tr: data.name_tr || '',
        base_price: data.base_price || 0,
        badge: data.badge || '',
        colors: data.colors || [],
        sales_count: data.sales_count || 0,
        created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.created_at || new Date().toISOString()),
        media: { front: baseFrontImage }
      });
    }
  }
  
  return expandedProducts;
}
