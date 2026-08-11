"use client";

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useTranslations } from 'next-intl';
import { Loader2, Save, ShieldCheck, ShieldAlert } from 'lucide-react';

export default function AccountPage() {
  const t = useTranslations('Account');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  // Editable fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  // Providers info
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [isPhoneUser, setIsPhoneUser] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check providers
        const providers = currentUser.providerData.map(p => p.providerId);
        setIsGoogleUser(providers.includes('google.com'));
        setIsPhoneUser(providers.includes('phone'));

        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUser({ uid: currentUser.uid, ...userData });
          
          setFullName(userData.full_name || '');
          setPhone(userData.phone || '');
          setEmail(userData.email || '');
          setIsPhoneVerified(userData.phone_verified || false);
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setError('');
    
    try {
      const updates: any = { full_name: fullName };
      
      // Only allow updating email if not a Google user
      if (!isGoogleUser) {
        updates.email = email;
      }
      
      // Only allow updating phone if not a Phone user
      if (!isPhoneUser) {
        updates.phone = phone;
      }

      await updateDoc(doc(db, 'users', user.uid), updates);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setError(err.message || 'Error updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-6 border-b border-gray-100 pb-4">{t('personalInfo')}</h2>
      
      <div className="flex flex-col gap-6 max-w-2xl">
        
        {/* Full Name - Always Editable */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600">{t('fullName')}</label>
          <input 
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full p-3 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-shadow"
            placeholder={t('notProvided')}
          />
        </div>

        {/* Email - Conditionally Editable */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-gray-600">{t('email')}</label>
            <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <ShieldCheck className="w-3 h-3" />
              {t('verified', { fallback: 'Verified' })}
            </span>
          </div>
          <input 
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isGoogleUser}
            className={`w-full p-3 rounded-lg border border-gray-200 outline-none transition-shadow ${isGoogleUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-[var(--color-primary)]'}`}
            placeholder={t('notProvided')}
          />
          {isGoogleUser && <p className="text-xs text-gray-400">{t('emailLockedGoogle', { fallback: 'Email cannot be changed for Google accounts.' })}</p>}
        </div>

        {/* Phone - Conditionally Editable */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-gray-600">{t('phone')}</label>
            <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <ShieldCheck className="w-3 h-3" />
              {t('verified', { fallback: 'Verified' })}
            </span>
          </div>
          <input 
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPhoneUser}
            dir="ltr"
            className={`w-full p-3 text-left rounded-lg border border-gray-200 outline-none transition-shadow ${isPhoneUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-[var(--color-primary)]'}`}
            placeholder={t('phonePlaceholder')}
          />
          {isPhoneUser && <p className="text-xs text-gray-400">{t('phoneLocked', { fallback: 'Phone number cannot be changed for phone-registered accounts.' })}</p>}
        </div>

        {/* Preferred Language - Read Only */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600">{t('preferredLanguage')}</label>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-500">
            {user?.preferred_language?.toUpperCase() || t('notProvided')}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4 mt-2">
          <button 
            onClick={handleSaveProfile}
            disabled={isSaving}
            className="px-6 py-3 bg-[var(--color-primary)] hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 min-w-[120px] justify-center"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {t('save')}
          </button>
          
          {saveSuccess && (
            <p className="text-sm text-green-600 font-medium">{t('saveSuccess')}</p>
          )}
        </div>

      </div>
    </div>
  );
}
