import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Truck, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeliveryMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: any;
  onConfirm: (method: 'shipping' | 'express', fee: number, distance: number) => void;
}

export default function DeliveryMethodModal({ isOpen, onClose, address, onConfirm }: DeliveryMethodModalProps) {
  const t = useTranslations('Checkout');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [selectedMethod, setSelectedMethod] = useState<'shipping' | 'express'>('shipping');

  useEffect(() => {
    if (isOpen && address) {
      calculateDelivery();
    }
  }, [isOpen, address]);

  const calculateDelivery = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/checkout/calculate-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: address.lat, lng: address.lng })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to calculate delivery');
      }
      
      setDeliveryData(data);
      if (data.isExpressAvailable) {
        setSelectedMethod('express');
      } else {
        setSelectedMethod('shipping');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button 
          onClick={onClose}
          className="absolute top-4 ltr:right-4 rtl:left-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <h3 className="text-2xl font-bold mb-6 text-center">{t('selectDeliveryMethod')}</h3>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary)]" />
            <p className="text-gray-500 font-medium">{t('calculatingDelivery')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">
            <p>{t('errorCalculating')}</p>
            <p className="text-sm mt-2">{error}</p>
            <button onClick={calculateDelivery} className="mt-4 underline font-bold">{t('retry')}</button>
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            
            {/* Express Delivery (if available) */}
            {deliveryData.isExpressAvailable && (
              <label className={cn(
                "block p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden",
                selectedMethod === 'express' 
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" 
                  : "border-gray-200 hover:border-gray-300 bg-white"
              )}>
                {selectedMethod === 'express' && (
                  <div className="absolute top-0 ltr:right-0 rtl:left-0 bg-[var(--color-primary)] text-white text-[10px] px-3 py-1 ltr:rounded-bl-lg rtl:rounded-br-lg font-bold">
                    {t('selected')}
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Zap size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-lg">{t('expressDelivery')}</span>
                      <span className="font-black text-lg text-[var(--color-primary)]">{deliveryData.expressFee} ₺</span>
                    </div>
                    <p className="text-gray-500 text-sm">{t('expressTime')}</p>
                    <p className="text-gray-400 text-xs mt-1">{t('distance')}: {deliveryData.distance} km</p>
                  </div>
                </div>
                <input 
                  type="radio" 
                  name="delivery" 
                  value="express" 
                  className="hidden"
                  checked={selectedMethod === 'express'}
                  onChange={() => setSelectedMethod('express')}
                />
              </label>
            )}

            {/* Standard Shipping */}
            <label className={cn(
              "block p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden",
              selectedMethod === 'shipping' 
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" 
                : "border-gray-200 hover:border-gray-300 bg-white"
            )}>
              {selectedMethod === 'shipping' && (
                <div className="absolute top-0 ltr:right-0 rtl:left-0 bg-[var(--color-primary)] text-white text-[10px] px-3 py-1 ltr:rounded-bl-lg rtl:rounded-br-lg font-bold">
                  {t('selected')}
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Truck size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-lg">{t('standardShipping')}</span>
                    <span className="font-black text-lg text-[var(--color-primary)]">{deliveryData.fixedShippingFee} ₺</span>
                  </div>
                  <p className="text-gray-500 text-sm">{t('standardTime')}</p>
                </div>
              </div>
              <input 
                type="radio" 
                name="delivery" 
                value="shipping" 
                className="hidden"
                checked={selectedMethod === 'shipping'}
                onChange={() => setSelectedMethod('shipping')}
              />
            </label>

          </div>
        )}

        <button 
          onClick={() => {
            const fee = selectedMethod === 'express' ? deliveryData.expressFee : deliveryData.fixedShippingFee;
            onConfirm(selectedMethod, fee, deliveryData?.distance || 0);
          }}
          disabled={loading || !!error}
          className="w-full py-4 rounded-xl font-bold text-lg bg-[var(--color-action)] text-white hover:opacity-90 transition-all shadow-lg disabled:opacity-50"
        >
          {t('confirmAndProceed')}
        </button>
      </div>
    </div>
  );
}
