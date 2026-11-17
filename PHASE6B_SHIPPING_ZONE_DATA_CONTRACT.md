# Phase 06B: Shipping Zone Data Contract Specification
**Kendin Tasarla — E-Commerce & POD Delivery Architecture**  
**Specification Version:** `1.0.0`  
**Date:** 2026-11-15  

---

## 1. Overview & Type System

This document specifies the exact JSON schemas, TypeScript types, and Firestore document layouts governing **Express Delivery Zones** in Kendin Tasarla across the Store (`d:\kenditasarl`) and Admin (`d:\kenditasarl\kenditasarl-admin`).

---

## 2. Zod & TypeScript Data Contracts

### 2.1 Coordinate Pair & GeoJSON Polygon
```typescript
export type CoordinatePair = [number, number]; // [longitude, latitude] in degrees

export const geoJsonPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z
      .array(linearRingSchema)
      .min(1)
      .max(10), // coordinates[0] is outer boundary; coordinates[1..N] are holes
  })
  .strict();
```

- **Linear Ring Requirements:**
  - Length: Minimum 4 coordinates.
  - Closed Ring: The first coordinate must equal the last coordinate ($C_0 = C_{N-1}$).
  - Longitude: $-180 \le \text{lng} \le 180$.
  - Latitude: $-90 \le \text{lat} \le 90$.
  - Self-intersection: Must evaluate to `false` via `isRingSelfIntersecting`.

### 2.2 Service Hours Schema
```typescript
export const serviceHoursSchema = z
  .object({
    timezone: z.literal("Europe/Istanbul").default("Europe/Istanbul"),
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7), // 1 = Monday, 7 = Sunday
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm"),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm"),
  })
  .strict();
```
- **Overnight Shifts:** When `end < start` (e.g. `21:00` to `03:00`), the window spans across midnight into the following morning.

### 2.3 Express Delivery Zone Schema
```typescript
export const expressDeliveryZoneSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    title: localizedStringSchema, // { tr: string, ar: string, en: string }
    description: localizedStringSchema.optional(),
    isActive: z.boolean().default(true),
    geometry: geoJsonPolygonSchema,
    feeMinor: z.number().int().min(0).max(10000000), // Integer kuruş (e.g. 15000 = 150.00 TL)
    minimumSubtotalMinor: z.number().int().min(0).max(10000000).optional(),
    serviceHours: serviceHoursSchema,
    etaDescription: localizedStringSchema.optional(), // e.g. "2-4 saat içinde teslimat"
    priority: z.number().int().min(0).max(1000).default(1),
  })
  .strict();
```

### 2.4 Express Zone Policy Definition Schema
```typescript
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
```

---

## 3. Firestore Document Models

### 3.1 Active Policy Pointer
- **Path:** `/shipping_zone_policies/default`
- **Fields:**
  - `schemaVersion`: `1` (integer)
  - `id`: `"default"` (string)
  - `activeRevisionId`: `"<sha256_hash>"` | `null`
  - `updatedAt`: ISO 8601 string
  - `updatedBy`: Admin UID string

### 3.2 Working Draft
- **Path:** `/shipping_zone_policies/default/drafts/current`
- **Fields:**
  - `schemaVersion`: `1` (integer)
  - `status`: `"draft"` (string)
  - `updatedAt`: ISO 8601 string
  - `updatedBy`: Admin UID string
  - `definitionJson`: Serialized JSON string of `ExpressZonePolicyDefinition` (prevents Firestore nested array rejection)
  - `validationWarnings`: Array of warning strings

### 3.3 Immutable Published Revision
- **Path:** `/shipping_zone_policies/default/revisions/{revisionHash}`
- **Fields:**
  - `schemaVersion`: `1` (integer)
  - `revisionId`: `"<sha256_hash>"` (identical to document ID)
  - `status`: `"published"` (string)
  - `createdAt`: ISO 8601 string
  - `publishedBy`: Admin UID string
  - `definitionJson`: Serialized JSON string of `ExpressZonePolicyDefinition`

### 3.4 Concurrency & Audit Trail
- **Path:** `/shipping_zone_policies/default/audit/{auditId}`
- **Fields:**
  - `action`: `"save_draft"` | `"publish"`
  - `actorId`: Admin UID string
  - `fromRevision`: String or `null`
  - `toRevision`: String
  - `timestamp`: ISO 8601 string

---

## 4. Checkout & Order Snapshots

### 4.1 Shipping Snapshot in Orders
When an order is confirmed, an immutable snapshot is stored in `/orders/{orderId}`:
```typescript
shipping_snapshot: {
  method: "express",
  zone_id: "zone_kadikoy",
  zoneId: "zone_kadikoy",
  fee_minor: 15000,
  feeMinor: 15000,
  zone_title: {
    tr: "Kadıköy Hızlı Teslimat Bölgesi",
    ar: "منطقة توصيل سريع كاديكوي",
    en: "Kadikoy Express Zone"
  },
  zoneTitle: { ... },
  eta_description: {
    tr: "2-4 saat içinde teslimat",
    ar: "توصيل خلال 2-4 ساعات",
    en: "Delivery in 2-4 hours"
  },
  etaDescription: { ... },
  policy_revision: "<sha256_hash>",
  location_source: "pin_verified" | "google_places"
}
```

### 4.2 Order Financial Summary
- `delivery_fee`: `150` (floating/decimal TL)
- `delivery_minor`: `15000` (integer kuruş)
- `shipping_policy_revision`: `"<sha256_hash>"`
- `delivery_method`: `"express"`
