import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. Multilingual localized string helper
// ---------------------------------------------------------------------------
export const localizedStringSchema = z
  .object({
    tr: z.string().min(1).max(500),
    ar: z.string().min(1).max(500),
    en: z.string().min(1).max(500),
  })
  .strict();
export type LocalizedString = z.infer<typeof localizedStringSchema>;

// ---------------------------------------------------------------------------
// 2. GeoJSON Polygon Schema (Lon, Lat order per RFC 7946)
// ---------------------------------------------------------------------------
export const coordinatePairSchema = z
  .tuple([
    z.number().finite().min(-180).max(180), // Longitude
    z.number().finite().min(-90).max(90),   // Latitude
  ]);
export type CoordinatePair = z.infer<typeof coordinatePairSchema>;

export const linearRingSchema = z
  .array(coordinatePairSchema)
  .min(4) // Minimum 3 unique points + 1 closure point
  .max(500)
  .refine(
    (ring) => {
      if (ring.length < 4) return false;
      const first = ring[0];
      const last = ring[ring.length - 1];
      // Ring must be closed (first coordinate equals last coordinate)
      const isClosed =
        Math.abs(first[0] - last[0]) < 1e-7 &&
        Math.abs(first[1] - last[1]) < 1e-7;
      return isClosed;
    },
    { message: "Linear ring must be closed (first and last coordinate must match)" }
  );

export const geoJsonPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(linearRingSchema).min(1).max(20), // [outerRing, ...holes]
  })
  .strict();
export type GeoJSONPolygon = z.infer<typeof geoJsonPolygonSchema>;

// ---------------------------------------------------------------------------
// 3. Service Hours Schema (Europe/Istanbul Timezone)
// ---------------------------------------------------------------------------
export const serviceHoursSchema = z
  .object({
    timezone: z.literal("Europe/Istanbul").default("Europe/Istanbul"),
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7), // 1 = Monday, 7 = Sunday
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm"),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm"),
  })
  .strict();
export type ServiceHours = z.infer<typeof serviceHoursSchema>;

// ---------------------------------------------------------------------------
// 4. Express Delivery Zone Schema
// ---------------------------------------------------------------------------
export const expressDeliveryZoneSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/, "Zone ID must be alphanumeric with dashes/underscores"),
    title: localizedStringSchema,
    description: localizedStringSchema.optional(),
    isActive: z.boolean().default(true),
    geometry: geoJsonPolygonSchema,
    feeMinor: z.number().int().min(0).max(10000000), // Integer kuruş (e.g. 15000 = 150.00 TL)
    minimumSubtotalMinor: z.number().int().min(0).max(10000000).optional(), // Minimum basket required in kuruş
    serviceHours: serviceHoursSchema,
    etaDescription: localizedStringSchema.optional(), // e.g. "2-4 saat içinde teslimat"
    priority: z.number().int().min(0).max(1000).default(1),
  })
  .strict();
export type ExpressDeliveryZone = z.infer<typeof expressDeliveryZoneSchema>;

// ---------------------------------------------------------------------------
// 5. Versioned Policy Schema
// ---------------------------------------------------------------------------
export const expressZonePolicyDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    zones: z.array(expressDeliveryZoneSchema).max(50),
    updatedAt: z.string().max(100),
    updatedBy: z.string().max(128).optional(),
  })
  .strict();
export type ExpressZonePolicyDefinition = z.infer<typeof expressZonePolicyDefinitionSchema>;

// ---------------------------------------------------------------------------
// 6. Geometry Utilities (Pure TypeScript, zero external dependencies)
// ---------------------------------------------------------------------------

/**
 * Calculates planar signed area of a 2D ring using the Shoelace formula.
 * Returns positive or negative number. Absolute value > 0 means non-zero area.
 */
