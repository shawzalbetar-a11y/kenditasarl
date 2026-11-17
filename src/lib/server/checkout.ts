import { templateConfig, publishedTemplateSchema } from "../printTemplate";
import {
  calculateVersionedPrice,
  getDefaultPricingPolicy,
  type PricingPolicyDefinition,
  type CartLineForPricing,
} from "../versionedPricing";
import {
  evaluateExpressEligibility,
  type ExpressZonePolicyDefinition,
} from "../shippingZones";
import { createHash } from "node:crypto";
import {
  FieldValue,
  type DocumentData,
  type Transaction,
} from "firebase-admin/firestore";
import { authorize, serverDb, serverAuth } from "./cloudinaryServer";
import {
  artwork,
  check,
  CheckoutError,
  digest,
  id,
  money,
  priceCustom,
  settings,
} from "./checkoutArt";
import { isColorMatch, normalizeSize } from "../colorTranslations";
import { dispatchOrderEvent } from "./orderNotifications";
import { getDrivingDistance } from "./shippingDistance";
import { boundedBody } from "./imageUpload";

type Data = DocumentData;
const version = 1;
const maxLines = 30;
const revision = (snap: {
  updateTime?: { seconds: number; nanoseconds: number };
}) =>
  snap.updateTime
    ? [snap.updateTime.seconds, snap.updateTime.nanoseconds].join(".")
    : "missing";

