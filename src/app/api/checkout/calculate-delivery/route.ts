import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server/cloudinaryServer';
import { DEFAULT_PRICING_CONFIG, PricingSettingsConfig } from '@/lib/pricing';
import { getDrivingDistance } from "@/lib/server/shippingDistance";
import {
  evaluateExpressEligibility,
  type ExpressZonePolicyDefinition,
} from "@/lib/shippingZones";
import { verifyServerAddress } from "@/lib/server/addressVerification";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lat, lng, subtotal = 0, addressId, userId } = body;

    if (lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const db = serverDb();

    // 1. Fetch unified pricing config from settings/pricing
    let deliveryConfig = DEFAULT_PRICING_CONFIG.delivery;
    try {
      const pricingSnap = await db.doc('settings/pricing').get();
      if (pricingSnap.exists) {
        const pricingData = pricingSnap.data() as Partial<PricingSettingsConfig>;
        if (pricingData?.delivery) {
          deliveryConfig = {
            ...DEFAULT_PRICING_CONFIG.delivery,
            ...pricingData.delivery,
            express: {
              ...DEFAULT_PRICING_CONFIG.delivery.express,
              ...(pricingData.delivery.express || {}),
            },
          };
        }
      }
    } catch (err) {
      console.warn("Could not fetch settings/pricing", err);
    }

    // 2. Standard Shipping & Free Shipping eligibility
    const isFreeShipping =
      deliveryConfig.is_free_shipping_enabled &&
      Number(subtotal) >= deliveryConfig.free_shipping_threshold;
    const fixedShippingFee = isFreeShipping ? 0 : deliveryConfig.fixed_shipping_fee;

    // 3. Phase 06B Express Delivery Zones: Point-In-Polygon & Service Hours Check
    let isExpressAvailable = false;
    let expressFee = 0;
    let expressFeeMinor = 0;
    let zoneId: string | null = null;
    let zoneTitle: any = null;
    let etaDescription: any = null;
    let expressReasonCode: string | null = null;
    let expressReasonMessage: any = null;
    let policyRevisionId: string | null = null;

    try {
      const policyPointerSnap = await db.doc("shipping_zone_policies/default").get();
      if (policyPointerSnap.exists && policyPointerSnap.get("activeRevisionId")) {
        const revId = policyPointerSnap.get("activeRevisionId");
        policyRevisionId = revId;
        const revSnap = await db.doc(`shipping_zone_policies/default/revisions/${revId}`).get();
        if (revSnap.exists && (revSnap.get("definition") || revSnap.get("definitionJson"))) {
          const revData = revSnap.data();
          const activePolicy = (revData?.definition || (revData?.definitionJson ? JSON.parse(revData.definitionJson) : null)) as ExpressZonePolicyDefinition;

          // Address verification check (Phase 06B-R Trust Boundary: Client cannot self-certify)
          let resolvedLocationSource = "unverified";
          if (addressId && userId) {
            const check = await verifyServerAddress({
              addressId: String(addressId),
              userId: String(userId),
              lat: Number(lat),
              lng: Number(lng),
            });
            if (check.verified) {
              resolvedLocationSource = check.record.verificationSource;
            }
          }

          const subtotalMinor = Math.round(Number(subtotal) * 100);

          const evaluation = evaluateExpressEligibility({
            policy: activePolicy,
            address: {
              lat: Number(lat),
              lng: Number(lng),
              location_source: resolvedLocationSource,
            },
            basketSubtotalMinor: subtotalMinor,
            currentDate: new Date(),
          });

          if (evaluation.eligible) {
            isExpressAvailable = true;
            zoneId = evaluation.zoneId;
            zoneTitle = evaluation.zoneTitle;
            expressFeeMinor = evaluation.feeMinor;
            expressFee = evaluation.feeMinor / 100;
            etaDescription = evaluation.etaDescription || null;
          } else {
            isExpressAvailable = false;
            expressReasonCode = evaluation.reasonCode;
            expressReasonMessage = evaluation.reasonMessage;
          }
        }
      }
    } catch (err) {
      console.warn("Error evaluating express shipping zone policy", err);
    }

    // Distance calculation for informative metrics
    const storeLat = parseFloat(process.env.STORE_ORIGIN_LAT || '0');
    const storeLng = parseFloat(process.env.STORE_ORIGIN_LNG || '0');
    let distance = 0;
    if (storeLat && storeLng) {
      distance = await getDrivingDistance(storeLat, storeLng, lat, lng).catch(() => 0);
    }

    return NextResponse.json({
      distance: Math.round(distance * 10) / 10,
      isExpressAvailable,
      expressFee,
      expressFeeMinor,
      zoneId,
      zoneTitle,
      etaDescription,
      expressReasonCode,
      expressReasonMessage,
      policyRevisionId,
      fixedShippingFee,
      isFreeShipping,
      freeShippingThreshold: deliveryConfig.free_shipping_threshold,
      isFreeShippingEnabled: deliveryConfig.is_free_shipping_enabled,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
