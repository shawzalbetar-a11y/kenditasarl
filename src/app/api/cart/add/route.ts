import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PRICING = {
  text: 10,
  image: 20,
  sticker: 5,
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = JSON.parse(JSON.stringify(rawBody));
    const { productId, size, color, designId, quantity, userId } = body;
    
    const effectiveUserId = userId || 'guest_user';

    if (!productId || !designId) {
      return NextResponse.json({ error: 'Missing required productId or designId' }, { status: 400 });
    }
    
    // 1. Verify Product & Base Price
    let unitPrice = 250;
    try {
      const productSnap = await getDoc(doc(db, 'products', productId));
      if (productSnap.exists()) {
        const productData = productSnap.data();
        unitPrice = productData.base_price || 250;
      }
    } catch (pErr) {
      console.warn("Product fetch fallback:", pErr);
    }
    
    // 2. Verify Design & Calculate Additions Server-Side
    let extraCost = 0;
    try {
      const designSnap = await getDoc(doc(db, 'designs', designId));
      if (designSnap.exists()) {
        const designData = designSnap.data();
        const canvasJson = designData.canvas_json;
        
        if (canvasJson && typeof canvasJson === 'object') {
          Object.values(canvasJson).forEach((faceJson: any) => {
            try {
              const parsed = typeof faceJson === 'string' ? JSON.parse(faceJson) : faceJson;
              if (parsed && parsed.objects && Array.isArray(parsed.objects)) {
                parsed.objects.forEach((obj: any) => {
                  if (obj.type === 'textbox' || obj.type === 'i-text') extraCost += PRICING.text;
                  else if (obj.type === 'image') {
                    if (obj.name === 'sticker') extraCost += PRICING.sticker;
                    else extraCost += PRICING.image;
                  }
                });
              }
            } catch (e) {}
          });
        }
      }
    } catch (dErr) {
      console.warn("Design fetch fallback:", dErr);
    }
    
    unitPrice += extraCost;
    
    // 3. Create Clean Cart Item (Zero undefined values)
    const cartItem = JSON.parse(JSON.stringify({
      user_id: effectiveUserId,
      product_id: productId,
      variant_id: `${color || 'default'}_${size || 'M'}`,
      design_id: designId,
      design_type: 'custom',
      quantity: Number(quantity) || 1,
      unit_price: unitPrice,
      created_at: new Date().toISOString()
    }));
    
    const newCartDoc = await addDoc(collection(db, 'cart_items'), cartItem);
    
    return NextResponse.json({ success: true, cartItemId: newCartDoc.id, unitPrice });
  } catch (err: any) {
    console.error("API Error Details in /api/cart/add:", err);
    return NextResponse.json({ success: false, error: err.message || 'Cart operation failed' }, { status: 500 });
  }
}
