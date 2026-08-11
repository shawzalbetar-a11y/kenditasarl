'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useTranslations } from 'next-intl';
import { MapPin, Plus, Loader2, Star, Trash2, Edit2, Zap } from 'lucide-react';
import AddressModal from '@/components/account/AddressModal';

export default function AddressesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const t = useTranslations('Addresses');
  
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        fetchAddresses(currentUser.uid);
      } else {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchAddresses = async (uid: string) => {
    try {
      const q = query(collection(db, 'addresses'), where('user_id', '==', uid));
      const snapshot = await getDocs(q);
      const fetchedAddresses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort so default is first
      fetchedAddresses.sort((a: any, b: any) => (b.is_default === true ? 1 : 0) - (a.is_default === true ? 1 : 0));
      setAddresses(fetchedAddresses);
    } catch (error) {
      console.error("Error fetching addresses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAddress = async (addressData: any) => {
    if (!user) return;
    
    const isNew = !editingAddress;
    const addressId = isNew ? doc(collection(db, 'addresses')).id : editingAddress.id;
    const addressRef = doc(db, 'addresses', addressId);

    const batch = writeBatch(db);

    if (addressData.is_default) {
      // Need to set other addresses to false
      const otherAddresses = addresses.filter(a => a.id !== addressId && a.is_default);
      for (const a of otherAddresses) {
        batch.update(doc(db, 'addresses', a.id), { is_default: false });
      }
    }

    if (isNew) {
      batch.set(addressRef, {
        ...addressData,
        user_id: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    } else {
      batch.update(addressRef, {
        ...addressData,
        updated_at: serverTimestamp()
      });
    }

    await batch.commit();
    await fetchAddresses(user.uid);
    if (returnTo) {
      router.push(returnTo);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Are you sure you want to delete this address?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'addresses', id));
      setAddresses(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error("Error deleting address:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const openNewModal = () => {
    setEditingAddress(null);
    setIsModalOpen(true);
  };

  const openEditModal = (address: any) => {
    setEditingAddress(address);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-8 border-b border-gray-100 pb-4">
        <h1 className="text-3xl font-bold text-secondary">{t('title')}</h1>
        <button 
          onClick={openNewModal}
          className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-opacity-90 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-md"
        >
          <Plus size={20} />
          <span className="hidden sm:inline">{t('addNew')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {addresses.map((address) => (
          <div 
            key={address.id} 
            className={`relative p-6 rounded-2xl border transition-all ${
              address.is_default 
                ? 'border-[var(--color-primary)] bg-indigo-50/30 shadow-sm' 
                : 'border-gray-200 bg-white'
            }`}
          >
            {address.is_default && (
              <span className="absolute top-4 right-4 bg-[var(--color-primary)] text-white text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                <Star size={12} className="fill-white" />
                {t('defaultBadge')}
              </span>
            )}
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <MapPin size={20} />
              </div>
              <h3 className="font-bold text-lg">{address.label}</h3>
            </div>
            
            <p className="text-gray-600 text-sm leading-relaxed mb-4 min-h-[40px]">
              {address.full_address}
            </p>

            {address.is_fast_delivery_eligible && (
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium mb-6 bg-green-50 px-3 py-2 rounded-lg">
                <Zap size={16} className="fill-green-600 text-green-600" />
                {t('fastDelivery')}
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-gray-100">
              <button 
                onClick={() => openEditModal(address)}
                className="flex items-center gap-2 flex-1 justify-center py-2 text-sm font-semibold text-gray-600 hover:text-[var(--color-primary)] hover:bg-gray-50 rounded-lg transition-colors"
              >
                <Edit2 size={16} />
                {t('edit')}
              </button>
              <button 
                onClick={() => handleDelete(address.id)}
                disabled={deletingId === address.id}
                className="flex items-center gap-2 flex-1 justify-center py-2 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {deletingId === address.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {t('delete')}
              </button>
            </div>
          </div>
        ))}
        
        {addresses.length === 0 && (
          <div className="col-span-full py-16 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-300">
            <MapPin size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-bold mb-2">{t('noAddresses')}</h3>
            <button onClick={openNewModal} className="text-[var(--color-primary)] font-bold hover:underline">
              {t('addNew')}
            </button>
          </div>
        )}
      </div>

      <AddressModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveAddress}
        initialData={editingAddress}
      />
    </div>
  );
}
