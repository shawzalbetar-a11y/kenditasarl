"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, ShieldCheck } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { 
  RecaptchaVerifier,
  linkWithPhoneNumber
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  savedPhone: string;
}

export default function PhoneVerificationModal({ isOpen, onClose, onSuccess, savedPhone }: PhoneVerificationModalProps) {
  const [phoneNumber, setPhoneNumber] = useState(savedPhone || '');
  const [otpCode, setOtpCode] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const t = useTranslations('Auth');

  // Clear reCAPTCHA when modal opens to prevent DOM state mismatch
  useEffect(() => {
    if (isOpen) {
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch(e) {}
        window.recaptchaVerifier = null;
      }
      setPhoneNumber(savedPhone || '');
      setOtpCode('');
      setShowOtpInput(false);
      setError('');
    }
  }, [isOpen, savedPhone]);

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'verification-recaptcha', {
        'size': 'invisible',
      });
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || !auth.currentUser) return;
    setError('');
    setLoading(true);

    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      
      const confirmation = await linkWithPhoneNumber(auth.currentUser, formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setShowOtpInput(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || t('authError'));
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || !confirmationResult || !auth.currentUser) return;
    setError('');
    setLoading(true);

    try {
      // Link the credential
      await confirmationResult.confirm(otpCode);
      
      // Update firestore to mark phone as verified
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        phone: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
        phone_verified: true
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || t('authError'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-border/50"
        >
          <button 
            onClick={onClose}
            className="absolute top-6 left-6 p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors z-10"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-black mb-2 text-center">
              {t('verifyPhoneToContinue', { fallback: 'Verify your phone to continue' })}
            </h2>
            <p className="text-zinc-500 text-center mb-6 text-sm">
              {showOtpInput 
                ? t('enterOtpDesc') 
                : t('verifyPhoneDesc', { fallback: 'To secure your orders, please verify your phone number before adding to cart.' })}
            </p>
          </div>

          <div id="verification-recaptcha"></div>

          {error && (
            <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={showOtpInput ? handleVerifyOtp : handleSendCode} className="flex flex-col gap-4">
            {!showOtpInput ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold px-1">{t('phone')}</label>
                <input 
                  type="tel" 
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full p-4 rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-left"
                  dir="ltr"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold px-1">{t('otpCode')}</label>
                <input 
                  type="text" 
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full p-4 text-center tracking-widest text-xl rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading || (!showOtpInput && phoneNumber.length < 5) || (showOtpInput && otpCode.length < 6)}
              className="w-full py-4 mt-2 bg-[var(--color-primary)] hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? t('loading') : (showOtpInput ? t('verifyCode') : t('sendCode'))}
            </button>
            
            {showOtpInput && (
              <button 
                type="button"
                onClick={() => {
                  setShowOtpInput(false);
                  setOtpCode('');
                  setError('');
                }}
                className="text-sm text-zinc-500 hover:text-zinc-800 font-medium text-center mt-2"
              >
                {t('changePhone')}
              </button>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
