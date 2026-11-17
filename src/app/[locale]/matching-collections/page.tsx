"use client";

import { useEffect, useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  Users,
  Plus,
  Trash2,
  Sparkles,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Image as ImageIcon,
  Type,
  Maximize2,
} from "lucide-react";
import {
  adaptMasterDesignToTargetPlacement,
  type MatchingCollectionTemplate,
  type MasterCanvasData,
  type PlacementRect,
  type MatchingBundleItem,
} from "@/lib/matchingCollections";

interface ProductOption {
  id: string;
  name_tr?: string;
  name_ar?: string;
  name_en?: string;
  category_id?: string;
  base_price?: number;
  images?: Array<{ face: string; url: string; type?: string }>;
  print_template_revision?: string;
  variants: Array<{
    docId: string;
    color: string;
    color_hex?: string;
    sizes: Record<string, number>;
  }>;
}

interface MemberState {
  id: string;
  roleKey: "father" | "mother" | "child" | "partner" | "friend" | "custom";
  customRoleLabel?: string;
  productId: string;
  variantDocId: string;
  color: string;
  size: string;
  face: string;
  placementId: string;
  quantity: number;
  scaleMultiplier: number;
}

export default function MatchingCollectionsPage() {
  const t = useTranslations("MatchingCollections");
  const locale = useLocale() as "tr" | "ar" | "en";
  const router = useRouter();

  const [curatedTemplates, setCuratedTemplates] = useState<MatchingCollectionTemplate[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Master Design State
  const [masterText, setMasterText] = useState("FAMILY FOREVER");
  const [masterTextColor, setMasterTextColor] = useState("#111827");
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);

  // Active collection items / members
  const [members, setMembers] = useState<MemberState[]>([
    {
      id: "mem_1",
      roleKey: "father",
      productId: "",
      variantDocId: "",
      color: "black",
      size: "XL",
      face: "front",
      placementId: "front_full",
      quantity: 1,
      scaleMultiplier: 1.0,
    },
    {
      id: "mem_2",
      roleKey: "mother",
      productId: "",
      variantDocId: "",
      color: "white",
      size: "M",
      face: "front",
      placementId: "front_full",
      quantity: 1,
      scaleMultiplier: 1.0,
    },
    {
      id: "mem_3",
      roleKey: "child",
      productId: "",
      variantDocId: "",
      color: "yellow",
      size: "S",
      face: "front",
      placementId: "front_full",
      quantity: 1,
      scaleMultiplier: 1.0,
    },
  ]);

  // Load products and curated templates
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // Load active curated templates
        const tplRes = await fetch("/api/matching-collections");
        const tplData = await tplRes.json();
        if (tplRes.ok && tplData.templates) {
          setCuratedTemplates(tplData.templates);
        }

        // Load products with variants
        const prodsSnap = await getDocs(
          query(collection(db, "products"), where("is_active", "==", true))
        );

        const loadedProducts: ProductOption[] = [];
        for (const pDoc of prodsSnap.docs) {
          const pData = pDoc.data();
          const variantsSnap = await getDocs(
            collection(db, `products/${pDoc.id}/variants`)
          );
          const variants = variantsSnap.docs.map((vDoc) => ({
            docId: vDoc.id,
            color: vDoc.data().color || "default",
            color_hex: vDoc.data().color_hex,
            sizes: vDoc.data().sizes || { M: vDoc.data().stock || 10 },
          }));

          loadedProducts.push({
            id: pDoc.id,
            name_tr: pData.name_tr,
            name_ar: pData.name_ar,
            name_en: pData.name_en,
            category_id: pData.category_id,
            base_price: pData.base_price || 250,
            images: pData.images || [],
            print_template_revision: pData.print_template_revision,
            variants,
          });
        }

        setProducts(loadedProducts);

        // Pre-select first available product for members
        if (loadedProducts.length > 0) {
          const defaultProduct = loadedProducts[0];
          const defaultVariant = defaultProduct.variants[0];
          setMembers((prev) =>
            prev.map((m) => ({
              ...m,
              productId: m.productId || defaultProduct.id,
              variantDocId: m.variantDocId || defaultVariant?.docId || "",
              color: defaultVariant?.color || m.color,
            }))
          );
        }
      } catch (err: any) {
        console.error("Error loading matching collections data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute Master Canvas Data
  const masterCanvasData: MasterCanvasData = useMemo(() => {
    const objects: any[] = [];
    if (masterImageUrl) {
      objects.push({
        type: "image",
        src: masterImageUrl,
        left: 500,
        top: 400,
        originX: "center",
        originY: "center",
        width: 400,
        height: 400,
        scaleX: 1,
        scaleY: 1,
      });
    }
    if (masterText) {
      objects.push({
        type: "text",
        text: masterText,
        left: 500,
        top: masterImageUrl ? 680 : 500,
        originX: "center",
        originY: "center",
        fontSize: 48,
        fill: masterTextColor,
        fontFamily: "Arial",
        fontWeight: "bold",
        scaleX: 1,
        scaleY: 1,
      });
    }

    return {
      version: "5.3.0",
      referenceBounds: { width: 1000, height: 1000 },
      objects,
    };
  }, [masterText, masterTextColor, masterImageUrl]);

  // Target Placement Rect standard for apparel mockups
  const targetPlacementRect: PlacementRect = {
    x: 150,
    y: 120,
    width: 300,
    height: 400,
  };

  // Add Member
  const addMember = () => {
    if (members.length >= 30) return;
    const defaultProduct = products[0];
    const defaultVariant = defaultProduct?.variants[0];
    const newMember: MemberState = {
      id: `mem_${Date.now()}`,
      roleKey: "child",
      productId: defaultProduct?.id || "",
      variantDocId: defaultVariant?.docId || "",
      color: defaultVariant?.color || "white",
      size: "M",
      face: "front",
      placementId: "front_full",
      quantity: 1,
      scaleMultiplier: 1.0,
    };
    setMembers([...members, newMember]);
  };

  // Remove Member
  const removeMember = (id: string) => {
    if (members.length <= 1) return;
    setMembers(members.filter((m) => m.id !== id));
  };

  // Update Member
  const updateMember = (id: string, updates: Partial<MemberState>) => {
    setMembers(
      members.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, ...updates };
        if (updates.productId && updates.productId !== m.productId) {
          const prod = products.find((p) => p.id === updates.productId);
          if (prod && prod.variants.length > 0) {
            updated.variantDocId = prod.variants[0].docId;
            updated.color = prod.variants[0].color;
          }
        }
        return updated;
      })
    );
  };

  // Submit Bundle to Cart
  const handleAddAllToCart = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const user = auth.currentUser;
    if (!user) {
      setErrorMessage(locale === "tr" ? "Lütfen önce giriş yapın." : locale === "ar" ? "يرجى تسجيل الدخول أولاً." : "Please log in first.");
      return;
    }

    try {
      setSubmitting(true);
      const token = await user.getIdToken();

      // Step 1: Save Master Design
      const masterRes = await fetch("/api/master-designs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Aile Seti - ${new Date().toLocaleDateString(locale)}`,
          canvasData: masterCanvasData,
          assets: masterImageUrl ? [{ id: "asset_img_1", type: "upload", url: masterImageUrl }] : [],
        }),
      });

      const masterJson = await masterRes.json();
      if (!masterRes.ok || !masterJson.design) {
        throw new Error(masterJson.error || "Ortak tasarım kaydedilemedi");
      }
      const masterDesign = masterJson.design;

      // Step 2: Prepare Bundle Items
      const bundleItems: MatchingBundleItem[] = members.map((m, idx) => {
        const prod = products.find((p) => p.id === m.productId);
        const pTitle = prod ? (prod[`name_${locale}` as keyof ProductOption] as string) || prod.name_tr || prod.id : m.productId;
        const roleLabel = m.roleKey === "custom" && m.customRoleLabel
          ? m.customRoleLabel
          : t(`roles.${m.roleKey}` as any);

        const adapted = adaptMasterDesignToTargetPlacement(
          { canvasData: masterCanvasData },
          targetPlacementRect,
          { scaleMultiplier: m.scaleMultiplier }
        );

        const templateRevisionId = prod?.print_template_revision || "0".repeat(64);

        return {
          id: `item_${idx + 1}_${Date.now()}`,
          bundleId: "",
          roleLabel,
          productId: m.productId,
          productTitle: pTitle,
          variantId: `${m.color}_${m.size}`,
          variantDocId: m.variantDocId,
          sku: `${m.productId}_${m.variantDocId}_${m.size}`,
          color: m.color,
          size: m.size,
          quantity: m.quantity,
          templateRevisionId,
          face: m.face,
          placementId: m.placementId,
          targetPlacementRect,
          mapping: adapted.mapping,
          canvasJson: adapted.canvasJson,
          validationStatus: adapted.validationStatus,
          validationError: adapted.validationError,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      // Step 3: Create Bundle Draft
      const bundleRes = await fetch("/api/matching-bundles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: masterDesign.title,
          masterDesignId: masterDesign.id,
          masterRevision: masterDesign.revision,
          masterRevisionHash: masterDesign.revisionHash,
          status: "draft",
          items: bundleItems,
        }),
      });

      const bundleJson = await bundleRes.json();
      if (!bundleRes.ok || !bundleJson.bundle) {
        throw new Error(bundleJson.error || "Koleksiyon taslağı kaydedilemedi");
      }
      const bundleId = bundleJson.bundle.id;

      // Step 4: Add Bundle items to Cart (Authoritative 03B Server Transaction)
      const cartRes = await fetch(`/api/matching-bundles/${bundleId}/add-to-cart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const cartJson = await cartRes.json();
      if (!cartRes.ok) {
        throw new Error(cartJson.message || cartJson.error || "Sepete eklenirken hata oluştu");
      }

      setSuccessMessage(t("successAdded"));
      setTimeout(() => {
        router.push("/cart");
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || "Bir hata oluştu");
    } finally {
      setSubmitting(false);
    }
  };

  const getProductName = (prod: ProductOption) => {
    return (prod[`name_${locale}` as keyof ProductOption] as string) || prod.name_tr || prod.name_en || prod.id;
  };

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header Hero */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black tracking-wide">
            <Sparkles size={16} />
            <span>KENDİN TASARLA PRO</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
            {t("title")}
          </h1>
          <p className="text-base sm:text-lg text-gray-600">
            {t("subtitle")}
          </p>
        </div>

        {/* Curated Collections Section (if any templates exist) */}
        {curatedTemplates.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Users size={22} className="text-primary" />
              <span>{t("curatedCollections")}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {curatedTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition flex flex-col"
                >
                  <div className="h-48 overflow-hidden relative">
                    <img
                      src={tpl.coverImageUrl}
                      alt={tpl.title[locale] || tpl.title.tr}
                      className="w-full h-full object-cover"
                    />
                    {tpl.badge && (
                      <span className="absolute top-3 end-3 bg-primary text-white text-xs font-black px-2.5 py-1 rounded-full shadow-sm">
                        {tpl.badge[locale] || tpl.badge.tr}
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="font-black text-lg text-gray-900">
                        {tpl.title[locale] || tpl.title.tr}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {tpl.description[locale] || tpl.description.tr}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        // Populate members from template suggested roles
                        if (tpl.suggestedRoles && tpl.suggestedRoles.length > 0) {
                          const newMembers: MemberState[] = tpl.suggestedRoles.map((r, i) => ({
                            id: `mem_${i + 1}_${Date.now()}`,
                            roleKey: (r.id as any) || "custom",
                            customRoleLabel: r.label[locale] || r.label.tr,
                            productId: r.defaultProductId || products[0]?.id || "",
                            variantDocId: products[0]?.variants[0]?.docId || "",
                            color: products[0]?.variants[0]?.color || "black",
                            size: i === 0 ? "XL" : i === 1 ? "M" : "S",
                            face: "front",
                            placementId: "front_full",
                            quantity: 1,
                            scaleMultiplier: 1.0,
                          }));
                          setMembers(newMembers);
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition text-center"
                    >
                      {t("createButton")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Master Design Creation Section */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <Layers size={22} className="text-primary" />
                <span>{t("masterDesignTitle")}</span>
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {t("masterDesignDesc")}
              </p>
            </div>
            <div className="text-xs font-bold text-primary bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-200">
              {t("independentPricingNote")}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Master Artwork Inputs */}
            <div className="lg:col-span-7 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Type size={14} className="text-primary" />
                  <span>Özel Metin / Aile Soyadı / Slogan</span>
                </label>
                <input
                  type="text"
                  value={masterText}
                  onChange={(e) => setMasterText(e.target.value)}
                  placeholder="Örn: AKSOY AİLESİ veya FAMILY FOREVER"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-black focus:ring-2 focus:ring-primary/20 focus:border-primary transition outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Yazı Rengi
                </label>
                <div className="flex items-center gap-2">
                  {["#111827", "#DC2626", "#2563EB", "#16A34A", "#D97706", "#9333EA", "#FFFFFF"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMasterTextColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${masterTextColor === c ? "scale-110 border-primary ring-2 ring-primary/20" : "border-gray-200"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <ImageIcon size={14} className="text-primary" />
                  <span>Ortak Görsel veya Logo URL (İsteğe Bağlı)</span>
                </label>
                <input
                  type="url"
                  value={masterImageUrl || ""}
                  onChange={(e) => setMasterImageUrl(e.target.value || null)}
                  placeholder="https://... (PNG veya JPG şeffaf görsel)"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary transition outline-none text-left"
                />
              </div>
            </div>

            {/* Master Artwork Canvas Preview */}
            <div className="lg:col-span-5 bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[220px]">
              <span className="text-xs font-bold text-gray-400 mb-2">Ortak Referans Kanvası (1000x1000)</span>
              <div className="w-48 h-48 bg-white border border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-3 text-center shadow-inner relative overflow-hidden">
                {masterImageUrl && (
                  <img
                    src={masterImageUrl}
                    alt="Master Preview"
                    className="max-h-24 max-w-full object-contain mb-2"
                  />
                )}
                {masterText && (
                  <span
                    className="font-black text-sm tracking-wide break-words max-w-full"
                    style={{ color: masterTextColor }}
                  >
                    {masterText}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Member Items Section */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-gray-900">
                {t("customCollection")}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500">
                Her üye için beden, renk ve baskı alanını bağımsız olarak belirleyin
              </p>
            </div>
            <button
              onClick={addMember}
              disabled={members.length >= 30}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-sm"
            >
              <Plus size={16} />
              <span>{t("addMember")}</span>
            </button>
          </div>

          {/* Members Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {members.map((member, idx) => {
              const prod = products.find((p) => p.id === member.productId);
              const adapted = adaptMasterDesignToTargetPlacement(
                { canvasData: masterCanvasData },
                targetPlacementRect,
                { scaleMultiplier: member.scaleMultiplier }
              );
              const isValid = adapted.validationStatus === "valid";

              return (
                <div
                  key={member.id}
                  className={`bg-white rounded-3xl border transition p-6 flex flex-col justify-between space-y-5 shadow-sm hover:shadow-md ${
                    isValid ? "border-gray-200" : "border-red-300 ring-2 ring-red-100"
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <select
                        value={member.roleKey}
                        onChange={(e) =>
                          updateMember(member.id, {
                            roleKey: e.target.value as any,
                          })
                        }
                        className="font-black text-sm bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-gray-900 outline-none"
                      >
                        <option value="father">{t("roles.father")}</option>
                        <option value="mother">{t("roles.mother")}</option>
                        <option value="child">{t("roles.child")}</option>
                        <option value="partner">{t("roles.partner")}</option>
                        <option value="friend">{t("roles.friend")}</option>
                        <option value="custom">{t("roles.custom")}</option>
                      </select>
                    </div>

                    {members.length > 1 && (
                      <button
                        onClick={() => removeMember(member.id)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded-lg transition"
                        title={t("removeMember")}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {/* Mockup Preview with Adapted Art */}
                  <div className="relative w-full h-48 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 overflow-hidden">
                    {/* Mockup garment placeholder or image */}
                    <div
                      className="w-36 h-44 rounded-xl border border-gray-200 shadow-xs flex flex-col items-center justify-center relative p-2"
                      style={{
                        backgroundColor:
                          member.color === "black"
                            ? "#18181b"
                            : member.color === "white"
                            ? "#ffffff"
                            : member.color === "navy"
                            ? "#1e293b"
                            : member.color === "yellow"
                            ? "#fef08a"
                            : member.color === "red"
                            ? "#ef4444"
                            : "#f4f4f5",
                      }}
                    >
                      {/* Printable Placement dashed rectangle */}
                      <div className="w-24 h-32 border border-dashed border-primary/60 rounded flex flex-col items-center justify-center p-1 text-center relative overflow-hidden bg-white/10 backdrop-blur-3xs">
                        {masterImageUrl && (
                          <img
                            src={masterImageUrl}
                            alt="Preview"
                            className="max-h-12 max-w-full object-contain mb-1"
                          />
                        )}
                        {masterText && (
                          <span
                            className="font-black text-[9px] tracking-tight leading-tight line-clamp-2"
                            style={{
                              color:
                                member.color === "black" || member.color === "navy"
                                  ? "#ffffff"
                                  : masterTextColor,
                            }}
                          >
                            {masterText}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Validation Status Badge */}
                    <div className="absolute bottom-2 end-2">
                      {isValid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                          <CheckCircle2 size={12} /> {t("scaleToFit")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateMember(member.id, { scaleMultiplier: 0.85 })}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-full border border-red-200 transition"
                        >
                          <AlertTriangle size={12} /> {t("scaleToFit")}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Product & Variant Controls */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 mb-1">
                        {t("selectProduct")}
                      </label>
                      <select
                        value={member.productId}
                        onChange={(e) =>
                          updateMember(member.id, { productId: e.target.value })
                        }
                        className="w-full text-xs font-bold bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800 outline-none"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {getProductName(p)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 mb-1">
                          {t("selectColor")}
                        </label>
                        <select
                          value={member.color}
                          onChange={(e) =>
                            updateMember(member.id, { color: e.target.value })
                          }
                          className="w-full text-xs font-bold bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800 outline-none"
                        >
                          {prod?.variants.map((v) => (
                            <option key={v.docId} value={v.color}>
                              {v.color}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 mb-1">
                          {t("selectSize")}
                        </label>
                        <select
                          value={member.size}
                          onChange={(e) =>
                            updateMember(member.id, { size: e.target.value })
                          }
                          className="w-full text-xs font-bold bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800 outline-none"
                        >
                          {["S", "M", "L", "XL", "2XL", "3XL"].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 mb-1">
                          {t("printPlacement")}
                        </label>
                        <select
                          value={member.placementId}
                          onChange={(e) =>
                            updateMember(member.id, { placementId: e.target.value })
                          }
                          className="w-full text-xs font-bold bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800 outline-none"
                        >
                          <option value="front_full">Ön Yüz (Tam)</option>
                          <option value="front_center">Ön Göğüs</option>
                          <option value="chest_left">Sol Göğüs</option>
                          <option value="back_full">Arka Yüz (Tam Sırt)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 mb-1">
                          {t("quantity")}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={member.quantity}
                          onChange={(e) =>
                            updateMember(member.id, {
                              quantity: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                          className="w-full text-xs font-bold bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800 outline-none text-center"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status Messages */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-red-50 text-red-700 text-sm border border-red-200 font-bold flex items-center gap-2">
            <AlertTriangle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-4 rounded-2xl bg-green-50 text-green-800 text-sm border border-green-200 font-bold flex items-center gap-2">
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Bottom Sticky Action Bar */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-30">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
              {t("itemsCount", { count: members.length })}
            </span>
            <span className="text-sm font-black text-gray-900">
              {t("independentPricingNote")}
            </span>
          </div>

          <button
            onClick={handleAddAllToCart}
            disabled={submitting}
            className="w-full sm:w-auto px-8 py-4 bg-primary hover:bg-primary/95 text-white font-black text-base rounded-2xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
          >
            <ShoppingCart size={20} />
            <span>{submitting ? t("addingToCart") : t("addAllToCart")}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
