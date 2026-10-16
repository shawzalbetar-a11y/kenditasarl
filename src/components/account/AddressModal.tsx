'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GoogleMap, useLoadScript, Marker } from '@react-google-maps/api';
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete';

const mapContainerStyle = {
  width: '100%',
  height: '250px',
  borderRadius: '0.75rem'
};
const defaultCenter = { lat: 41.0082, lng: 28.9784 }; // Istanbul
const libraries: ("places")[] = ['places'];

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (address: any) => Promise<void>;
  initialData?: any;
}

export default function AddressModal({ isOpen, onClose, onSave, initialData }: AddressModalProps) {
  const t = useTranslations('Addresses');
  
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries,
    language: 'tr',
    region: 'TR'
  });

  const [label, setLabel] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [detailedAddress, setDetailedAddress] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<any>(defaultCenter);
  const [isSaving, setIsSaving] = useState(false);
  
  const [showMap, setShowMap] = useState(false);
  const [isCheckingDistance, setIsCheckingDistance] = useState(false);
  const [isFastDeliveryEligible, setIsFastDeliveryEligible] = useState(false);

  const {
    ready,
    value: searchValue,
    suggestions: { status, data: suggestionsData },
    setValue: setSearchValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    initOnMount: false,
    debounce: 300,
    requestOptions: {
      componentRestrictions: { country: "tr" },
      language: 'tr'
    },
  });

  useEffect(() => {
    if (isLoaded) {
      init();
    }
  }, [isLoaded, init]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setLabel(initialData.label || '');
        setCity(initialData.city || '');
        setDistrict(initialData.district || '');
        setDetailedAddress(initialData.detailed_address || '');
        setIsDefault(initialData.is_default || false);
        setSearchValue(initialData.full_address || '', false);
        setSelectedLocation({
          lat: initialData.lat || defaultCenter.lat,
          lng: initialData.lng || defaultCenter.lng
        });
        setIsFastDeliveryEligible(initialData.is_fast_delivery_eligible || false);
        setShowMap(initialData.is_fast_delivery_eligible || false);
      } else {
        setLabel('');
        setCity('');
        setDistrict('');
        setDetailedAddress('');
        setIsDefault(false);
        setSearchValue('', false);
        setSelectedLocation(defaultCenter);
        setIsFastDeliveryEligible(false);
        setShowMap(false);
      }
    }
  }, [isOpen, initialData, setSearchValue]);

  const handleSelectPlace = async (address: string) => {
    setSearchValue(address, false);
    clearSuggestions();
    setIsCheckingDistance(true);
    setShowMap(false);
    try {
      const results = await getGeocode({ address });
      const { lat, lng } = await getLatLng(results[0]);
      setSelectedLocation({ lat, lng });

      // Extract city and district
      let extractedCity = "";
      let extractedDistrict = "";
      results[0].address_components.forEach(comp => {
         if (comp.types.includes("administrative_area_level_1")) extractedCity = comp.long_name;
         if (comp.types.includes("administrative_area_level_2") || comp.types.includes("locality")) extractedDistrict = comp.long_name;
      });
      setCity(extractedCity);
      setDistrict(extractedDistrict);

      // Check express eligibility
      const res = await fetch('/api/checkout/calculate-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng })
      });
      if (res.ok) {
        const data = await res.json();
        setIsFastDeliveryEligible(data.isExpressAvailable);
        setShowMap(data.isExpressAvailable);
      } else {
        setIsFastDeliveryEligible(false);
      }
    } catch (error: any) {
      console.error("Error fetching geocode or calculating distance:", error);
      setIsFastDeliveryEligible(false);
    } finally {
      setIsCheckingDistance(false);
    }
  };

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setSelectedLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        label,
        city,
        district,
        detailed_address: detailedAddress,
        full_address: searchValue,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        is_default: isDefault,
        is_fast_delivery_eligible: isFastDeliveryEligible
      });
      onClose();
    } catch (error) {
      console.error("Error saving address:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-border/50 max-h-[90vh] overflow-y-auto"
        >
          <button 
            onClick={onClose}
            className="absolute top-6 left-6 p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors z-10"
          >
            <X size={20} />
          </button>

          <h2 className="text-2xl font-black mb-6 text-center">
            {initialData ? t('modalTitleEdit') : t('modalTitleNew')}
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold px-1">{t('label')}</label>
              <input 
                type="text" 
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full p-4 rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="Ex: Home, Work..."
              />
            </div>

            <div className="flex flex-col gap-1.5 relative">
              <label className="text-sm font-semibold px-1">Address</label>
              <div className="relative">
                <input 
                  type="text" 
                  required
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  disabled={!ready || isCheckingDistance}
                  className="w-full p-4 rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder={t('searchPlaceholder')}
                />
                {isCheckingDistance && (
                  <Loader2 className="absolute top-1/2 -translate-y-1/2 ltr:right-4 rtl:left-4 animate-spin text-gray-400" size={20} />
                )}
              </div>
              
              {/* Autocomplete Suggestions */}
              {status === "OK" && (
                <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl mt-1 top-full shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {suggestionsData.map(({ place_id, description }) => (
                    <li 
                      key={place_id} 
                      onClick={() => handleSelectPlace(description)}
                      className="p-3 hover:bg-gray-100 cursor-pointer text-sm flex items-center gap-2 border-b border-gray-100 last:border-0"
                    >
                      <MapPin size={16} className="text-gray-400 min-w-4" />
                      <span className="truncate">{description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {showMap && (
              <div className="flex flex-col gap-2 mt-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl text-sm font-medium leading-relaxed">
                  {t('mapWarning')}
                </div>
                <div className="w-full h-[250px] bg-gray-100 rounded-xl overflow-hidden relative shadow-inner">
                  {loadError ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Error loading maps</div>
                  ) : !isLoaded ? (
                    <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-[var(--color-primary)]" /></div>
                  ) : (
                    <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      zoom={15}
                      center={selectedLocation}
                      onClick={handleMapClick}
                      options={{ disableDefaultUI: true, zoomControl: true }}
                    >
                      <Marker position={selectedLocation} draggable={true} onDragEnd={(e) => {
                        if (e.latLng) setSelectedLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() })
                      }} />
                    </GoogleMap>
                  )}
                </div>
              </div>
            )}

            {showMap && (
              <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="text-sm font-semibold px-1 text-red-600">{t('detailedAddress')}</label>
                <textarea 
                  required
                  value={detailedAddress}
                  onChange={(e) => setDetailedAddress(e.target.value)}
                  className="w-full p-4 rounded-xl border border-red-200 bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none placeholder:text-red-300"
                  placeholder={t('detailedAddressPlaceholder')}
                  rows={3}
                />
              </div>
            )}

            <div className="flex items-center gap-3 mt-2 px-1">
              <input 
                type="checkbox" 
                id="isDefaultAddress"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-5 h-5 accent-[var(--color-primary)] rounded cursor-pointer"
              />
              <label htmlFor="isDefaultAddress" className="text-sm font-medium cursor-pointer select-none">
                {t('setAsDefault')}
              </label>
            </div>

            <div className="flex gap-3 mt-4">
              <button 
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-black font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button 
                type="submit" 
                disabled={isSaving}
                className="flex-1 py-4 bg-[var(--color-primary)] hover:bg-opacity-90 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSaving && <Loader2 size={18} className="animate-spin" />}
                {t('save')}
              </button>
            </div>

          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
