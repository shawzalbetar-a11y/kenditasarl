import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';

const PRICING = {
  text: 10,
  image: 20,
  sticker: 5,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, size, color, designId, quantity, userId } = body;
    
    if (!productId || !userId || !designId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // 1. Verify Product & Base Price
    const productSnap = await getDoc(doc(db, 'products', productId));
    if (!productSnap.exists()) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    const productData = productSnap.data();
    let unitPrice = productData.base_price || 250;
    
    // 2. Verify Design & Calculate Additions Server-Side
    const designSnap = await getDoc(doc(db, 'designs', designId));
    if (!designSnap.exists()) {
       return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }
    const designData = designSnap.data();
    const canvasJson = designData.canvas_json;
    
    let extraCost = 0;
    if (canvasJson) {
      Object.values(canvasJson).forEach((faceJsonStr: any) => {
        try {
          const parsed = JSON.parse(faceJsonStr);
          if (parsed.objects && Array.isArray(parsed.objects)) {
            parsed.objects.forEach((obj: any) => {
              if (obj.type === 'textbox' || obj.type === 'i-text') extraCost += PRICING.text;
              else if (obj.type === 'image') {
                if (obj.name === 'sticker') extraCost += PRICING.sticker;
                else extraCost += PRICING.image;
              }
            });
          }
        } catch(e) { }
      });
    }
    
    unitPrice += extraCost;
    
    // 3. Create Cart Item
    const cartItem = {
      user_id: userId,
      product_id: productId,
      variant_id: `${color}_${size}`,
      design_id: designId,
      design_type: 'custom',
      quantity: quantity || 1,
      unit_price: unitPrice,
      created_at: new Date().toISOString()
    };
    
    const newCartDoc = await addDoc(collection(db, 'cart_items'), cartItem);
    
    return NextResponse.json({ success: true, cartItemId: newCartDoc.id, unitPrice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