function fields(input: Data, allowed: string[]) {
  check(
    input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      Object.keys(input).every((k) => allowed.includes(k)),
    "INVALID",
    400,
  );
}
function amount(q: number) {
  check(Number.isSafeInteger(q) && q >= 1 && q <= 999, "INVALID", 400);
}
function resolveSku(raw: Data, variants: FirebaseFirestore.QuerySnapshot) {
  const legacy = id(raw.variant_id);
  if (raw.size != null) id(raw.size);
  if (raw.color != null) id(raw.color);
  const split = legacy.lastIndexOf("_");
  const size = raw.size || (split > 0 ? legacy.slice(split + 1) : "");
  const color = raw.color || (split > 0 ? legacy.slice(0, split) : "");
  const matches = variants.docs.flatMap((v) => {
    const data = v.data();
    if (
      raw.variant_doc_id
        ? raw.variant_doc_id !== v.id
        : v.id !== legacy && !isColorMatch(color, data)
    )
      return [];
    if (raw.color && !isColorMatch(raw.color, data)) return [];
    if (
      v.id !== legacy &&
      split > 0 &&
      (!isColorMatch(legacy.slice(0, split), data) ||
        normalizeSize(legacy.slice(split + 1)) !== normalizeSize(size))
    )
      return [];
    const sizes = data.sizes
      ? Object.keys(data.sizes)
      : [data.size].filter(Boolean);
    return sizes
      .filter((k) => normalizeSize(k) === normalizeSize(size || data.size))
      .map((k) => {
        const stock = data.sizes ? data.sizes[k] : data.stock;
        check(Number.isSafeInteger(stock) && stock >= 0);
        return {
          doc: v,
          data,
          size: k,
          color: data.hex || data.color || data.colorName_en,
          stock,
        };
      });
  });
  check(matches.length === 1 && matches[0].color);
  return matches[0];
}
function assetResolver(tx: Transaction, uid: string, guestUid?: string) {
  const db = serverDb();
  return async (obj: Data) => {
    const ref = obj.originalAssetId || obj.assetId;
    const urls = [
      obj.src,
      obj.originalAssetUrl,
      typeof ref === "string" && ref.startsWith("https://") ? ref : null,
    ].filter(Boolean);
    check(
      urls.every((u) => typeof u === "string" && /^https:\/\//.test(u)) &&
        new Set(urls).size <= 1,
    );
    const url = urls[0];
    let asset: FirebaseFirestore.DocumentSnapshot | undefined;
    if (ref && !urls.includes(ref)) {
      asset = await tx.get(db.collection("design_assets").doc(id(ref)));
      check(asset.exists);
    } else if (url) {
      const rows = await tx.get(
        db.collection("design_assets").where("url", "==", url).limit(2),
      );
      check(rows.size <= 1);
      asset = rows.docs[0];
    }
    if (asset?.exists) {
      const a = asset.data()!;
      check(
        (!url || a.url === url) &&
          a.is_active !== false &&
          a.published !== false &&
          /^https:\/\//.test(a.url),
      );
      money(a.price ?? 0);
      return { id: asset.id, url: a.url, price: a.price ?? 0, upload: false };
    }
    check(url && obj.type === "image");
    const key = createHash("sha256").update(url).digest("hex");
    const owned =
      (await tx.get(db.doc(`upload_receipts/${key}/owners/${uid}`))).get(
        "url",
      ) === url;
    if (!owned)
      check(
        guestUid &&
          (
            await tx.get(db.doc(`upload_receipts/${key}/owners/${guestUid}`))
          ).get("url") === url,
      );
    return { id: url, url, price: 0, upload: true };
  };
}

async function line(
  tx: Transaction,
  uid: string,
  input: Data,
  cfg: ReturnType<typeof settings>,
  locale: string,
  cartId?: string,
  guestUid?: string,
) {
  amount(input.quantity);
  const db = serverDb();
  const product = await tx.get(
    db.collection("products").doc(id(input.product_id)),
  );
  const p = product.data();
  check(
    p &&
      (p.is_active === true || p.isActive === true) &&
      p.is_active !== false &&
      p.isActive !== false,
  );
  const sku = resolveSku(
    input,
    await tx.get(product.ref.collection("variants")),
  );
  const kind = input.design_type ?? (input.design_id ? "custom" : undefined);
  check(["blank", "ready", "custom"].includes(kind));
  const base = money(sku.data.price ?? p.base_price);
  const designId = input.design_id ? id(input.design_id) : null;
  check(
    kind !== "blank" ||
      (!designId && !input.canvas_json && !input.production_snapshot),
  );
  const saved = cartId
    ? (await tx.get(db.collection("checkout_art").doc(cartId))).data()
    : undefined;
  if (cartId && input.schema_version === version && kind !== "blank")
    check(saved);
  if (saved)
    check(
      saved.uid === uid &&
        saved.product_id === product.id &&
        saved.variant_doc_id === sku.doc.id &&
        saved.size === sku.size &&
        saved.design_id === designId,
    );
  let locked = null;
  let price = {
    minor: base,
    parts: [{ type: "base", id: "base_product", minor: base }],
  };
  let designRevision = "";
  const previews: Record<string, string> = {};
  let preview =
    (kind === "blank"
      ? (sku.data.blank_image_front ?? sku.data.mockup_front)
      : sku.data.image_front) ?? null;
  let readyAssets: { face: string; url: string }[] | null = null;
  if (kind === "ready" && !designId) {
    const published = (p.images ?? []).filter(
      (image: Data) =>
        image?.type === "ready" &&
        (!image.colorHex || isColorMatch(image.colorHex, sku.data)) &&
        typeof image.url === "string" &&
        /^https:\/\//.test(image.url),
    );
    check(published.length);
    readyAssets = published.map((image: Data) => ({
      face: id(image.face),
      url: image.url,
    }));
    if (saved) check(digest(readyAssets) === saved.art_version);
    preview =
      published.find((image: Data) => image.face === "front")?.url ??
      published[0].url;
  }
  if (kind === "custom" || designId) {
    check(designId);
    const design = await tx.get(db.collection("designs").doc(designId));
    const d = design.data();
    check(d);
    if (kind === "ready") {
      check(
        (p.linked_ready_designs ?? []).includes(designId) ||
          p.ready_design_id === designId,
      );
      check(d.is_template === true);
    } else
      check(
        d.user_id === uid &&
          d.product_id === product.id &&
          d.is_template !== true,
        "FORBIDDEN",
        403,
      );
    designRevision = revision(design);
    let effective = saved
      ? { ...saved.art, user_id: uid, color: sku.color, product_id: product.id }
      : d;
    if (!saved && cartId && kind === "custom") {
      if (input.canvas_json || input.production_snapshot) {
        check(input.canvas_json && input.production_snapshot);
        effective = {
          ...d,
          canvas_json: input.canvas_json,
          production_snapshot: input.production_snapshot,
          color: input.color ?? d.color,
          placement_mode: input.placement_mode ?? d.placement_mode,
          selected_placement_ids:
            input.selected_placement_ids ?? d.selected_placement_ids,
        };
      } else {
        const millis = (v: any) =>
          typeof v?.toMillis === "function"
            ? v.toMillis()
            : typeof v === "string"
              ? Date.parse(v)
              : NaN;
        const added = millis(input.created_at),
          edited = millis(d.updated_at);
        check(
          !(
            Number.isFinite(added) &&
            Number.isFinite(edited) &&
            edited > added
          ),
        );
      }
    }
    const resolveAsset = assetResolver(
      tx,
      kind === "ready" && d.user_id ? id(d.user_id) : uid,
      kind === "ready" ? undefined : saved?.guestUid || guestUid,
    );
    let artProduct = p;
    if (p.print_template_revision && kind === "custom") {
      if (saved) {
        // Only server-owned checkout_art can pin a previously accepted configuration.
        const pinned = JSON.parse(saved.art.production_snapshot).customization_config;
        check(pinned?.faces);
        artProduct = {...p, customization_config:pinned};
      } else {
        const revision = p.print_template_revision;
        check(typeof revision === "string" && /^[a-f0-9]{64}$/.test(revision));
        const doc = await tx.get(product.ref.collection("print_template_revisions").doc(revision));
        const parsed = publishedTemplateSchema.safeParse(doc.data());
        check(parsed.success && parsed.data.revision === revision);
        const template = parsed.data.definition;
        check(template.productId === product.id && digest(template) === revision);
        check(template.variantIds.includes(sku.doc.id));
        artProduct = {...p, customization_config:templateConfig(template, revision)};
      }
    }
    const { art, flat, sourceKeys } = await artwork(
      effective,
      sku.data,
      sku.color,
      artProduct,
      resolveAsset,
      saved ? undefined : input.art_source,
    );
    locked = saved?.art ?? art;
    if (kind === "custom")
      price = priceCustom(
        base,
        flat,
        art,
        cfg,
        artProduct.customization_config.garmentType,
        locale,
      );
    if (saved) Object.assign(previews, saved.preview_images);
    else
      for (const [face, key] of Object.entries(sourceKeys)) {
        const url =
          d.preview_images?.[key] ??
          (face === "front" && isColorMatch(d.color, sku.data)
            ? d.preview_image_url
            : null);
        if (typeof url !== "string" || !url.startsWith("https://")) continue;
        if (kind === "ready") previews[face] = url;
        else
          try {
            previews[face] = (
              await resolveAsset({ type: "image", src: url })
            ).url;
          } catch (e) {
            if (!(e instanceof CheckoutError)) throw e;
          }
      }
    preview = previews.front ?? Object.values(previews)[0] ?? null;
  }
  const artVersion = digest(locked ?? readyAssets);
  // A previously accepted cart version is never silently replaced by an edited source.
  if (saved)
    check(saved.art_version === digest(saved.art ?? saved.ready_assets));
  const skuKey = digest([product.id, sku.doc.id, sku.size]);
  const item = {
    schema_version: version,
    product_id: product.id,
    product_name: p["name_" + locale] ?? p.name_en ?? product.id,
    variant_id: sku.color + "_" + sku.size,
    variant_doc_id: sku.doc.id,
    color: sku.color,
    size: sku.size,
    sku: skuKey,
    quantity: input.quantity,
    unit_price: price.minor / 100,
    unit_minor: price.minor,
    currency: "TRY",
    design_type: kind,
    design_id: designId,
    art_version: artVersion,
    ...(input.art_source ? { art_source: input.art_source } : {}),
    preview_image_url: preview,
    preview_images: previews,
    canvas_json: locked?.canvas_json ?? null,
    production_snapshot:
      locked?.production_snapshot ??
      (readyAssets
        ? JSON.stringify({ snapshotVersion: 1, ready_assets: readyAssets })
        : null),
    selected_placement_ids: locked?.selected_placement_ids ?? [],
    print_method: locked?.print_method ?? null,
    placement_mode: locked?.placement_mode ?? null,
    snapshot_version: locked || readyAssets ? 1 : null,
    is_immutable_snapshot: !!(locked || readyAssets),
    breakdown: price.parts,
    ...(input.bundle_id ? { bundle_id: String(input.bundle_id) } : {}),
    ...(input.bundle_item_id
      ? { bundle_item_id: String(input.bundle_item_id) }
      : {}),
    ...(input.role_label ? { role_label: String(input.role_label) } : {}),
    ...(input.master_design_id
      ? { master_design_id: String(input.master_design_id) }
      : {}),
    ...(typeof input.master_revision === "number"
      ? { master_revision: input.master_revision }
      : {}),
    ...(input.master_revision_hash
      ? { master_revision_hash: String(input.master_revision_hash) }
      : {}),
    ...(input.instance_revision_id
      ? { instance_revision_id: String(input.instance_revision_id) }
      : {}),
  };
  const summary = {
    name: p["name_" + locale] ?? p.name_en ?? product.id,
    variant_id: item.variant_id,
    size: sku.size,
    color: sku.color,
    quantity: input.quantity,
    minor: price.minor,
    old_minor:
      typeof input.unit_price === "number"
        ? money(input.unit_price)
        : price.minor,
    breakdown: price.parts,
    art_version: artVersion,
    sku: skuKey,
  };
  return {
    item,
    summary,
    sku,
    art: locked,
    readyAssets,
    versions: [revision(product), revision(sku.doc), designRevision],
  };
}

async function add(uid: string, body: Data, guestUid?: string) {
  fields(body, ["lines"]);
  check(
    Array.isArray(body.lines) &&
      body.lines.length &&
      body.lines.length <= maxLines,
    "INVALID",
    400,
  );
  const db = serverDb();
  return db.runTransaction(async (tx) => {
    const cfg = settings(
      (await tx.get(db.doc("settings/pricing"))).data() ?? {},
    );
    const result = [];
    for (const input of body.lines) {
      fields(input, [
        "product_id",
        "variant_id",
        "color",
        "size",
        "quantity",
        "design_id",
        "design_type",
        "art_source",
        "bundle_id",
        "bundle_item_id",
        "role_label",
        "master_design_id",
        "master_revision",
        "master_revision_hash",
        "instance_revision_id",
      ]);
      result.push(await line(tx, uid, input, cfg, "en", undefined, guestUid));
    }
    check(
      Buffer.byteLength(JSON.stringify(result.map((r) => r.item))) < 2000000,
    );
    const ids = [];
    for (const { item, art, readyAssets } of result) {
      check(Buffer.byteLength(JSON.stringify(item)) < 450000);
      const ref = db.collection("cart_items").doc();
      if (art || readyAssets)
        tx.create(db.collection("checkout_art").doc(ref.id), {
          schema_version: version,
          uid,
          product_id: item.product_id,
          variant_doc_id: item.variant_doc_id,
          size: item.size,
          design_id: item.design_id,
          art_version: item.art_version,
          art,
          ready_assets: readyAssets,
          preview_images: item.preview_images,
          guestUid: guestUid ?? null,
        });
      tx.create(ref, {
        ...item,
        user_id: uid,
        created_at: FieldValue.serverTimestamp(),
      });
      ids.push(ref.id);
    }
    return { ids };
  });
}

async function prepare(
  tx: Transaction,
  uid: string,
  addressId: string,
  method: string,
  locale: string,
  distance: number,
  addressRevision: string,
) {
  const db = serverDb();
  const address = await tx.get(db.collection("addresses").doc(addressId));
  check(address.get("user_id") === uid, "FORBIDDEN", 403);
  const fullAddress = address.get("full_address");
  check(
    typeof fullAddress === "string" &&
      fullAddress.trim().length > 0 &&
      fullAddress.length <= 4000,
    "DELIVERY",
  );
  check(revision(address) === addressRevision, "REFRESH");
  const rules = await tx.get(db.doc("settings/pricing"));
  const cfg = settings(rules.data() ?? {});
  const cart = await tx.get(
    db
      .collection("cart_items")
      .where("user_id", "==", uid)
      .limit(maxLines + 1),
  );
  check(cart.size > 0 && cart.size <= maxLines, "CART_SIZE");
  const rows: any[] = [];
  const stocks = new Map<
    string,
    {
      ref: FirebaseFirestore.DocumentReference;
      stock: number;
      quantity: number;
      size: string;
      mapped: boolean;
    }
  >();
  for (const doc of cart.docs) {
    try {
      const l = await line(tx, uid, doc.data(), cfg, locale, doc.id);
      const { item, sku } = l;
      check(Buffer.byteLength(JSON.stringify(item)) < 450000);
      const previous = stocks.get(item.sku);
      const quantity = (previous?.quantity ?? 0) + item.quantity;
      check(quantity <= sku.stock, "NO_STOCK");
      stocks.set(item.sku, {
        ref: sku.doc.ref,
        size: sku.size,
        stock: sku.stock,
        quantity,
        mapped: !!sku.data.sizes,
      });
      rows.push({ ...l, doc });
    } catch (e) {
      if (e instanceof CheckoutError) e.line = doc.id;
      throw e;
    }
  }
  check(Buffer.byteLength(JSON.stringify(rows.map((r) => r.item))) < 2000000);
  const subtotal = rows.reduce(
    (n, r) => n + r.item.unit_minor * r.item.quantity,
    0,
  );
  const d = cfg.delivery;
  let shipping =
    d.is_free_shipping_enabled && subtotal >= money(d.free_shipping_threshold)
      ? 0
      : money(d.fixed_shipping_fee);

  let shippingSnapshot: any = null;
  let activeShippingPolicyRevision: string | null = null;

  if (method === "express") {
    let evaluatedFromZone = false;
    try {
      const zonePointerDoc = await tx.get(db.doc("shipping_zone_policies/default"));
      if (zonePointerDoc.exists && zonePointerDoc.get("activeRevisionId")) {
        const revId = zonePointerDoc.get("activeRevisionId");
        activeShippingPolicyRevision = revId;
        const revDoc = await tx.get(
          db.doc(`shipping_zone_policies/default/revisions/${revId}`)
        );
        if (revDoc.exists && (revDoc.get("definition") || revDoc.get("definitionJson"))) {
          const revData = revDoc.data();
          const activePolicy = (revData?.definition || (revData?.definitionJson ? JSON.parse(revData.definitionJson) : null)) as ExpressZonePolicyDefinition;

          // Phase 06B-R: Server Address Verification check
          const addressLat = Number(address.get("lat"));
          const addressLng = Number(address.get("lng"));
          const verificationDoc = await tx.get(db.doc(`address_verifications/${addressId}`));
          let resolvedLocationSource = "unverified";
          if (verificationDoc.exists) {
            const vData = verificationDoc.data();
            const tolerance = 0.0001;
            if (
              vData?.userId === uid &&
              vData?.status === "verified" &&
              (!vData?.expiresAt || new Date(vData.expiresAt).getTime() > Date.now()) &&
              Math.abs(Number(vData?.lat) - addressLat) < tolerance &&
              Math.abs(Number(vData?.lng) - addressLng) < tolerance
            ) {
              resolvedLocationSource = vData.verificationSource || "admin_verified";
            }
          }

          if (resolvedLocationSource === "unverified") {
            throw new CheckoutError("ADDRESS_VERIFICATION_REQUIRED", 400);
          }

          const evaluation = evaluateExpressEligibility({
            policy: activePolicy,
            address: {
              lat: addressLat,
              lng: addressLng,
              location_source: resolvedLocationSource,
            },
            basketSubtotalMinor: Math.round(subtotal * 100),
            currentDate: new Date(),
          });

          if (!evaluation.eligible) {
            throw new CheckoutError(evaluation.reasonCode, 400);
          }

          shipping = money(evaluation.feeMinor / 100);
          shippingSnapshot = {
            method: "express",
            zone_id: evaluation.zoneId,
            zoneId: evaluation.zoneId,
            zone_title: evaluation.zoneTitle,
            zoneTitle: evaluation.zoneTitle,
            fee_minor: evaluation.feeMinor,
            feeMinor: evaluation.feeMinor,
            policy_revision: revId,
            eta_description: evaluation.etaDescription || null,
            etaDescription: evaluation.etaDescription || null,
            location_source: resolvedLocationSource,
          };
          evaluatedFromZone = true;
        }
      }
    } catch (e) {
      if (e instanceof CheckoutError) throw e;
    }

    if (!evaluatedFromZone) {
      const e = d.express;
      check(
        e.is_active === true && Number.isFinite(distance) && distance <= e.max_km,
        "DELIVERY",
      );
      shipping =
        Math.round(
          (money(e.base_fee) +
            money(e.flat_tier_fee) +
            Math.max(0, distance - e.flat_tier_km) * money(e.price_per_km)) /
            100,
        ) * 100;
      shippingSnapshot = {
        method: "express",
        zone_id: "legacy_distance",
        fee_minor: shipping,
        distance_km: distance,
      };
    }
  } else {
    shippingSnapshot = {
      method: "shipping",
      fee_minor: shipping,
      is_free: shipping === 0,
    };
  }
  check(Number.isSafeInteger(subtotal + shipping));

  // 05B Versioned Pricing in Shadow Mode (telemetry only, non-intrusive)
  let activePolicyDef: PricingPolicyDefinition = getDefaultPricingPolicy();
  let activePolicyRevisionId: string = "default_baseline";
  try {
    const policyPointerDoc = await tx.get(db.doc("pricing_policies/default"));
    if (policyPointerDoc.exists && policyPointerDoc.get("activeRevisionId")) {
      const revId = policyPointerDoc.get("activeRevisionId");
      const revDoc = await tx.get(
        db.doc(`pricing_policies/default/revisions/${revId}`),
      );
      if (revDoc.exists && revDoc.get("definition")) {
        activePolicyDef = revDoc.get("definition");
        activePolicyRevisionId = revId;
      }
    }
  } catch {
    // If pointer does not exist yet, fallback cleanly
  }

  const pricingLines: CartLineForPricing[] = rows.map((r) => {
    const basePart =
      r.item.breakdown?.find((b: any) => b.type === "base")?.minor ??
      r.item.unit_minor;
    return {
      lineId: r.doc.id,
      productId: r.item.product_id,
      variantId: r.item.variant_id,
      variantDocId: r.item.variant_doc_id,
      color: r.item.color,
      size: r.item.size,
      designType: r.item.design_type,
      basePriceMinor: basePart,
      readyPriceMinor:
        r.item.design_type === "ready" ? r.item.unit_minor : undefined,
      quantity: r.item.quantity,
      selectedPlacementIds: r.item.selected_placement_ids,
      printMethod: r.item.print_method ?? undefined,
      assets: (r.item.breakdown || [])
        .filter((b: any) => b.type === "sticker")
        .map((b: any) => ({
          id: b.id,
          priceMinor: b.minor,
        })),
    };
  });

  const versionedResult = calculateVersionedPrice(pricingLines, activePolicyDef);

  const shadowQuote = {
    policy_revision_id: activePolicyRevisionId,
    engine_03b_subtotal_minor: subtotal,
    engine_05b_subtotal_minor: versionedResult.subtotalMinor,
    diff_minor: versionedResult.subtotalMinor - subtotal,
    line_count: rows.length,
    lines: versionedResult.lines.map((vl, idx) => ({
      line_id: rows[idx].doc.id,
      sku: rows[idx].item.sku,
      engine_03b_unit_minor: rows[idx].item.unit_minor,
      engine_05b_unit_minor: vl.unitMinor,
      engine_03b_line_minor:
        rows[idx].item.unit_minor * rows[idx].item.quantity,
      engine_05b_line_minor: vl.totalMinor,
      diff_minor:
        vl.totalMinor - rows[idx].item.unit_minor * rows[idx].item.quantity,
      applied_rules: vl.appliedRules,
    })),
  };

  const summary = {
    schema_version: version,
    currency: "TRY",
    lines: rows.map((r) => ({ id: r.doc.id, ...r.summary })),
    subtotal,
    shipping,
    total: subtotal + shipping,
    price_revision: revision(rules),
    shipping_snapshot: shippingSnapshot,
    shipping_policy_revision: activeShippingPolicyRevision,
  };
  const fingerprint = digest([
    uid,
    addressId,
    addressRevision,
    method,
    locale,
    summary,
    rows.map((r) => [revision(r.doc), r.versions]),
  ]);
  const deliveryAddress = Object.fromEntries(
    ["label", "full_name", "phone", "full_address", "lat", "lng"]
      .map((k) => [k, address.get(k)])
      .filter(([, v]) => typeof v === "string" || typeof v === "number"),
  );
  return {
    rows,
    stocks,
    summary,
    fingerprint,
    deliveryAddress,
    shadowQuote,
    activePolicyRevisionId,
  };
}

async function quote(uid: string, body: Data) {
  fields(body, ["address_id", "method", "locale"]);
  const addr = id(body.address_id);
  const { method, locale } = body;
  check(
    ["shipping", "express"].includes(method) &&
      ["ar", "tr", "en"].includes(locale),
    "INVALID",
    400,
  );
  const db = serverDb();
  const address = await db.collection("addresses").doc(addr).get();
  check(address.get("user_id") === uid, "FORBIDDEN", 403);
  let distance = 0;
  if (method === "express") {
    const data = address.data() || {};
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    check(
      Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180,
      "DELIVERY",
    );
    const a = Number(process.env.STORE_ORIGIN_LAT),
      b = Number(process.env.STORE_ORIGIN_LNG);
    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      Math.abs(a) <= 90 &&
      Math.abs(b) <= 180
    ) {
      distance = await getDrivingDistance(a, b, lat, lng).catch(() => 0);
    }
  }
  return db.runTransaction(async (tx) => {
    const {
      summary,
      fingerprint,
      shadowQuote,
      activePolicyRevisionId,
    } = await prepare(
      tx,
      uid,
      addr,
      method,
      locale,
      distance,
      revision(address),
    );
    const ref = db.collection("checkout_quotes").doc();
    const expires = Date.now() + 5 * 60000;
    tx.create(ref, {
      schema_version: version,
      uid,
      address_id: addr,
      address_revision: revision(address),
      distance,
      method,
      locale,
      fingerprint,
      expires,
      shadow_quote: shadowQuote,
      pricing_policy_revision: activePolicyRevisionId,
      shipping_policy_revision: summary.shipping_policy_revision ?? null,
      shipping_snapshot: summary.shipping_snapshot ?? null,
    });
    return { ...summary, quote_id: ref.id, expires };
  });
}

