# Ready and Blank Products Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement granular multi-color and multi-face product card expansion in the storefront (Ready-to-sell vs Blank/Customizable) and interactive 4-face gallery with mode switching on the product details page.

**Architecture:** Extend `getExpandedProducts` in `src/lib/products.ts` to inspect product images and generate discrete variant entries for both ready-to-sell (`type: "ready"`) and blank customizer mockups (`type: "blank"`), update `ProductCard` with tailored badges and routing, and upgrade `products/[id]/page.tsx` with full 4-face gallery switching and size/quantity/customizer flow.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Firestore, Jest.

---

### Task 1: Product Expansion Unit Tests

**Files:**
- Create/Modify: `e:/kenditasarl/src/lib/productsExpansion.test.ts`
- Modify: `e:/kenditasarl/src/lib/products.ts`

- [ ] **Step 1: Write test for ready and blank color-face expansion**

Write test verifying that a product document with multiple colors and both ready + blank images across 4 faces generates separate ready and blank cards with correct image mapping and URLs.

```typescript
import { getExpandedProductsFromData } from './products';

describe('getExpandedProducts logic', () => {
  it('correctly expands multi-color product into ready and blank items with 4 faces', () => {
    const mockProduct = {
      id: 'prod_123',
      name_ar: 'تيشيرت قطن فاخر',
      name_en: 'Premium Cotton T-Shirt',
      name_tr: 'Premium Pamuk Tişört',
      base_price: 250,
      images: [
        { id: '1', url: 'https://cdn/white_front_ready.png', type: 'ready', face: 'front', colorHex: '#ffffff' },
        { id: '2', url: 'https://cdn/white_back_ready.png', type: 'ready', face: 'back', colorHex: '#ffffff' },
        { id: '3', url: 'https://cdn/white_front_blank.png', type: 'blank', face: 'front', colorHex: '#ffffff' },
        { id: '4', url: 'https://cdn/black_front_blank.png', type: 'blank', face: 'front', colorHex: '#000000' }
      ]
    };

    const expanded = getExpandedProductsFromData([mockProduct]);
    expect(expanded.length).toBe(3); // 1 ready white, 1 blank white, 1 blank black
    
    const readyWhite = expanded.find(p => p.id.includes('type=ready') && p.specificColor === '#ffffff');
    expect(readyWhite).toBeDefined();
    expect(readyWhite?.media.front).toBe('https://cdn/white_front_ready.png');
    
    const blankWhite = expanded.find(p => p.id.includes('type=blank') && p.specificColor === '#ffffff');
    expect(blankWhite).toBeDefined();
    expect(blankWhite?.media.front).toBe('https://cdn/white_front_blank.png');
    expect(blankWhite?.isCustomizable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- productsExpansion.test.ts`
Expected: FAIL due to missing `getExpandedProductsFromData`

- [ ] **Step 3: Implement `getExpandedProductsFromData` and update `getExpandedProducts`**

In `e:/kenditasarl/src/lib/products.ts`, add the pure expansion function `getExpandedProductsFromData` and use it inside `getExpandedProducts`.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- productsExpansion.test.ts`
Expected: PASS

---

### Task 2: Update Storefront Product Cards (`ProductCard.tsx`)

**Files:**
- Modify: `e:/kenditasarl/src/components/ui/ProductCard.tsx`
- Modify: `e:/kenditasarl/src/components/product/ProductCard.tsx`

- [ ] **Step 1: Enhance `ProductCard` to support `type="blank" | "ready"`**

Add support for:
- Badges: `🎨 صمم بنفسك` for blank mockups vs regular badge / `👕 جاهز للطلب`.
- Button label: "تخصيص وتفاصيل 🎨" for blank items vs "تفاصيل المنتج".
- Quick-design brush button linked directly to `/design-studio/${id}`.

- [ ] **Step 2: Verify `ProductCard` TypeScript compliance**

Run: `npx tsc --noEmit` in `e:/kenditasarl`
Expected: 0 errors

---

### Task 3: Upgrade Product Details Page Gallery & Mode Switcher

**Files:**
- Modify: `e:/kenditasarl/src/app/[locale]/products/[id]/page.tsx`

- [ ] **Step 1: Implement 4-Face thumbnail list for selected color**

Ensure that when a color is selected, all 4 faces (`front`, `back`, `left`, `right`) are resolved and displayed in thumbnail bar with localized face names.

- [ ] **Step 2: Add Ready vs Blank View Switcher Tab**

When a product contains both ready and blank images:
- Add a switcher: `[ 👕 صور المنتج الجاهز ]` and `[ 🎨 موكاب التصميم السادة ]`.
- Update the active gallery dynamically based on user toggle or initial URL parameter `?type=ready` or `?type=blank`.

- [ ] **Step 3: Connect Size, Quantity and Customizer Navigation**

Ensure the "صمم بنفسك" CTA button passes `selectedColor`, `selectedSize`, `quantity`, and active face to `/design-studio/${id}`.

- [ ] **Step 4: Verify details page compiles cleanly**

Run: `npx tsc --noEmit` in `e:/kenditasarl`
Expected: 0 errors

---

### Task 4: Full End-to-End Verification

**Files:**
- Test across: `e:/kenditasarl` and `e:/kenditasarl-admin`

- [ ] **Step 1: Run all test suites in `kenditasarl`**

Run: `npm test`
Expected: 100% tests passing

- [ ] **Step 2: Type check both projects**

Run: `npx tsc --noEmit` in `e:/kenditasarl`
Run: `npx tsc --noEmit` in `e:/kenditasarl-admin`
Expected: 0 errors
