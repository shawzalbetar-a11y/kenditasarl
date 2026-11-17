# Kendin Tasarla — Phase 06A Data Contract
## Matching Collections, Family Bundles & Shared Design Instances

**Document Version:** 1.0.0  
**Phase:** 06A  
**Date:** 15 November 2026  
**Status:** Implemented & Verified in Local Emulator & Unit Tests  

---

## 1. Overview & Architectural Principle

In Kendin Tasarla, a **Matching Collection / Family Bundle** allows a customer to compose an abstract, reusable **Master Design** (`master_designs/{masterId}`) and map it proportionally and adaptively onto multiple target physical garments (e.g. Father Men's T-Shirt XL, Mother Women's Hoodie M, Child Youth T-Shirt S) with distinct sizes, garment colors, print areas, and quantities.

### Core Axiom: Separation of Master Art from Physical Order Lines
```
+-------------------------------------------------------------+
|             master_designs/{masterId} (Logical)             |
|   - Vector/Text/Image layers in reference coordinate space   |
|   - revision: int, revisionHash: SHA-256                    |
+------------------------------+------------------------------+
                               |
            [adaptMasterDesignToTargetPlacement]
                               |
         +---------------------+---------------------+
         |                     |                     |
         v                     v                     v
+-----------------+   +-----------------+   +-----------------+
| Target Instance |   | Target Instance |   | Target Instance |
|  Father: XL     |   |  Mother: M      |   |  Child: S       |
|  Black T-Shirt  |   |  White Hoodie   |   |  Yellow T-Shirt |
|  Front (30x40cm)|   |  Front (28x35cm)|   |  Front (20x25cm)|
+--------+--------+   +--------+--------+   +--------+--------+
         |                     |                     |
         v                     v                     v
+-----------------+   +-----------------+   +-----------------+
| 03B Order Line  |   | 03B Order Line  |   | 03B Order Line  |
| SKU: TSHIRT-M-XL|   | SKU: HOODIE-W-M |   | SKU: TSHIRT-Y-S |
| Price: 260 TRY  |   | Price: 310 TRY  |   | Price: 190 TRY  |
| 04A/04B Snapshot|   | 04A/04B Snapshot|   | 04A/04B Snapshot|
+-----------------+   +-----------------+   +-----------------+
```

1. **The Master Design is NOT a printable face:** A master design exists in an abstract reference bounding frame and cannot be printed directly without adaptation to a specific product's placement template.
2. **Every physical item is an independent 03B order line:** Each bundle item receives its own concrete design document (`designs/{instanceId}`), its own SKU/variant, its own immutable production snapshot (`04A/04B`), and its own server-quoted price.
3. **Zero price cross-contamination:** Bundles never mutate existing single-product checkout semantics. 03B server pricing remains 100% authoritative. 05B versioned pricing runs in **Shadow Mode** for telemetry only.

---

## 2. Firestore Collection Specifications

### 2.1 `matching_collection_templates/{templateId}`
Admin-curated marketing templates displayed on `/matching-collections` showcase page (e.g., "Family Vacation 2026", "Couple Matching Set").

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier (e.g. `family-vacation-2026`) |
| `slug` | `string` | URL-safe slug (`^[a-z0-9-]+$`) |
| `title` | `LocalizedString` | Multilingual title (`{ tr, ar, en }`) |
| `description` | `LocalizedString` | Multilingual description (`{ tr, ar, en }`) |
| `coverImageUrl` | `string` | URL of the cover illustration or mockup |
| `allowedProductIds` | `string[]` | List of supported product IDs (min 1, max 50) |
| `suggestedRoles` | `SuggestedRole[]` | Optional presentation presets (`father`, `mother`, `child`, `baby`) |
| `sortOrder` | `number` | Display ordering |
| `isActive` | `boolean` | Visibility toggle |
| `createdAt` | `string (ISO)` | Creation timestamp |
| `updatedAt` | `string (ISO)` | Last update timestamp |

