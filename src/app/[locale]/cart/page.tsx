"use client";

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Trash2, Minus, Plus, ShoppingBag, Loader2, PenTool } from 'lucide-react';
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

  const [clearing, setClearing] = useState(false);

  const removeItem = async (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, 'cart_items', id));
    } catch (err) {
      console.error(err);
      fetchCartItems(user.uid);
    }
  };

  const clearCart = async () => {
    if (!user || items.length === 0 || clearing) return;
    if (!window.confirm(t('clearCartConfirm') || 'Are you sure you want to clear your cart?')) {
      return;
    }
    setClearing(true);
    const previousItems = [...items];
    setItems([]); // optimistic clear
    try {
      const q = query(collection(db, 'cart_items'), where('user_id', '==', user.uid));
      const snap = await getDocs(q);
      const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (err) {
      console.error(err);
      setItems(previousItems);
    } finally {
      setClearing(false);
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
    <div className="min-h-screen bg-[var(--color-background)] pt-24 sm:pt-28 pb-16 px-3 sm:px-4 md:px-8">
      <div className="max-w-[95rem] mx-auto">
        
        {/* Cart Header: Title and Clear Cart Button */}
        <div className="flex items-center justify-between gap-3 mb-6 pb-2 border-b border-border/40">
          <div className="flex items-baseline gap-2 sm:gap-3">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--color-text)]">
              {t('title')}
            </h1>
            <span className="text-xs sm:text-sm font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
              {items.length}
            </span>
          </div>

          <button
            type="button"
            onClick={clearCart}
            disabled={clearing}
            className="flex items-center gap-1.5 text-xs sm:text-sm text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 active:scale-95 px-3 py-1.5 sm:py-2 rounded-xl font-semibold transition-all border border-red-200/70 disabled:opacity-50 cursor-pointer"
            title={t('clearCart')}
          >
            {clearing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            <span>{t('clearCart')}</span>
          </button>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
          
          {/* Cart Items List */}
          <div className="flex-1 flex flex-col gap-4 sm:gap-6">
            {items.map(item => {
              const [color, size] = item.variant_id ? item.variant_id.split('_') : ['', ''];
              
              return (
                <div 
                  key={item.id} 
                  className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm border border-border/60 hover:border-gray-300 transition-all flex flex-row gap-3 sm:gap-5 relative group"
                >
                  {/* Product Image Thumbnail */}
                  <Link 
                    href={`/products/${item.product_id}`} 
                    className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-gray-50 shrink-0 relative block border border-gray-100 self-center sm:self-start"
                  >
                    <Image 
                      src={item.imageUrl} 
                      alt={item.title} 
                      fill 
                      sizes="(max-width: 640px) 96px, 128px"
                      className="object-cover" 
                    />
                  </Link>

                  {/* Product Details Column */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      {/* Top Row: Title + Delete Button */}
                      <div className="flex items-start justify-between gap-2">
                        <Link 
                          href={`/products/${item.product_id}`} 
                          className="font-bold text-sm sm:text-base md:text-lg text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors line-clamp-2 leading-snug"
                        >
                          {item.title}
                        </Link>

                        {/* Individual Remove Button (Always clearly visible & accessible on mobile) */}
                        <button 
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 sm:p-2 text-red-500 sm:text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shrink-0 active:scale-95 cursor-pointer -mt-1 -mr-1 rtl:-mr-0 rtl:-ml-1"
                          title={t('remove')}
                          aria-label={t('remove')}
                        >
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 sm:text-gray-400 sm:group-hover:text-red-500" />
                        </button>
                      </div>

                      {/* Color & Size Badges */}
                      <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-2 text-xs text-gray-500 font-medium">
                        {color && (
                          <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                            <span 
                              className="w-3.5 h-3.5 rounded-full border border-gray-300 shadow-xs shrink-0" 
                              style={{ backgroundColor: color === 'navy' ? '#000080' : color }} 
                              title={item.colorName || color} 
                            />
                            <span className="capitalize">{item.colorName || color}</span>
                          </div>
                        )}
                        {size && (
                          <div className="bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                            <span>{t('size')}: <strong className="text-gray-700">{size}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Bottom Row: Price & Quantity Controls */}
                    <div className="flex items-center justify-between gap-2 mt-3 sm:mt-4 pt-2 border-t border-gray-50 sm:border-0 sm:pt-0">
                      {/* Unit Price */}
                      <span className="font-black text-base sm:text-xl text-[var(--color-primary)] whitespace-nowrap">
                        {item.unit_price} ₺
                      </span>
                      
                      {/* Quantity Controls */}
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center h-8 sm:h-9 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                          <button 
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity, item.maxStock, -1)}
                            disabled={item.quantity <= 1}
                            className="w-8 sm:w-9 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 transition-colors cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 sm:w-9 text-center font-bold text-xs sm:text-sm text-gray-800">
                            {item.quantity}
                          </span>
                          <button 
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity, item.maxStock, 1)}
                            disabled={item.quantity >= item.maxStock}
                            className="w-8 sm:w-9 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 transition-colors cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus size={14} />
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
        subtotal={subtotal}
        onConfirm={handleDeliveryConfirm} 
      />
    </div>
  );
}