async function confirm(uid: string, body: Data) {
  fields(body, ["quote_id", "key", "accepted"]);
  check(
    body.accepted === true &&
      typeof body.key === "string" &&
      /^[\w-]{16,100}$/.test(body.key),
    "ACCEPT_REQUIRED",
    400,
  );
  const db = serverDb();
  const quoteRef = db.collection("checkout_quotes").doc(id(body.quote_id));
  const replay = db
    .collection("checkout_attempts")
    .doc(digest([uid, body.key]));
  return db.runTransaction(async (tx) => {
    const attempt = await tx.get(replay);
    if (attempt.exists) {
      check(attempt.get("quote_id") === quoteRef.id, "KEY_CONFLICT");
      return { order_id: attempt.get("order_id") };
    }
    const q = (await tx.get(quoteRef)).data();
    check(q?.uid === uid, "FORBIDDEN", 403);
    check(!q.order_id && Date.now() < q.expires, "REFRESH");
    const {
      rows,
      stocks,
      summary,
      fingerprint,
      deliveryAddress,
      activePolicyRevisionId,
    } = await prepare(
        tx,
        uid,
        q.address_id,
        q.method,
        q.locale,
        q.distance,
        q.address_revision,
      );
    check(fingerprint === q.fingerprint, "REFRESH");
    const counter = db.doc("counters/orders");
    const old = (await tx.get(counter)).data();
    const currentVal =
      typeof old?.current_value === "number"
        ? old.current_value
        : typeof old?.next_number === "number"
          ? old.next_number - 1
          : undefined;
    const number = currentVal !== undefined ? currentVal + 1 : 1000;
    check(Number.isSafeInteger(number) && number >= 1000);
    const order = db.collection("orders").doc();
    tx.create(order, {
      schema_version: version,
      user_id: uid,
      order_number: "ORD-" + number,
      status: "pending",
      payment_method: "cod",
      payment_status: "pending_cod",
      created_at: FieldValue.serverTimestamp(),
      address_id: q.address_id,
      address_snapshot: deliveryAddress,
      delivery_method: q.method,
      locale: q.locale,
      subtotal: summary.subtotal / 100,
      total: summary.total / 100,
      delivery_fee: summary.shipping / 100,
      currency: "TRY",
      subtotal_minor: summary.subtotal,
      total_minor: summary.total,
      delivery_minor: summary.shipping,
      quote_id: quoteRef.id,
      price_revision: summary.price_revision,
      pricing_policy_revision:
        q.pricing_policy_revision ?? activePolicyRevisionId ?? null,
      shipping_policy_revision:
        q.shipping_policy_revision ?? summary.shipping_policy_revision ?? null,
      shipping_snapshot:
        q.shipping_snapshot ?? summary.shipping_snapshot ?? null,
      shadow_quote_summary: q.shadow_quote
        ? {
            policy_revision_id: q.shadow_quote.policy_revision_id,
            diff_minor: q.shadow_quote.diff_minor,
          }
        : null,
    });
    tx.set(counter, { current_value: number }, { merge: true });
    for (const { doc, item } of rows) {
      tx.create(order.collection("items").doc(doc.id), item);
      tx.delete(doc.ref);
    }
    for (const s of Array.from(stocks.values())) {
      tx.set(
        s.ref,
        {
          stock_revision: FieldValue.increment(1),
          ...(s.mapped
            ? { sizes: { [s.size]: s.stock - s.quantity } }
            : { stock: s.stock - s.quantity }),
        },
        { merge: true },
      );
    }
    tx.create(replay, {
      schema_version: version,
      uid,
      quote_id: quoteRef.id,
      order_id: order.id,
    });
    tx.update(quoteRef, { order_id: order.id });
    tx.create(db.collection("order_notifications").doc(order.id), {
      schema_version: version,
      order_id: order.id,
      status: "pending",
      event: "order_created",
    });
    return { order_id: order.id };
  });
}

