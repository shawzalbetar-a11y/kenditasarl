"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useCheckoutStore } from '@/store/useCheckoutStore';
import { checkoutCall, CheckoutProblem } from '@/lib/checkoutClient';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2, MapPin, Truck, Zap } from 'lucide-react';

export default function CheckoutSummaryPage() {
  const t = useTranslations('Checkout');
  const locale = useLocale();
  const router = useRouter();
  
  const { selectedAddress, deliveryMethod } = useCheckoutStore();
  const [quote, setQuote] = useState<any>(null);
  const [loading,setLoading] = useState(true);
  const [isProcessing,setIsProcessing] = useState(false);
  const [accepted,setAccepted] = useState(false);
  const [error,setError] = useState("");
  const [review,setReview] = useState("");
  const [refresh,setRefresh] = useState(0);
  const attempt = useRef("");
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setQuote(null); setAccepted(false); setError(""); setReview("");
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const storageKey = "checkout-attempt-" + user?.uid;
      const saved = sessionStorage.getItem(storageKey);
      if (user && saved) {
        try {
          const {key,quote_id} = JSON.parse(saved);
          const result = await checkoutCall("checkout/confirm",{key,quote_id,accepted:true});
          sessionStorage.removeItem(storageKey);
          if (active) router.replace(`/order-confirmation/${result.order_id}`);
          return;
        } catch(e) {
          if (!(e instanceof CheckoutProblem) || e.message === "UNAVAILABLE") {
            if (active) {setLoading(false);setError(t("retryOrder"));}
            return;
          }
          sessionStorage.removeItem(storageKey);
        }
      }
      if (!user || !selectedAddress?.id || !deliveryMethod) { router.replace("/cart"); return; }
      try {
        const result = await checkoutCall("checkout/quote",{address_id:selectedAddress.id,method:deliveryMethod,locale});
        if (active) { attempt.current = crypto.randomUUID(); setQuote(result); }
      } catch (e) {
        if (active) { setError(t(e instanceof CheckoutProblem && e.message === "NO_STOCK" ? "stockChanged" : "reviewQuote"));
          if (e instanceof CheckoutProblem) setReview(e.line ?? ""); }
      } finally { if (active) setLoading(false); }
    });
    return () => { active = false; unsubscribe(); };
  },[selectedAddress?.id,deliveryMethod,locale,router,refresh,t]);
  const items = quote?.lines ?? [];
  const deliveryFee = (quote?.shipping ?? 0)/100;
  const subtotal = (quote?.subtotal ?? 0)/100;
  const total = (quote?.total ?? 0)/100;
  const handleConfirmOrder = async () => {
    if (!quote || !accepted || submitting.current) return;
    submitting.current = true; setIsProcessing(true); setError("");
    try {
      const storageKey = "checkout-attempt-" + auth.currentUser.uid;
      sessionStorage.setItem(storageKey, JSON.stringify({quote_id:quote.quote_id,key:attempt.current}));
      const result = await checkoutCall("checkout/confirm",{quote_id:quote.quote_id,key:attempt.current,accepted:true});
      sessionStorage.removeItem(storageKey);
      router.replace(`/order-confirmation/${result.order_id}`);
    } catch (e) {
      if (e instanceof CheckoutProblem && ["REFRESH","NEEDS_REVIEW","NO_STOCK","CART_SIZE"].includes(e.message)) {
        sessionStorage.removeItem("checkout-attempt-" + auth.currentUser?.uid); setAccepted(false); setQuote(null); setError(t("reviewQuote"));
      } else setError(t("retryOrder"));
      submitting.current = false; setIsProcessing(false);
    }
  };

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
                 {items.map((item: any) => (
                   <div key={item.id} className="flex gap-4">
                     <div className="flex-1">
                       <p className="font-bold text-sm">{item.name}</p>
                       <p className="text-xs text-gray-500 mt-0.5">
                          {t('quantity')}: {item.quantity} 
                          {item.color} · {item.size}
                       </p>
                       {item.breakdown.map((part:any,index:number) => <p className="text-xs" key={index}>{part.label || t("part_"+part.type)} · {part.minor/100} ₺</p>)}
                       {item.old_minor !== item.minor && <p>{t("oldPrice")} <del>{item.old_minor/100} ₺</del> · {t("newPrice")} {item.minor/100} ₺</p>}
                     </div>
                     <div className="font-bold text-sm">{item.minor * item.quantity / 100} ₺</div>
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
                  <span className="font-semibold">
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-600 font-bold">0 ₺ ({locale === 'tr' ? 'Ücretsiz' : locale === 'en' ? 'Free' : 'مجاناً 🎉'})</span>
                    ) : (
                      `${deliveryFee} ₺`
                    )}
                  </span>
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

              {quote && <label className="flex min-h-11 items-center gap-2 mb-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} />{t("acceptQuote")}</label>}
              {error && <div className="flex gap-4"><button className="min-h-11" onClick={()=>setRefresh(n=>n+1)}>{t("refreshQuote")}</button>
                <button className="min-h-11" onClick={()=>router.push("/cart"+(review ? "#"+encodeURIComponent(review) : ""))}>{t("editCart")}</button></div>}
              <button 
                onClick={handleConfirmOrder}
                disabled={isProcessing || !accepted || !quote}
                className="w-full py-4 rounded-xl font-bold text-lg bg-[var(--color-action)] text-white hover:bg-opacity-90 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    {t('confirmingOrder')}
                  </>
                ) : (
                  t('confirmCod')
                )}
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
