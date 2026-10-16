import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { DEFAULT_PRICING_CONFIG, PricingSettingsConfig } from '@/lib/pricing';

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
    const body = await request.json();
    const { lat, lng, subtotal = 0 } = body;

    if (lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const storeLat = parseFloat(process.env.STORE_ORIGIN_LAT || '0');
    const storeLng = parseFloat(process.env.STORE_ORIGIN_LNG || '0');

    const distance = await getDrivingDistance(storeLat, storeLng, lat, lng);

    // 1. Try to fetch unified pricing config from settings/pricing
    let deliveryConfig = DEFAULT_PRICING_CONFIG.delivery;
    try {
      if (db) {
        const pricingSnap = await getDoc(doc(db, 'settings', 'pricing'));
        if (pricingSnap.exists()) {
          const pricingData = pricingSnap.data() as Partial<PricingSettingsConfig>;
          if (pricingData.delivery) {
            deliveryConfig = {
              ...DEFAULT_PRICING_CONFIG.delivery,
              ...pricingData.delivery,
              express: {
                ...DEFAULT_PRICING_CONFIG.delivery.express,
                ...(pricingData.delivery.express || {})
              }
            };
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch settings/pricing, falling back to delivery_zones or defaults", err);
    }

    // 2. Check Free Shipping eligibility
    const isFreeShipping = deliveryConfig.is_free_shipping_enabled && 
      Number(subtotal) >= deliveryConfig.free_shipping_threshold;
    
    const fixedShippingFee = isFreeShipping ? 0 : deliveryConfig.fixed_shipping_fee;

    // 3. Express Delivery calculation (Base fee + Flat tier fee up to Flat tier km, then price_per_km for extra distance)
    const expressActive = deliveryConfig.express.is_active;
    const isExpressAvailable = expressActive && (distance <= deliveryConfig.express.max_km);
    
    const baseFee = deliveryConfig.express.base_fee || 0;
    const flatTierFee = typeof deliveryConfig.express.flat_tier_fee === 'number' ? deliveryConfig.express.flat_tier_fee : 150;
    const flatTierKm = typeof deliveryConfig.express.flat_tier_km === 'number' ? deliveryConfig.express.flat_tier_km : 3;
    const pricePerKm = typeof deliveryConfig.express.price_per_km === 'number' ? deliveryConfig.express.price_per_km : 10;

    let computedExpressFee = baseFee + flatTierFee;
    if (distance > flatTierKm) {
      const extraKm = distance - flatTierKm;
      computedExpressFee += extraKm * pricePerKm;
    }
    const expressFee = Math.round(computedExpressFee);

    return NextResponse.json({
      distance: Math.round(distance * 10) / 10,
      isExpressAvailable,
      expressFee,
      fixedShippingFee,
      isFreeShipping,
      freeShippingThreshold: deliveryConfig.free_shipping_threshold,
      isFreeShippingEnabled: deliveryConfig.is_free_shipping_enabled
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