### 2.2 `master_designs/{masterId}`
Customer-owned abstract logical artwork.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier (`uuidv4` or Firestore ID) |
| `userId` | `string` | Owner UID from authenticated Firebase token |
| `title` | `string` | Customer's title for the master design (1–200 chars) |
| `revision` | `number` | Monotonically increasing revision counter (>= 1) |
| `revisionHash` | `string` | 64-character SHA-256 hash of canvas data and assets |
| `canvasData` | `MasterCanvasData` | `{ objects: Record<string, any>[], referenceBounds: { width, height } }` |
| `assets` | `MasterAsset[]` | External uploaded asset IDs and licenses |
| `previewUrl` | `string?` | Composite thumbnail preview |
| `createdAt` | `string (ISO)` | Creation timestamp |
| `updatedAt` | `string (ISO)` | Last revision timestamp |

### 2.3 `matching_bundle_drafts/{bundleId}`
Private customer draft representing an in-progress matching set before adding to cart.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique draft identifier |
| `userId` | `string` | Owner UID |
| `title` | `string` | Bundle title |
| `templateSlug` | `string?` | Reference to source `matching_collection_templates` slug |
| `masterDesignId` | `string` | Reference to `master_designs/{masterId}` |
| `masterRevision` | `number` | Master design revision snapshot |
| `masterRevisionHash` | `string` | Master design 64-char SHA-256 hash |
| `itemCount` | `number` | Number of items in set (1–30) |
| `status` | `string` | `"draft" \| "ready" \| "added_to_cart"` |
| `createdAt` | `string (ISO)` | Creation timestamp |
| `updatedAt` | `string (ISO)` | Last update timestamp |

#### Subcollection: `matching_bundle_drafts/{bundleId}/items/{itemId}`
Individual member item within a draft (isolated to avoid Firestore 1 MiB document limits).

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Member item ID |
| `roleLabel` | `string?` | Display-only role label (e.g. `"father"`, `"child"`) |
| `productId` | `string` | Target product ID (e.g. `"tshirt"`, `"hoodie"`) |
| `variantId` | `string` | Selected variant SKU (e.g. `"black_XL"`, `"white_M"`) |
| `color` | `string` | Garment color code/name |
| `size` | `string` | Garment size |
| `quantity` | `number` | Quantity for this member (1–100) |
| `templateRevision` | `string` | Published 05A template revision for the target product |
| `face` | `string` | Selected garment face (e.g. `"front"`, `"back"`) |
| `placementId` | `string` | Selected print placement ID (e.g. `"front_full"`) |
| `targetPlacement` | `PlacementRect` | Target placement rect `{ x, y, width, height }` |
| `mapping` | `BundleItemMapping` | Proportional transform `{ scaleX, scaleY, offsetX, offsetY, rotation }` |
| `validationStatus` | `string` | `"valid" \| "out_of_bounds" \| "template_stale" \| "missing_assets"` |
| `generatedDesignId`| `string?` | Set upon conversion to cart line |

### 2.4 Provenance Fields on `orders/{orderId}/items/{itemId}`
When a bundle is added to cart and confirmed into an order, 03B retains optional provenance fields on the line without altering 03B financial accounting:

```typescript
interface BundleLineProvenance {
  bundle_id?: string;
  bundle_item_id?: string;
  role_label?: string;
  master_design_id?: string;
  master_revision?: number;
  master_revision_hash?: string;
  instance_revision_id?: string;
}
```

---

## 3. Geometric Adaptation Engine

The adaptation engine (`adaptMasterDesignToTargetPlacement`) maps objects from the master design's abstract reference coordinate space into the target placement area while strictly preserving aspect ratio and verifying bounds.

```typescript
export function adaptMasterDesignToTargetPlacement(
  masterCanvas: MasterCanvasData,
  targetPlacement: PlacementRect,
  userOverrides?: {
    scaleMultiplier?: number;
    offsetX?: number;
    offsetY?: number;
    rotation?: number;
  }
): {
  adaptedObjects: Record<string, any>[];
  mapping: BundleItemMapping;
  validationStatus: "valid" | "out_of_bounds";
  boundingBox: PlacementRect;
}
```

### Pure Algorithm Steps:
1. **Compute Master Bounding Box:** Calculate the minimum axis-aligned bounding box enclosing all non-deleted master canvas objects:
   $$\text{bbox} = [\min(x), \min(y), \max(x + w), \max(y + h)]$$
