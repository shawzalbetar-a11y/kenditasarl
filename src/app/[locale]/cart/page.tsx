"use client";

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Trash2, Minus, Plus, ShoppingBag, Loader2 } from 'lucide-react';
import { getProductFrontImage } from '@/lib/products';
import Image from 'next/image';
import AddressSelectionModal from '@/components/checkout/AddressSelectionModal';
import DeliveryMethodModal from '@/components/checkout/DeliveryMethodModal';
import { useCheckoutStore } from '@/store/useCheckoutStore';
import { useRouter } from '@/i18n/routing';

export default function CartPage() {
  const t = useTranslations('Cart');
  const locale = useLocale();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  
  const { setCheckoutData } = useCheckoutStore();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [selectedAddressForDelivery, setSelectedAddressForDelivery] = useState<any>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchCartItems(currentUser.uid);
      } else {
        setItems([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchCartItems = async (uid: string) => {
    setLoading(true);
    try {
      const q = query(collection(db, 'cart_items'), where('user_id', '==', uid));
      const snap = await getDocs(q);
      
      const itemPromises = snap.docs.map(async (cartDoc) => {
        const data = cartDoc.data();
        
        // Fetch product details
        let title = '';
        let maxStock = 0;
        let imageUrl = '';
        let colorName = '';
        
        try {
          const prodSnap = await getDoc(doc(db, 'products', data.product_id));
          if (prodSnap.exists()) {
            const prodData = prodSnap.data();
            title = prodData[`name_${locale}`] || prodData.name_en;
            
            if (data.variant_id) {
              const [color, size] = data.variant_id.split('_');
              const allVarsSnap = await getDocs(collection(db, 'products', data.product_id, 'variants'));
              
              for (const vDoc of allVarsSnap.docs) {
                const vData = vDoc.data();
                const vColor = vData.hex || vData.colorName_en || vData.color;
                
                if (vColor === color) {
                  // Extract localized color name
                  colorName = vData[`colorName_${locale}`] || vData.colorName_en || color;

                  // Check stock based on schema
                  if (vData.sizes) {
                    maxStock = vData.sizes[size] || 0;
                  } else if (vData.size === size) {
                    maxStock = vData.stock || 0;
                  }
                  
                  // Get image
                  if (vData.image_front) {
                    imageUrl = vData.image_front;
                  }
                  
                  break; // Found matching color
                }
              }
            }
          }
          
          if (data.design_id) {
            const designSnap = await getDoc(doc(db, 'designs', data.design_id));
            if (designSnap.exists()) {
               imageUrl = designSnap.data().preview_image_url;
            }
          }
          
          if (!imageUrl) {
             imageUrl = await getProductFrontImage(data.product_id);
          }
        } catch (e) {
          console.error(e);
        }
        
        return {
          id: cartDoc.id,
          ...data,
          title,
          maxStock,
          colorName: colorName || (data.variant_id ? data.variant_id.split('_')[0] : ''),
          imageUrl: imageUrl || 'https://via.placeholder.com/200'
        };
      });
      
      const resolvedItems = await Promise.all(itemPromises);
      // Sort by created_at desc
      resolvedItems.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      
      setItems(resolvedItems);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (id: string, currentQty: number, maxStock: number, change: number) => {
    const newQty = currentQty + change;
    if (newQty < 1 || newQty > maxStock) return;
    
    // Optimistic update
    setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: newQty } : item));
    
    try {
      await updateDoc(doc(db, 'cart_items', id), { quantity: newQty });
    } catch (err) {
      console.error(err);
      fetchCartItems(user.uid);
    }
  };

  const removeItem = async (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, 'cart_items', id));
    } catch (err) {
      console.error(err);
      fetchCartItems(user.uid);
    }
  };

  const subtotal = items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);

  const handleCheckoutClick = async () => {
    if (!user) return;
    setIsCheckingOut(true);
    try {
      const q = query(collection(db, 'addresses'), where('user_id', '==', user.uid));
      const snap = await getDocs(q);
      if (snap.empty) {
        router.push('/account/addresses?returnTo=/cart');
        return;
      }
      setAddresses(snap.docs.map(d => ({id: d.id, ...d.data()})));
      setIsAddressModalOpen(true);
    } catch (e) {
      console.error(e);
      alert(t('checkoutError') || 'Error fetching addresses');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleAddressSelect = (addr: any) => {
    setIsAddressModalOpen(false);
    setSelectedAddressForDelivery(addr);
    setIsDeliveryModalOpen(true);
  };

  const handleDeliveryConfirm = (method: 'shipping' | 'express', fee: number, distance: number) => {
    setCheckoutData({
      selectedAddress: selectedAddressForDelivery,
      deliveryMethod: method,
      deliveryFee: fee,
      distance
    });
    setIsDeliveryModalOpen(false);
    router.push('/checkout');
  };

  if (loading) {
    return <div className="min-h-screen pt-32 text-center text-gray-500">{t('loading')}</div>;
  }

  if (!user || items.length === 0) {
    return (
      <div className="min-h-screen pt-32 pb-16 px-4 max-w-[95rem] mx-auto flex flex-col items-center justify-center text-center">
        <ShoppingBag className="w-32 h-32 text-gray-200 mb-8" />
        <h1 className="text-3xl md:text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-gray-500 text-lg mb-8">{t('emptyMessage')}</p>
        <Link href="/" className="bg-[var(--color-primary)] text-white px-8 py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-all hover:-translate-y-1 shadow-lg">
          {t('startShopping')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-28 pb-16 px-4 md:px-8">
      <div className="max-w-[95rem] mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-[var(--color-text)]">{t('title')}</h1>
        
        <div className="flex flex-col lg:flex-row gap-10">
          
          {/* Cart Items List */}
          <div className="flex-1 flex flex-col gap-6">
            {items.map(item => {
              const [color, size] = item.variant_id ? item.variant_id.split('_') : ['', ''];
              
              return (
                <div key={item.id} className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-border/50 flex flex-col sm:flex-row gap-6 relative group">
                  
                  {/* Remove Button */}
                  <button 
                    onClick={() => removeItem(item.id)}
                    className="absolute top-4 ltr:right-4 rtl:left-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title={t('remove')}
                  >
                    <Trash2 size={20} />
                  </button>

                  {/* Product Image */}
                  <Link href={`/products/${item.product_id}`} className="w-full sm:w-32 h-40 sm:h-32 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 relative block border border-gray-100">
                    <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                  </Link>

                  {/* Product Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <Link href={`/products/${item.product_id}`} className="font-bold text-lg text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors pr-8">
                        {item.title}
                      </Link>
                      <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 font-medium">
                        {color && (
                          <div className="flex items-center gap-1">
                            <span className="w-4 h-4 rounded-full border border-gray-300 shadow-sm" style={{ backgroundColor: color === 'navy' ? '#000080' : color }} title={item.colorName || color} />
                            <span className="capitalize">{item.colorName || color}</span>
                          </div>
                        )}
                        {size && (
                          <>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span>{t('size')}: {size}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
                      {/* Price */}
                      <span className="font-black text-xl text-[var(--color-primary)]">
                        {item.unit_price} ₺
                      </span>
                      
                      {/* Quantity Control */}
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center h-10 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity, item.maxStock, -1)}
                            disabled={item.quantity <= 1}
                            className="w-10 h-full flex items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-10 text-center font-bold text-sm">
                            {item.quantity}
                          </span>
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity, item.maxStock, 1)}
                            disabled={item.quantity >= item.maxStock}
                            className="w-10 h-full flex items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        {item.quantity >= item.maxStock && item.maxStock > 0 && (
                          <span className="text-[10px] text-red-500 font-bold">{t('maxStockWarning')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Order Summary */}
          <div className="w-full lg:w-96 flex-shrink-0">
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-border/50 sticky top-28">
              <h2 className="text-xl font-bold mb-6 text-[var(--color-text)]">{t('title')}</h2>
              
              <div className="flex justify-between items-center mb-6">
                <span className="text-gray-500 font-medium">{t('subtotal')}</span>
                <span className="text-2xl font-black text-[var(--color-primary)]">{subtotal} ₺</span>
              </div>
              
              <div className="h-px w-full bg-border/60 my-6"></div>
              
              <button 
                onClick={handleCheckoutClick}
                disabled={isCheckingOut}
                className="w-full py-4 rounded-xl font-bold text-lg bg-[var(--color-action)] text-white hover:opacity-90 shadow-sm flex items-center justify-center gap-2"
              >
                {isCheckingOut && <Loader2 size={20} className="animate-spin" />}
                {t('checkout')}
              </button>
            </div>
          </div>
          
        </div>
      </div>

      <AddressSelectionModal 
        isOpen={isAddressModalOpen} 
        onClose={() => setIsAddressModalOpen(false)} 
        addresses={addresses} 
        onSelect={handleAddressSelect} 
      />

      <DeliveryMethodModal 
        isOpen={isDeliveryModalOpen} 
        onClose={() => setIsDeliveryModalOpen(false)} 
        address={selectedAddressForDelivery} 
        onConfirm={handleDeliveryConfirm} 
      />
    </div>
  );
}
