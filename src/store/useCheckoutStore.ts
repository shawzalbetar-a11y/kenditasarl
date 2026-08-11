import { create } from 'zustand';

interface CheckoutState {
  selectedAddress: any | null;
  deliveryMethod: 'shipping' | 'express' | null;
  deliveryFee: number;
  distance: number | null;
  setCheckoutData: (data: Partial<CheckoutState>) => void;
  resetCheckout: () => void;
}

export const useCheckoutStore = create<CheckoutState>((set) => ({
  selectedAddress: null,
  deliveryMethod: null,
  deliveryFee: 0,
  distance: null,
  setCheckoutData: (data) => set((state) => ({ ...state, ...data })),
  resetCheckout: () => set({ selectedAddress: null, deliveryMethod: null, deliveryFee: 0, distance: null })
}));
