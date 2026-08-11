'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { auth, db } from '@/lib/firebase';
import { getProductFrontImage } from '@/lib/products';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { CheckCircle2, Loader2, Package, MapPin, CreditCard, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import Image from 'next/image';

export default function OrderConfirmationPage({ params }: { params: { orderId: string, locale: string } }) {
  const t = useTranslations('Checkout');
  const router = useRouter();
  
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [address, setAddress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }
      
      try {
        const orderSnap = await getDoc(doc(db, 'orders', params.orderId));
        if (!orderSnap.exists() || orderSnap.data().user_id !== user.uid) {
          router.push('/');
          return;
        }
        
        const orderData = orderSnap.data();
        setOrder({ id: orderSnap.id, ...orderData });
        
        if (orderData.address_id) {
           const addrSnap = await getDoc(doc(db, 'addresses', orderData.address_id));
           if (addrSnap.exists()) setAddress(addrSnap.data());
        }

        const itemsSnap = await getDocs(collection(db, 'orders', params.orderId, 'items'));
        const orderItems = await Promise.all(itemsSnap.docs.map(async (d) => {
           const idata = d.data();
           let title = 'Product';
           let imageUrl = 'https://via.placeholder.com/150';
           
           try {
              const pSnap = await getDoc(doc(db, 'products', idata.product_id));
              if (pSnap.exists()) {
                 const pData = pSnap.data();
                 title = pData[`name_${params.locale}`] || pData.name_en || 'Product';
                 // Get variant image if it exists
                 if (idata.variant_id) {
                    const [color, size] = idata.variant_id.split('_');
                    const allVarsSnap = await getDocs(collection(db, 'products', idata.product_id, 'variants'));
                    let colorName = '';
                    for (const vDoc of allVarsSnap.docs) {
                       const vData = vDoc.data();
                       const vColor = vData.hex || vData.colorName_en || vData.color;
                       if (vColor === color) {
                          colorName = vData[`colorName_${params.locale}`] || vData.colorName_en || color;
                          if (vData.image_front) {
                             imageUrl = vData.image_front;
                          }
                          break;
                       }
                    }
                    idata.colorName = colorName;
                 } else {
                    const frontImage = await getProductFrontImage(idata.product_id);
                    if (frontImage) {
                       imageUrl = frontImage;
                    }
                 }
              }
              if (idata.design_id) {
                 const designSnap = await getDoc(doc(db, 'designs', idata.design_id));
                 if (designSnap.exists()) {
                    imageUrl = designSnap.data().preview_image_url || imageUrl;
                 }
              }
           } catch(e) {}
           return { id: d.id, ...idata, title, imageUrl };
        }));
        setItems(orderItems);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, [params.orderId, params.locale, router]);

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex justify-center text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-28 pb-16 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border border-border/50 text-center mb-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]"></div>
          
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="text-green-500 w-10 h-10" />
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-[var(--color-text)]">
            {t('orderConfirmedTitle', { fallback: 'Thank you for your order! 🎉' })}
          </h1>
          <p className="text-gray-500 text-lg mb-8">
            {t('orderConfirmedDesc', { fallback: 'We have received your order and are getting it ready to be shipped.' })}
          </p>
          
          <div className="inline-flex items-center gap-4 bg-gray-50 px-6 py-4 rounded-2xl border border-gray-100">
            <div className="text-left rtl:text-right">
              <p className="text-sm text-gray-500 mb-1">{t('orderNumber', { fallback: 'Order Number' })}</p>
              <p className="font-bold text-xl font-mono">{order.order_number}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
           <div className="bg-white rounded-2xl p-6 shadow-sm border border-border/50">
             <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
               <MapPin className="text-[var(--color-primary)]" size={20} />
               {t('deliveryAddress', { fallback: 'Delivery Address' })}
             </h3>
             {address ? (
                <div className="text-gray-600 leading-relaxed">
                  <p className="font-semibold text-gray-900 mb-1">{address.label}</p>
                  <p>{address.detailed_address || address.full_address}</p>
                  {(address.city || address.district) && (
                     <p className="text-sm mt-1">{address.city} - {address.district}</p>
                  )}
                </div>
             ) : (
               <p className="text-gray-500 italic">No address provided</p>
             )}
           </div>

           <div className="bg-white rounded-2xl p-6 shadow-sm border border-border/50">
             <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
               <CreditCard className="text-[var(--color-primary)]" size={20} />
               {t('paymentDetails', { fallback: 'Payment Details' })}
             </h3>
             <div className="space-y-2 text-gray-600">
               <div className="flex justify-between">
                 <span>{t('paymentMethod', { fallback: 'Method' })}:</span>
                 <span className="font-semibold text-gray-900">{t('cashOnDelivery', { fallback: 'Cash on Delivery' })}</span>
               </div>
               <div className="flex justify-between">
                 <span>{t('total', { fallback: 'Total' })}:</span>
                 <span className="font-bold text-lg text-[var(--color-primary)]">{order.total} ₺</span>
               </div>
             </div>
           </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
           <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
             <Package className="text-[var(--color-primary)]" size={20} />
             {t('orderItems', { fallback: 'Order Items' })}
           </h3>
           <div className="space-y-4">
             {items.map(item => (
               <div key={item.id} className="flex gap-4 p-4 bg-gray-50 rounded-xl">
                 <div className="w-16 h-16 rounded-lg bg-white overflow-hidden border border-gray-100 flex-shrink-0 relative">
                   <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                 </div>
                 <div className="flex-1">
                   <h4 className="font-bold text-sm mb-1">{item.title}</h4>
                   <p className="text-xs text-gray-500">
                     {t('quantity')}: {item.quantity}
                     {item.variant_id && item.variant_id.includes('_') ? ` | ${item.colorName ? item.colorName + ' - ' : ''}${t('size')}: ${item.variant_id.split('_')[1]}` : ''}
                   </p>
                 </div>
                 <div className="font-bold">
                   {item.unit_price * item.quantity} ₺
                 </div>
               </div>
             ))}
           </div>
        </div>

        <div className="flex gap-4 flex-col sm:flex-row">
          <Link href="/" className="flex-1 bg-[var(--color-primary)] text-white text-center py-4 rounded-xl font-bold hover:bg-opacity-90 transition-all">
            {t('continueShopping', { fallback: 'Continue Shopping' })}
          </Link>
          <Link href="/account/orders" className="flex-1 bg-white border-2 border-gray-200 text-gray-700 text-center py-4 rounded-xl font-bold hover:bg-gray-50 transition-all">
            {t('viewMyOrders', { fallback: 'View My Orders' })}
          </Link>
        </div>

      </div>
    </div>
  );
}