export function calculateRingArea(ring: CoordinatePair[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

/**
 * Checks if two line segments (p1-p2) and (p3-p4) intersect.
 */
function ccw(p1: CoordinatePair, p2: CoordinatePair, p3: CoordinatePair): number {
  return (p3[1] - p1[1]) * (p2[0] - p1[0]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
}

export function doSegmentsIntersect(
  p1: CoordinatePair,
  p2: CoordinatePair,
  p3: CoordinatePair,
  p4: CoordinatePair
): boolean {
  const ccw1 = ccw(p1, p3, p4);
  const ccw2 = ccw(p2, p3, p4);
  const ccw3 = ccw(p1, p2, p3);
  const ccw4 = ccw(p1, p2, p4);

  if (
    ((ccw1 > 0 && ccw2 < 0) || (ccw1 < 0 && ccw2 > 0)) &&
    ((ccw3 > 0 && ccw4 < 0) || (ccw3 < 0 && ccw4 > 0))
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a linear ring has self-intersecting edges (excluding consecutive vertices).
 */
export function isRingSelfIntersecting(ring: CoordinatePair[]): boolean {
  const n = ring.length;
  if (n < 4) return false;

  for (let i = 0; i < n - 1; i++) {
    const a1 = ring[i];
    const a2 = ring[i + 1];

    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue; // Skip first and last segment connecting at vertex 0
      const b1 = ring[j];
      const b2 = ring[j + 1];

      if (doSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if a point is on a line segment with a small epsilon.
 */
function isPointOnSegment(
  pt: CoordinatePair,
  p1: CoordinatePair,
  p2: CoordinatePair,
  epsilon = 1e-8
): boolean {
  const [px, py] = pt;
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  const lenSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (lenSq < epsilon) {
    return Math.abs(px - x1) < epsilon && Math.abs(py - y1) < epsilon;
  }

  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  if (Math.abs(cross) > epsilon) return false;

  const dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1);
  if (dot < 0 || dot > lenSq) return false;

  return true;
}

/**
 * Ray-casting algorithm to test if [lon, lat] is inside a single linear ring.
 * Boundary semantics: points on edges or vertices return true.
 */
export function isPointInRing(point: CoordinatePair, ring: CoordinatePair[]): boolean {
  const [x, y] = point;
  let inside = false;
  const n = ring.length;
  if (n < 4) return false;

  // In GeoJSON, ring[0] equals ring[n - 1]. Loop over the n - 1 segments.
  for (let i = 0; i < n - 1; i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[i + 1];

    // Check if point is directly on the segment
    if (isPointOnSegment(point, ring[i], ring[i + 1])) {
      return true;
    }

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Full Point-in-Polygon check for GeoJSON Polygon with outer ring and optional holes.
 */
export function isPointInPolygon(point: CoordinatePair, polygon: GeoJSONPolygon): boolean {
  if (!polygon.coordinates || polygon.coordinates.length === 0) return false;

  const outerRing = polygon.coordinates[0];
  if (!isPointInRing(point, outerRing)) {
    return false;
  }

  // If inside outer ring, check that it's NOT inside any hole (inner rings)
  for (let h = 1; h < polygon.coordinates.length; h++) {
    const holeRing = polygon.coordinates[h];
    if (isPointInRing(point, holeRing)) {
      return false; // Point is in a hole
    }
  }

  return true;
}

/**
 * Checks if two GeoJSON Polygons overlap.
 * Returns true if any vertex of A is inside B, or any vertex of B is inside A,
 * or any edge of A intersects any edge of B.
 */
export function doPolygonsOverlap(polyA: GeoJSONPolygon, polyB: GeoJSONPolygon): boolean {
  const ringA = polyA.coordinates[0];
  const ringB = polyB.coordinates[0];

  // 1. Check if any vertex of A is strictly inside B
  for (let i = 0; i < ringA.length - 1; i++) {
    if (isPointInPolygon(ringA[i], polyB)) return true;
  }

  // 2. Check if any vertex of B is strictly inside A
  for (let i = 0; i < ringB.length - 1; i++) {
    if (isPointInPolygon(ringB[i], polyA)) return true;
  }

  // 3. Check if any edge of A intersects any edge of B
  for (let i = 0; i < ringA.length - 1; i++) {
    const a1 = ringA[i];
    const a2 = ringA[i + 1];
    for (let j = 0; j < ringB.length - 1; j++) {
      const b1 = ringB[j];
      const b2 = ringB[j + 1];
      if (doSegmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }

  return false;
}

/**
 * Validates a policy's geometry rules:
 * - No self-intersecting rings
 * - Non-zero positive area
 * - No overlapping active zones
 */
export function validatePolicyGeometry(policy: ExpressZonePolicyDefinition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const activeZones = policy.zones.filter((z) => z.isActive);

  // Validate individual zones
  for (const zone of policy.zones) {
    if (!zone.geometry || zone.geometry.type !== "Polygon" || !Array.isArray(zone.geometry.coordinates)) {
      errors.push(`Zone "${zone.id}": Invalid GeoJSON Polygon structure.`);
      continue;
    }

    const outerRing = zone.geometry.coordinates[0];
    if (!outerRing || outerRing.length < 4) {
      errors.push(`Zone "${zone.id}": Outer ring must contain at least 4 coordinates.`);
      continue;
    }

    // Verify closure
    const firstPt = outerRing[0];
    const lastPt = outerRing[outerRing.length - 1];
    if (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1]) {
      errors.push(`Zone "${zone.id}": Outer ring is not closed (first vertex must match last vertex).`);
    }

    // Validate coordinate ranges
    for (const [lng, lat] of outerRing) {
      if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) {
        errors.push(`Zone "${zone.id}": Coordinates must be finite numbers.`);
        break;
      }
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        errors.push(`Zone "${zone.id}": Coordinates out of range (lng: [-180, 180], lat: [-90, 90]).`);
        break;
      }
    }

    const area = Math.abs(calculateRingArea(outerRing));
    if (area < 1e-10) {
      errors.push(`Zone "${zone.id}": Polygon area is zero or degenerate.`);
    }

    if (isRingSelfIntersecting(outerRing)) {
      errors.push(`Zone "${zone.id}": Polygon outer ring is self-intersecting.`);
    }

    // Validate holes
    for (let h = 1; h < zone.geometry.coordinates.length; h++) {
      const hole = zone.geometry.coordinates[h];
      if (!hole || hole.length < 4) {
        errors.push(`Zone "${zone.id}": Hole #${h} must contain at least 4 coordinates.`);
        continue;
      }

      const hFirst = hole[0];
      const hLast = hole[hole.length - 1];
      if (hFirst[0] !== hLast[0] || hFirst[1] !== hLast[1]) {
        errors.push(`Zone "${zone.id}": Hole #${h} is not closed.`);
      }

      if (isRingSelfIntersecting(hole)) {
        errors.push(`Zone "${zone.id}": Hole #${h} is self-intersecting.`);
      }

      // Hole must be fully enclosed by outer ring
      for (const pt of hole) {
        if (!isPointInRing(pt, outerRing)) {
          errors.push(`Zone "${zone.id}": Hole #${h} is not fully enclosed within outer boundary.`);
          break;
        }
      }

      // Hole must not intersect outer ring edges
      let holeIntersectsOuter = false;
      for (let i = 0; i < outerRing.length - 1; i++) {
        for (let j = 0; j < hole.length - 1; j++) {
          if (doSegmentsIntersect(outerRing[i], outerRing[i + 1], hole[j], hole[j + 1])) {
            errors.push(`Zone "${zone.id}": Hole #${h} intersects the outer boundary.`);
            holeIntersectsOuter = true;
            break;
          }
        }
        if (holeIntersectsOuter) break;
      }

      // Hole must not intersect other holes
      for (let otherH = h + 1; otherH < zone.geometry.coordinates.length; otherH++) {
        const otherHole = zone.geometry.coordinates[otherH];
        let holesIntersect = false;
        for (let i = 0; i < hole.length - 1; i++) {
          for (let j = 0; j < otherHole.length - 1; j++) {
            if (doSegmentsIntersect(hole[i], hole[i + 1], otherHole[j], otherHole[j + 1])) {
              errors.push(`Zone "${zone.id}": Hole #${h} intersects Hole #${otherH}.`);
              holesIntersect = true;
              break;
            }
          }
          if (holesIntersect) break;
        }
      }
    }
  }

  // Validate no overlapping active zones (Task 06B Section 3.3 requirement)
  for (let i = 0; i < activeZones.length; i++) {
    for (let j = i + 1; j < activeZones.length; j++) {
      const zoneA = activeZones[i];
      const zoneB = activeZones[j];
      if (doPolygonsOverlap(zoneA.geometry, zoneB.geometry)) {
        errors.push(
          `Overlapping active zones detected: "${zoneA.id}" and "${zoneB.id}". Overlapping active zones are rejected on publish.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 7. Time & Service Hours Evaluator
// ---------------------------------------------------------------------------

/**
 * Checks whether a given Date is within the configured service hours in Europe/Istanbul.
 */
export function isWithinServiceHours(
  hours: ServiceHours,
  currentDate = new Date()
): boolean {
  // Format current date in Europe/Istanbul timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(currentDate);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  const dayOfWeek = weekdayMap[partMap.weekday] ?? 1;
  if (!hours.days.includes(dayOfWeek)) {
    return false;
  }

  const currentH = parseInt(partMap.hour, 10);
  const currentM = parseInt(partMap.minute, 10);
  const currentMinutes = currentH * 60 + currentM;

  const [startH, startM] = hours.start.split(":").map(Number);
  const startMinutes = startH * 60 + startM;

  const [endH, endM] = hours.end.split(":").map(Number);
  const endMinutes = endH * 60 + endM;

  // Normal window (e.g. 09:00 to 21:00)
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // Overnight window (e.g. 21:00 to 03:00)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

// ---------------------------------------------------------------------------
// 8. Eligibility Evaluation Engine
// ---------------------------------------------------------------------------

export type ExpressFailureReason =
  | "NO_ACTIVE_POLICY"
  | "INVALID_ADDRESS"
  | "ADDRESS_VERIFICATION_REQUIRED"
  | "OUTSIDE_ZONE"
  | "OUTSIDE_SERVICE_HOURS"
  | "MINIMUM_NOT_MET";

export interface AddressCoordinates {
  lat?: number;
  lng?: number;
  location_source?: string;
}

export interface EvaluateExpressParams {
  policy: ExpressZonePolicyDefinition | null;
  address: AddressCoordinates | null;
  basketSubtotalMinor: number;
  currentDate?: Date;
}

export type ExpressEvaluationResult =
  | {
      eligible: true;
      zoneId: string;
      zoneTitle: LocalizedString;
      feeMinor: number;
      minimumSubtotalMinor?: number;
      etaDescription?: LocalizedString;
    }
  | {
      eligible: false;
      reasonCode: ExpressFailureReason;
      reasonMessage: LocalizedString;
    };

export function evaluateExpressEligibility(
  params: EvaluateExpressParams
): ExpressEvaluationResult {
  const { policy, address, basketSubtotalMinor, currentDate = new Date() } = params;

  if (!policy || !Array.isArray(policy.zones) || policy.zones.length === 0) {
    return {
      eligible: false,
      reasonCode: "NO_ACTIVE_POLICY",
      reasonMessage: {
        tr: "Hızlı teslimat hizmeti şu anda aktif değildir.",
        ar: "خدمة التوصيل السريع غير مفعلة حالياً.",
        en: "Express delivery service is currently not active.",
      },
    };
  }

  if (
    !address ||
    typeof address.lat !== "number" ||
    typeof address.lng !== "number" ||
    !Number.isFinite(address.lat) ||
    !Number.isFinite(address.lng) ||
    Math.abs(address.lat) > 90 ||
    Math.abs(address.lng) > 180
  ) {
    return {
      eligible: false,
      reasonCode: "INVALID_ADDRESS",
      reasonMessage: {
        tr: "Teslimat adresi koordinatları geçersiz.",
        ar: "إحداثيات عنوان التوصيل غير صالحة.",
        en: "Delivery address coordinates are invalid.",
      },
    };
  }

  // Address trust check (Task 06B Section 4)
  const trustedSources = [
    "google_places",
    "pin_verified",
    "admin_verified",
    "verified",
    "carrier_geocoded",
    "google_places_server",
  ];
  const locationSource = address.location_source || "unverified";
  if (!trustedSources.includes(locationSource)) {
    return {
      eligible: false,
      reasonCode: "ADDRESS_VERIFICATION_REQUIRED",
      reasonMessage: {
        tr: "Hızlı teslimat için adres konumunun doğrulanması gerekmektedir.",
        ar: "يتطلب التوصيل السريع التحقق الموثوق من موقع العنوان.",
        en: "Express delivery requires verified address location.",
      },
    };
  }

  const point: CoordinatePair = [address.lng, address.lat];

  // Find active matching zone sorted by priority descending
  const activeZones = policy.zones
    .filter((z) => z.isActive)
    .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));

  let matchedZone: ExpressDeliveryZone | null = null;
  for (const zone of activeZones) {
    if (isPointInPolygon(point, zone.geometry)) {
      matchedZone = zone;
      break;
    }
  }

  if (!matchedZone) {
    return {
      eligible: false,
      reasonCode: "OUTSIDE_ZONE",
      reasonMessage: {
        tr: "Adresiniz hızlı teslimat hizmet bölgelerimiz dışındadır.",
        ar: "عنوانك خارج مناطق التوصيل السريع المدعومة.",
        en: "Your address is outside our express delivery service zones.",
      },
    };
  }

  // Check service hours
  if (!isWithinServiceHours(matchedZone.serviceHours, currentDate)) {
    return {
      eligible: false,
      reasonCode: "OUTSIDE_SERVICE_HOURS",
      reasonMessage: {
        tr: `Hızlı teslimat çalışma saatleri dışındasınız (${matchedZone.serviceHours.start} - ${matchedZone.serviceHours.end}).`,
        ar: `أنت خارج أوقات عمل التوصيل السريع (${matchedZone.serviceHours.start} - ${matchedZone.serviceHours.end}).`,
        en: `Outside express service hours (${matchedZone.serviceHours.start} - ${matchedZone.serviceHours.end}).`,
      },
    };
  }

  // Check minimum subtotal basket
  if (
    matchedZone.minimumSubtotalMinor &&
    basketSubtotalMinor < matchedZone.minimumSubtotalMinor
  ) {
    const minTL = (matchedZone.minimumSubtotalMinor / 100).toFixed(2);
    return {
      eligible: false,
      reasonCode: "MINIMUM_NOT_MET",
      reasonMessage: {
        tr: `Bu bölgede hızlı teslimat için minimum sepet tutarı ${minTL} ₺ olmalıdır.`,
        ar: `الحد الأدنى للطلب للتوصيل السريع في هذه المنطقة هو ${minTL} ل.ت.`,
        en: `Minimum basket subtotal for express delivery in this zone is ${minTL} TRY.`,
      },
    };
  }

  return {
    eligible: true,
    zoneId: matchedZone.id,
    zoneTitle: matchedZone.title,
    feeMinor: matchedZone.feeMinor,
    minimumSubtotalMinor: matchedZone.minimumSubtotalMinor,
    etaDescription: matchedZone.etaDescription,
  };
}

// ---------------------------------------------------------------------------
// 9. Fingerprint & Default Baseline Policy
// ---------------------------------------------------------------------------

export function computePolicyFingerprint(policy: ExpressZonePolicyDefinition): string {
  // Isomorphic SHA-256 resolution
  let crypto: any;
  try {
    crypto = eval("require")("node:crypto");
  } catch {
    crypto = (globalThis as any).crypto;
  }

  const jsonStr = JSON.stringify(policy, Object.keys(policy).sort());
  if (crypto && typeof crypto.createHash === "function") {
    return crypto.createHash("sha256").update(jsonStr).digest("hex");
  }
  // Fallback djb2-based hash for pure browser environments if WebCrypto subtle is async
  let h = 0x811c9dc5;
  for (let i = 0; i < jsonStr.length; i++) {
    h ^= jsonStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(64, "0");
}

/**
 * Synthetic default baseline policy for Istanbul Kadıköy & Beşiktaş
 */
export function getDefaultExpressZonePolicy(): ExpressZonePolicyDefinition {
  return {
    schemaVersion: 1,
    id: "default",
    name: "İstanbul Hızlı Teslimat Bölgeleri",
    zones: [
      {
        id: "zone_kadikoy",
        title: {
          tr: "Kadıköy Hızlı Teslimat Bölgesi",
          ar: "منطقة توصيل سريع كاديكوي",
          en: "Kadikoy Express Zone",
        },
        description: {
          tr: "Kadıköy ilçe sınırları içi hızlı kurye servisi",
          ar: "خدمة توصيل سريع داخل حدود كاديكوي",
          en: "Express courier service within Kadikoy district",
        },
        isActive: true,
        // Synthetic Kadikoy polygon (lon, lat)
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [29.010, 40.970],
              [29.070, 40.970],
              [29.090, 41.000],
              [29.030, 41.010],
              [29.010, 40.970], // closed
            ],
          ],
        },
        feeMinor: 15000, // 150.00 TL
        minimumSubtotalMinor: 20000, // 200.00 TL
        serviceHours: {
          timezone: "Europe/Istanbul",
          days: [1, 2, 3, 4, 5, 6, 7],
          start: "09:00",
          end: "22:00",
        },
        etaDescription: {
          tr: "2-4 saat içinde teslimat",
          ar: "توصيل خلال 2-4 ساعات",
          en: "Delivery in 2-4 hours",
        },
        priority: 10,
      },
      {
        id: "zone_besiktas",
        title: {
          tr: "Beşiktaş Hızlı Teslimat Bölgesi",
          ar: "منطقة توصيل سريع بيشكتاش",
          en: "Besiktas Express Zone",
        },
        description: {
          tr: "Beşiktaş merkez ve sahil şeridi",
          ar: "منطقة بيشكتاش والشريط الساحلي",
          en: "Besiktas center and coastline",
        },
        isActive: true,
        // Synthetic Besiktas polygon (lon, lat)
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [29.000, 41.040],
              [29.050, 41.040],
              [29.060, 41.070],
              [29.010, 41.070],
              [29.000, 41.040], // closed
            ],
          ],
        },
        feeMinor: 17500, // 175.00 TL
        minimumSubtotalMinor: 25000, // 250.00 TL
        serviceHours: {
          timezone: "Europe/Istanbul",
          days: [1, 2, 3, 4, 5, 6, 7],
          start: "10:00",
          end: "21:00",
        },
        etaDescription: {
          tr: "2-3 saat içinde teslimat",
          ar: "توصيل خلال 2-3 ساعات",
          en: "Delivery in 2-3 hours",
        },
        priority: 10,
      },
    ],
    updatedAt: "2026-11-15T00:00:00.000Z",
    updatedBy: "system",
  };
}
