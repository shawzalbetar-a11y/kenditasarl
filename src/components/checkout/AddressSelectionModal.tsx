import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';

interface AddressSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  addresses: any[];
  onSelect: (address: any) => void;
}

export default function AddressSelectionModal({ isOpen, onClose, addresses, onSelect }: AddressSelectionModalProps) {
  const t = useTranslations('Checkout');
  
  // Default to is_default address or first one
  const [selectedId, setSelectedId] = useState<string | null>(
    addresses.find(a => a.is_default)?.id || (addresses.length > 0 ? addresses[0].id : null)
  );

  if (!isOpen) return null;

  const handleContinue = () => {
    const addr = addresses.find(a => a.id === selectedId);
    if (addr) onSelect(addr);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-4 ltr:right-4 rtl:left-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <h3 className="text-2xl font-bold mb-6 text-center">{t('selectAddress')}</h3>

        <div className="space-y-4 mb-6">
          {addresses.map((address) => (
            <label 
              key={address.id} 
              className={cn(
                "block p-4 rounded-xl border-2 cursor-pointer transition-all",
                selectedId === address.id 
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" 
                  : "border-gray-200 hover:border-gray-300 bg-white"
              )}
            >
              <div className="flex items-start gap-4">
                <input 
                  type="radio" 
                  name="address" 
                  value={address.id} 
                  checked={selectedId === address.id}
                  onChange={() => setSelectedId(address.id)}
                  className="mt-1 w-5 h-5 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg text-gray-900">{address.label}</span>
                    {address.is_default && (
                      <span className="bg-[var(--color-secondary)] text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                        {t('default')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-gray-500 text-sm mt-2">
                    <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                    <span className="leading-relaxed">{address.full_address}</span>
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={handleContinue}
            disabled={!selectedId}
            className="w-full py-4 rounded-xl font-bold text-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-all shadow-lg disabled:opacity-50"
          >
            {t('continueToDelivery')}
          </button>
          
          <Link 
            href="/account/addresses?returnTo=/cart"
            className="w-full py-4 rounded-xl font-bold text-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all text-center"
          >
            + {t('addNewAddress')}
          </Link>
        </div>
      </div>
    </div>
  );
}