export async function checkoutRequest(
  request: Request,
  action: "add" | "quote" | "confirm",
) {
  try {
    const uid = await authorize(request, false, false);
    if (typeof uid === "number")
      return Response.json({ error: "AUTH" }, { status: uid });
    const bytes = await boundedBody(request, 64000).catch(
      (e: { status?: number }) => {
        throw new CheckoutError("INVALID", e.status === 413 ? 413 : 400);
      },
    );
    let input;
    try {
      input = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new CheckoutError("INVALID", 400);
    }
    fields(
      input,
      action === "add"
        ? ["lines"]
        : action === "quote"
          ? ["address_id", "method", "locale"]
          : ["quote_id", "key", "accepted"],
    );
    let guestUid;
    if (action === "add" && request.headers.has("X-Upload-Session")) {
      const guest = await serverAuth()
        .verifyIdToken(request.headers.get("X-Upload-Session")!, true)
        .catch(() => null);
      check(guest?.firebase.sign_in_provider === "anonymous", "AUTH", 403);
      guestUid = guest.uid;
    }
    const result =
      action === "add"
        ? await add(uid, input, guestUid)
        : await { quote, confirm }[action](uid, input);
    if ("order_id" in result)
      await dispatchOrderEvent(result.order_id).catch(() => {});
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof CheckoutError ? e.message : "UNAVAILABLE",
        line: e instanceof CheckoutError ? e.line : undefined,
      },
      { status: e instanceof CheckoutError ? e.status : 503 },
    );
  }
}
