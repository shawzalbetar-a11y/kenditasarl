"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, User, Mail, ArrowRight } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  getAdditionalUserInfo,
  signInWithPhoneNumber,
  updateEmail,
  linkWithPopup,
  linkWithPhoneNumber,
  RecaptchaVerifier
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useTranslations, useLocale } from 'next-intl';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [authMethod, setAuthMethod] = useState<'main' | 'phone'>('main');
  
  // Phone Auth state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingProvider, setOnboardingProvider] = useState<'google' | 'phone'>('google');
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingEmail, setOnboardingEmail] = useState('');
  const [onboardingPhone, setOnboardingPhone] = useState('');
  const [onboardingOtpSent, setOnboardingOtpSent] = useState(false);
  const [onboardingOtpCode, setOnboardingOtpCode] = useState('');
  const [onboardingPhoneLinked, setOnboardingPhoneLinked] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const t = useTranslations('Auth');
  const locale = useLocale();

  useEffect(() => {
    if (isOpen) {
      // Reset state when opened
      setAuthMethod('main');
      setShowOtpInput(false);
      setPhoneNumber('');
      setOtpCode('');
      setError('');
      setShowOnboarding(false);
      
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {}
        window.recaptchaVerifier = null;
      }

      // Auto-check for onboarding if user is already logged in
      const checkOnboarding = async () => {
        if (auth.currentUser) {
          try {
            const docSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (!docSnap.exists() || !docSnap.data().full_name) {
              setCurrentUser(auth.currentUser);
              const providers = auth.currentUser.providerData.map((p: any) => p.providerId);
              if (providers.includes('google.com')) {
                setOnboardingProvider('google');
                setOnboardingName(auth.currentUser.displayName || '');
                setOnboardingEmail(auth.currentUser.email || '');
              } else {
                setOnboardingProvider('phone');
                setOnboardingPhone(auth.currentUser.phoneNumber || '');
              }
              setShowOnboarding(true);
            }
          } catch (e) {
            console.error(e);
          }
        }
      };
      checkOnboarding();
    }
  }, [isOpen]);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (!userDocSnap.exists() || !userDocSnap.data().full_name || !userDocSnap.data().phone) {
        // Need onboarding
        setCurrentUser(user);
        setOnboardingProvider('google');
        setOnboardingName(user.displayName || '');
        setOnboardingEmail(user.email || '');
        setShowOnboarding(true);
      } else {
        // Already onboarded
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || t('authError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': (response: any) => {
          // reCAPTCHA solved
        }
      });
    }
  };

  const handleSendPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setError('');
    setLoading(true);

    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
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
    if (!otpCode || !confirmationResult) return;
    setError('');
    setLoading(true);

    try {
      const userCredential = await confirmationResult.confirm(otpCode);
      const user = userCredential.user;
      
      // FIREWALL: Check if this phone number is already registered to a different user
      const usersRef = collection(db, 'users');
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const q = query(usersRef, where('phone', '==', formattedPhone));
      const querySnapshot = await getDocs(q);
      
      let isConflict = false;
      querySnapshot.forEach((docSnap) => {
        if (docSnap.id !== user.uid) {
          isConflict = true;
        }
      });

      if (isConflict) {
        // This phone number belongs to another account (likely Google)
        await user.delete(); // Clean up the newly created phone auth user
        await auth.signOut();
        throw new Error(t('phoneLinkedToGoogle', { fallback: 'This phone number is linked to a Google account. Please log in with Google, then verify your number from the cart.' }));
      }

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (!userDocSnap.exists() || !userDocSnap.data().full_name || !userDocSnap.data().email) {
        // Need onboarding
        setCurrentUser(user);
        setOnboardingProvider('phone');
        setOnboardingPhone(user.phoneNumber || phoneNumber);
        setShowOnboarding(true);
      } else {
        // Already onboarded
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || t('authError'));
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setError('');
    setLoading(true);
    
    try {
      // FIREWALL: Check for duplicates before saving
      const usersRef = collection(db, 'users');
      
      if (onboardingProvider === 'google') {
        if (!onboardingPhoneLinked) {
          throw new Error(t('verifyPhoneFirst', { fallback: 'Please verify your phone number first.' }));
        }
      } else {
        const qEmail = query(usersRef, where('email', '==', onboardingEmail));
        const snapEmail = await getDocs(qEmail);
        
        let isEmailConflict = false;
        snapEmail.forEach(docSnap => {
          if (docSnap.id !== currentUser.uid) isEmailConflict = true;
        });
        
        if (isEmailConflict) {
          throw new Error(t('emailInUse', { fallback: 'This email is already in use by another account.' }));
        }
      }

      // Note: We removed updateEmail here because Firebase blocks it with auth/operation-not-allowed
      // unless Email/Password provider is enabled and email verification is bypassed.

      await setDoc(doc(db, 'users', currentUser.uid), {
        full_name: onboardingName,
        email: onboardingProvider === 'google' ? currentUser.email : onboardingEmail,
        phone: onboardingProvider === 'google' ? (onboardingPhone.startsWith('+') ? onboardingPhone : `+${onboardingPhone}`) : currentUser.phoneNumber,
        preferred_language: locale,
        created_at: new Date().toISOString(),
        phone_verified: true // All users must verify phone during onboarding now
      });
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || t('authError'));
    } finally {
      setLoading(false);
    }
  };

  const handleLinkGoogle = async () => {
    if (!currentUser) return;
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await linkWithPopup(currentUser, provider);
      setOnboardingEmail(result.user.email || '');
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') {
        setError(t('googleAlreadyLinked', { fallback: 'This Google account is already linked to another user.' }));
      } else {
        setError(err.message || t('authError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOnboardingPhoneCode = async () => {
    if (!currentUser || !onboardingPhone) return;
    setError('');
    setLoading(true);
    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = onboardingPhone.startsWith('+') ? onboardingPhone : `+${onboardingPhone}`;
      const confirmation = await linkWithPhoneNumber(currentUser, formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setOnboardingOtpSent(true);
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') {
        setError(t('phoneInUse', { fallback: 'This phone number is already in use by another account.' }));
      } else {
        setError(err.message || t('authError'));
      }
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOnboardingOtp = async () => {
    if (!confirmationResult || !onboardingOtpCode) return;
    setError('');
    setLoading(true);
    try {
      await confirmationResult.confirm(onboardingOtpCode);
      setOnboardingPhoneLinked(true);
      setOnboardingOtpSent(false);
    } catch (err: any) {
      setError(err.message || t('authError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOnboarding = async () => {
    try {
      await auth.signOut();
    } catch (e) {}
    setShowOnboarding(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={showOnboarding ? handleCancelOnboarding : onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-border/50 max-h-[90vh] overflow-y-auto scrollbar-hide"
        >
          <button 
            onClick={showOnboarding ? handleCancelOnboarding : onClose}
            className="absolute top-6 left-6 p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors z-10"
          >
            <X size={20} />
          </button>

          <div id="recaptcha-container"></div>

          {/* ONBOARDING FLOW */}
          {showOnboarding ? (
            <div className="flex flex-col">
              <h2 className="text-3xl font-black mb-2 text-center text-[var(--color-primary)]">
                {t('completeProfile', { fallback: 'Complete Profile' })}
              </h2>
              <p className="text-zinc-500 text-center mb-8">
                {t('completeProfileDesc', { fallback: 'Please provide your details to finish setting up your account.' })}
              </p>
              
              <form onSubmit={handleOnboardingSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold px-1 flex items-center gap-2">
                    <User className="w-4 h-4" /> {t('fullName')}
                  </label>
                  <input 
                    type="text" 
                    required
                    value={onboardingName}
                    onChange={(e) => setOnboardingName(e.target.value)}
                    className="w-full p-4 rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder={t('fullNamePlaceholder')}
                  />
                </div>

                {onboardingProvider === 'google' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold px-1 flex items-center gap-2">
                      <Phone className="w-4 h-4" /> {t('phone')}
                    </label>
                    {onboardingPhoneLinked ? (
                      <div className="w-full p-4 rounded-xl border border-green-200 bg-green-50 text-green-700 flex items-center gap-3">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span className="font-medium">{onboardingPhone}</span>
                      </div>
                    ) : onboardingOtpSent ? (
                      <div className="flex flex-col gap-2">
                        <input 
                          type="text" 
                          required
                          value={onboardingOtpCode}
                          onChange={(e) => setOnboardingOtpCode(e.target.value)}
                          className="w-full p-4 rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-center tracking-widest text-lg"
                          placeholder="000000"
                          maxLength={6}
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOnboardingOtp}
                          disabled={loading || onboardingOtpCode.length !== 6}
                          className="w-full py-3 bg-secondary hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                        >
                          {loading ? t('loading') : t('verifyCode', { fallback: 'Verify Code' })}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <input 
                          type="tel" 
                          required
                          value={onboardingPhone}
                          onChange={(e) => setOnboardingPhone(e.target.value)}
                          className="w-full p-4 rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-left"
                          placeholder="+90 555 555 55 55"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={handleSendOnboardingPhoneCode}
                          disabled={loading || !onboardingPhone}
                          className="w-full py-3 bg-secondary hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                        >
                          {loading ? t('loading') : t('verifyPhone', { fallback: 'Verify Phone Number' })}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold px-1 flex items-center gap-2">
                      <Mail className="w-4 h-4" /> {t('email')}
                    </label>
                    {onboardingEmail ? (
                      <div className="w-full p-4 rounded-xl border border-green-200 bg-green-50 text-green-700 flex items-center gap-3">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span className="font-medium">{onboardingEmail}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleLinkGoogle}
                        disabled={loading}
                        className="w-full py-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
                      >
                        <svg className="w-6 h-6" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        {t('linkGoogleAccount', { fallback: 'Link Google Account' })}
                      </button>
                    )}
                  </div>
                )}
                
                {error && (
                  <div className="p-3 bg-red-100 text-red-700 rounded-xl text-sm font-medium">
                    {error}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={loading || (onboardingProvider === 'phone' && !onboardingEmail) || (onboardingProvider === 'google' && !onboardingPhoneLinked)}
                  className="w-full py-4 mt-2 bg-[var(--color-primary)] hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {loading ? t('loading') : t('saveAndContinue', { fallback: 'Save & Continue' })}
                  {!loading && <ArrowRight className="w-5 h-5 rtl:rotate-180" />}
                </button>
              </form>
            </div>
          ) : 
          
          /* AUTHENTICATION FLOW */
          (
            <div className="flex flex-col">
              <h2 className="text-3xl font-black mb-2 text-center">
                {authMethod === 'phone' ? t('loginWithPhone', { fallback: 'Phone Login' }) : t('welcomeBack', { fallback: 'Welcome Back!' })}
              </h2>
              <p className="text-zinc-500 text-center mb-8">
                {authMethod === 'phone' 
                  ? (showOtpInput ? t('enterOtpDesc', { fallback: 'Enter the 6-digit code sent to your phone' }) : t('enterPhoneDesc', { fallback: 'Enter your phone number with country code' }))
                  : t('loginToContinue', { fallback: 'Sign in to access your saved designs and orders' })}
              </p>

              {error && (
                <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-xl text-sm font-medium">
                  {error}
                </div>
              )}

              {authMethod === 'main' ? (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full py-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {t('continueWithGoogle', { fallback: 'Continue with Google' })}
                  </button>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">
                        {t('or', { fallback: 'Or' })}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setAuthMethod('phone');
                      setError('');
                    }}
                    disabled={loading}
                    className="w-full py-4 bg-[var(--color-primary)] hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    <Phone className="w-5 h-5" />
                    {t('continueWithPhone', { fallback: 'Continue with Phone' })}
                  </button>
                </div>
              ) : (
                <form onSubmit={showOtpInput ? handleVerifyOtp : handleSendPhoneCode} className="flex flex-col gap-4">
                  {!showOtpInput ? (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold px-1">{t('phone')}</label>
                      <input 
                        type="tel" 
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full p-4 rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-left"
                        placeholder="+90 555 555 55 55"
                        dir="ltr"
                      />
                      <p className="text-xs text-zinc-500 px-1 mt-1">{t('phoneFormatHint', { fallback: 'Include country code, e.g. +90' })}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold px-1">{t('otpCode', { fallback: 'Verification Code' })}</label>
                      <input 
                        type="text" 
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full p-4 text-center tracking-widest text-xl rounded-xl border border-border/50 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        placeholder="123456"
                      />
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={loading || (!showOtpInput && phoneNumber.length < 5) || (showOtpInput && otpCode.length < 6)}
                    className="w-full py-4 mt-2 bg-[var(--color-primary)] hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {loading ? t('loading') : (showOtpInput ? t('verifyCode', { fallback: 'Verify Code' }) : t('sendCode', { fallback: 'Send SMS Code' }))}
                  </button>

                  <div className="mt-4 flex flex-col gap-3">
                    {showOtpInput && (
                      <button 
                        type="button"
                        onClick={() => {
                          setShowOtpInput(false);
                          setOtpCode('');
                          setError('');
                        }}
                        className="text-sm text-zinc-500 hover:text-zinc-800 font-medium text-center"
                      >
                        {t('changePhone', { fallback: 'Change Phone Number' })}
                      </button>
                    )}
                    
                    <button 
                      type="button"
                      onClick={() => setAuthMethod('main')}
                      className="text-sm text-zinc-500 hover:text-[var(--color-primary)] font-medium text-center"
                    >
                      {t('backToMain', { fallback: 'Back to options' })}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