2. **Calculate Scale-to-Fit Ratio:**
   $$\text{scaleX} = \frac{\text{targetPlacement.width}}{\text{bbox.width}}, \quad \text{scaleY} = \frac{\text{targetPlacement.height}}{\text{bbox.height}}$$
   $$\text{baseScale} = \min(\text{scaleX}, \text{scaleY}) \times 0.90 \quad \text{(90\% safe margin)}$$
   $$\text{finalScale} = \text{baseScale} \times (\text{userOverrides.scaleMultiplier} \mathbin{?} 1.0)$$
3. **Center Artwork Within Placement Box:**
   $$\text{artWidth} = \text{bbox.width} \times \text{finalScale}$$
   $$\text{artHeight} = \text{bbox.height} \times \text{finalScale}$$
   $$\text{targetOriginX} = \text{targetPlacement.x} + \frac{\text{targetPlacement.width} - \text{artWidth}}{2} + (\text{userOverrides.offsetX} \mathbin{?} 0)$$
   $$\text{targetOriginY} = \text{targetPlacement.y} + \frac{\text{targetPlacement.height} - \text{artHeight}}{2} + (\text{userOverrides.offsetY} \mathbin{?} 0)$$
4. **Transform Objects:**
   For each object, scale its coordinates and dimensions proportionally:
   $$\text{obj.left} = \text{targetOriginX} + (\text{origLeft} - \text{bbox.minX}) \times \text{finalScale}$$
   $$\text{obj.top} = \text{targetOriginY} + (\text{origTop} - \text{bbox.minY}) \times \text{finalScale}$$
   $$\text{obj.scaleX} = \text{origScaleX} \times \text{finalScale}, \quad \text{obj.scaleY} = \text{origScaleY} \times \text{finalScale}$$
5. **Strict Boundary Verification:**
   Verify that the resulting bounding box is completely enclosed within `targetPlacement`:
   $$\text{finalBBox.x} \ge \text{targetPlacement.x} - 0.5$$
   $$\text{finalBBox.y} \ge \text{targetPlacement.y} - 0.5$$
   $$\text{finalBBox.x} + \text{finalBBox.width} \le \text{targetPlacement.x} + \text{targetPlacement.width} + 0.5$$
   $$\text{finalBBox.y} + \text{finalBBox.height} \le \text{targetPlacement.y} + \text{targetPlacement.height} + 0.5$$
   If any condition fails, `validationStatus` is set to `"out_of_bounds"`, preventing cart addition until adjusted or auto-fitted.

---

## 4. Security Rules Summary (`firestore.rules`)

```javascript
// Curated templates: Public read, Admin write
match /matching_collection_templates/{templateId} {
  allow read: if true;
  allow write: if isStoreAdmin();
}

// Master designs: Isolated to owner UID or Admin
match /master_designs/{designId} {
  allow read: if isOwner(resource.data.userId) || isStoreAdmin();
  allow create: if isOwner(request.resource.data.userId);
  allow update: if isOwner(resource.data.userId) && isOwner(request.resource.data.userId);
  allow delete: if isOwner(resource.data.userId) || isStoreAdmin();
}

// Bundle drafts: Isolated to owner UID or Admin
match /matching_bundle_drafts/{bundleId} {
  allow read: if isOwner(resource.data.userId) || isStoreAdmin();
  allow create: if isOwner(request.resource.data.userId);
  allow update: if isOwner(resource.data.userId) && isOwner(request.resource.data.userId);
  allow delete: if isOwner(resource.data.userId) || isStoreAdmin();

  match /items/{itemId} {
    allow read: if isOwner(get(/databases/$(database)/documents/matching_bundle_drafts/$(bundleId)).data.userId) || isStoreAdmin();
    allow write: if isOwner(get(/databases/$(database)/documents/matching_bundle_drafts/$(bundleId)).data.userId) || isStoreAdmin();
  }
}
```

---

## 5. Pricing & Shadow Mode Integration

1. **03B Server Authority:**
   Every physical line created from a matching bundle is quoted and billed using the authoritative 03B server pricing engine.
   - Base garment price from SKU matrix.
   - Custom print fees based on actual used placement faces.
   - Authorized paid catalog assets charged strictly per existing policy.
2. **05B Shadow Mode:**
   - Evaluated silently during `/api/checkout/quote`.
   - Resulting telemetry stored in `checkout_quotes/{quoteId}.shadow_quote`.
   - Never alters customer payable amounts or quote expiration.
   - Verified across multi-member bundles in Test 5.
