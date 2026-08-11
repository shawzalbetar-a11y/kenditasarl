import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

// Fallback Haversine function
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; // Distance in km
}

async function getDrivingDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  // Use a dedicated server key if available (recommended for backend Google APIs), 
  // otherwise fallback to the public key.
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return calculateHaversineDistance(lat1, lon1, lat2, lon2);

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      // Distance is in meters, convert to km
      return data.rows[0].elements[0].distance.value / 1000;
    }
    console.warn("Google Distance Matrix API returned non-OK status, falling back to Haversine");
  } catch (error) {
    console.error("Error calling Google Distance Matrix API:", error);
  }
  
  // Fallback if API fails
  return calculateHaversineDistance(lat1, lon1, lat2, lon2);
}

export async function POST(request: Request) {
  try {
    const { lat, lng } = await request.json();

    if (lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const storeLat = parseFloat(process.env.STORE_ORIGIN_LAT || '0');
    const storeLng = parseFloat(process.env.STORE_ORIGIN_LNG || '0');

    const distance = await getDrivingDistance(storeLat, storeLng, lat, lng);

    // Fetch active delivery zone
    const q = query(collection(db, 'delivery_zones'), where('active', '==', true));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      return NextResponse.json({ error: 'No active delivery zones found' }, { status: 404 });
    }

    const zone = snap.docs[0].data();
    
    // Calculate express fee
    const expressFee = zone.base_fee + (zone.price_per_km * distance);
    const isExpressAvailable = distance <= zone.max_km;

    return NextResponse.json({
      distance: Math.round(distance * 10) / 10,
      isExpressAvailable,
      expressFee: Math.round(expressFee),
      fixedShippingFee: zone.fixed_shipping_fee
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
