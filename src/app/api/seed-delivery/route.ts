import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export async function GET() {
  try {
    const zone = {
      base_fee: 50,
      price_per_km: 5,
      max_km: 30,
      fixed_shipping_fee: 50,
      active: true
    };
    await addDoc(collection(db, 'delivery_zones'), zone);
    return NextResponse.json({ success: true, zone });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
