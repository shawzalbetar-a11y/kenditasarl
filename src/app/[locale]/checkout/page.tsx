"use client";

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useCheckoutStore } from '@/store/useCheckoutStore';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, runTransaction, writeBatch, serverTimestamp, increment, getDoc } from 'firebase/firestore';
import { Loader2, MapPin, Truck, Zap } from 'lucide-react';
import { getProductFrontImage } from '@/lib/products';

export default function CheckoutSummaryPage() {
  const t = useTranslations('Checkout');
  const locale = useLocale();
  const router = useRouter();
  
  const { selectedAddress, deliveryMethod, deliveryFee } = useCheckoutStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [userPhone, setUserPhone] = useState<string>('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists() && userDoc.data().phone) {
             setUserPhone(userDoc.data().phone);
          }
        } catch(e) {}
        
        if (!selectedAddress || !deliveryMethod) {
          // If state is empty (e.g., hard refresh), go back to cart
          router.push('/cart');
          return;
        }
        fetchCartItems(currentUser.uid);
      } else {
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, [selectedAddress, deliveryMethod, router]);

  const fetchCartItems = async (uid: string) => {
    try {
      const q = query(collection(db, 'cart_items'), where('user_id', '==', uid));
      const snap = await getDocs(q);
      const cartItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Also fetch product names for error messages
      const itemsWithNames = await Promise.all(cartItems.map(async (item: any) => {
        let name = 'Product';
        let imageUrl = item.image_url || null;
        try {
           const pSnap = await getDocs(query(collection(db, 'products'), where('__name__', '==', item.product_id)));
           if (!pSnap.empty) {
              const pData = pSnap.docs[0].data();
              name = pData[`name_${locale}`] || pData.name_en || 'Product';
              
              if (item.variant_id) {
                const [color, size] = item.variant_id.split('_');
                const varsSnap = await getDocs(collection(db, 'products', item.product_id, 'variants'));
                let colorName = '';
                for (const vDoc of varsSnap.docs) {
                  const vData = vDoc.data();
                  const docColor = vData.hex || vData.colorName_en || vData.color;
                  if (docColor === color) {
                    colorName = vData[`colorName_${locale}`] || vData.colorName_en || color;
                    if (vData.image_front) {
                      imageUrl = vData.image_front;
                    }
                    break;
                  }
                }
                item.colorName = colorName;
              }
              if (!imageUrl) {
                 imageUrl = await getProductFrontImage(item.product_id);
              }
           }
           if (item.design_id && !imageUrl) {
             const designSnap = await getDoc(doc(db, 'designs', item.design_id));
             if (designSnap.exists()) {
                imageUrl = designSnap.data().preview_image_url;
             }
           }
        } catch(e) {}
        return { ...item, name, imageUrl: imageUrl || 'https://via.placeholder.com/100' };
      }));
      
      setItems(itemsWithNames);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!user || items.length === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      // 1. Prepare Variant References
      const itemRefs: any[] = [];
      for (const item of items) {
        if (item.variant_id) {
          const [color, size] = item.variant_id.split('_');
          const varsSnap = await getDocs(collection(db, 'products', item.product_id, 'variants'));
          let foundVarRef = null;
          let foundSize = null;
          for (const vDoc of varsSnap.docs) {
            const vData = vDoc.data();
            const docColor = vData.hex || vData.colorName_en || vData.color;
            if (docColor === color) {
              if (vData.sizes && vData.sizes[size] !== undefined) {
                foundVarRef = vDoc.ref;
                foundSize = size;
                break;
              } else if (vData.size === size) {
                foundVarRef = vDoc.ref;
                break;
              }
            }
          }
          
          if (foundVarRef) {
             itemRefs.push({ item, varRef: foundVarRef, size: foundSize });
          } else {
             throw new Error(`Variant not found for ${item.name}`);
          }
        }
      }

      // 2. Run Transaction
      const orderId = doc(collection(db, 'orders')).id;
      let currentOrderNum = 1000; // Starting number
      
      await runTransaction(db, async (transaction) => {
        // Read Phase
        const counterRef = doc(db, 'counters', 'orders');
        const counterDoc = await transaction.get(counterRef);
        
        if (counterDoc.exists() && counterDoc.data().current_value) {
           currentOrderNum = counterDoc.data().current_value + 1;
        }

        const variantDocs = [];
        for (const { item, varRef, size } of itemRefs) {
           const vDoc = await transaction.get(varRef);
           if (!vDoc.exists()) throw new Error(`Variant not found for ${item.name}`);
           const vData = vDoc.data() as any;
           
           let stock = 0;
           if (size && vData.sizes) {
             stock = vData.sizes[size] || 0;
           } else {
             stock = vData.stock || 0;
           }
           
           if (stock < item.quantity) {
              throw new Error(t('outOfStockError', { name: item.name }));
           }
           variantDocs.push({ varRef, newStock: stock - item.quantity, size, vData });
        }

        // Write Phase
        transaction.set(counterRef, { current_value: currentOrderNum }, { merge: true });

        const orderRef = doc(db, 'orders', orderId);
        transaction.set(orderRef, {
           user_id: user.uid,
           order_number: `ORD-${currentOrderNum}`,
           status: 'pending',
           delivery_method: deliveryMethod,
           address_id: selectedAddress?.id || null,
           delivery_fee: deliveryFee,
           subtotal,
           total,
           payment_method: 'cod',
           payment_status: 'pending_cod',
           locale: locale,
           created_at: serverTimestamp()
        });

        items.forEach(item => {
           const itemRef = doc(collection(orderRef, 'items'));
           transaction.set(itemRef, {
              product_id: item.product_id,
              variant_id: item.variant_id || null,
              design_id: item.design_id || null,
              quantity: item.quantity,
              unit_price: item.unit_price
           });
        });

        for (const { varRef, newStock, size, vData } of variantDocs) {
           if (size && vData.sizes) {
             transaction.update(varRef, { [`sizes.${size}`]: newStock });
           } else {
             transaction.update(varRef, { stock: newStock });
           }
        }
      });

      // 3. Cleanup Cart
      const batch = writeBatch(db);
      items.forEach(item => {
         batch.delete(doc(db, 'cart_items', item.id));
      });
      await batch.commit();

      // 4. Send Confirmation Email (Async)
      if (user.email) {
        fetch('/api/email/order-confirmation', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ 
             email: user.email,
             customerName: user.displayName || user.email.split('@')[0],
             customerPhone: userPhone,
             locale: locale,
             deliveryAddress: selectedAddress ? `${selectedAddress.detailed_address || selectedAddress.full_address}, ${selectedAddress.city || ''}` : '',
             orderNumber: `ORD-${currentOrderNum}`,
             total,
             deliveryMethod,
             items: items.map(i => ({ 
               name: i.name, 
               quantity: i.quantity, 
               price: i.unit_price,
               color: i.color,
               size: i.size,
               customText: i.custom_text
             }))
           })
        }).catch(console.error);
      }

      // 5. Redirect
      router.push(`/order-confirmation/${orderId}`);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while confirming your order.');
      setIsProcessing(false);
    }
  };

  const subtotal = items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);
  const total = subtotal + deliveryFee;

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex justify-center text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-28 pb-16 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-[var(--color-text)]">{t('orderSummary')}</h1>
        
        <div className="flex flex-col lg:flex-row gap-8">
          
          <div className="flex-1 space-y-6">
            {/* Delivery Info */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-border/50">
              <h2 className="text-xl font-bold mb-4">{t('deliveryDetails')}</h2>
              
              <div className="flex items-start gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
                <MapPin className="text-[var(--color-primary)] mt-0.5" size={20} />
                <div>
                  <p className="font-bold">{selectedAddress?.label}</p>
                  <p className="text-sm text-gray-600">{selectedAddress?.full_address}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                {deliveryMethod === 'express' ? (
                  <Zap className="text-orange-500 mt-0.5" size={20} />
                ) : (
                  <Truck className="text-blue-500 mt-0.5" size={20} />
                )}
                <div>
                  <p className="font-bold">
                    {deliveryMethod === 'express' ? t('expressDelivery') : t('standardShipping')}
                  </p>
                  <p className="text-sm text-gray-600">
                    {deliveryMethod === 'express' ? t('expressTime') : t('standardTime')}
                  </p>
                </div>
              </div>
            </div>

            {/* Placeholder for Cart Items summary if needed later */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-border/50">
               <h2 className="text-lg font-bold mb-4">{t('itemsCount', { count: items.length })}</h2>
               <div className="space-y-4">
                 {items.map(item => (
                   <div key={item.id} className="flex gap-4">
                     <div className="w-12 h-12 rounded-md bg-gray-100 overflow-hidden relative border border-gray-200 flex-shrink-0">
                       <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full" />
                     </div>
                     <div className="flex-1">
                       <p className="font-bold text-sm">{item.name}</p>
                       <p className="text-xs text-gray-500 mt-0.5">
                          {t('quantity')}: {item.quantity} 
                          {item.variant_id && item.variant_id.includes('_') ? ` | ${item.colorName ? item.colorName + ' - ' : ''}${t('size')}: ${item.variant_id.split('_')[1]}` : (item.size ? ` | ${t('size')}: ${item.size}` : '')}
                       </p>
                     </div>
                     <div className="font-bold text-sm">
                       {item.unit_price * item.quantity} ₺
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>

          <div className="w-full lg:w-96 flex-shrink-0">
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-border/50 sticky top-28">
              <h2 className="text-xl font-bold mb-6 text-[var(--color-text)]">{t('paymentSummary')}</h2>
              
              <div className="space-y-3 text-sm mb-6">
                <div className="flex justify-between items-center text-gray-600">
                  <span>{t('subtotal')}</span>
                  <span className="font-semibold">{subtotal} ₺</span>
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span>{t('deliveryFee')}</span>
                  <span className="font-semibold">{deliveryFee} ₺</span>
                </div>
              </div>
              
              <div className="h-px w-full bg-border/60 my-4"></div>
              
              <div className="flex justify-between items-center mb-8">
                <span className="text-lg font-bold">{t('total')}</span>
                <span className="text-2xl font-black text-[var(--color-primary)]">{total} ₺</span>
              </div>
              
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-4">
                  {error}
                </div>
              )}

              <button 
                onClick={handleConfirmOrder}
                disabled={isProcessing || items.length === 0}
                className="w-full py-4 rounded-xl font-bold text-lg bg-[var(--color-action)] text-white hover:bg-opacity-90 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    {t('confirmingOrder')}
                  </>
                ) : (
                  t('payNow')
                )}
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
