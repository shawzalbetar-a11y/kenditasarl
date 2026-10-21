"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { fabric } from 'fabric';
import { Ruler, Type, Upload, Sticker, Undo, Redo, AlignCenter, AlignLeft, AlignRight, Save, ShoppingCart, Trash2, LayoutTemplate, X, Layers, Settings, Plus, Minus, ZoomIn, ZoomOut, Hand, Zap, Eye, CheckCircle2, AlertTriangle, Sparkles, Tag, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import AuthModal from '@/components/auth/AuthModal';
import { auth, db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, orderBy, where, deleteDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { PrintArea } from '@/lib/customizationConfig';
import { resolveImagePrintAreaGeometry } from '@/lib/coordinateMapping';
import { getCategoryLocalizedName } from '@/lib/categoryTranslations';
import TextTools from './tools/TextTools';
import ImageTools from './tools/ImageTools';
import LayerPanel from './tools/LayerPanel';
import PrecisionControls from './tools/PrecisionControls';
import ValidationModal from './ValidationModal';
import AssetGalleryModal, { GalleryAsset, GalleryCategory } from './AssetGalleryModal';
import MultiVariantMatrixModal, { VariantMatrixItem } from './MultiVariantMatrixModal';
import UserMediaSidebar, { UserUploadItem, RecentAssetItem } from './UserMediaSidebar';
import { getLocalizedColorName } from '@/lib/colorTranslations';
import { 
  getPricingSettings, 
  calculateCustomProductPrice, 
  DEFAULT_PRICING_CONFIG, 
  PricingSettingsConfig, 
  PriceCalculationResult 
} from '@/lib/pricing';
import { optimizeImageForUpload } from '@/lib/image-optimizer';
import { setupModernFabricControls, applyModernObjectStyles as applyCustomModernStyles, applyModernStyleToObject } from '@/lib/fabricCustomControls';
import GarmentPlacementGuide from './GarmentPlacementGuide';
import { PlacementSpec, getPlacementById, isFaceMatching } from '@/lib/printPlacementConfig';

const COLOR_MAP: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  gray: '#9CA3AF',
  navy: '#1E3A8A',
  blue: '#3B82F6',
  red: '#EF4444'
};

const isColorEqual = (c1?: string | null, c2?: string | null): boolean => {
  if (!c1 || !c2) return false;
  const s1 = c1.trim().toLowerCase();
  const s2 = c2.trim().toLowerCase();
  if (s1 === s2) return true;
  
  const hex1 = COLOR_MAP[s1]?.toLowerCase() || s1;
  const hex2 = COLOR_MAP[s2]?.toLowerCase() || s2;
  if (hex1 === hex2) return true;

  const name1 = Object.keys(COLOR_MAP).find(k => COLOR_MAP[k]?.toLowerCase() === s1) || s1;
  const name2 = Object.keys(COLOR_MAP).find(k => COLOR_MAP[k]?.toLowerCase() === s2) || s2;
  return name1 === name2;
};

// Mobile-First Global Fabric Handle & Touch Configuration with High Quality Image Smoothing
if (typeof window !== 'undefined' && fabric) {
  setupModernFabricControls(fabric);
  if (fabric.Canvas) {
    fabric.Canvas.prototype.clearContext = function(ctx: CanvasRenderingContext2D) {
      if (!ctx) return this;
      const retina = (this as any).getRetinaScaling ? (this as any).getRetinaScaling() : ((this as any).retinaScaling || 1);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.getWidth() * retina, this.getHeight() * retina);
      ctx.restore();
      return this;
    };

    fabric.Canvas.prototype.centerObject = function(obj: fabric.Object) {
      const targetW = this.getWidth() || 2000;
      const targetH = this.getHeight() || 2000;
      if (obj.originX === 'center' && obj.originY === 'center') {
        obj.set({
          left: targetW / 2,
          top: targetH / 2,
        });
      } else {
        obj.set({
          left: (targetW - obj.getScaledWidth()) / 2,
          top: (targetH - obj.getScaledHeight()) / 2,
        });
      }
      obj.setCoords();
      this.renderAll();
      return this;
    };

    fabric.Canvas.prototype.centerObjectH = function(obj: fabric.Object) {
      const targetW = this.getWidth() || 2000;
      if (obj.originX === 'center') {
        obj.set({ left: targetW / 2 });
      } else {
        obj.set({ left: (targetW - obj.getScaledWidth()) / 2 });
      }
      obj.setCoords();
      this.renderAll();
      return this;
    };

    fabric.Canvas.prototype.centerObjectV = function(obj: fabric.Object) {
      const targetH = this.getHeight() || 2000;
      if (obj.originY === 'center') {
        obj.set({ top: targetH / 2 });
      } else {
        obj.set({ top: (targetH - obj.getScaledHeight()) / 2 });
      }
      obj.setCoords();
      this.renderAll();
      return this;
    };
  }

  if (fabric.IText) {
    (fabric.IText.prototype.set as any)({
      editingBorderColor: '#1d4ed8',
      cursorWidth: 4,
      cursorColor: '#1d4ed8',
      cursorDelay: 400,
    });

    // Ensure editing border remains thick and visible even during typing / mobile keyboard open
    (fabric.IText.prototype as any)._renderEditingBorder = function(ctx: CanvasRenderingContext2D) {
      ctx.save();
      ctx.strokeStyle = this.editingBorderColor || '#1d4ed8';
      ctx.lineWidth = 4;
      const halfWidth = this.width / 2;
      const halfHeight = this.height / 2;
      ctx.strokeRect(-halfWidth, -halfHeight, this.width, this.height);
      ctx.restore();
    };
  }

  if (fabric.Textbox) {
    (fabric.Textbox.prototype.set as any)({
      editingBorderColor: '#1d4ed8',
      cursorWidth: 4,
      cursorColor: '#1d4ed8',
      cursorDelay: 400,
    });

    (fabric.Textbox.prototype as any)._renderEditingBorder = function(ctx: CanvasRenderingContext2D) {
      ctx.save();
      ctx.strokeStyle = this.editingBorderColor || '#1d4ed8';
      ctx.lineWidth = 4;
      const halfWidth = this.width / 2;
      const halfHeight = this.height / 2;
      ctx.strokeRect(-halfWidth, -halfHeight, this.width, this.height);
      ctx.restore();
    };
  }

  if (fabric.Image) {
    (fabric.Image.prototype.set as any)({
      imageSmoothing: true,
      strokeUniform: true,
      crossOrigin: 'anonymous',
    });
  }
}

interface FabricCanvasProps {
  productId: string;
  basePrice: number;
  productFaces: { front: string; back: string; left: string; right: string };
  productData?: any; 
  initialColor?: string;
  initialSize?: string;
  initialQuantity?: number;
}

const PRICING = {
  text: 10,
  image: 20,
  sticker: 5,
};

export default function FabricCanvas({ productId, basePrice, productFaces, productData, initialColor, initialSize, initialQuantity }: FabricCanvasProps) {
  const t = useTranslations('Editor');
  const tPreview = useTranslations('Preview');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const designIdFromUrl = searchParams.get('designId');
  const mode = searchParams.get('mode');
  const colorFromUrl = searchParams.get('color');
  const sizeFromUrl = searchParams.get('size');
  const quantityFromUrl = searchParams.get('quantity');

  const resolvedInitialColor = initialColor || colorFromUrl || productData?.selectedColor || 'white';
  const resolvedInitialSize = initialSize || sizeFromUrl || productData?.selectedSize || 'M';
  const resolvedInitialQuantity = initialQuantity || (quantityFromUrl ? Math.max(1, parseInt(quantityFromUrl, 10) || 1) : null) || productData?.initialQuantity || 1;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null);
  
  // The faces we support depending on the product
  const configFaces = productData?.config?.faces || { front: { printArea: { width: 200, height: 280, top: 120, left: 100 } } };
  const availableFaces = Object.keys(configFaces);
  
  const [activeFace, setActiveFace] = useState<string>(availableFaces[0] || 'front');
  const [totalPrice, setTotalPrice] = useState(basePrice);
  const [pricingConfig, setPricingConfig] = useState<PricingSettingsConfig>(DEFAULT_PRICING_CONFIG);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceCalculationResult | null>(null);
  const [showPricePopover, setShowPricePopover] = useState(false);
  const historyRef = useRef<string[]>([]);
  const historyStepRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'cart' | 'buy_now' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [modalZoom, setModalZoom] = useState<number>(1);
  const [modalPan, setModalPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalTouchDistRef = useRef<number | null>(null);
  const isModalDraggingRef = useRef<boolean>(false);
  const modalLastTouchPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [imageQualityReport, setImageQualityReport] = useState<{ status: string, message: string, color: string } | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationIssues, setValidationIssues] = useState<{ type: 'error' | 'warning', message: string }[]>([]);
  const [customizationMode, setCustomizationMode] = useState<'SAFE' | 'FREE'>('SAFE');
  const [activeMobileTab, setActiveMobileTab] = useState<string | null>(null);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [isObjectOutOfBounds, setIsObjectOutOfBounds] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
  
  const [selectedSize, setSelectedSize] = useState(resolvedInitialSize);
  const [selectedColor, setSelectedColor] = useState(resolvedInitialColor);
  const availableSizes = Array.isArray(productData?.sizes) && productData.sizes.length > 0 ? productData.sizes : ['S', 'M', 'L', 'XL', '2XL'];
  const availableColors = Array.isArray(productData?.colors) && productData.colors.length > 0 ? productData.colors : ['white', 'black', 'navy', '#DC2626', '#4B5563'];
  const [isMatrixModalOpen, setIsMatrixModalOpen] = useState(false);
  const [totalOrderQuantity, setTotalOrderQuantity] = useState<number>(resolvedInitialQuantity);
  const [variantMatrix, setVariantMatrix] = useState<VariantMatrixItem[]>([
    { color: resolvedInitialColor, size: resolvedInitialSize, quantity: resolvedInitialQuantity }
  ]);
  const [syncAllColors, setSyncAllColors] = useState<boolean>(false);
  const syncAllColorsRef = useRef(syncAllColors);
  syncAllColorsRef.current = syncAllColors;

  // Per-color placements management with unification toggle
  const [placementsByColor, setPlacementsByColor] = useState<Record<string, string[]>>({});
  const [syncPlacementsAcrossColors, setSyncPlacementsAcrossColors] = useState<boolean>(false);
  const syncPlacementsAcrossColorsRef = useRef(syncPlacementsAcrossColors);
  syncPlacementsAcrossColorsRef.current = syncPlacementsAcrossColors;

  // Free Placement Mode state (الوضع الحر)
  const [isFreeMode, setIsFreeMode] = useState<boolean>(false);
  const isFreeModeRef = useRef<boolean>(isFreeMode);
  isFreeModeRef.current = isFreeMode;

  const handleToggleFreeMode = useCallback((enabled: boolean) => {
    setIsFreeMode(enabled);
  }, []);

  // Hovered placement during drag & drop snapping
  const [hoveredPlacementId, setHoveredPlacementId] = useState<string | null>(null);
  const hoveredPlacementIdRef = useRef<string | null>(null);
  hoveredPlacementIdRef.current = hoveredPlacementId;

  // Active / Focused placement (Single placement focus strategy: only 1 placement visible at rest, all visible while dragging)
  const [focusedPlacementId, setFocusedPlacementId] = useState<string | null>(null);
  const [isObjectDragging, setIsObjectDragging] = useState<boolean>(false);
  const isObjectDraggingRef = useRef<boolean>(false);

  const normalizeColorKey = useCallback((color?: string | null): string => {
    if (!color) return 'default';
    const s = color.trim().toLowerCase();
    return COLOR_MAP[s]?.toLowerCase() || s;
  }, []);

  const activeColorKey = normalizeColorKey(selectedColor);

  const currentSelectedPlacementIds = useMemo(() => {
    if (syncPlacementsAcrossColors) {
      return placementsByColor['__synced__'] || placementsByColor[activeColorKey] || [];
    }
    return placementsByColor[activeColorKey] || [];
  }, [placementsByColor, activeColorKey, syncPlacementsAcrossColors]);

  const allSelectedPlacements = useMemo(() => {
    return currentSelectedPlacementIds
      .map(id => getPlacementById(id, productData?.config?.garmentType))
      .filter((p): p is PlacementSpec => !!p);
  }, [currentSelectedPlacementIds, productData]);

  const activeFaceSelectedPlacements = useMemo(() => {
    return allSelectedPlacements.filter(p => isFaceMatching(p.targetFace, activeFace));
  }, [allSelectedPlacements, activeFace]);

  const activeFaceSelectedPlacementsRef = useRef<PlacementSpec[]>(activeFaceSelectedPlacements);
  activeFaceSelectedPlacementsRef.current = activeFaceSelectedPlacements;

  const uniqueSelectedColors = useMemo(() => {
    const list: string[] = [];
    if (Array.isArray(variantMatrix) && variantMatrix.length > 0) {
      variantMatrix.forEach(item => {
        if (item.color && item.quantity > 0 && !list.some(c => isColorEqual(c, item.color))) {
          list.push(item.color);
        }
      });
    }
    if (selectedColor && !list.some(c => isColorEqual(c, selectedColor))) {
      list.push(selectedColor);
    }
    return list;
  }, [variantMatrix, selectedColor]);

  const [toastNotification, setToastNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const isInitialSyncDone = useRef(false);

  // Synchronize size, color, quantity and matrix when incoming parameters change (First mount only)
  useEffect(() => {
    if (isInitialSyncDone.current) return;
    const targetSize = initialSize || sizeFromUrl || productData?.selectedSize;
    const targetColor = initialColor || colorFromUrl || productData?.selectedColor;
    const targetQty = initialQuantity || (quantityFromUrl ? Math.max(1, parseInt(quantityFromUrl, 10) || 1) : null) || productData?.initialQuantity;

    if (targetSize && targetSize !== selectedSize) {
      setSelectedSize(targetSize);
    }
    if (targetColor && targetColor !== selectedColor) {
      setSelectedColor(targetColor);
    }
    if (targetQty && targetQty !== totalOrderQuantity) {
      setTotalOrderQuantity(targetQty);
    }
    if (targetSize || targetColor || targetQty) {
      setVariantMatrix([
        { 
          color: targetColor || selectedColor, 
          size: targetSize || selectedSize, 
          quantity: targetQty || totalOrderQuantity 
        }
      ]);
    }
    isInitialSyncDone.current = true;
  }, [initialSize, initialColor, initialQuantity, sizeFromUrl, colorFromUrl, quantityFromUrl, productData?.selectedSize, productData?.selectedColor, productData?.initialQuantity]);

  const getStockForVariant = useCallback((color: string, size?: string): number => {
    if (!productData?.variants || !Array.isArray(productData.variants) || productData.variants.length === 0) {
      return 999;
    }
    const colorClean = color.trim().toLowerCase();
    const variant = productData.variants.find((v: any) => {
      const vColor = (v.color || v.hex || v.id || '').trim().toLowerCase();
      const vHex = (v.hex || '').trim().toLowerCase();
      const vNameAr = (v.colorName_ar || '').trim().toLowerCase();
      const vNameTr = (v.colorName_tr || '').trim().toLowerCase();
      const vNameEn = (v.colorName_en || '').trim().toLowerCase();
      return vColor === colorClean || vHex === colorClean || vNameAr === colorClean || vNameTr === colorClean || vNameEn === colorClean;
    });

    if (!variant) return 999;
    if (size) {
      if (variant.sizes && typeof variant.sizes[size] === 'number') {
        return variant.sizes[size];
      }
      if (typeof variant.stock === 'number') {
        return variant.stock;
      }
      return 999;
    }
    if (typeof variant.stock === 'number') return variant.stock;
    if (variant.sizes && typeof variant.sizes === 'object') {
      return Object.values(variant.sizes).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    }
    return 999;
  }, [productData]);

  const isSizeAvailable = useCallback((size: string, color?: string): boolean => {
    return getStockForVariant(color || selectedColor, size) > 0;
  }, [getStockForVariant, selectedColor]);

  const isColorAvailable = useCallback((color: string): boolean => {
    return getStockForVariant(color) > 0;
  }, [getStockForVariant]);

  const grandTotalPrice = (Number(totalPrice) || basePrice) * Math.max(1, totalOrderQuantity);

  const storageKey = `draft_design_${productId}`;
  const hasRestoredDraftRef = useRef(false);
  const isRestoring = useRef(false);
  const saveDraftTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentDesignIdRef = useRef<string | null>(null);
  const facesData = useRef<Record<string, string | null>>({});

  const activeFaceRef = useRef(activeFace);
  activeFaceRef.current = activeFace;
  const selectedColorRef = useRef(selectedColor);
  selectedColorRef.current = selectedColor;

  const getFaceStateKey = useCallback((face: string, color: string): string => {
    const normColor = (color || 'default').trim().toLowerCase();
    return `${normColor}:::${face}`;
  }, []);

  const getFaceJson = useCallback((face: string, color: string): string | null => {
    const exactKey = getFaceStateKey(face, color);
    if (facesData.current[exactKey] !== undefined && facesData.current[exactKey] !== null) {
      return facesData.current[exactKey];
    }
    
    // Check color aliases with isColorEqual
    for (const k of Object.keys(facesData.current)) {
      if (k.includes(':::')) {
        const [storedColor, storedFace] = k.split(':::');
        if (storedFace === face && isColorEqual(storedColor, color) && facesData.current[k]) {
          return facesData.current[k];
        }
      }
    }

    // Fallback for legacy designs with only 'front', 'back', etc.
    if (facesData.current[face] && (!initialColor || isColorEqual(color, initialColor))) {
      return facesData.current[face];
    }

    // Fallback: If new color has not been designed yet, inherit existing active face design so canvas is not wiped
    for (const k of Object.keys(facesData.current)) {
      if (k.includes(':::')) {
        const [, storedFace] = k.split(':::');
        if (storedFace === face && facesData.current[k]) {
          try {
            const parsed = typeof facesData.current[k] === 'string' ? JSON.parse(facesData.current[k]!) : facesData.current[k];
            if (parsed?.objects && Array.isArray(parsed.objects) && parsed.objects.length > 0) {
              return facesData.current[k];
            }
          } catch {}
        }
      } else if (k === face && facesData.current[k]) {
        return facesData.current[k];
      }
    }

    return null;
  }, [getFaceStateKey, initialColor]);

  const [designAssets, setDesignAssets] = useState<any[]>([]);
  const [assetCategories, setAssetCategories] = useState<{ id: string; name: string; order?: number }[]>([]);
  const [selectedStickerCategory, setSelectedStickerCategory] = useState<string>('all');
  const [userUploads, setUserUploads] = useState<UserUploadItem[]>([]);
  const [recentAssets, setRecentAssets] = useState<RecentAssetItem[]>([]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastNotification({ type, text });
    setTimeout(() => setToastNotification(null), 3000);
  };

  const latestTotalPriceRef = useRef(totalPrice);
  latestTotalPriceRef.current = totalPrice;
  const latestPriceBreakdownRef = useRef(priceBreakdown);
  latestPriceBreakdownRef.current = priceBreakdown;

  // Robust Centralized Hybrid Pricing Recalculator (Stabilized against infinite re-render loops)
  const recalculatePrice = useCallback((targetCanvas?: fabric.Canvas, explicitFacesData?: Record<string, any>) => {
    const c = targetCanvas || canvas;
    let currentFaceObj: any = null;
    if (c && !(c as any).disposed && c.getElement && c.getElement()) {
      try {
        currentFaceObj = c.toJSON(['id', 'name', 'selectable', 'src', 'originalAssetId', 'crossOrigin', 'isCustomUpload', 'assetName', 'assetPrice']);
      } catch (e) {}
    }

    const currentMap = explicitFacesData || facesData.current || {};
    const parsedFacesMap: Record<string, any> = {};
    Object.keys(currentMap).forEach(fKey => {
      let faceName = fKey;
      let shouldInclude = true;

      if (fKey.includes(':::')) {
        const [cColor, fFace] = fKey.split(':::');
        faceName = fFace;
        // Include faces belonging to the currently selected color
        shouldInclude = isColorEqual(cColor, selectedColor);
      }

      if (shouldInclude) {
        const raw = currentMap[fKey];
        if (raw) {
          try {
            parsedFacesMap[faceName] = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch {
            parsedFacesMap[faceName] = raw;
          }
        }
      }
    });

    if (currentFaceObj) {
      parsedFacesMap[activeFace] = currentFaceObj;
    }

    const calcResult = calculateCustomProductPrice({
      basePrice,
      facesData: parsedFacesMap,
      assetsList: designAssets,
      pricingConfig
    });

    setTotalPrice(prev => (prev !== calcResult.totalPrice ? calcResult.totalPrice : prev));
    setPriceBreakdown(prev => (JSON.stringify(prev) !== JSON.stringify(calcResult) ? calcResult : prev));
  }, [canvas, activeFace, selectedColor, basePrice, designAssets, pricingConfig]);

  // Load centralized pricing settings
  useEffect(() => {
    getPricingSettings().then(cfg => {
      if (cfg) setPricingConfig(cfg);
    });
  }, []);

  // Reactively recalculate price whenever fresh pricing settings or assets are loaded from Firestore
  useEffect(() => {
    recalculatePrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingConfig, designAssets]);

  // Load persistent user uploads and recently used library assets
  useEffect(() => {
    // 1. Instant local storage cache
    try {
      const cachedUploads = localStorage.getItem('studio_user_uploads');
      if (cachedUploads) setUserUploads(JSON.parse(cachedUploads));
      const cachedRecents = localStorage.getItem('studio_recent_library_assets');
      if (cachedRecents) setRecentAssets(JSON.parse(cachedRecents));
    } catch (e) {}

    // 2. Fetch authenticated user's uploads from Firestore
    const currentUser = auth.currentUser;
    if (currentUser && db) {
      const q = query(
        collection(db, 'user_uploads'),
        where('user_id', '==', currentUser.uid)
      );
      getDocs(q).then((snap) => {
        const firestoreUploads: UserUploadItem[] = snap.docs.map((d) => ({
          id: d.id,
          url: d.data().url,
          name: d.data().name || 'Design',
          createdAt: d.data().created_at,
          size: d.data().size,
        }));
        if (firestoreUploads.length > 0) {
          setUserUploads((prev) => {
            const existingUrls = new Set(firestoreUploads.map((u) => u.url));
            const merged = [...firestoreUploads, ...prev.filter((p) => !existingUrls.has(p.url))];
            try {
              localStorage.setItem('studio_user_uploads', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }
      }).catch((err) => {
        console.warn("Could not fetch user_uploads from Firestore:", err);
      });
    }
  }, []);

  const recordUserUpload = async (url: string, name?: string, size?: number) => {
    const newItem: UserUploadItem = {
      id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      url,
      name: name || 'Design',
      createdAt: new Date().toISOString(),
      size
    };

    setUserUploads(prev => {
      const filtered = prev.filter(p => p.url !== url);
      const next = [newItem, ...filtered];
      try {
        localStorage.setItem('studio_user_uploads', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (auth.currentUser && db) {
      try {
        const docRef = await addDoc(collection(db, 'user_uploads'), {
          user_id: auth.currentUser.uid,
          url,
          name: name || 'Design',
          size: size || 0,
          created_at: new Date().toISOString()
        });
        newItem.id = docRef.id;
      } catch (err) {
        console.warn("Failed to persist upload in Firestore:", err);
      }
    }
  };

  const recordRecentAsset = (url: string, asset?: { id?: string; name?: string; price?: number; category?: string }) => {
    const newItem: RecentAssetItem = {
      id: asset?.id || `rec-${Date.now()}`,
      url,
      name: asset?.name || 'Sticker',
      price: asset?.price || 0,
      category: asset?.category || 'Stickers',
      usedAt: new Date().toISOString()
    };

    setRecentAssets(prev => {
      const filtered = prev.filter(p => p.url !== url);
      const next = [newItem, ...filtered].slice(0, 20);
      try {
        localStorage.setItem('studio_recent_library_assets', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSelectUpload = (item: UserUploadItem) => {
    if (!canvas) return;
    loadFabricImage(item.url, (fabricImg) => {
      (fabricImg as any).set({ 
        name: 'user_upload', 
        originalAssetId: item.url,
        crossOrigin: 'anonymous',
        isCustomUpload: true,
        assetName: item.name
      });
      prepareAndAddObject(fabricImg);
      saveHistoryState();
      showToast(t('itemAddedSuccess', { fallback: 'تمت إضافة التصميم إلى مساحة العمل' }), 'success');
    });
  };

  const handleSelectRecentAsset = (item: RecentAssetItem) => {
    addSticker(item.url, item);
    showToast(t('itemAddedSuccess', { fallback: 'تمت إضافة العنصر إلى التصميم بنجاح' }), 'success');
  };

  const handleDeleteUpload = async (id: string) => {
    setUserUploads(prev => {
      const next = prev.filter(p => p.id !== id);
      try {
        localStorage.setItem('studio_user_uploads', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (auth.currentUser && db && !id.startsWith('up-')) {
      try {
        await deleteDoc(doc(db, 'user_uploads', id));
      } catch (err) {
        console.warn("Failed to delete upload from Firestore:", err);
      }
    }
  };

  const handleDeleteRecent = (id: string) => {
    setRecentAssets(prev => {
      const next = prev.filter(p => p.id !== id);
      try {
        localStorage.setItem('studio_recent_library_assets', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const saveDraft = useCallback((targetCanvas?: fabric.Canvas) => {
    const c = targetCanvas || canvas;
    if (!c || isRestoring.current || typeof window === 'undefined') return;

    if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);

    saveDraftTimerRef.current = setTimeout(() => {
      if (isRestoring.current || !c) return;
      try {
        const json = c.toJSON(['id', 'name', 'selectable', 'src', 'originalAssetId', 'crossOrigin', 'isCustomUpload', 'assetName', 'assetPrice']);
        const currentKey = getFaceStateKey(activeFaceRef.current, selectedColorRef.current);
        facesData.current[currentKey] = JSON.stringify(json);
        
        const draftPayload = {
          faces: facesData.current,
          totalPrice: latestTotalPriceRef.current,
          priceBreakdown: latestPriceBreakdownRef.current,
          selectedSize,
          selectedColor,
          variantMatrix,
          totalOrderQuantity,
          activeFace,
          placementsByColor,
          syncPlacementsAcrossColors,
          selectedPlacementIds: currentSelectedPlacementIds,
          updatedAt: new Date().toISOString()
        };
        try {
          localStorage.setItem(storageKey, JSON.stringify(draftPayload));
          console.log(`✅ Auto-save: Key [${currentKey}] updated.`);
        } catch (storageErr) {
          console.warn("LocalStorage is full, skipping auto-save for large image.", storageErr);
        }
      } catch (err) {
        console.error("❌ Auto-save failed:", err);
      }
    }, 500); // تأخير نصف ثانية لضمان استقرار الأداء
  }, [canvas, selectedSize, selectedColor, storageKey, getFaceStateKey, variantMatrix, totalOrderQuantity, activeFace]);

  const propagateDesignToAllColors = useCallback((explicitCanvas?: fabric.Canvas) => {
    const targetCanvas = explicitCanvas || canvas;
    if (uniqueSelectedColors.length <= 1) return;
    
    // 1. Save current active face to memory
    if (targetCanvas && !isRestoring.current) {
      try {
        const json = JSON.stringify(targetCanvas.toJSON(SERIALIZE_PROPERTIES));
        const currentKey = getFaceStateKey(activeFaceRef.current, selectedColorRef.current);
        facesData.current[currentKey] = json;
      } catch (e) {}
    }

    // 2. Extract all designed faces for the current selected color
    const activeFacesForColor: Record<string, string> = {};
    Object.keys(facesData.current).forEach(k => {
      if (k.includes(':::')) {
        const [c, f] = k.split(':::');
        if (isColorEqual(c, selectedColorRef.current) && facesData.current[k]) {
          activeFacesForColor[f] = facesData.current[k]!;
        }
      } else if (facesData.current[k]) {
        activeFacesForColor[k] = facesData.current[k]!;
      }
    });

    // 3. Mirror all designed faces to every other color in uniqueSelectedColors
    uniqueSelectedColors.forEach((otherColor: string) => {
      if (!isColorEqual(otherColor, selectedColorRef.current)) {
        Object.entries(activeFacesForColor).forEach(([fKey, fJson]) => {
          const targetKey = getFaceStateKey(fKey, otherColor);
          facesData.current[targetKey] = fJson;
        });
      }
    });

    saveDraft(targetCanvas || undefined);
    showToast(
      locale === 'tr' 
        ? `Tasarım ${uniqueSelectedColors.length} seçili renge uygulandı` 
        : locale === 'en' 
          ? `Design synced to all ${uniqueSelectedColors.length} selected colors` 
          : `تم تطبيق التعديلات على كافة الألوان (${uniqueSelectedColors.length} ألوان)`,
      'success'
    );
  }, [uniqueSelectedColors, canvas, getFaceStateKey, locale, saveDraft]);
  
  // Internal Canvas & Preview Zoom & Pan Control (1.0x to 3.0x with Hand Tool)
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isPanMode, setIsPanMode] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanModeRef = useRef<boolean>(false);
  isPanModeRef.current = isPanMode;
  const mockupContainerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(3, parseFloat((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(1, parseFloat((prev - 0.25).toFixed(2)));
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanMode(false);
    if (canvas) {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      canvas.requestRenderAll();
    }
  };

  // Toggle Hand Tool / Pan Mode on Fabric Canvas
  useEffect(() => {
    if (!canvas) return;
    if (isPanMode) {
      canvas.discardActiveObject();
      canvas.selection = false;
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
      canvas.requestRenderAll();
    } else {
      canvas.selection = true;
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      canvas.forEachObject((obj) => {
        obj.selectable = true;
        obj.evented = true;
      });
      canvas.requestRenderAll();
    }
  }, [isPanMode, canvas]);

  // Support Spacebar to Pan on Desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isPanModeRef.current) {
        const target = e.target as HTMLElement;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          setIsPanMode(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isPanModeRef.current) {
        const target = e.target as HTMLElement;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          setIsPanMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Support Mouse Wheel Zoom on Desktop (Ctrl/Meta + Wheel)
  useEffect(() => {
    const container = mockupContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        setZoomLevel((prev) => {
          const next = Math.min(3, Math.max(1, parseFloat((prev + delta).toFixed(2))));
          if (next === 1) setPanOffset({ x: 0, y: 0 });
          return next;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Panning Event Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isPanMode) return;
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanMode || !isDraggingRef.current) return;
    const deltaX = e.clientX - lastPosRef.current.x;
    const deltaY = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };

    setPanOffset((prev) => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isPanMode || e.touches.length === 0) return;
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPanMode || !isDraggingRef.current || e.touches.length === 0) return;
    const deltaX = e.touches[0].clientX - lastPosRef.current.x;
    const deltaY = e.touches[0].clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

    setPanOffset((prev) => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Stickers & Assets strictly from Firestore (100% Admin Controlled)
  const allStickersList = designAssets.filter((a) => a.type === 'sticker' || a.type === 'print' || !a.type);

  // Dynamically compute list of categories to display in public tabs (Strictly deduplicated by category name)
  const rawCategories = assetCategories.length > 0 
    ? assetCategories 
    : Array.from(new Set(allStickersList.map(s => s.category).filter(Boolean))).map((name, i) => ({ id: `cat-${i}`, name }));

  const seenCategoryNames = new Set<string>();
  const uniqueDisplayCategories: { id: string; name: string; order?: number }[] = [];
  for (const c of rawCategories) {
    const cleanName = (c.name || '').trim();
    if (cleanName && !seenCategoryNames.has(cleanName)) {
      seenCategoryNames.add(cleanName);
      uniqueDisplayCategories.push(c);
    }
  }

  const displayCategories = [
    { id: 'all', name: 'all' },
    ...uniqueDisplayCategories
  ];

  // Filtered list by selected category
  const filteredStickers = selectedStickerCategory === 'all'
    ? allStickersList
    : allStickersList.filter(s => (s.category || 'أخرى') === selectedStickerCategory);

  // Dynamic Mobile Shift & Auto-Scroll (Hide header and welcome banner, auto-scroll canvas into view)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const header = document.querySelector('header');
    const welcomeBanner = document.getElementById('design-studio-welcome-banner');
    const isMobile = window.innerWidth <= 768;

    if (isMobile && activeMobileTab) {
      if (header) (header as HTMLElement).style.display = 'none';
      if (welcomeBanner) (welcomeBanner as HTMLElement).style.display = 'none';

      // Auto-scroll smooth to canvas area to maximize viewport
      setTimeout(() => {
        canvasContainerRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 50);
    } else {
      if (header) (header as HTMLElement).style.display = '';
      if (welcomeBanner) (welcomeBanner as HTMLElement).style.display = '';
    }

    return () => {
      if (header) (header as HTMLElement).style.display = '';
      if (welcomeBanner) (welcomeBanner as HTMLElement).style.display = '';
    };
  }, [activeMobileTab]);

  // Fetch Assets & Categories
  useEffect(() => {
    async function fetchAssetsAndCategories() {
      if (!db) return;
      try {
        const [assetsSnap, catsSnap] = await Promise.all([
          getDocs(collection(db, 'design_assets')),
          getDocs(query(collection(db, 'asset_categories'), orderBy('order', 'asc'))).catch(() => null)
        ]);

        if (assetsSnap) {
          setDesignAssets(assetsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }

        if (catsSnap && !catsSnap.empty) {
          const rawCats = catsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
          const seen = new Set<string>();
          const loadedCats: any[] = [];
          for (const c of rawCats) {
            const cleanName = (c.name_ar || c.name || '').trim();
            if (cleanName && !seen.has(cleanName)) {
              seen.add(cleanName);
              loadedCats.push(c);
            }
          }
          loadedCats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          setAssetCategories(loadedCats);
        }
      } catch (err) {
        console.error("Failed to fetch assets & categories", err);
      }
    }
    fetchAssetsAndCategories();
  }, []);

  // Load design if designId exists
  useEffect(() => {
    async function fetchDesign() {
      if (!db || !designIdFromUrl) return;
      try {
        const docRef = doc(db, 'designs', designIdFromUrl);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.canvas_json) {
            let parsedFaces = data.canvas_json;
            if (typeof parsedFaces === 'string') {
              try {
                parsedFaces = JSON.parse(parsedFaces);
              } catch (e) {
                console.warn("Error parsing canvas_json string:", e);
              }
            }
            facesData.current = parsedFaces || {};
            const designColor = data.color || colorFromUrl || initialColor || selectedColor || 'white';
            Object.entries(facesData.current).forEach(([k, v]) => {
              if (!k.includes(':::') && v) {
                facesData.current[getFaceStateKey(k, designColor)] = v;
              }
            });

            if (data.size && !sizeFromUrl && !initialSize) setSelectedSize(data.size);
            if (data.color && !colorFromUrl && !initialColor) setSelectedColor(data.color);
            
            if (mode === 'remix') {
              // We loaded the design, but we act as if it's a new unsaved canvas
              currentDesignIdRef.current = null;
            } else {
              currentDesignIdRef.current = designIdFromUrl;
            }
            
            // Reload canvas if already initialized with context guards
            const targetJson = getFaceJson(activeFace, designColor);
            if (canvas && canvas.getContext() && canvas.getElement() && targetJson) {
              isRestoring.current = true;
              try {
                canvas.loadFromJSON(targetJson, () => {
                  if (canvas && canvas.getContext() && canvas.getElement()) {
                    canvas.renderAll();
                    saveHistoryState();
                  }
                  isRestoring.current = false;
                });
              } catch (e) {
                isRestoring.current = false;
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load design", err);
      }
    }
    fetchDesign();
  }, [designIdFromUrl]);

  // Dynamic Face Mockup Image Resolver based on selectedColor & activeFace
  const getFaceMockupForColor = useCallback((face: string, color: string): string => {
    const rawImages = productData?.raw_images || productData?.images || [];
    const variants = productData?.variants || [];
    const targetFace = face;

    // 1. Try to find a blank or ready mockup in raw_images matching color and targetFace
    if (Array.isArray(rawImages) && rawImages.length > 0 && color) {
      const matchingBlank = rawImages.find((img: any) => 
        (img && typeof img === 'object') &&
        (img.type === 'blank' || !img.type) &&
        (img.face === targetFace || (targetFace === 'left_shoulder' && img.face === 'left') || (targetFace === 'right_shoulder' && img.face === 'right')) &&
        (isColorEqual(img.colorHex, color) || isColorEqual(img.color, color) || isColorEqual(img.colorName, color) || isColorEqual(img.colorName_ar, color) || isColorEqual(img.colorName_tr, color) || isColorEqual(img.colorName_en, color))
      );
      if (matchingBlank?.url) return matchingBlank.url;

      const matchingReady = rawImages.find((img: any) => 
        (img && typeof img === 'object') &&
        (img.face === targetFace || (targetFace === 'left_shoulder' && img.face === 'left') || (targetFace === 'right_shoulder' && img.face === 'right')) &&
        (isColorEqual(img.colorHex, color) || isColorEqual(img.color, color) || isColorEqual(img.colorName, color) || isColorEqual(img.colorName_ar, color) || isColorEqual(img.colorName_tr, color) || isColorEqual(img.colorName_en, color))
      );
      if (matchingReady?.url) return matchingReady.url;
    }

    // 2. Try to find a variant matching color in variants collection
    if (Array.isArray(variants) && variants.length > 0 && color) {
      const matchingVariant = variants.find((v: any) => 
        isColorEqual(v.hex, color) ||
        isColorEqual(v.color, color) ||
        isColorEqual(v.colorName_ar, color) ||
        isColorEqual(v.colorName_tr, color) ||
        isColorEqual(v.colorName_en, color) ||
        isColorEqual(v.name, color)
      );

      if (matchingVariant) {
        if (matchingVariant.base_images && matchingVariant.base_images[targetFace]) {
          return matchingVariant.base_images[targetFace];
        }
        if (matchingVariant.images && matchingVariant.images[targetFace]) {
          return matchingVariant.images[targetFace];
        }
        if (targetFace === 'front' && (matchingVariant.image_front || matchingVariant.mockup_front || matchingVariant.image || matchingVariant.url)) {
          return matchingVariant.image_front || matchingVariant.mockup_front || matchingVariant.image || matchingVariant.url;
        }
        if (targetFace === 'back' && (matchingVariant.image_back || matchingVariant.mockup_back)) {
          return matchingVariant.image_back || matchingVariant.mockup_back;
        }
      }
    }

    // 3. Fallback to productFaces prop
    return productFaces[face as keyof typeof productFaces] || productFaces['front'] || '';
  }, [productData, productFaces]);

  const currentFaceMockupUrl = getFaceMockupForColor(activeFace, selectedColor);

  // 1. Resolve face geometry from product configuration
  const resolvedFaceConfig = configFaces[activeFace]?.printArea;

  // 2. Dynamic tracking of the current mockup image's true natural dimensions
  const [mockupNaturalSize, setMockupNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!currentFaceMockupUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setMockupNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = currentFaceMockupUrl;
  }, [currentFaceMockupUrl]);

  // True Native Mockup Dimensions (Priority: Image Natural Size -> Resolved Config -> High-Res Standard 1792x2400)
  const nativeWidth = mockupNaturalSize.width > 0 
    ? mockupNaturalSize.width 
    : (Number(resolvedFaceConfig?.nativeWidth) || 1792);

  const nativeHeight = mockupNaturalSize.height > 0 
    ? mockupNaturalSize.height 
    : (Number(resolvedFaceConfig?.nativeHeight) || 2400);

  const nativeAspectRatio = nativeWidth / nativeHeight;

  // Free Mode Printable Area bounds (per garment face)
  const freePrintZone = React.useMemo(() => {
    const freeBounds = productData?.config?.freeModeBounds?.[activeFace];
    const nw = nativeWidth;
    const nh = nativeHeight;
    if (freeBounds) {
      const fbNw = freeBounds.nativeWidth || nw;
      const fbNh = freeBounds.nativeHeight || nh;
      return {
        left: (freeBounds.x / fbNw) * nw,
        top: (freeBounds.y / fbNh) * nh,
        width: (freeBounds.width / fbNw) * nw,
        height: (freeBounds.height / fbNh) * nh,
        nativeWidth: nw,
        nativeHeight: nh,
      };
    }
    const isSleeve = activeFace === 'left' || activeFace === 'right' || activeFace === 'left_shoulder' || activeFace === 'right_shoulder';
    const fw = Math.round(nw * (isSleeve ? 0.45 : 0.54));
    const fh = Math.round(nh * (isSleeve ? 0.65 : 0.68));
    const fx = Math.round((nw - fw) / 2);
    const fy = Math.round(nh * (isSleeve ? 0.18 : 0.18));
    return {
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      nativeWidth: nw,
      nativeHeight: nh,
    };
  }, [productData?.config?.freeModeBounds, activeFace, nativeWidth, nativeHeight]);

  // Current Print Area spans the entire garment face (0,0 to nativeWidth, nativeHeight)
  // Completely eliminates legacy boundary walls, clipping, and coordinate offset shifts!
  const currentPrintArea: PrintArea = React.useMemo(() => {
    return {
      id: isFreeMode ? `free_${activeFace}` : `approved_${activeFace}`,
      name: (isFreeMode ? `FREE_${activeFace}` : `APPROVED_${activeFace}`).toUpperCase(),
      left: 0,
      top: 0,
      width: nativeWidth,
      height: nativeHeight,
      nativeWidth,
      nativeHeight,
    };
  }, [isFreeMode, activeFace, nativeWidth, nativeHeight]);

  // Fabric Canvas covers 100% of the mockup image directly (Zero offset, zero padding distortion)
  const totalCanvasWidth = nativeWidth;
  const totalCanvasHeight = nativeHeight;

  // Sync canvas internal resolution when native dimensions change
  useEffect(() => {
    if (!canvas) return;
    if (canvas.getWidth() !== totalCanvasWidth || canvas.getHeight() !== totalCanvasHeight) {
      canvas.setWidth(totalCanvasWidth);
      canvas.setHeight(totalCanvasHeight);
      (canvas as any).printAreaWidth = totalCanvasWidth;
      (canvas as any).printAreaHeight = totalCanvasHeight;
      canvas.renderAll();
    }
  }, [canvas, totalCanvasWidth, totalCanvasHeight]);

  // Helper to resolve precise placement coordinates in Fabric virtual canvas space (1:1 with mockup space)
  const getPlacementFabricBounds = useCallback((spec: PlacementSpec) => {
    const calibrated = productData?.config?.calibratedPlacements?.[spec.id];
    const hasCalibrated = !!calibrated && !!calibrated.nativeWidth && calibrated.nativeWidth > 0;
    
    const nw = nativeWidth;
    const nh = nativeHeight;

    const mockupX = hasCalibrated ? (calibrated.x / calibrated.nativeWidth) * nw : (spec.canvasBox.leftPercent / 100) * nw;
    const mockupY = hasCalibrated ? (calibrated.y / calibrated.nativeHeight) * nh : (spec.canvasBox.topPercent / 100) * nh;
    const mockupW = hasCalibrated ? (calibrated.width / calibrated.nativeWidth) * nw : (spec.canvasBox.maxWidthPercent / 100) * nw;
    const mockupH = hasCalibrated ? (calibrated.height / calibrated.nativeHeight) * nh : (spec.canvasBox.maxHeightPercent / 100) * nh;

    // Direct 1:1 mapping with mockup coordinates - No offset drift or artificial barriers!
    const fabricLeft = mockupX;
    const fabricTop = mockupY;
    const fabricWidth = mockupW;
    const fabricHeight = mockupH;
    const fabricCenterX = fabricLeft + fabricWidth / 2;
    const fabricCenterY = fabricTop + fabricHeight / 2;

    return {
      spec,
      id: spec.id,
      nameAr: spec.nameAr,
      nameEn: spec.nameEn,
      nameTr: spec.nameTr,
      mockupX,
      mockupY,
      mockupW,
      mockupH,
      fabricLeft,
      fabricTop,
      fabricWidth,
      fabricHeight,
      fabricCenterX,
      fabricCenterY,
    };
  }, [productData?.config?.calibratedPlacements, nativeWidth, nativeHeight]);

  // Helper to format controls, auto-scale within placement or free bounds, and position object
  const prepareAndAddObject = (obj: fabric.Object, canvasInstance?: fabric.Canvas) => {
    const c = canvasInstance || canvas;
    if (!c) return;

    // Mark as intentionally positioned to prevent object:added listener from re-scaling/re-centering
    (obj as any).__alreadyPositioned = true;

    // Approved Standards Mode: Automatically insert into target approved placement!
    if (!isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length > 0) {
      const existingObjects = c.getObjects().filter(o => o.name !== 'background' && o.name !== 'mockup' && o.name !== 'print_area_guide');
      let targetPlacement = activeFaceSelectedPlacementsRef.current[0];

      // If multiple placements exist, look for an empty placement without objects
      for (const spec of activeFaceSelectedPlacementsRef.current) {
        const bounds = getPlacementFabricBounds(spec);
        const hasObj = existingObjects.some(o => {
          const pt = o.getCenterPoint();
          return (
            pt.x >= bounds.fabricLeft &&
            pt.x <= bounds.fabricLeft + bounds.fabricWidth &&
            pt.y >= bounds.fabricTop &&
            pt.y <= bounds.fabricTop + bounds.fabricHeight
          );
        });
        if (!hasObj) {
          targetPlacement = spec;
          break;
        }
      }

      const pBounds = getPlacementFabricBounds(targetPlacement);
      const maxWidth = pBounds.fabricWidth * 0.85;
      const maxHeight = pBounds.fabricHeight * 0.85;
      const currentWidth = obj.getScaledWidth();
      const currentHeight = obj.getScaledHeight();

      if (currentWidth > maxWidth || currentHeight > maxHeight) {
        const scaleFactor = Math.min(maxWidth / (obj.width || 1), maxHeight / (obj.height || 1));
        obj.scale(scaleFactor);
      }

      obj.set({
        originX: 'center',
        originY: 'center',
        left: pBounds.fabricCenterX,
        top: pBounds.fabricCenterY,
      });
      (obj as any).assignedPlacementId = targetPlacement.id;
      setFocusedPlacementId(targetPlacement.id);

      c.add(obj);
      c.setActiveObject(obj);
      obj.setCoords();
      applyCustomModernStyles(c);
      c.renderAll();

      setToastNotification({
        type: 'info',
        text: locale === 'tr' ? `Tasarım ${targetPlacement.nameTr} konumuna yerleştirildi` :
              locale === 'en' ? `Design placed in ${targetPlacement.nameEn}` :
              `تم وضع التصميم داخل: ${targetPlacement.nameAr}`,
      });
      return;
    }

    // Free Mode: Scale within 75% of full printable zone
    const maxWidth = freePrintZone.width * 0.75;
    const maxHeight = freePrintZone.height * 0.75;
    const currentWidth = obj.getScaledWidth();
    const currentHeight = obj.getScaledHeight();

    if (currentWidth > maxWidth || currentHeight > maxHeight) {
      const scaleFactor = Math.min(maxWidth / (obj.width || 1), maxHeight / (obj.height || 1));
      obj.scale(scaleFactor);
    }

    obj.set({
      originX: 'center',
      originY: 'center',
      left: freePrintZone.left + freePrintZone.width / 2,
      top: freePrintZone.top + freePrintZone.height / 2,
    });

    c.add(obj);
    c.setActiveObject(obj);
    obj.setCoords();
    applyCustomModernStyles(c);
    c.renderAll();
  };

  // Resilient Fabric Image/SVG Loader with automatic CORS & SVG fallback
  const loadFabricImage = (
    url: string,
    onSuccess: (img: fabric.Object) => void,
    onError?: (err: any) => void
  ) => {
    const isSvg = url.toLowerCase().endsWith('.svg') || url.includes('image/svg+xml');
    
    if (isSvg) {
      try {
        fabric.loadSVGFromURL(url, (objects, options) => {
          if (objects && objects.length) {
            const svgObj = fabric.util.groupSVGElements(objects, options);
            onSuccess(svgObj);
          } else {
            loadRasterImage(url, onSuccess, onError);
          }
        }, undefined, { crossOrigin: 'anonymous' });
      } catch (svgErr) {
        loadRasterImage(url, onSuccess, onError);
      }
    } else {
      loadRasterImage(url, onSuccess, onError);
    }
  };

  const loadRasterImage = (
    url: string,
    onSuccess: (img: fabric.Image) => void,
    onError?: (err: any) => void
  ) => {
    try {
      fabric.Image.fromURL(
        url,
        (img) => {
          if (img && img.width && img.height && img.width > 0) {
            (img as any).set({ 
              crossOrigin: 'anonymous',
              imageSmoothing: true,
              strokeUniform: true
            });
            const el = img.getElement();
            if (el && 'crossOrigin' in el) {
              (el as HTMLImageElement).crossOrigin = 'anonymous';
            }
            onSuccess(img);
          } else {
            // Fallback using DOM Image with explicit crossOrigin
            const domImg = new Image();
            domImg.crossOrigin = 'anonymous';
            domImg.onload = () => {
              try {
                const fabricInstance = new fabric.Image(domImg, { 
                  crossOrigin: 'anonymous',
                  imageSmoothing: true,
                  strokeUniform: true
                } as any);
                (fabricInstance as any).set({ 
                  crossOrigin: 'anonymous',
                  imageSmoothing: true,
                  strokeUniform: true
                });
                onSuccess(fabricInstance);
              } catch (domInstanceErr) {
                onError?.(domInstanceErr);
              }
            };
            domImg.onerror = (domErr) => {
              console.error("CORS Image load failed:", url, domErr);
              onError?.(domErr);
            };
            domImg.src = url;
          }
        },
        { crossOrigin: 'anonymous' }
      );
    } catch (err) {
      console.error("loadRasterImage exception:", err);
      onError?.(err);
    }
  };

  // Initialize Canvas with Strict Lifecycle Safeguards & Memory Cleanup
  useEffect(() => {
    if (!canvasRef.current) return;

    let isDisposed = false;
    let restoreTimer: NodeJS.Timeout | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;

    const initCanvas = new fabric.Canvas(canvasRef.current, {
      width: totalCanvasWidth,
      height: totalCanvasHeight,
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      imageSmoothingEnabled: true,
      enableRetinaScaling: true,
    });

    (initCanvas as any).printAreaWidth = totalCanvasWidth;
    (initCanvas as any).printAreaHeight = totalCanvasHeight;
    initCanvas.viewportTransform = [1, 0, 0, 1, 0, 0];

    // Ensure 100% full canvas clean wipe on every frame to prevent any trailing, smearing or ghosting
    initCanvas.clearContext = function(ctx: CanvasRenderingContext2D) {
      if (!ctx) return this;
      const retina = (this as any).getRetinaScaling ? (this as any).getRetinaScaling() : ((this as any).retinaScaling || 1);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.getWidth() * retina, this.getHeight() * retina);
      ctx.restore();
      return this;
    };

    initCanvas.imageSmoothingEnabled = true;
    const anyCanvas = initCanvas as any;
    if (anyCanvas.contextTop) {
      anyCanvas.contextTop.imageSmoothingEnabled = true;
      anyCanvas.contextTop.imageSmoothingQuality = 'high';
    }
    if (anyCanvas.contextContainer) {
      anyCanvas.contextContainer.imageSmoothingEnabled = true;
      anyCanvas.contextContainer.imageSmoothingQuality = 'high';
    }
    
    // Dynamic Hybrid Pricing Calculation
    const updatePrice = () => {
      if (isDisposed || !initCanvas || !initCanvas.getContext() || !initCanvas.getElement()) return;
      recalculatePrice(initCanvas);
    };

    initCanvas.on('object:added', (e) => {
      if (isDisposed) return;
      const obj = e.target;
      
      if (obj) {
        // Apply Global Brand Modern Selection Controls & Dimensions
        applyCustomModernStyles(initCanvas);

        // Smart sizing for raw objects that were not already positioned by prepareAndAddObject or addText
        if (!isRestoring.current && !(obj as any).__alreadyPositioned && !(obj as any).assignedPlacementId) {
          const isText = obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text';
          if (isText) {
            const marginPx = 40;
            const targetTextWidth = Math.max(120, freePrintZone.width - (marginPx * 2));
            obj.scaleToWidth(targetTextWidth);
            const maxHeight = freePrintZone.height * 0.35;
            if (obj.getScaledHeight() > maxHeight) {
              obj.scaleToHeight(maxHeight);
            }
          } else {
            const maxW = freePrintZone.width * 0.75;
            const maxH = freePrintZone.height * 0.75;
            const originalW = obj.width || 1;
            const originalH = obj.height || 1;
            const scaleFactor = Math.min(maxW / originalW, maxH / originalH);
            obj.scale(scaleFactor);
          }
          obj.set({
            left: freePrintZone.left + freePrintZone.width / 2,
            top: freePrintZone.top + freePrintZone.height / 2,
            originX: 'center',
            originY: 'center',
          });
          obj.setCoords();
        }
      }
      
      updatePrice();
      if (!isRestoring.current) {
        saveHistoryStateCanvas(initCanvas);
        saveDraft(initCanvas);
      }
    });

    const onCanvasModified = () => {
      if (isDisposed || isRestoring.current) return;
      saveHistoryStateCanvas(initCanvas);
      saveDraft(initCanvas);
    };

    initCanvas.on('object:removed', () => { updatePrice(); onCanvasModified(); });
    initCanvas.on('object:modified', onCanvasModified);
    initCanvas.on('text:changed', onCanvasModified);

    const updateActiveObj = () => {
      if (isDisposed) return;
      setActiveObject(initCanvas.getActiveObject() || null);
    };

    initCanvas.on('mouse:down', (opt) => {
      if (isPanModeRef.current) {
        isDraggingRef.current = true;
        const evt = opt.e as MouseEvent | TouchEvent;
        const clientX = 'clientX' in evt ? evt.clientX : (evt as TouchEvent).touches?.[0]?.clientX || 0;
        const clientY = 'clientY' in evt ? evt.clientY : (evt as TouchEvent).touches?.[0]?.clientY || 0;
        lastPosRef.current = { x: clientX, y: clientY };
      }
    });

    initCanvas.on('mouse:move', (opt) => {
      if (isPanModeRef.current && isDraggingRef.current) {
        const evt = opt.e as MouseEvent | TouchEvent;
        const clientX = 'clientX' in evt ? evt.clientX : (evt as TouchEvent).touches?.[0]?.clientX || 0;
        const clientY = 'clientY' in evt ? evt.clientY : (evt as TouchEvent).touches?.[0]?.clientY || 0;
        const deltaX = clientX - lastPosRef.current.x;
        const deltaY = clientY - lastPosRef.current.y;
        lastPosRef.current = { x: clientX, y: clientY };

        setPanOffset((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
      }
    });

    initCanvas.on('mouse:up', () => {
      isDraggingRef.current = false;
    });

    initCanvas.on('selection:created', (e) => {
      updateActiveObj();
      if (e.selected && e.selected[0]) {
        validateAndSnap();
      }
    });
    initCanvas.on('selection:updated', (e) => {
      updateActiveObj();
      if (e.selected && e.selected[0]) {
        validateAndSnap();
      }
    });
    initCanvas.on('selection:cleared', () => {
      updateActiveObj();
      setIsObjectOutOfBounds(false);
    });

    // Boundary Clamping & Snapping & Validation
    const validateAndSnap = () => {
      if (isDisposed || !initCanvas || !initCanvas.getContext() || !initCanvas.getElement()) return;
      const activeObj = initCanvas.getActiveObject();
      if (!activeObj) {
        setValidationWarning(null);
        return;
      }

      // 1. Boundary Clamping: Keep at least 20px visible inside the garment canvas
      const minVisible = 20;
      const bound = activeObj.getBoundingRect(true, true);
      let newLeft = activeObj.left || 0;
      let newTop = activeObj.top || 0;

      if (bound.left + bound.width < minVisible) {
        newLeft += (minVisible - (bound.left + bound.width));
      }
      if (bound.left > nativeWidth - minVisible) {
        newLeft -= (bound.left - (nativeWidth - minVisible));
      }
      if (bound.top + bound.height < minVisible) {
        newTop += (minVisible - (bound.top + bound.height));
      }
      if (bound.top > nativeHeight - minVisible) {
        newTop -= (bound.top - (nativeHeight - minVisible));
      }

      if (newLeft !== activeObj.left || newTop !== activeObj.top) {
        activeObj.set({ left: newLeft, top: newTop });
        activeObj.setCoords();
      }

      // 2. Centerline Snapping (Dynamic based on true garment width)
      const centerX = nativeWidth / 2;
      const SNAP_ZONE = Math.round(nativeWidth * 0.008);
      const centerPt = activeObj.getCenterPoint();

      if (Math.abs(centerPt.x - centerX) < SNAP_ZONE) {
        activeObj.set({ left: (activeObj.left || 0) + (centerX - centerPt.x) });
      }

      // 3. Print Area & Placement Boundary Validation
      const br = activeObj.getBoundingRect(true, true);
      const tolerance = 6;
      let isOutOfBounds = false;

      if (isFreeModeRef.current) {
        const fz = freePrintZone;
        isOutOfBounds = 
          br.left < fz.left - tolerance || 
          (br.left + br.width) > (fz.left + fz.width + tolerance) ||
          br.top < fz.top - tolerance || 
          (br.top + br.height) > (fz.top + fz.height + tolerance);
      } else if (activeFaceSelectedPlacementsRef.current.length > 0) {
        let insidePlacement = false;
        for (const spec of activeFaceSelectedPlacementsRef.current) {
          const p = getPlacementFabricBounds(spec);
          const tol = 35;
          if (
            br.left >= p.fabricLeft - tol &&
            (br.left + br.width) <= p.fabricLeft + p.fabricWidth + tol &&
            br.top >= p.fabricTop - tol &&
            (br.top + br.height) <= p.fabricTop + p.fabricHeight + tol
          ) {
            insidePlacement = true;
            break;
          }
        }
        isOutOfBounds = !insidePlacement;
      }

      const scale = Math.max(1, initCanvas.getWidth() / 400);

      if (isOutOfBounds) {
        (activeObj.set as any)({
          borderColor: '#dc2626',
          cornerStrokeColor: '#dc2626',
          editingBorderColor: '#dc2626',
          cursorColor: '#dc2626',
          borderDashArray: [Math.round(8 * scale), Math.round(6 * scale)],
          borderScaleFactor: Math.max(2, Math.round(2.5 * scale)),
          padding: Math.round(10 * scale),
        });
        setIsObjectOutOfBounds(true);
      } else {
        (activeObj.set as any)({
          borderColor: '#2563EB',
          cornerStrokeColor: '#2563EB',
          editingBorderColor: '#2563EB',
          cursorColor: '#2563EB',
          borderDashArray: [Math.round(8 * scale), Math.round(6 * scale)],
          borderScaleFactor: Math.max(2, Math.round(2.5 * scale)),
          padding: Math.round(10 * scale),
        });
        setIsObjectOutOfBounds(false);
        setIsWarningDismissed(false);
      }
    };

    // Real-time hover detection over approved placement boxes during object drag
    const handleObjectMoving = (e: fabric.IEvent) => {
      const activeObj = e.target || initCanvas.getActiveObject();
      if (!activeObj) return;

      if (!isObjectDraggingRef.current) {
        isObjectDraggingRef.current = true;
        setIsObjectDragging(true);
      }

      if (!isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length > 0) {
        const centerPt = activeObj.getCenterPoint();
        let matchedPlacementId: string | null = null;

        for (const spec of activeFaceSelectedPlacementsRef.current) {
          const p = getPlacementFabricBounds(spec);
          if (
            centerPt.x >= p.fabricLeft - 40 &&
            centerPt.x <= p.fabricLeft + p.fabricWidth + 40 &&
            centerPt.y >= p.fabricTop - 40 &&
            centerPt.y <= p.fabricTop + p.fabricHeight + 40
          ) {
            matchedPlacementId = spec.id;
            break;
          }
        }

        if (matchedPlacementId !== hoveredPlacementIdRef.current) {
          hoveredPlacementIdRef.current = matchedPlacementId;
          setHoveredPlacementId(matchedPlacementId);
        }
      }

      validateAndSnap();
    };

    // Magnetic Snapping on drop into the nearest / hovered placement
    const handleObjectModified = (e: fabric.IEvent) => {
      const activeObj = e.target || initCanvas.getActiveObject();
      if (activeObj && !isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length > 0) {
        const centerPt = activeObj.getCenterPoint();
        let targetSpec: PlacementSpec | null = null;
        let isInsideTarget = false;

        for (const spec of activeFaceSelectedPlacementsRef.current) {
          const p = getPlacementFabricBounds(spec);
          const isInside =
            centerPt.x >= p.fabricLeft - 40 &&
            centerPt.x <= p.fabricLeft + p.fabricWidth + 40 &&
            centerPt.y >= p.fabricTop - 40 &&
            centerPt.y <= p.fabricTop + p.fabricHeight + 40;

          if (isInside) {
            targetSpec = spec;
            isInsideTarget = true;
            break;
          }
        }

        // If not directly inside, find closest within snap radius (250px)
        if (!targetSpec) {
          let minDistance = 250;
          for (const spec of activeFaceSelectedPlacementsRef.current) {
            const p = getPlacementFabricBounds(spec);
            const dist = Math.hypot(centerPt.x - p.fabricCenterX, centerPt.y - p.fabricCenterY);
            if (dist < minDistance) {
              minDistance = dist;
              targetSpec = spec;
            }
          }
        }

        if (targetSpec) {
          const p = getPlacementFabricBounds(targetSpec);
          const previousPlacementId = (activeObj as any).assignedPlacementId;

          // Only snap to center if switching placements or dropped from outside
          if (!previousPlacementId || previousPlacementId !== targetSpec.id || !isInsideTarget) {
            activeObj.set({
              originX: 'center',
              originY: 'center',
              left: p.fabricCenterX,
              top: p.fabricCenterY,
            });

            // Scale down if larger than placement bounds
            const maxW = p.fabricWidth * 0.9;
            const maxH = p.fabricHeight * 0.9;
            const curW = activeObj.getScaledWidth();
            const curH = activeObj.getScaledHeight();
            if (curW > maxW || curH > maxH) {
              const scaleFactor = Math.min(maxW / (activeObj.width || 1), maxH / (activeObj.height || 1));
              activeObj.scale(scaleFactor);
            }

            setToastNotification({
              type: 'success',
              text: locale === 'tr' ? `Tasarım ${targetSpec.nameTr} konumuna kilitlendi 🎯` :
                    locale === 'en' ? `Design snapped to ${targetSpec.nameEn} 🎯` :
                    `تم إدخال وتثبيت التصميم في: ${targetSpec.nameAr} 🎯`,
            });
          }

          (activeObj as any).assignedPlacementId = targetSpec.id;
          activeObj.setCoords();
          initCanvas.renderAll();
        }

        if (targetSpec) {
          setFocusedPlacementId(targetSpec.id);
        }
        hoveredPlacementIdRef.current = null;
        setHoveredPlacementId(null);
      }

      if (isObjectDraggingRef.current) {
        isObjectDraggingRef.current = false;
        setIsObjectDragging(false);
      }

      validateAndSnap();
      if (!isRestoring.current) {
        saveHistoryStateCanvas(initCanvas);
      }
    };

    initCanvas.on('object:moving', handleObjectMoving);
    initCanvas.on('object:scaling', validateAndSnap);
    initCanvas.on('object:modified', handleObjectModified);

    initCanvas.on('mouse:up', () => {
      if (isObjectDraggingRef.current) {
        isObjectDraggingRef.current = false;
        setIsObjectDragging(false);
      }
    });

    const handleSelectionFocus = (e: fabric.IEvent) => {
      const selected = (e as any).selected?.[0] || e.target;
      if (selected && (selected as any).assignedPlacementId) {
        setFocusedPlacementId((selected as any).assignedPlacementId);
      }
    };
    initCanvas.on('selection:created', handleSelectionFocus);
    initCanvas.on('selection:updated', handleSelectionFocus);
    initCanvas.on('object:added', (opt) => {
      if (!isRestoring.current && opt?.target?.name !== 'background' && opt?.target?.name !== 'mockup' && opt?.target?.name !== 'print_area_guide') {
        saveHistoryStateCanvas(initCanvas);
      }
    });
    initCanvas.on('object:removed', (opt) => {
      if (!isRestoring.current && opt?.target?.name !== 'background' && opt?.target?.name !== 'mockup' && opt?.target?.name !== 'print_area_guide') {
        saveHistoryStateCanvas(initCanvas);
      }
    });

    // 1. قراءة المسودة من الذاكرة مرة واحدة فقط عند تحميل الصفحة
    if (typeof window !== 'undefined' && !hasRestoredDraftRef.current && !designIdFromUrl) {
      try {
        const savedRaw = localStorage.getItem(storageKey);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (parsed?.faces) {
            facesData.current = parsed.faces; // استعادة جميع الأوجه للذاكرة
            if (parsed.selectedSize && !sizeFromUrl && !initialSize) setSelectedSize(parsed.selectedSize);
            if (parsed.selectedColor && !colorFromUrl && !initialColor) setSelectedColor(parsed.selectedColor);
            if (Array.isArray(parsed.variantMatrix) && parsed.variantMatrix.length > 0 && !quantityFromUrl && !initialQuantity) {
              setVariantMatrix(parsed.variantMatrix);
            }
            if (typeof parsed.totalOrderQuantity === 'number' && parsed.totalOrderQuantity > 0 && !quantityFromUrl && !initialQuantity) {
              setTotalOrderQuantity(parsed.totalOrderQuantity);
            }
            if (typeof parsed.totalPrice === 'number') setTotalPrice(parsed.totalPrice);
            if (parsed.priceBreakdown) setPriceBreakdown(parsed.priceBreakdown);
            if (parsed.placementsByColor && typeof parsed.placementsByColor === 'object') {
              setPlacementsByColor(parsed.placementsByColor);
            } else if (Array.isArray(parsed.selectedPlacementIds)) {
              const initialKey = normalizeColorKey(parsed.selectedColor || resolvedInitialColor);
              setPlacementsByColor({ [initialKey]: parsed.selectedPlacementIds });
            }
            if (typeof parsed.syncPlacementsAcrossColors === 'boolean') {
              setSyncPlacementsAcrossColors(parsed.syncPlacementsAcrossColors);
            }
            recalculatePrice(undefined, parsed.faces);
            console.log("📥 Draft memory loaded with matrix & pricing.");
          }
        }
      } catch (err) { console.warn("Memory read error:", err); }
      hasRestoredDraftRef.current = true; // إغلاق قفل القراءة من الـ localStorage
    }

    // 2. تحميل الوجه الحالي للون المحدد
    const currentTargetJson = getFaceJson(activeFace, selectedColor);
    if (currentTargetJson) {
      isRestoring.current = true;
      restoreTimer = setTimeout(() => {
        if (isDisposed || !initCanvas || !initCanvas.getContext() || !initCanvas.getElement()) {
           isRestoring.current = false;
           return;
        }
        try {
          let parsed = typeof currentTargetJson === 'string' ? JSON.parse(currentTargetJson) : currentTargetJson;
          if (parsed?.objects && Array.isArray(parsed.objects)) {
            parsed.objects.forEach((obj: any) => {
              if (obj.type === 'image') {
                obj.crossOrigin = 'anonymous';
              }
            });
          }
          initCanvas.loadFromJSON(parsed, () => {
            if (!isDisposed && initCanvas && initCanvas.getContext() && initCanvas.getElement()) {
              applyModernObjectStyles(initCanvas);
              initCanvas.renderAll();
              const initialJson = JSON.stringify(initCanvas.toJSON(SERIALIZE_PROPERTIES));
              historyRef.current = [initialJson];
              historyStepRef.current = 0;
              setCanUndo(false);
              setCanRedo(false);
              recalculatePrice(initCanvas);
              const currentKey = getFaceStateKey(activeFace, selectedColor);
              facesData.current[currentKey] = initialJson;
              console.log(`✅ Face [${activeFace}] for Color [${selectedColor}] rendered with ${parsed?.objects?.length || 0} objects.`);
            }
            isRestoring.current = false; // فتح قفل الحفظ بعد اكتمال الرسم
          });
        } catch (err) {
          console.error("Render fail:", err);
          isRestoring.current = false;
        }
      }, 100);
    } else {
      initCanvas.clear();
      initCanvas.backgroundColor = 'transparent';
      initCanvas.renderAll();
      const initialJson = JSON.stringify(initCanvas.toJSON(SERIALIZE_PROPERTIES));
      historyRef.current = [initialJson];
      historyStepRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
      isRestoring.current = false; // إذا كان الوجه جديداً تماماً
      recalculatePrice(initCanvas);
    }

    setCanvas(initCanvas);

    return () => {
      // حفظ سريع للوجه واللون الحالي قبل إغلاقه
      if (!isDisposed && initCanvas && !isRestoring.current) {
        try {
          const json = JSON.stringify(initCanvas.toJSON(['id', 'name', 'selectable', 'src', 'originalAssetId', 'crossOrigin', 'isCustomUpload', 'assetName', 'assetPrice']));
          const currentKey = getFaceStateKey(activeFace, selectedColor);
          facesData.current[currentKey] = json;
        } catch (e) {}
      }

      isDisposed = true;
      isRestoring.current = true; // منع الحفظ أثناء التدمير
      if (restoreTimer) clearTimeout(restoreTimer);
      try { initCanvas.dispose(); } catch(e) {}
    };
  }, [activeFace, selectedColor]); // Re-initialize when active face or color changes

  const SERIALIZE_PROPERTIES = [
    'id', 'name', 'selectable', 'src', 'originalAssetId', 'crossOrigin',
    'isCustomUpload', 'assetName', 'assetPrice', 'fontSize', 'fontFamily',
    'fontWeight', 'fontStyle', 'underline', 'fill', 'stroke', 'strokeWidth',
    'textAlign', 'lineHeight', 'charSpacing', 'opacity', 'scaleX', 'scaleY',
    'angle', 'left', 'top', 'width', 'height', 'flipX', 'flipY'
  ];

  const applyModernObjectStyles = (targetCanvas: fabric.Canvas) => {
    applyCustomModernStyles(targetCanvas);
  };

  const saveHistoryStateCanvas = (c: fabric.Canvas) => {
    if (!c || isRestoring.current) return;
    const json = JSON.stringify(c.toJSON(SERIALIZE_PROPERTIES));
    
    const currentIdx = historyStepRef.current;
    if (currentIdx >= 0 && historyRef.current[currentIdx] === json) {
      return;
    }

    const nextHistory = historyRef.current.slice(0, currentIdx + 1);
    nextHistory.push(json);

    if (nextHistory.length > 50) {
      nextHistory.shift();
    }

    historyRef.current = nextHistory;
    historyStepRef.current = nextHistory.length - 1;

    setCanUndo(historyStepRef.current > 0);
    setCanRedo(false);

    const currentKey = getFaceStateKey(activeFaceRef.current, selectedColorRef.current);
    facesData.current[currentKey] = json;

    if (syncAllColorsRef.current && uniqueSelectedColors.length > 1) {
      uniqueSelectedColors.forEach((otherColor: string) => {
        if (!isColorEqual(otherColor, selectedColorRef.current)) {
          const mirrorKey = getFaceStateKey(activeFaceRef.current, otherColor);
          facesData.current[mirrorKey] = json;
        }
      });
    }

    recalculatePrice(c);
    saveDraft(c);
  };

  const saveHistoryState = () => {
    if (canvas) saveHistoryStateCanvas(canvas);
  };

  const clearDraft = () => {
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = 'transparent';
    canvas.renderAll();
    recalculatePrice(canvas);
    saveHistoryStateCanvas(canvas);
    showToast(t('clearDraft'), 'info');
  };

  const checkObjectBounds = useCallback((targetCanvas?: fabric.Canvas | null) => {
    const c = targetCanvas || canvas;
    if (!c) return;
    const activeObj = c.getActiveObject();
    if (!activeObj) {
      setIsObjectOutOfBounds(false);
      return;
    }
    const br = activeObj.getBoundingRect(true, true);
    const tolerance = 2;
    const isOutOfBounds = 
      br.left < -tolerance || 
      (br.left + br.width) > (currentPrintArea.width + tolerance) ||
      br.top < -tolerance || 
      (br.top + br.height) > (currentPrintArea.height + tolerance);

    const scale = Math.max(1, c.getWidth() / 400);

    if (isOutOfBounds) {
      (activeObj.set as any)({
        borderColor: '#EF4444',
        borderDashArray: [Math.round(8 * scale), Math.round(6 * scale)],
        borderScaleFactor: Math.max(2, Math.round(2.5 * scale)),
        padding: Math.round(10 * scale),
      });
      setIsObjectOutOfBounds(true);
    } else {
      (activeObj.set as any)({
        borderColor: '#2563EB',
        borderDashArray: [Math.round(8 * scale), Math.round(6 * scale)],
        borderScaleFactor: Math.max(2, Math.round(2.5 * scale)),
        padding: Math.round(10 * scale),
      });
      setIsObjectOutOfBounds(false);
      setIsWarningDismissed(false);
    }
  }, [canvas, currentPrintArea.width, currentPrintArea.height]);

  const undo = useCallback(() => {
    if (!canvas || !canvas.getContext() || !canvas.getElement() || isRestoring.current || historyStepRef.current <= 0) return;
    
    const prevIdx = historyStepRef.current - 1;
    const targetJson = historyRef.current[prevIdx];
    if (!targetJson) return;

    isRestoring.current = true;
    historyStepRef.current = prevIdx;
    setCanUndo(prevIdx > 0);
    setCanRedo(true);

    try {
      canvas.loadFromJSON(targetJson, () => {
        if (canvas && canvas.getContext() && canvas.getElement()) {
          applyModernObjectStyles(canvas);
          canvas.renderAll();
          recalculatePrice(canvas);
          const currentKey = getFaceStateKey(activeFace, selectedColor);
          facesData.current[currentKey] = targetJson;

          if (syncAllColorsRef.current && uniqueSelectedColors.length > 1) {
            uniqueSelectedColors.forEach((otherColor: string) => {
              if (!isColorEqual(otherColor, selectedColor)) {
                const mirrorKey = getFaceStateKey(activeFace, otherColor);
                facesData.current[mirrorKey] = targetJson;
              }
            });
          }

          saveDraft(canvas);
          checkObjectBounds(canvas);
        }
        isRestoring.current = false;
      });
    } catch (e) {
      console.error("Undo error:", e);
      isRestoring.current = false;
    }
  }, [canvas, activeFace, selectedColor, getFaceStateKey, uniqueSelectedColors, recalculatePrice, saveDraft, checkObjectBounds]);

  const redo = useCallback(() => {
    if (!canvas || !canvas.getContext() || !canvas.getElement() || isRestoring.current || historyStepRef.current >= historyRef.current.length - 1) return;
    
    const nextIdx = historyStepRef.current + 1;
    const targetJson = historyRef.current[nextIdx];
    if (!targetJson) return;

    isRestoring.current = true;
    historyStepRef.current = nextIdx;
    setCanUndo(true);
    setCanRedo(nextIdx < historyRef.current.length - 1);

    try {
      canvas.loadFromJSON(targetJson, () => {
        if (canvas && canvas.getContext() && canvas.getElement()) {
          applyModernObjectStyles(canvas);
          canvas.renderAll();
          recalculatePrice(canvas);
          const currentKey = getFaceStateKey(activeFace, selectedColor);
          facesData.current[currentKey] = targetJson;

          if (syncAllColorsRef.current && uniqueSelectedColors.length > 1) {
            uniqueSelectedColors.forEach((otherColor: string) => {
              if (!isColorEqual(otherColor, selectedColor)) {
                const mirrorKey = getFaceStateKey(activeFace, otherColor);
                facesData.current[mirrorKey] = targetJson;
              }
            });
          }

          saveDraft(canvas);
          checkObjectBounds(canvas);
        }
        isRestoring.current = false;
      });
    } catch (e) {
      console.error("Redo error:", e);
      isRestoring.current = false;
    }
  }, [canvas, activeFace, selectedColor, getFaceStateKey, uniqueSelectedColors, recalculatePrice, saveDraft, checkObjectBounds]);

  // Global Keyboard Shortcuts for Undo/Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            e.preventDefault();
            redo();
          } else {
            e.preventDefault();
            undo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const switchFace = useCallback((face: string) => {
    if (face === activeFace) return;
    if (canvas && !isRestoring.current) {
      try {
        const json = JSON.stringify(canvas.toJSON(SERIALIZE_PROPERTIES));
        const currentKey = getFaceStateKey(activeFace, selectedColor);
        facesData.current[currentKey] = json;
      } catch (e) {}
    }
    setActiveFace(face);
  }, [canvas, activeFace, selectedColor, getFaceStateKey]);

  const handleTogglePlacement = useCallback((placement: PlacementSpec) => {
    const targetFace = placement.targetFace;

    setPlacementsByColor(prev => {
      const currentList = syncPlacementsAcrossColorsRef.current
        ? (prev['__synced__'] || prev[activeColorKey] || [])
        : (prev[activeColorKey] || []);

      const exists = currentList.includes(placement.id);
      const updatedList = exists
        ? currentList.filter(id => id !== placement.id)
        : [...currentList, placement.id];

      if (syncPlacementsAcrossColorsRef.current) {
        const nextMap: Record<string, string[]> = {
          ...prev,
          ['__synced__']: updatedList,
          [activeColorKey]: updatedList,
        };
        availableColors.forEach((c: string) => {
          nextMap[normalizeColorKey(c)] = updatedList;
        });
        uniqueSelectedColors.forEach((c: string) => {
          nextMap[normalizeColorKey(c)] = updatedList;
        });
        return nextMap;
      } else {
        return {
          ...prev,
          [activeColorKey]: updatedList,
        };
      }
    });

    const wasSelected = currentSelectedPlacementIds.includes(placement.id);
    setFocusedPlacementId(placement.id);
    if (!wasSelected) {
      if (targetFace && !isFaceMatching(targetFace, activeFace)) {
        switchFace(targetFace);
      }
    }

    if (canvas) {
      const activeObj = canvas.getActiveObject();
      if (activeObj && !wasSelected) {
        const pBounds = getPlacementFabricBounds(placement);
        activeObj.set({
          originX: 'center',
          originY: 'center',
          left: pBounds.fabricCenterX,
          top: pBounds.fabricCenterY,
        });
        (activeObj as any).assignedPlacementId = placement.id;
        activeObj.setCoords();
        canvas.requestRenderAll();
      }
    }
  }, [activeColorKey, activeFace, canvas, currentSelectedPlacementIds, switchFace, availableColors, uniqueSelectedColors, normalizeColorKey]);

  const handleToggleSyncPlacements = useCallback(() => {
    setSyncPlacementsAcrossColors(prev => {
      const next = !prev;
      if (next) {
        // Propagate current color's placements to all colors
        const currentList = placementsByColor[activeColorKey] || [];
        setPlacementsByColor(oldMap => {
          const newMap: Record<string, string[]> = {
            ...oldMap,
            ['__synced__']: currentList,
          };
          availableColors.forEach((c: string) => {
            newMap[normalizeColorKey(c)] = currentList;
          });
          uniqueSelectedColors.forEach((c: string) => {
            newMap[normalizeColorKey(c)] = currentList;
          });
          return newMap;
        });
      }
      return next;
    });
  }, [activeColorKey, placementsByColor, availableColors, uniqueSelectedColors, normalizeColorKey]);

  const handleApplyToAllColors = useCallback(() => {
    const currentList = placementsByColor[activeColorKey] || [];
    setPlacementsByColor(oldMap => {
      const newMap: Record<string, string[]> = {
        ...oldMap,
        ['__synced__']: currentList,
      };
      availableColors.forEach((c: string) => {
        newMap[normalizeColorKey(c)] = currentList;
      });
      uniqueSelectedColors.forEach((c: string) => {
        newMap[normalizeColorKey(c)] = currentList;
      });
      return newMap;
    });
    showToast(
      locale === 'tr' ? 'Konumlar tüm renklere uygulandı' : locale === 'en' ? 'Placements copied to all colors' : 'تم تعميم مواضع هذا اللون على كافة الألوان',
      'success'
    );
  }, [activeColorKey, placementsByColor, availableColors, uniqueSelectedColors, normalizeColorKey, showToast, locale]);

  const handleClearPlacements = useCallback(() => {
    setPlacementsByColor(prev => ({
      ...prev,
      [activeColorKey]: [],
      ['__synced__']: [],
    }));
  }, [activeColorKey]);

  const switchColor = useCallback((newColor: string) => {
    if (isColorEqual(selectedColor, newColor)) return;

    if (canvas && !isRestoring.current) {
      try {
        const json = JSON.stringify(canvas.toJSON(SERIALIZE_PROPERTIES));
        const currentKey = getFaceStateKey(activeFace, selectedColor);
        facesData.current[currentKey] = json;
      } catch (e) {}
    }

    if (syncAllColorsRef.current) {
      propagateDesignToAllColors();
    }

    setSelectedColor(newColor);

    // If single item, update its color. If multi-item matrix, preserve it!
    setVariantMatrix(prev => {
      if (!prev || prev.length <= 1) {
        return [{ color: newColor, size: selectedSize, quantity: totalOrderQuantity || 1 }];
      }
      return prev;
    });

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('color', newColor);
      window.history.replaceState(null, '', url.toString());
    }
  }, [canvas, activeFace, selectedColor, selectedSize, totalOrderQuantity, getFaceStateKey, propagateDesignToAllColors]);

  const addText = () => {
    if (!canvas) return;
    const txt = t('newText', { fallback: 'نصك هنا' });
    const isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(txt);
    const marginPx = Math.max(8, Math.round(currentPrintArea.width * 0.03));
    const targetTextWidth = Math.max(80, currentPrintArea.width - (marginPx * 2));
    
    // إنشاء نص تفاعلي بخط عريض وواضح
    const text = new fabric.IText(txt, {
      fontFamily: 'Cairo, Arial, sans-serif',
      fill: '#000000',
      fontSize: 40,
      fontWeight: 'bold',
      direction: isRtl ? 'rtl' : 'ltr',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      cursorWidth: 4,
      cursorColor: '#2563EB',
    } as any);

    let targetLeft = freePrintZone.left + freePrintZone.width / 2;
    let targetTop = freePrintZone.top + freePrintZone.height / 2;
    let assignedPlacementId: string | undefined = undefined;
    (text as any).__alreadyPositioned = true;

    if (!isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length > 0) {
      const existingObjects = canvas.getObjects().filter(o => o.name !== 'background' && o.name !== 'mockup' && o.name !== 'print_area_guide');
      let targetPlacement = activeFaceSelectedPlacementsRef.current[0];
      for (const spec of activeFaceSelectedPlacementsRef.current) {
        const bounds = getPlacementFabricBounds(spec);
        const hasObj = existingObjects.some(o => {
          const pt = o.getCenterPoint();
          return (
            pt.x >= bounds.fabricLeft &&
            pt.x <= bounds.fabricLeft + bounds.fabricWidth &&
            pt.y >= bounds.fabricTop &&
            pt.y <= bounds.fabricTop + bounds.fabricHeight
          );
        });
        if (!hasObj) {
          targetPlacement = spec;
          break;
        }
      }

      const pBounds = getPlacementFabricBounds(targetPlacement);
      targetLeft = pBounds.fabricCenterX;
      targetTop = pBounds.fabricCenterY;
      assignedPlacementId = targetPlacement.id;

      const maxTextW = pBounds.fabricWidth * 0.85;
      const maxTextH = pBounds.fabricHeight * 0.45;
      text.scaleToWidth(Math.min(targetTextWidth, maxTextW));
      if (text.getScaledHeight() > maxTextH) {
        text.scaleToHeight(maxTextH);
      }
    } else {
      const maxTextW = freePrintZone.width * 0.85;
      const maxTextH = freePrintZone.height * 0.35;
      text.scaleToWidth(Math.min(targetTextWidth, maxTextW));
      if (text.getScaledHeight() > maxTextH) {
        text.scaleToHeight(maxTextH);
      }
    }

    text.set({
      left: targetLeft,
      top: targetTop,
      originX: 'center',
      originY: 'center',
    });
    if (assignedPlacementId) {
      (text as any).assignedPlacementId = assignedPlacementId;
    }

    canvas.add(text);
    canvas.setActiveObject(text);
    text.setCoords();
    applyCustomModernStyles(canvas);
    canvas.renderAll();
    saveHistoryState();
  };

  const handleAutoFitActiveObject = () => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;

    let targetLeft = freePrintZone.left;
    let targetTop = freePrintZone.top;
    let targetW = freePrintZone.width;
    let targetH = freePrintZone.height;

    if (!isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length > 0) {
      const assignedId = (obj as any).assignedPlacementId || focusedPlacementId;
      const activeSpec = activeFaceSelectedPlacementsRef.current.find(s => s.id === assignedId) || activeFaceSelectedPlacementsRef.current[0];
      const p = getPlacementFabricBounds(activeSpec);
      targetLeft = p.fabricLeft;
      targetTop = p.fabricTop;
      targetW = p.fabricWidth;
      targetH = p.fabricHeight;
    }

    const maxW = targetW * 0.9;
    const maxH = targetH * 0.9;
    const objW = obj.getScaledWidth();
    const objH = obj.getScaledHeight();

    if (objW > maxW || objH > maxH) {
      const scaleFactor = Math.min(maxW / (obj.width || 1), maxH / (obj.height || 1));
      obj.scale(scaleFactor);
    }

    obj.set({
      originX: 'center',
      originY: 'center',
      left: targetLeft + targetW / 2,
      top: targetTop + targetH / 2,
    });
    obj.setCoords();

    applyCustomModernStyles(canvas);

    setIsObjectOutOfBounds(false);
    canvas.requestRenderAll();
    canvas.renderAll();
    saveHistoryState();
  };

  const addSticker = (url: string, asset?: { id?: string; name?: string; price?: number; category?: string }) => {
    if (!canvas) return;
    recordRecentAsset(url, asset);
    loadFabricImage(
      url,
      (img) => {
        (img as any).set({
          name: 'sticker',
          originalAssetId: asset?.id || url,
          src: url,
          assetName: asset?.name,
          assetPrice: typeof asset?.price === 'number' ? asset.price : 0,
        });
        prepareAndAddObject(img);
        saveHistoryState();
      },
      (err) => {
        console.error("Error loading sticker:", err);
      }
    );
  };

  const processImageFile = async (file: File) => {
    if (!canvas) return;

    // 1. Check MIME Type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      alert(t('invalidFileType', { fallback: 'Invalid file type. Please upload PNG, JPG, WEBP, or SVG.' }));
      return;
    }

    // 2. Client-side Smart Optimization for large files (> 9.5MB / 20MB+)
    let fileToProcess = file;
    if (file.size > 9.5 * 1024 * 1024) {
      showToast(t('optimizingImage', { fallback: 'جاري تحسين وضغط الصورة...' }), 'info');
      fileToProcess = await optimizeImageForUpload(file);
    }

    // 3. Client-side Image Analysis before upload
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const imgObj = new Image();
      imgObj.onload = async () => {
        const width = imgObj.width;
        const height = imgObj.height;
        const maxDim = Math.max(width, height);
        
        // Quality Engine Logic
        let status = t('qualityUnsuitable');
        let message = t('qualityUnsuitableDesc');
        let color = 'bg-red-50 border-red-200 text-red-700';

        if (maxDim > 2000) {
          status = t('qualityExcellent');
          message = t('qualityExcellentDesc');
          color = 'bg-green-50 border-green-200 text-green-700';
        } else if (maxDim > 1000) {
          status = t('qualityGood');
          message = t('qualityGoodDesc');
          color = 'bg-yellow-50 border-yellow-200 text-yellow-700';
        } else if (maxDim > 500) {
          status = t('qualityLow');
          message = t('qualityLowDesc');
          color = 'bg-orange-50 border-orange-200 text-orange-700';
        }

        // Format specific advice
        if (fileToProcess.type === 'image/png') {
          message += t('transparentBgNote');
        } else if (fileToProcess.type === 'image/jpeg' || fileToProcess.type === 'image/jpg') {
          message += t('jpegBgNote');
        }

        setImageQualityReport({ status, message, color });
        
        // Auto dismiss after 10 seconds
        setTimeout(() => setImageQualityReport(null), 10000);

        // 4. Optimistic Canvas Rendering (Immediately show image on canvas)
        let canvasObjectRef: fabric.Object | null = null;
        loadFabricImage(dataUrl, (fabricImg) => {
          (fabricImg as any).set({ 
            name: 'user_upload', 
            originalAssetId: dataUrl,
            crossOrigin: 'anonymous',
            isCustomUpload: true
          });
          prepareAndAddObject(fabricImg);
          canvasObjectRef = fabricImg;
          saveHistoryState();
        });

        // 5. Background Cloud Upload
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', fileToProcess);

        try {
          const response = await fetch('/api/upload', { method: 'POST', body: formData });
          const data = await response.json();
          if (data.url) {
            const httpsUrl = (data.url as string).replace('http://', 'https://');
            if (canvasObjectRef) {
              const imgObj = canvasObjectRef as fabric.Image;
              
              // استبدال الـ Base64 بالرابط القصير السحابي
              if (imgObj.setSrc) {
                imgObj.setSrc(httpsUrl, () => {
                  (imgObj as any).set({
                    originalAssetId: httpsUrl,
                    crossOrigin: 'anonymous'
                  });
                  canvas?.renderAll();
                  saveDraft(canvas); // إجبار الحفظ التلقائي بالرابط الجديد لتخفيف حجم الذاكرة
                }, { crossOrigin: 'anonymous' });
              } else {
                (imgObj as any).set({
                  src: httpsUrl,
                  originalAssetId: httpsUrl,
                  crossOrigin: 'anonymous'
                });
                canvas?.renderAll();
                saveDraft(canvas);
              }
            }

            // Record in persistent user uploads
            recordUserUpload(httpsUrl, fileToProcess.name, fileToProcess.size);
          }
        } catch (error) {
          console.warn("Background upload warning (local dataURL retained):", error);
        } finally {
          setIsUploading(false);
        }
      };
      imgObj.src = dataUrl;
    };
    reader.readAsDataURL(fileToProcess);
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !canvas) return;
    const file = e.target.files[0];
    await processImageFile(file);
    e.target.value = '';
  };

  // Listen for top quick-actions external upload trigger & open gallery modal
  useEffect(() => {
    const handleExternalUpload = (e: any) => {
      if (e.detail?.file) {
        processImageFile(e.detail.file);
      }
    };
    const handleOpenGallery = () => {
      setIsGalleryModalOpen(true);
    };

    window.addEventListener('STUDIO_EXTERNAL_UPLOAD_FILE', handleExternalUpload);
    window.addEventListener('STUDIO_OPEN_GALLERY_MODAL', handleOpenGallery);
    return () => {
      window.removeEventListener('STUDIO_EXTERNAL_UPLOAD_FILE', handleExternalUpload);
      window.removeEventListener('STUDIO_OPEN_GALLERY_MODAL', handleOpenGallery);
    };
  }, [canvas]);

  const deleteSelected = () => {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
      canvas.discardActiveObject();
      activeObjects.forEach(obj => canvas.remove(obj));
      canvas.requestRenderAll();
      saveHistoryState();
    }
  };

  // 1. Data Extraction & Print-on-Demand Payload Utility
  const exportDesignData = async () => {
    if (!canvas) return null;
    
    try {
      // 1. Deselect objects so bounding box, blue borders, and handles are never in the print or mockup files
      canvas.discardActiveObject();
      canvas.renderAll();

      // 2. Extract JSON state with all vector, image, color, font, position, scale, and angle parameters
      const jsonState = canvas.toJSON(['id', 'name', 'selectable', 'originalAssetId', 'crossOrigin']);

      // 3. Generate Transparent Print-Ready PNG (Optimized Multiplier: 2 to prevent mobile RAM freeze / OOM)
      let fullCanvasDataUrl = '';
      try {
        fullCanvasDataUrl = canvas.toDataURL({
          format: 'png',
          multiplier: 2,
          enableRetinaScaling: false
        });
      } catch (taintErr) {
        console.warn("Canvas high-res export taint/memory fallback:", taintErr);
        try {
          fullCanvasDataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
        } catch {
          fullCanvasDataUrl = '';
        }
      }

      // Print-Ready Graphic (Full high-res transparent artwork 1:1 with garment space)
      const printReadyImage = fullCanvasDataUrl;

      // 4. Generate Photorealistic Mockup Composite JPEG (Clean 1:1 overlay with garment image)
      let mockupImage = '';
      const mockupUrl = getFaceMockupForColor(activeFace, selectedColor);
      if (mockupUrl) {
        mockupImage = await new Promise<string>((resolve) => {
          const mockupImg = new Image();
          mockupImg.crossOrigin = 'anonymous';
          mockupImg.onload = () => {
            try {
              const maxDim = 1200;
              let width = mockupImg.naturalWidth || 1000;
              let height = mockupImg.naturalHeight || 1000;
              if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
              }

              const offCanvas = document.createElement('canvas');
              offCanvas.width = width;
              offCanvas.height = height;
              const ctx = offCanvas.getContext('2d');
              if (!ctx) {
                resolve(printReadyImage || '');
                return;
              }

              ctx.drawImage(mockupImg, 0, 0, width, height);

              if (fullCanvasDataUrl) {
                const designImg = new Image();
                designImg.crossOrigin = 'anonymous';
                designImg.onload = () => {
                  ctx.drawImage(designImg, 0, 0, width, height);
                  resolve(offCanvas.toDataURL('image/jpeg', 0.88));
                };
                designImg.onerror = () => resolve(fullCanvasDataUrl);
                designImg.src = fullCanvasDataUrl;
              } else {
                resolve(offCanvas.toDataURL('image/jpeg', 0.88));
              }
            } catch {
              resolve(fullCanvasDataUrl || '');
            }
          };
          mockupImg.onerror = () => resolve(printReadyImage || '');
          mockupImg.src = mockupUrl;
        });
      } else {
        mockupImage = printReadyImage;
      }

      const payload = {
        productId,
        face: activeFace,
        size: selectedSize,
        color: selectedColor,
        jsonState,
        mockupImage,
        printReadyImage,
        printArea: currentPrintArea,
        createdAt: new Date().toISOString()
      };

      console.log("🚀 [PRINT_PAYLOAD_GENERATED]:", {
        productId: payload.productId,
        face: payload.face,
        size: payload.size,
        color: payload.color,
        jsonObjectsCount: jsonState?.objects?.length || 0,
        mockupImagePreview: mockupImage ? `${mockupImage.substring(0, 40)}... (${Math.round(mockupImage.length / 1024)} KB)` : 'none',
        printReadyImagePreview: printReadyImage ? `${printReadyImage.substring(0, 40)}... (${Math.round(printReadyImage.length / 1024)} KB)` : 'none',
        printArea: payload.printArea,
        fullPayload: payload
      });

      return payload;
    } catch (exportErr) {
      console.error("Design Save Error Details (exportDesignData):", exportErr);
      return null;
    }
  };

  const handlePreview = async () => {
    if (!canvas) return;
    setIsPreviewLoading(true);
    try {
      const data = await exportDesignData();
      if (data?.mockupImage) {
        setPreviewImage(data.mockupImage);
      }
    } catch (err) {
      console.error("Preview Generation Error:", err);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const closePreviewModal = () => {
    setPreviewImage(null);
    setModalZoom(1);
    setModalPan({ x: 0, y: 0 });
  };

  const handleModalTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      modalTouchDistRef.current = dist;
    } else if (e.touches.length === 1 && modalZoom > 1) {
      isModalDraggingRef.current = true;
      modalLastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleModalTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && modalTouchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / modalTouchDistRef.current;
      setModalZoom(prev => Math.min(4, Math.max(1, parseFloat((prev * factor).toFixed(2)))));
      modalTouchDistRef.current = dist;
    } else if (e.touches.length === 1 && isModalDraggingRef.current && modalZoom > 1) {
      const dx = e.touches[0].clientX - modalLastTouchPosRef.current.x;
      const dy = e.touches[0].clientY - modalLastTouchPosRef.current.y;
      setModalPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      modalLastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleModalTouchEnd = () => {
    modalTouchDistRef.current = null;
    isModalDraggingRef.current = false;
  };

  const handleModalMouseDown = (e: React.MouseEvent) => {
    if (modalZoom > 1) {
      isModalDraggingRef.current = true;
      modalLastTouchPosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleModalMouseMove = (e: React.MouseEvent) => {
    if (isModalDraggingRef.current && modalZoom > 1) {
      const dx = e.clientX - modalLastTouchPosRef.current.x;
      const dy = e.clientY - modalLastTouchPosRef.current.y;
      setModalPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      modalLastTouchPosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleModalMouseUp = () => {
    isModalDraggingRef.current = false;
  };

  const handleModalWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      setModalZoom(prev => Math.min(4, parseFloat((prev + 0.25).toFixed(2))));
    } else {
      setModalZoom(prev => {
        const next = Math.max(1, parseFloat((prev - 0.25).toFixed(2)));
        if (next === 1) setModalPan({ x: 0, y: 0 });
        return next;
      });
    }
  };

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const generateFaceMockupPreview = async (
    faceName: string,
    faceJsonStr: string,
    productMockupUrl?: string,
    facePrintArea?: any
  ): Promise<string> => {
    try {
      const parsed = typeof faceJsonStr === 'string' ? JSON.parse(faceJsonStr) : faceJsonStr;
      const userObjs = (parsed?.objects || []).filter((obj: any) => {
        if (!obj || !obj.type) return false;
        const name = (obj.name || '').toLowerCase();
        return name !== 'background' && name !== 'mockup' && name !== 'print_area_guide' && name !== 'guideline';
      });

      // If face has no user objects, return the clean garment mockup image
      if (userObjs.length === 0) {
        return productMockupUrl || '';
      }

      const facePrintArea = configFaces[faceName]?.printArea;
      const fnw = facePrintArea?.nativeWidth || nativeWidth;
      const fnh = facePrintArea?.nativeHeight || nativeHeight;

      // Render design inside offscreen canvas 1:1 with garment space
      const offscreenEl = document.createElement('canvas');
      offscreenEl.width = fnw;
      offscreenEl.height = fnh;
      const staticCanvas = new fabric.StaticCanvas(offscreenEl, {
        width: fnw,
        height: fnh,
        backgroundColor: 'transparent'
      });

      await new Promise<void>((resolve) => {
        staticCanvas.loadFromJSON(parsed, () => {
          resolve();
        });
      });

      staticCanvas.getObjects().forEach((obj: any) => {
        const name = (obj.name || '').toLowerCase();
        if (name === 'background' || name === 'mockup' || name === 'print_area_guide' || name === 'guideline') {
          staticCanvas.remove(obj);
        }
      });
      staticCanvas.renderAll();

      let printDataUrl = '';
      try {
        printDataUrl = staticCanvas.toDataURL({ format: 'png', multiplier: 1 });
      } catch {
        printDataUrl = '';
      }
      staticCanvas.dispose();

      if (!productMockupUrl) {
        return printDataUrl;
      }

      // Composite Garment Mockup Image + Rendered Design 1:1
      return await new Promise<string>((resolve) => {
        const mockupImg = new Image();
        mockupImg.crossOrigin = 'anonymous';
        mockupImg.onload = () => {
          try {
            const maxDim = 1200;
            let bgWidth = mockupImg.naturalWidth || 800;
            let bgHeight = mockupImg.naturalHeight || 800;
            if (bgWidth > maxDim || bgHeight > maxDim) {
              const ratio = Math.min(maxDim / bgWidth, maxDim / bgHeight);
              bgWidth = Math.round(bgWidth * ratio);
              bgHeight = Math.round(bgHeight * ratio);
            }

            const compositeCanvas = document.createElement('canvas');
            compositeCanvas.width = bgWidth;
            compositeCanvas.height = bgHeight;
            const ctx = compositeCanvas.getContext('2d');
            if (!ctx) {
              resolve(printDataUrl || '');
              return;
            }

            ctx.drawImage(mockupImg, 0, 0, bgWidth, bgHeight);

            if (printDataUrl) {
              const printImg = new Image();
              printImg.crossOrigin = 'anonymous';
              printImg.onload = () => {
                ctx.drawImage(printImg, 0, 0, bgWidth, bgHeight);
                resolve(compositeCanvas.toDataURL('image/jpeg', 0.88));
              };
              printImg.onerror = () => resolve(printDataUrl);
              printImg.src = printDataUrl;
            } else {
              resolve(compositeCanvas.toDataURL('image/jpeg', 0.88));
            }
          } catch {
            resolve(printDataUrl || '');
          }
        };
        mockupImg.onerror = () => resolve(printDataUrl || '');
        mockupImg.src = productMockupUrl;
      });
    } catch (err) {
      console.warn("generateFaceMockupPreview error for face:", faceName, err);
      return '';
    }
  };

  // Auth and Save Handlers
  
  const onAuthSuccess = () => {
    if (pendingAction) {
      executeAction(pendingAction);
      setPendingAction(null);
    }
  };

  const executeAction = async (action: 'save' | 'cart' | 'buy_now') => {
    if (!canvas) return;
    if (isUploading) {
      showToast(t('waitUpload', { fallback: 'جاري رفع الصور، يرجى الانتظار...' }), 'info');
      return;
    }
    setIsSaving(true);
    
    try {
      // Save current face & color state
      const currentSaveKey = getFaceStateKey(activeFace, selectedColor);
      facesData.current[currentSaveKey] = JSON.stringify(canvas.toJSON(['name', 'originalAssetId']));
      
      // Filter out empty faces from payload
      const filteredFacesData: Record<string, string> = {};
      Object.entries(facesData.current).forEach(([stateKey, jsonStr]) => {
        try {
          const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          const userObjs = (parsed?.objects || []).filter((obj: any) => {
            if (!obj || !obj.type) return false;
            const name = (obj.name || '').toLowerCase();
            return name !== 'background' && name !== 'mockup' && name !== 'print_area_guide' && name !== 'guideline';
          });
          if (userObjs.length > 0) {
            filteredFacesData[stateKey] = typeof jsonStr === 'string' ? jsonStr : JSON.stringify(jsonStr);
          }
        } catch {}
      });

      // 1. إنشاء نسخة نظيفة من بيانات الأوجه وتطهير أي Base64 لتجنب خطأ 1MB في Firestore
      const cleanFacesData: Record<string, string> = {};
      const targetFaces = Object.keys(filteredFacesData).length > 0 ? filteredFacesData : facesData.current;

      Object.entries(targetFaces).forEach(([stateKey, jsonStr]) => {
        try {
          let faceObj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          
          if (faceObj && faceObj.objects && Array.isArray(faceObj.objects)) {
            faceObj.objects = faceObj.objects.map((obj: any) => {
              if (obj.type === 'image' && obj.src && typeof obj.src === 'string' && obj.src.startsWith('data:image/')) {
                // استبدال الـ Base64 الطويل بالرابط السحابي الأصلي لتخفيف حجم الوثيقة
                obj.src = (obj.originalAssetId && obj.originalAssetId.startsWith('http')) ? obj.originalAssetId : "";
              }
              return obj;
            });
          }
          cleanFacesData[stateKey] = JSON.stringify(faceObj);
        } catch (e) {
          cleanFacesData[stateKey] = typeof jsonStr === 'string' ? jsonStr : JSON.stringify(jsonStr);
        }
      });

      // 2. الفلتر النووي: مسح أي Base64 طويل (data:image/...;base64,...) من الـ JSON بالكامل دون إفساد علامات التنصيص
      const rawCanvasJsonString = JSON.stringify(cleanFacesData);
      const cleanCanvasJsonString = rawCanvasJsonString
        .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]{100,}/g, '')
        .replace(/""""/g, '""');

      // 3. Generate preview images for all designed faces & colors
      const previewImagesByFace: Record<string, string> = {};

      for (const [stateKey, jsonContent] of Object.entries(cleanFacesData)) {
        try {
          let faceDataUrl = '';
          let faceName = stateKey;
          let faceColor = selectedColor;
          if (stateKey.includes(':::')) {
            const parts = stateKey.split(':::');
            faceColor = parts[0];
            faceName = parts[1];
          }

          if (faceName === activeFace && isColorEqual(faceColor, selectedColor)) {
            const printPayload = await exportDesignData();
            faceDataUrl = printPayload?.mockupImage || printPayload?.printReadyImage || '';
          } else {
            const faceMockup = getFaceMockupForColor(faceName, faceColor);
            const faceArea = configFaces[faceName]?.printArea || currentPrintArea;
            faceDataUrl = await generateFaceMockupPreview(faceName, jsonContent, faceMockup, faceArea);
          }

          if (faceDataUrl && faceDataUrl.startsWith('data:image/')) {
            try {
              const blob = dataURLtoBlob(faceDataUrl);
              const formData = new FormData();
              formData.append('file', blob, `preview-${stateKey.replace(':::', '-')}.jpg`);
              const response = await fetch('/api/upload', { method: 'POST', body: formData });
              const data = await response.json();
              if (data?.url && typeof data.url === 'string' && data.url.startsWith('http')) {
                previewImagesByFace[stateKey] = data.url;
              }
            } catch (uploadErr) {
              console.warn(`Failed to upload preview for stateKey ${stateKey}`, uploadErr);
            }
          }
        } catch (facePreviewErr) {
          console.warn(`Error generating preview for stateKey ${stateKey}`, facePreviewErr);
        }
      }

      const currentStateKey = getFaceStateKey(activeFace, selectedColor);
      const primaryPreviewUrl = previewImagesByFace[currentStateKey] || previewImagesByFace[activeFace] || Object.values(previewImagesByFace)[0] || "";

      if (!db) throw new Error("Firestore not initialized");

      const sanitizeForFirestore = <T,>(data: T): T => {
        return JSON.parse(
          JSON.stringify(data, (key, value) => {
            if (value === undefined) return null;
            return value;
          })
        );
      };
      
      const selectedPlacementsData = allSelectedPlacements.map(p => ({
        id: p.id,
        targetFace: p.targetFace,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        nameTr: p.nameTr,
        descriptionAr: p.descriptionAr,
        offsetFromCollarCm: p.offsetFromCollarCm,
        dimensions: {
          recommended: {
            widthCm: p.dimensions.recommended.widthCm,
            heightCm: p.dimensions.recommended.heightCm,
          }
        }
      }));

      const placementNamesSummary = allSelectedPlacements.map(p => 
        locale === 'tr' ? p.nameTr : locale === 'en' ? p.nameEn : p.nameAr
      ).join(' + ');

      // NOTE: canvas_json & production_snapshot are stored as JSON strings to prevent Firestore nested entity & dot-notation key errors. Use JSON.parse() when retrieving.
      const docData = sanitizeForFirestore({
        user_id: auth.currentUser?.uid || 'guest_user',
        product_id: productId,
        variant_id: `${selectedColor}_${selectedSize}`,
        size: selectedSize,
        color: selectedColor,
        design_type: 'custom',
        customization_mode: customizationMode,
        print_area_config: JSON.stringify(currentPrintArea || {}),
        production_snapshot: JSON.stringify({
          snapshotVersion: 1,
          editorVersion: 1,
          customization_config: productData?.config || { faces: {} },
          printAreas: Object.keys(configFaces).reduce((acc: any, face: string) => {
            acc[face] = configFaces[face]?.printArea || {};
            return acc;
          }, {})
        }),
        quality_metadata: imageQualityReport ? JSON.stringify(imageQualityReport) : null,
        canvas_json: cleanCanvasJsonString, // Nuclear cleaned JSON string (zero Base64, under 50KB)
        preview_image_url: primaryPreviewUrl,
        print_ready_url: primaryPreviewUrl,
        preview_images: previewImagesByFace,
        placements_by_color: placementsByColor,
        sync_placements_across_colors: syncPlacementsAcrossColors,
        selected_placement_ids: currentSelectedPlacementIds,
        selected_placements: selectedPlacementsData,
        placement_id: currentSelectedPlacementIds.join(','),
        placement_title: placementNamesSummary || null,
        placement_offset_collar_cm: allSelectedPlacements[0]?.offsetFromCollarCm ?? null,
        placement_mode: isFreeMode ? 'free' : 'standard',
        free_mode_disclaimer_accepted: isFreeMode,
        totalPrice: Number(totalPrice) || basePrice,
        status: action === 'save' ? 'saved' : 'draft',
        updated_at: new Date().toISOString()
      });
      
      if (currentDesignIdRef.current) {
        await updateDoc(doc(db, 'designs', currentDesignIdRef.current), docData);
      } else {
        const newDoc = await addDoc(collection(db, 'designs'), { ...docData, created_at: new Date().toISOString() });
        currentDesignIdRef.current = newDoc.id;
      }

      if (action === 'save') {
        showToast(t('saveSuccess'), 'success');
      } else if (action === 'cart' || action === 'buy_now') {
        const userId = auth.currentUser?.uid || 'guest_user';
        const itemsToCart = (variantMatrix && variantMatrix.length > 0)
          ? variantMatrix
          : [{ color: selectedColor, size: selectedSize, quantity: totalOrderQuantity || 1 }];

        for (const item of itemsToCart) {
          const itemVariantId = `${item.color}_${item.size}`;
          const itemColorKey = normalizeColorKey(item.color);
          const itemPlacementIds = syncPlacementsAcrossColors
            ? (placementsByColor['__synced__'] || placementsByColor[activeColorKey] || [])
            : (placementsByColor[itemColorKey] || placementsByColor[activeColorKey] || []);

          const itemPlacements = itemPlacementIds
            .map(id => getPlacementById(id, productData?.config?.garmentType))
            .filter((p): p is PlacementSpec => !!p);

          const itemPlacementsData = itemPlacements.map(p => ({
            id: p.id,
            targetFace: p.targetFace,
            nameAr: p.nameAr,
            nameEn: p.nameEn,
            nameTr: p.nameTr,
            descriptionAr: p.descriptionAr,
            offsetFromCollarCm: p.offsetFromCollarCm,
            dimensions: {
              recommended: {
                widthCm: p.dimensions.recommended.widthCm,
                heightCm: p.dimensions.recommended.heightCm,
              }
            }
          }));

          const itemPlacementNames = itemPlacements.map(p =>
            locale === 'tr' ? p.nameTr : locale === 'en' ? p.nameEn : p.nameAr
          ).join(' + ');

          const itemColorFrontKey = getFaceStateKey('front', item.color);
          const itemColorActiveKey = getFaceStateKey(activeFace, item.color);
          const itemPreview = previewImagesByFace[itemColorFrontKey] || previewImagesByFace[itemColorActiveKey] || primaryPreviewUrl;
          const cartItem = sanitizeForFirestore({
            user_id: userId,
            product_id: productId,
            variant_id: itemVariantId,
            design_id: currentDesignIdRef.current || 'unknown_design',
            design_type: 'custom',
            selected_placement_ids: itemPlacementIds,
            selected_placements: itemPlacementsData,
            placement_id: itemPlacementIds.join(','),
            placement_name: itemPlacementNames || null,
            placement_offset_collar_cm: itemPlacements[0]?.offsetFromCollarCm ?? null,
            placement_mode: isFreeMode ? 'free' : 'standard',
            free_mode_disclaimer_accepted: isFreeMode,
            quantity: item.quantity,
            unit_price: Number(totalPrice) || basePrice,
            preview_image_url: itemPreview,
            created_at: new Date().toISOString()
          });
          await addDoc(collection(db, 'cart_items'), cartItem);
        }

        // Clear local draft to prevent ghost designs in future orders
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(storageKey);
          } catch (e) {}
        }
        facesData.current = {};
        hasRestoredDraftRef.current = false;

        if (action === 'buy_now') {
          router.push('/checkout');
        } else {
          // Clear canvas for a fresh clean state
          canvas.clear();
          canvas.backgroundColor = 'transparent';
          canvas.renderAll();
          saveHistoryState();
          showToast(t('cartSuccess'), 'success');
        }
      }
    } catch (err: any) {
      console.error("Design Save Error Details:", err);
      const rawErrorMsg = err instanceof Error ? err.message : (typeof err === 'string' ? err : JSON.stringify(err));
      showToast(rawErrorMsg || t('saveError'), 'error');
    } finally {
      // MANDATORY: Always restore button loading state under all circumstances
      setIsSaving(false);
    }
  };
  
  const runValidation = () => {
    if (!canvas) return;
    const issues: { type: 'error' | 'warning', message: string }[] = [];
    const objects = canvas.getObjects();

    if (objects.length === 0) {
      alert(t('emptyCanvasError', { fallback: 'Your design is empty! Please add some elements.' }));
      return;
    }

    let hasOutofBounds = false;
    let hasDefaultText = false;

    objects.forEach(obj => {
      if (obj.name === 'background' || obj.name === 'mockup' || obj.name === 'print_area_guide') return;
      const br = obj.getBoundingRect(true, true);
      const tolerance = 6;
      let insideBounds = false;

      if (isFreeModeRef.current) {
        const fz = freePrintZone;
        insideBounds =
          br.left >= fz.left - tolerance &&
          (br.left + br.width) <= fz.left + fz.width + tolerance &&
          br.top >= fz.top - tolerance &&
          (br.top + br.height) <= fz.top + fz.height + tolerance;
      } else if (activeFaceSelectedPlacementsRef.current.length > 0) {
        for (const spec of activeFaceSelectedPlacementsRef.current) {
          const p = getPlacementFabricBounds(spec);
          const tol = 35;
          if (
            br.left >= p.fabricLeft - tol &&
            (br.left + br.width) <= p.fabricLeft + p.fabricWidth + tol &&
            br.top >= p.fabricTop - tol &&
            (br.top + br.height) <= p.fabricTop + p.fabricHeight + tol
          ) {
            insideBounds = true;
            break;
          }
        }
      } else {
        insideBounds = true;
      }

      if (!insideBounds) {
        hasOutofBounds = true;
      }

      if (obj.type === 'textbox' || obj.type === 'i-text') {
        const textObj = obj as fabric.Textbox;
        if (textObj.text === t('newText', { fallback: 'New Text' }) || textObj.text === 'New Text' || textObj.text === 'نص جديد' || textObj.text === 'Yeni Metin') {
          hasDefaultText = true;
        }
      }
    });

    if (hasOutofBounds) {
      issues.push({ 
        type: 'warning', 
        message: t('outOfBoundsWarn', { fallback: 'توجد بعض العناصر خارج إطار الطباعة، يمكنك ملاءمتها تلقائياً بضغطة زر لتكون داخل الإطار بشكل مثالي.' }) 
      });
    }
    if (hasDefaultText) {
      issues.push({ 
        type: 'warning', 
        message: t('defaultTextWarn', { fallback: 'يوجد نص افتراضي (نص جديد) لم تقم بتعديله أو حذفه.' }) 
      });
    }

    if (issues.length > 0) {
      setValidationIssues(issues);
      setIsValidationModalOpen(true);
    } else {
      setCustomizationMode('SAFE');
      if (!auth?.currentUser) {
        setPendingAction(pendingAction || 'cart');
        setIsAuthModalOpen(true);
      } else {
        executeAction(pendingAction || 'cart');
      }
    }
  };

  const handleSafeMode = () => {
    if (!canvas) return;
    canvas.discardActiveObject();
    const objs = canvas.getObjects();
    if (objs.length === 0) return;
    
    // Auto Fit Logic using ActiveSelection
    const sel = new fabric.ActiveSelection(objs, { canvas });
    const targetW = currentPrintArea.safeArea ? currentPrintArea.safeArea.width : currentPrintArea.width;
    const targetH = currentPrintArea.safeArea ? currentPrintArea.safeArea.height : currentPrintArea.height;
    
    const scaleX = targetW / sel.width!;
    const scaleY = targetH / sel.height!;
    const scale = Math.min(scaleX, scaleY) * 0.95; // 95% to leave a tiny margin
    
    if (scale < 1) {
      sel.scale(scale);
    }
    
    // Center it in the target area
    const centerX = currentPrintArea.safeArea ? currentPrintArea.safeArea.left + (targetW / 2) : targetW / 2;
    const centerY = currentPrintArea.safeArea ? currentPrintArea.safeArea.top + (targetH / 2) : targetH / 2;
    
    sel.set({ left: centerX, top: centerY, originX: 'center', originY: 'center' });
    sel.setCoords();
    sel.destroy(); // break the selection back to individual objects
    
    canvas.renderAll();
    saveHistoryState();
    
    setIsValidationModalOpen(false);
    setCustomizationMode('SAFE');
    
    if (!auth?.currentUser) {
      setPendingAction(pendingAction || 'cart');
      setIsAuthModalOpen(true);
    } else {
      executeAction(pendingAction || 'cart');
    }
  };

  const handleFreeMode = () => {
    setIsValidationModalOpen(false);
    setCustomizationMode('FREE');
    if (!auth?.currentUser) {
      setPendingAction(pendingAction || 'cart');
      setIsAuthModalOpen(true);
    } else {
      executeAction(pendingAction || 'cart');
    }
  };

  const handleAction = (action: 'save' | 'cart' | 'buy_now') => {
    if (isUploading) {
      showToast(t('waitUpload', { fallback: 'جاري رفع الصور، يرجى الانتظار...' }), 'info');
      return;
    }
    if (action === 'cart' || action === 'buy_now') {
      setPendingAction(action);
      runValidation();
      return;
    }
    
    if (!auth?.currentUser) {
      setPendingAction(action);
      setIsAuthModalOpen(true);
    } else {
      executeAction(action);
    }
  };

  return (
    <div className={cn(
      "flex flex-col lg:flex-row gap-4 lg:gap-6 items-start w-full relative transition-all duration-300",
      activeMobileTab ? "pb-[45vh] lg:pb-0" : "pb-12 lg:pb-0"
    )}>
      {/* Toast Notification Banner */}
      {toastNotification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-none">
          <div className={cn(
            "px-5 py-3 rounded-2xl shadow-xl border backdrop-blur-md flex items-center gap-2.5 font-bold text-sm pointer-events-auto",
            toastNotification.type === 'success' ? "bg-green-600/95 text-white border-green-500 shadow-green-600/20" :
            toastNotification.type === 'error' ? "bg-red-600/95 text-white border-red-500 shadow-red-600/20" :
            "bg-gray-900/95 text-white border-gray-800"
          )}>
            {toastNotification.type === 'success' && <CheckCircle2 size={18} className="text-white shrink-0" />}
            {toastNotification.type === 'error' && <AlertTriangle size={18} className="text-white shrink-0" />}
            <span>{toastNotification.text}</span>
          </div>
        </div>
      )}

      {/* Canvas Area */}
      <div 
        ref={canvasContainerRef}
        className="flex-1 min-w-0 flex flex-col gap-2 md:gap-4 bg-gray-50/50 rounded-2xl md:rounded-3xl overflow-hidden relative border border-border/50 shadow-inner w-full scroll-mt-4"
      >
        {/* Floating Glassmorphic Price Badge & Interactive Breakdown & Preview Button (Top Left) */}
        <div className="absolute top-3 left-3 z-40 flex items-center gap-2 pointer-events-auto">
          {/* Price Breakdown Anchor */}
          <div className="relative flex flex-col items-start">
            <button
              type="button"
              onClick={() => setShowPricePopover(prev => !prev)}
              className="bg-white/95 backdrop-blur-md px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full shadow-md border border-gray-100 font-bold text-xs sm:text-sm text-[var(--color-primary)] flex items-center gap-1.5 hover:bg-white transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 font-medium">{t('total')}:</span>
                <span className="font-black text-sm md:text-base font-mono text-[var(--color-primary)]">{grandTotalPrice} ₺</span>
                {totalOrderQuantity > 1 && (
                  <span className="text-[10px] font-bold text-gray-400 font-mono">
                    ({totalPrice} ₺ × {totalOrderQuantity})
                  </span>
                )}
              </div>
              {priceBreakdown && priceBreakdown.totalExtra > 0 && (
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-md">
                  +{priceBreakdown.totalExtra} ₺
                </span>
              )}
            </button>

            {/* Price Breakdown Popover */}
            {showPricePopover && priceBreakdown && (
              <div className="absolute top-full mt-2 left-0 z-50 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-3.5 w-68 text-right animate-in fade-in zoom-in-95 duration-150 space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="font-bold text-gray-900">{t('priceBreakdown', { fallback: 'تفاصيل السعر' })}</span>
                  <button onClick={() => setShowPricePopover(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-1.5 py-1 text-gray-600 max-h-40 overflow-y-auto">
                  {priceBreakdown.breakdown.map((item) => (
                    <div key={item.id} className="flex justify-between items-center">
                      <span className="truncate max-w-[150px]">{item.name}</span>
                      <span className="font-bold font-mono text-gray-900">
                        {item.type === 'base' ? `${item.price} ₺` : `+${item.price} ₺`}
                      </span>
                    </div>
                  ))}
                </div>
                
                {totalOrderQuantity > 1 && (
                  <div className="border-t border-dashed border-gray-200 pt-1.5 flex justify-between items-center text-gray-500 font-medium text-[11px]">
                    <span>{locale === 'tr' ? 'Birim Fiyat × Adet' : locale === 'en' ? 'Unit Price × Qty' : 'سعر القطعة × الكمية'}</span>
                    <span className="font-mono font-bold text-gray-700">{totalPrice} ₺ × {totalOrderQuantity}</span>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-2 flex justify-between items-center font-bold text-gray-900">
                  <span>{t('total')}</span>
                  <span className="font-black text-sm font-mono text-[var(--color-primary)]">{grandTotalPrice} ₺</span>
                </div>
              </div>
            )}
          </div>

          {/* Preview Button (Moved next to Price Badge as requested) */}
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPreviewLoading}
            className="flex items-center gap-1.5 bg-gray-950/90 hover:bg-black text-white px-3.5 py-1.5 rounded-full shadow-md hover:shadow-xl border border-white/10 backdrop-blur-md transition-all font-bold text-xs group hover:scale-105 active:scale-95 cursor-pointer"
            title={t('previewDesign')}
          >
            <Eye size={14} className="text-amber-400 group-hover:scale-110 transition-transform" />
            <span>{isPreviewLoading ? '...' : t('previewDesign')}</span>
          </button>
        </div>

        {/* User Media & Recently Used Assets 2-Column Sidebar (Placed in the empty left space) */}
        <UserMediaSidebar
          userUploads={userUploads}
          recentAssets={recentAssets}
          onSelectUpload={handleSelectUpload}
          onSelectRecentAsset={handleSelectRecentAsset}
          onUploadFile={processImageFile}
          onDeleteUpload={handleDeleteUpload}
          onDeleteRecent={handleDeleteRecent}
          isUploading={isUploading}
        />
        
        {/* Top Validation Warnings & Free Mode Banner */}
        {(validationWarning || customizationMode === 'FREE') && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30 pointer-events-none">
            {validationWarning && (
              <div className="bg-red-500/90 backdrop-blur text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-lg animate-pulse border border-red-400">
                ⚠️ {validationWarning}
              </div>
            )}

            {customizationMode === 'FREE' && (
              <div className="bg-orange-500/90 backdrop-blur text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-lg border border-orange-400">
                🆓 {t('freeModeActive', { fallback: 'Free Mode (No Boundaries)' })}
              </div>
            )}
          </div>
        )}

        {/* Vertical Floating Glassmorphic Zoom & Pan Controls (Vertically Centered on Right edge of Canvas for zero overlap with Top cards or Bottom CTA Bar) */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 bg-white/95 backdrop-blur-md shadow-lg border border-gray-200/80 rounded-2xl p-1.5 pointer-events-auto select-none">
          {/* Hand Tool / Pan Toggle */}
          <button
            onClick={() => setIsPanMode(!isPanMode)}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-xl font-bold transition-all active:scale-95 cursor-pointer",
              isPanMode 
                ? "bg-[var(--color-primary)] text-white shadow-sm" 
                : "bg-gray-50 hover:bg-gray-100 text-gray-700"
            )}
            title={t('panTool')}
          >
            <Hand size={16} />
          </button>

          {/* Divider */}
          <div className="w-5 h-px bg-gray-200 my-0.5" />

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 active:scale-95 disabled:opacity-40 transition-all font-bold cursor-pointer"
            title={t('zoomIn')}
          >
            <Plus size={16} />
          </button>

          {/* Reset Zoom */}
          <button
            onClick={handleResetZoom}
            className="w-8 h-6 flex items-center justify-center rounded-lg text-[10px] font-mono font-bold text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
            title={t('resetZoom')}
          >
            {Math.round(zoomLevel * 100)}%
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1 && panOffset.x === 0 && panOffset.y === 0}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 active:scale-95 disabled:opacity-40 transition-all font-bold cursor-pointer"
            title={t('zoomOut')}
          >
            <Minus size={16} />
          </button>
        </div>

        {/* Quality Banner */}
        {imageQualityReport && (
          <div className="absolute top-16 left-4 right-4 z-30 pointer-events-none flex justify-center animate-in fade-in slide-in-from-top-2 duration-300">
            <div className={cn(
              "backdrop-blur px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-lg border pointer-events-auto text-white flex items-center gap-2",
              imageQualityReport.color === 'green' ? "bg-green-600/90 border-green-500" :
              imageQualityReport.color === 'yellow' ? "bg-yellow-500/90 border-yellow-400 text-yellow-900" :
              imageQualityReport.color === 'orange' ? "bg-orange-500/90 border-orange-400" :
              "bg-red-600/90 border-red-500"
            )}>
              <span>{imageQualityReport.status}</span>
              <button onClick={() => setImageQualityReport(null)} className="ml-2 hover:opacity-70"><X size={14}/></button>
            </div>
          </div>
        )}

        {/* Sleek Floating Out-of-Bounds Notification Banner for Mobile & Desktop (Positioned below Price & Preview buttons) */}
        {isObjectOutOfBounds && !isWarningDismissed && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-[92%] sm:w-auto max-w-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between gap-2 bg-red-600/90 hover:bg-red-600 backdrop-blur-md text-white px-3 py-1.5 rounded-full shadow-lg border border-red-400/60 text-xs font-bold transition-all">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertTriangle size={15} className="text-amber-300 shrink-0" />
                <span className="truncate text-xs font-semibold">{t('outOfBoundsLiveNotice')}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleAutoFitActiveObject}
                  className="bg-white text-red-700 hover:bg-red-50 px-2.5 py-0.5 rounded-full text-[11px] font-black transition-all shadow-xs hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  {t('fitInsideFrame')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsWarningDismissed(true)}
                  className="p-0.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  title={t('close')}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mockup Display with Dynamic Aspect Ratio & Internal Smooth Zoom & Pan */}
        <div 
          ref={mockupContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={cn(
            "w-full h-[60vh] md:h-[65vh] lg:h-[75vh] relative flex items-center justify-center p-2 lg:p-4 overflow-hidden select-none",
            isPanMode ? "cursor-grab active:cursor-grabbing" : ""
          )}
        >
          <div
            className="relative max-w-full flex items-center justify-center transition-transform duration-75 origin-center select-none"
            style={{
              height: '100%',
              aspectRatio: `${nativeWidth} / ${nativeHeight}`,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            }}
          >
            {/* Base Product Mockup Image (Natural aspect ratio with dynamic dimensions detection) */}
            <img
              src={currentFaceMockupUrl}
              alt={`${activeFace} view`}
              crossOrigin="anonymous"
              onLoad={(e) => {
                const nw = e.currentTarget.naturalWidth;
                const nh = e.currentTarget.naturalHeight;
                if (nw > 0 && nh > 0) {
                  setMockupNaturalSize(prev => (prev.width === nw && prev.height === nh ? prev : { width: nw, height: nh }));
                }
              }}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none rounded-lg shadow-sm"
            />

            {/* Approved Print Placements Overlays (Clean Single-Placement Focus + Drag Reveal Strategy) */}
            {!isFreeMode && activeFaceSelectedPlacements.length > 0 && (
              <div className="absolute inset-0 w-full h-full pointer-events-none z-15">
                {activeFaceSelectedPlacements.map((spec) => {
                  const box = spec.canvasBox;
                  const isFullCoverage = spec.id === 'full_front' || spec.id === 'full_back' || spec.id === 'full_back_hoodie';
                  const isHovered = hoveredPlacementId === spec.id;
                  const activeFocusedId = focusedPlacementId || activeFaceSelectedPlacements[0]?.id;
                  const isFocused = activeFocusedId === spec.id;

                  // Visibility Strategy:
                  // 1. While actively dragging a design: show ALL selected placements on this face as available drop targets!
                  // 2. While resting: show ONLY the currently focused/active placement! Zero clutter, zero stacked boxes!
                  const isVisible = isObjectDragging ? true : isFocused;

                  if (!isVisible) return null;

                  // Dynamic Admin Calibration Snap: If admin calibrated this placement for this product via drag & drop, snap to calibrated coordinates!
                  const calibrated = productData?.config?.calibratedPlacements?.[spec.id];
                  const hasCalibrated = !!calibrated && !!calibrated.nativeWidth && calibrated.nativeWidth > 0;
                  const leftPercent = hasCalibrated ? (calibrated.x / calibrated.nativeWidth) * 100 : box.leftPercent;
                  const topPercent = hasCalibrated ? (calibrated.y / calibrated.nativeHeight) * 100 : box.topPercent;
                  const widthPercent = hasCalibrated ? (calibrated.width / calibrated.nativeWidth) * 100 : box.maxWidthPercent;
                  const heightPercent = hasCalibrated ? (calibrated.height / calibrated.nativeHeight) * 100 : box.maxHeightPercent;
                  const displayWidthCm = calibrated?.physicalWidthCm || spec.dimensions.recommended.widthCm;
                  const displayHeightCm = calibrated?.physicalHeightCm || spec.dimensions.recommended.heightCm;
                  const displayOffsetCm = calibrated?.offsetFromCollarCm ?? spec.offsetFromCollarCm;

                  return (
                    <div
                      key={spec.id}
                      className={cn(
                        "absolute border-2 border-dashed pointer-events-none transition-all duration-200 animate-in fade-in",
                        // 100% TRANSPARENT BACKGROUND: Zero orange/brown tint over the garment fabric!
                        isHovered
                          ? "border-amber-400 bg-amber-400/20 ring-4 ring-amber-400/60 shadow-xl scale-[1.01] z-20"
                          : isFocused
                            ? isFullCoverage
                              ? "border-amber-500/80 bg-transparent rounded-3xl z-10"
                              : "border-amber-500/90 bg-transparent rounded-2xl z-10"
                            : "border-amber-400/40 bg-transparent opacity-60 rounded-2xl z-5"
                      )}
                      style={{
                        left: `${leftPercent}%`,
                        top: `${topPercent}%`,
                        width: `${widthPercent}%`,
                        height: `${heightPercent}%`,
                      }}
                    >
                      {/* Badge positioning */}
                      <div className={cn(
                        "absolute text-white text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border whitespace-nowrap z-20 transition-all",
                        isHovered
                          ? "bg-amber-500 border-white text-white ring-2 ring-amber-300 animate-pulse"
                          : "bg-amber-600/95 backdrop-blur-xs border-amber-300",
                        isFullCoverage
                          ? "top-2 start-2"
                          : "-top-3 sm:-top-3.5 left-1/2 -translate-x-1/2"
                      )}>
                        <span>{isHovered ? '🎯' : '📍'}</span>
                        <span>{locale === 'tr' ? spec.nameTr : locale === 'en' ? spec.nameEn : spec.nameAr}</span>
                        {isHovered ? (
                          <span className="font-black text-amber-100">
                            ({locale === 'tr' ? 'Bırak ve Yerleştir' : locale === 'en' ? 'Drop Here' : 'إفلات لتثبيت التصميم'})
                          </span>
                        ) : (
                          <>
                            <span>•</span>
                            <span dir="ltr">{displayWidthCm}×{displayHeightCm} cm</span>
                            <span>•</span>
                            <span className="flex items-center gap-0.5 text-amber-100">
                              <Ruler size={9} />
                              {locale === 'tr' ? `${displayOffsetCm} cm` : locale === 'en' ? `${displayOffsetCm} cm` : `${displayOffsetCm} سم`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Free Mode Full Face Active Guideline Overlay */}
            {isFreeMode && (
              <div className="absolute inset-0 w-full h-full pointer-events-none z-15">
                <div
                  className={cn(
                    "absolute border-2 border-dashed pointer-events-none transition-all duration-300",
                    isObjectOutOfBounds
                      ? "border-red-500 ring-4 ring-red-400/40 bg-transparent rounded-3xl"
                      : "border-amber-500/80 bg-transparent rounded-3xl"
                  )}
                  style={{
                    left: `${(freePrintZone.left / nativeWidth) * 100}%`,
                    top: `${(freePrintZone.top / nativeHeight) * 100}%`,
                    width: `${(freePrintZone.width / nativeWidth) * 100}%`,
                    height: `${(freePrintZone.height / nativeHeight) * 100}%`,
                  }}
                >
                  {/* Badge positioned OUTSIDE / ABOVE the bounding box so the entire printable area remains 100% clear */}
                  <div className="absolute -top-3.5 sm:-top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-600 to-orange-600 text-white text-[9px] sm:text-[10px] font-black px-3 py-0.5 rounded-full shadow-md flex items-center gap-1.5 border border-amber-300 z-20 whitespace-nowrap">
                    <Sparkles size={11} className="text-amber-200" />
                    <span>
                      {locale === 'tr' ? 'Serbest Mod (Tam Yüzey)' : locale === 'en' ? 'Free Mode (Full Face)' : 'الوضع الحر (كامل الواجهة)'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 
              ARCHITECTURAL NOTE FOR CURVED PRODUCTS (Mugs / Hats / Tumblers):
              To achieve photorealistic 3D cylindrical displacement and reflections without heavy WebGL:
              A transparent shadow/highlight overlay PNG (e.g. `productFaces[activeFace + '_overlay']` or category warp map)
              can be placed over this container with `pointer-events-none mix-blend-multiply opacity-60 z-30`.
            */}

            {/* Fabric Canvas Extended Overlay Container (100% 1:1 with garment mockup frame - No clipping barrier!) */}
            <div
              className={cn(
                "absolute inset-0 w-full h-full pointer-events-auto overflow-hidden",
                "[&_.canvas-container]:!w-full [&_.canvas-container]:!h-full [&_canvas]:!w-full [&_canvas]:!h-full",
                // Photorealistic Blend Mode: blends fabric texture & folds through the artwork on lower-canvas while keeping upper-canvas controls crisp
                (selectedColor === 'black' || selectedColor === 'navy' || selectedColor === '#000000' || selectedColor === '#1E3A8A')
                  ? "[&_.upper-canvas]:mix-blend-normal [&_.lower-canvas]:mix-blend-normal opacity-[0.98]"
                  : "[&_.lower-canvas]:mix-blend-multiply [&_.lower-canvas]:opacity-[0.95] [&_.upper-canvas]:mix-blend-normal"
              )}
              style={{
                width: '100%',
                height: '100%',
                top: '0%',
                left: '0%',
              }}
            >
              <div className="w-full h-full relative origin-top-left" style={{ transform: `scale(1)` }}>
                {/* Visual Guides & Overlays Container (Safe from diff collisions) */}
                <div className="w-full h-full absolute inset-0 pointer-events-none z-25">
                </div>

                {/* Isolated Extended Fabric Canvas Container (Sole child is canvas, completely safe from React DOM diffing) */}
                <div className="w-full h-full absolute inset-0 z-20 pointer-events-auto">
                  <canvas ref={canvasRef} className="w-full h-full relative bg-transparent" />
                </div>
              </div>
            </div>
          </div>

          {/* Floating Top-Right Studio Controls (Desktop Segmented Size & Color Swatches - Raised to Top) */}
          <div className="absolute top-3 right-3 z-40 flex flex-col items-end gap-2.5 pointer-events-auto">
            {/* Desktop-Only Sleek Floating Studio Card (Size & Color) */}
            <div className="hidden lg:flex flex-col gap-2.5 bg-white/95 backdrop-blur-xl border border-white/80 shadow-xl shadow-black/5 rounded-3xl p-3 text-xs w-60 animate-in fade-in zoom-in-95 duration-200">
              {/* Size Selector Section */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-0.5">
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">{t('size', { fallback: 'المقاس' })}</span>
                  <span className="font-mono font-black text-xs text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">{selectedSize}</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-2xl">
                  {availableSizes.map((s: string) => {
                    const isSelected = (selectedSize || '').trim().toUpperCase() === (s || '').trim().toUpperCase();
                    const inStock = isSizeAvailable(s, selectedColor);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!inStock}
                        onClick={() => {
                          if (!inStock) return;
                          setSelectedSize(s);
                          if (variantMatrix && variantMatrix.length > 0) {
                            setVariantMatrix([{ color: selectedColor, size: s, quantity: totalOrderQuantity || 1 }]);
                          }
                        }}
                        className={cn(
                          "flex-1 py-1 text-center font-bold text-xs rounded-xl transition-all",
                          !inStock
                            ? "opacity-35 line-through cursor-not-allowed bg-transparent text-gray-400"
                            : isSelected 
                              ? "bg-gray-900 text-white shadow-sm font-black scale-100 cursor-pointer" 
                              : "text-gray-800 hover:text-black hover:bg-white/80 bg-white/40 cursor-pointer"
                        )}
                        title={!inStock ? (locale === 'tr' ? 'Tükendi' : locale === 'en' ? 'Out of stock' : 'نفذت الكمية') : undefined}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subtle Divider */}
              <div className="h-px bg-gray-100 w-full" />

              {/* Color Selector Section */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-0.5">
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">{t('color', { fallback: 'اللون' })}</span>
                  <span className="text-[11px] font-black text-gray-900">
                    {getLocalizedColorName(selectedColor, locale)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-0.5">
                  {availableColors.map((c: string) => {
                    const isSelected = isColorEqual(selectedColor, c);
                    const inStock = isColorAvailable(c);
                    const bgColor = c === 'white' ? '#ffffff' : c === 'black' ? '#000000' : c === 'navy' ? '#1E3A8A' : c;
                    const cName = getLocalizedColorName(c, locale);
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={!inStock}
                        onClick={() => {
                          if (!inStock) return;
                          switchColor(c);
                        }}
                        className={cn(
                          "w-6 h-6 rounded-full transition-all relative flex items-center justify-center shadow-xs",
                          !inStock
                            ? "opacity-30 cursor-not-allowed border border-gray-300 ring-1 ring-red-400"
                            : isSelected 
                              ? "ring-2 ring-offset-2 ring-gray-900 scale-110 shadow-md cursor-pointer" 
                              : "hover:scale-110 border border-gray-300 opacity-90 hover:opacity-100 cursor-pointer"
                        )}
                        style={{ backgroundColor: bgColor }}
                        title={!inStock ? `${cName} (${locale === 'tr' ? 'Tükendi' : locale === 'en' ? 'Out of stock' : 'نفذت الكمية'})` : cName}
                      >
                        {isSelected && (
                          <div className={cn("w-1.5 h-1.5 rounded-full", (c === 'white' || bgColor === '#ffffff' || bgColor === '#fff') ? "bg-black" : "bg-white")} />
                        )}
                        {!inStock && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-full h-0.5 bg-red-500 rotate-45" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Sync Design Across All Selected Colors Toggle (Desktop) */}
                {uniqueSelectedColors.length > 1 && (
                  <div className="mt-1 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-1.5 animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Sparkles size={12} className={cn("shrink-0", syncAllColors ? "text-amber-500 animate-pulse" : "text-gray-400")} />
                      <span className="text-[10px] font-bold text-gray-700 truncate" title={t('syncAllColorsDesc', { fallback: 'تطبيق نفس الملصقات والتعديلات على جميع الألوان المختارة' })}>
                        {t('syncAllColors', { fallback: 'تطبيق على كافة الألوان' })} ({uniqueSelectedColors.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !syncAllColors;
                        setSyncAllColors(next);
                        if (next) propagateDesignToAllColors();
                      }}
                      className={cn(
                        "relative inline-flex h-4 w-7.5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        syncAllColors ? "bg-amber-500" : "bg-gray-200 hover:bg-gray-300"
                      )}
                      role="switch"
                      aria-checked={syncAllColors}
                      title={t('syncAllColorsDesc', { fallback: 'تطبيق نفس الملصقات والتعديلات على جميع الألوان المختارة' })}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out",
                          syncAllColors ? (locale === 'ar' ? "-translate-x-3.5" : "translate-x-3.5") : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Multi-Size / Multi-Color Matrix Trigger Button */}
              <button
                type="button"
                onClick={() => setIsMatrixModalOpen(true)}
                className="w-full mt-0.5 py-1.5 px-2 bg-orange-50 hover:bg-orange-100 text-[var(--color-primary)] font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1.5 border border-orange-200/80 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
              >
                <Layers size={13} className="shrink-0" />
                <span className="truncate">
                  {variantMatrix && variantMatrix.length > 1
                    ? (locale === 'tr' ? `${totalOrderQuantity} Adet (Çoklu Beden)` : locale === 'en' ? `${totalOrderQuantity} Pcs (Multi-Size)` : `${totalOrderQuantity} قطع (مقاسات متعددة)`)
                    : (locale === 'tr' ? 'Çoklu Beden & Adet Seç' : locale === 'en' ? 'Multi-Size & Qty Matrix' : 'تعدد المقاسات والكميات')}
                </span>
              </button>
            </div>
          </div>

          {/* Bottom Controls Bar (Mobile: Single bottom row side-by-side with Faces on right & Placements on left. Desktop: Placements at bottom-left, Faces centered) */}
          <div className="absolute bottom-2.5 sm:bottom-3 inset-x-2 sm:inset-x-3 z-35 pointer-events-none flex items-center justify-between gap-1 select-none">
            
            {/* 1. Faces Switcher (Shifted to right on mobile in RTL, centered on desktop) */}
            {availableFaces.length > 1 && (
              <div className="pointer-events-auto sm:absolute sm:bottom-0 sm:left-1/2 sm:-translate-x-1/2 sm:z-30 shrink-0 max-w-[55%] sm:max-w-[95%]">
                <div className="flex bg-white/95 backdrop-blur-md shadow-md sm:shadow-lg rounded-full p-0.5 sm:p-1 border border-gray-200/80 items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar">
                  {availableFaces.map(face => {
                    const f = (face || '').trim().toLowerCase();
                    const label = f === 'front' ? t('front', { fallback: 'Front' }) :
                                  f === 'back' ? t('back', { fallback: 'Back' }) :
                                  f === 'right_shoulder' ? t('right_shoulder', { fallback: 'Right Shoulder' }) :
                                  f === 'left_shoulder' ? t('left_shoulder', { fallback: 'Left Shoulder' }) :
                                  f === 'collar' ? t('collar', { fallback: 'Collar' }) :
                                  f === 'other' ? t('other', { fallback: 'Other' }) :
                                  t(face, { fallback: face });
                    return (
                      <button
                        key={face}
                        onClick={() => setActiveFace(face)}
                        className={cn(
                          "px-2 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all capitalize whitespace-nowrap cursor-pointer active:scale-95",
                          activeFace === face 
                            ? "bg-[var(--color-primary)] text-white shadow-xs" 
                            : "text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)] hover:bg-gray-100/80"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Placements & Free Mode Guide (Positioned beside Faces on mobile, anchored bottom-left below 'تصاميمي' on desktop) */}
            <div className="pointer-events-auto sm:absolute sm:bottom-0 sm:left-0 sm:z-35 shrink-0">
              <GarmentPlacementGuide
                garmentType={productData?.config?.garmentType || productData?.category || 'tshirt'}
                allowedPlacements={productData?.config?.allowedPlacements}
                activeFace={activeFace}
                selectedColor={selectedColor}
                selectedPlacementIds={currentSelectedPlacementIds}
                syncPlacementsAcrossColors={syncPlacementsAcrossColors}
                onToggleSyncPlacements={handleToggleSyncPlacements}
                onApplyToAllColors={handleApplyToAllColors}
                onTogglePlacement={handleTogglePlacement}
                onSelectFace={switchFace}
                onClearAll={handleClearPlacements}
                locale={locale}
                isFreeMode={isFreeMode}
                onToggleFreeMode={handleToggleFreeMode}
                allowFreeMode={productData?.config?.allowFreeMode !== false}
                focusedPlacementId={focusedPlacementId || activeFaceSelectedPlacements[0]?.id}
                onFocusPlacement={setFocusedPlacementId}
              />
            </div>

          </div>
        </div>

        {/* Action CTA Buttons (Buy Now & Add to Cart) - Positioned directly below product preview frame */}
        <div className="w-full px-3 py-3 flex flex-row items-center gap-2.5 md:gap-3 z-20 border-t border-gray-100/80 bg-white/70 backdrop-blur-xs rounded-b-2xl md:rounded-b-3xl">
          {/* 1. Buy Now Button */}
          <button
            type="button"
            onClick={() => handleAction('buy_now')}
            disabled={isSaving}
            className="flex-1 py-3 px-3 md:px-5 bg-gray-900 hover:bg-black text-white font-bold text-xs md:text-sm rounded-xl md:rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Zap size={16} className="text-amber-400 fill-amber-400 shrink-0" />
            <span className="truncate">{isSaving ? t('processing') : t('buyNow')}</span>
          </button>

          {/* 2. Add to Cart Button */}
          <button
            type="button"
            onClick={() => handleAction('cart')}
            disabled={isSaving}
            className="flex-1 py-3 px-3 md:px-5 bg-[var(--color-primary)] hover:opacity-90 text-white font-bold text-xs md:text-sm rounded-xl md:rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <ShoppingCart size={16} className="shrink-0" />
            <span className="truncate">{isSaving ? t('processing') : t('addToCart')}</span>
          </button>
        </div>
      </div>

      {/* Desktop Sidebar / Mobile Bottom Sheet Overlay (Transparent Click-Away, No Dark Tint) */}
      {activeMobileTab && (
        <div 
          className="md:hidden fixed inset-0 bg-transparent z-40"
          onClick={() => setActiveMobileTab(null)}
        />
      )}

      {/* Sidebar Toolbar (Desktop sticky sidebar with independent scroll, Mobile Bottom Sheet) */}
      <div className={cn(
        "w-full lg:w-96 flex flex-col gap-3 pb-20 lg:pb-4",
        "fixed lg:sticky inset-x-0 bottom-0 lg:top-28 bg-white/95 backdrop-blur-md lg:bg-transparent z-50 lg:z-auto",
        "rounded-t-3xl lg:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.15)] lg:shadow-none p-4 lg:p-0",
        "transition-transform duration-300 max-h-[45vh] lg:max-h-none lg:h-[calc(100vh-130px)] overflow-hidden lg:overflow-y-auto",
        "lg:[&::-webkit-scrollbar]:w-1.5 lg:[&::-webkit-scrollbar-thumb]:bg-gray-300 lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-track]:bg-transparent",
        activeMobileTab ? "translate-y-0" : "translate-y-full lg:translate-y-0"
      )}>
        
        {/* Mobile Sheet Drag Handle & Header */}
        <div className="lg:hidden flex flex-col gap-1.5 pb-2 border-b border-gray-200/80">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
          <div className="flex justify-between items-center px-1">
            <span className="font-bold text-gray-800 text-sm">
              {activeMobileTab === 'elements' && t('addElements')}
              {activeMobileTab === 'text' && t('textProperties')}
              {activeMobileTab === 'layers' && t('layers')}
              {activeMobileTab === 'properties' && t('properties')}
              {activeMobileTab === 'image' && t('imageProperties')}
              {activeMobileTab === 'all' && t('addElements')}
              {!activeMobileTab && t('addElements')}
            </span>
            <button onClick={() => setActiveMobileTab(null)} className="p-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600">
              <X size={16}/>
            </button>
          </div>
        </div>

        {/* Scrollable Container for Mobile Bottom Sheet / Desktop Inner Flow */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[36vh] lg:max-h-none pr-1 lg:pr-0">
          
          {/* 1. Properties Panel (Size & Color Switcher - Mobile Only) */}
          <div className={cn("bg-white md:rounded-3xl md:p-5 md:shadow-sm md:border border-border/50 lg:hidden", (!activeMobileTab || activeMobileTab === 'properties' || activeMobileTab === 'all') ? "block" : "hidden")}>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                 <span className="text-sm font-semibold">{t('size', { fallback: 'المقاس' })}</span>
                 <select 
                   value={availableSizes.find((s: string) => s.trim().toUpperCase() === (selectedSize || '').trim().toUpperCase()) || selectedSize} 
                   onChange={(e) => {
                     setSelectedSize(e.target.value);
                     if (variantMatrix && variantMatrix.length > 0) {
                       setVariantMatrix([{ color: selectedColor, size: e.target.value, quantity: totalOrderQuantity || 1 }]);
                     }
                   }} 
                   className="bg-transparent font-bold outline-none cursor-pointer"
                 >
                   {availableSizes.map((s: string) => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>
              <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">{t('color', { fallback: 'اللون' })}</span>
                  <span className="text-xs font-bold text-gray-700">{getLocalizedColorName(selectedColor, locale)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {availableColors.map((c: string) => {
                    const isSelected = isColorEqual(selectedColor, c);
                    const inStock = isColorAvailable(c);
                    const bgColor = c === 'white' ? '#ffffff' : c === 'black' ? '#000000' : c === 'navy' ? '#1E3A8A' : c;
                    const cName = getLocalizedColorName(c, locale);
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={!inStock}
                        onClick={() => {
                          if (!inStock) return;
                          switchColor(c);
                        }}
                        className={cn(
                          "w-7 h-7 rounded-full transition-all relative flex items-center justify-center shadow-xs",
                          !inStock
                            ? "opacity-30 cursor-not-allowed border border-gray-300 ring-1 ring-red-400"
                            : isSelected 
                              ? "ring-2 ring-offset-2 ring-gray-900 scale-110 shadow-md cursor-pointer" 
                              : "hover:scale-110 border border-gray-300 opacity-90 hover:opacity-100 cursor-pointer"
                        )}
                        style={{ backgroundColor: bgColor }}
                        title={!inStock ? `${cName} (${locale === 'tr' ? 'Tükendi' : locale === 'en' ? 'Out of stock' : 'نفذت الكمية'})` : cName}
                      >
                        {isSelected && (
                          <div className={cn("w-1.5 h-1.5 rounded-full", (c === 'white' || bgColor === '#ffffff' || bgColor === '#fff') ? "bg-black" : "bg-white")} />
                        )}
                        {!inStock && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-full h-0.5 bg-red-500 rotate-45" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Sync Design Across All Selected Colors Toggle (Mobile) */}
                {uniqueSelectedColors.length > 1 && (
                  <div className="pt-2 border-t border-gray-200/70 flex items-center justify-between gap-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles size={16} className={cn("shrink-0", syncAllColors ? "text-amber-600 animate-pulse" : "text-gray-400")} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-gray-800 truncate">
                          {t('syncAllColors', { fallback: 'تطبيق التعديلات على كافة الألوان' })} ({uniqueSelectedColors.length})
                        </span>
                        <span className="text-[10px] text-gray-500 truncate">
                          {t('syncAllColorsDesc', { fallback: 'تطبيق نفس الملصقات والتعديلات على جميع الألوان المختارة' })}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !syncAllColors;
                        setSyncAllColors(next);
                        if (next) propagateDesignToAllColors();
                      }}
                      className={cn(
                        "relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        syncAllColors ? "bg-amber-500" : "bg-gray-200"
                      )}
                      role="switch"
                      aria-checked={syncAllColors}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out",
                          syncAllColors ? (locale === 'ar' ? "-translate-x-4.5" : "translate-x-4.5") : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsMatrixModalOpen(true)}
                className="w-full py-2.5 px-3 bg-orange-50 hover:bg-orange-100 text-[var(--color-primary)] font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 border border-orange-200"
              >
                <Layers size={14} />
                <span>
                  {variantMatrix && variantMatrix.length > 1
                    ? (locale === 'tr' ? `${totalOrderQuantity} Adet Seçildi` : locale === 'en' ? `${totalOrderQuantity} Pcs Selected` : `${totalOrderQuantity} قطع محددة`)
                    : (locale === 'tr' ? 'Çoklu Beden & Adet Seç' : locale === 'en' ? 'Multi-Size & Qty Matrix' : 'تعدد المقاسات والكميات')}
                </span>
              </button>
            </div>
          </div>

          {/* 2. Tools Panel */}
          <div className={cn(
            "bg-white md:rounded-3xl md:p-5 md:shadow-sm md:border border-border/50 flex-1 flex flex-col gap-4",
            activeMobileTab === 'properties' ? "hidden md:flex" : "flex"
          )}>
            
            {/* A. Elements Tab Content (Add Text, Upload, Stickers, Shapes) */}
            <div className={cn("flex flex-col gap-4", (!activeMobileTab || activeMobileTab === 'all' || activeMobileTab === 'elements') ? "flex" : "hidden md:flex")}>
              <h4 className="font-bold text-[var(--color-secondary)] hidden md:block">{t('addElements', { fallback: 'إضافة عناصر' })}</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <button onClick={addText} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors text-[var(--color-secondary)] border border-transparent hover:border-gray-200">
                  <Type size={24} className="text-[var(--color-primary)]" />
                  <span className="text-sm font-bold">{t('addText', { fallback: 'إضافة نص' })}</span>
                </button>
                <label className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors cursor-pointer text-center text-[var(--color-secondary)] border border-transparent hover:border-gray-200">
                  <Upload size={24} className="text-[var(--color-primary)]" />
                  <span className="text-sm font-bold">{isUploading ? '...' : t('addImage', { fallback: 'رفع صورة' })}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={isUploading} />
                </label>
              </div>

              {/* Stickers & Graphics Section */}
              {allStickersList.length > 0 && (
                <div className="flex flex-col gap-2.5 bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--color-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={15} className="text-[var(--color-primary)]" />
                      <span>{t('stickers', { fallback: 'الملصقات والرسومات' })}</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsGalleryModalOpen(true)}
                        className="text-[11px] text-[var(--color-primary)] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>{t('browseGallery', { fallback: 'تصفح المعرض' })}</span>
                      </button>
                      <span className="text-[10px] bg-white border border-gray-200 text-gray-500 font-semibold px-2 py-0.5 rounded-full">
                        {filteredStickers.length}
                      </span>
                    </div>
                  </div>

                  {/* Category Filter Pills */}
                  {displayCategories.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none]">
                      {displayCategories.map((cat) => {
                        const isSelected = (cat.id === 'all' && selectedStickerCategory === 'all') || selectedStickerCategory === cat.name;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedStickerCategory(cat.id === 'all' ? 'all' : cat.name)}
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer",
                              isSelected
                                ? "bg-[var(--color-primary)] text-white font-bold shadow-xs scale-[1.02]"
                                : "bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200"
                            )}
                          >
                            {getCategoryLocalizedName(cat, locale)}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Stickers Grid */}
                  {filteredStickers.length === 0 ? (
                    <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200">
                      <p className="text-xs text-gray-400">{t('noStickersInCategory', { fallback: 'لا توجد ملصقات في هذا القسم حالياً' })}</p>
                    </div>
                  ) : (
                    <div className="flex overflow-x-auto flex-nowrap lg:grid lg:grid-cols-4 lg:overflow-x-visible gap-2 lg:gap-2.5 pb-2 lg:pb-0 scrollbar-hide [&::-webkit-scrollbar]:hidden max-h-56 lg:max-h-64 lg:overflow-y-auto pr-0.5 custom-scrollbar">
                      {filteredStickers.map((sticker) => (
                        <button
                          key={sticker.id}
                          onClick={() => addSticker(sticker.url, { id: sticker.id, name: sticker.name, price: sticker.price })}
                          className="shrink-0 lg:shrink w-16 h-16 lg:w-full lg:h-18 lg:aspect-square bg-white rounded-xl p-2 hover:ring-2 ring-[var(--color-primary)] border border-gray-200 hover:border-transparent relative transition-all active:scale-95 flex items-center justify-center group shadow-xs hover:shadow cursor-pointer"
                          title={sticker.name}
                        >
                          <img 
                            src={sticker.url} 
                            alt={sticker.name} 
                            className="w-full h-full object-contain pointer-events-none group-hover:scale-110 transition-transform duration-200" 
                            loading="lazy"
                          />
                          {typeof sticker.price === 'number' && sticker.price > 0 && (
                            <span className="absolute top-1 right-1 text-[8px] sm:text-[9px] font-black px-1 py-0.2 rounded bg-amber-500 text-white shadow-xs">
                              +{sticker.price} ₺
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* B. Text Tab Content (Text formatting displayed when a text object is selected) */}
            {activeObject && (activeObject.type === 'textbox' || activeObject.type === 'i-text') && (
              <div className={cn("flex flex-col gap-3", (!activeMobileTab || activeMobileTab === 'all' || activeMobileTab === 'text') ? "flex" : "hidden md:flex")}>
                <TextTools canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
                <PrecisionControls canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
              </div>
            )}

            {/* C. Image / Object Properties (Displayed when an Image/Sticker/Shape is active or on Elements tab) */}
            {activeObject && activeObject.type !== 'textbox' && activeObject.type !== 'i-text' && (
              <div className={cn("flex flex-col gap-3", (!activeMobileTab || activeMobileTab === 'all' || activeMobileTab === 'elements' || activeMobileTab === 'image') ? "flex" : "hidden md:flex")}>
                <ImageTools canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} printArea={currentPrintArea} />
                <PrecisionControls canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
              </div>
            )}
            
            {/* D. Layers Tab Content */}
            <div className={cn("flex flex-col gap-3", (!activeMobileTab || activeMobileTab === 'all' || activeMobileTab === 'layers') ? "flex" : "hidden md:flex")}>
              <LayerPanel canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
            </div>

            {/* Global Actions (Undo/Redo/Clear Draft/Delete) */}
            <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button 
                  type="button"
                  onClick={undo} 
                  disabled={!canUndo} 
                  className={cn(
                    "p-2.5 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-xs",
                    canUndo 
                      ? "bg-gray-900 hover:bg-black text-white shadow-md hover:scale-105" 
                      : "bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed"
                  )} 
                  title={t('undo', { fallback: 'تراجع' })}
                >
                  <Undo size={18} />
                </button>
                <button 
                  type="button"
                  onClick={redo} 
                  disabled={!canRedo} 
                  className={cn(
                    "p-2.5 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-xs",
                    canRedo 
                      ? "bg-gray-900 hover:bg-black text-white shadow-md hover:scale-105" 
                      : "bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed"
                  )} 
                  title={t('redo', { fallback: 'إعادة' })}
                >
                  <Redo size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {activeObject && (
                  <button 
                    type="button"
                    onClick={deleteSelected} 
                    className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 border border-red-200 shadow-xs" 
                    title={t('delete', { fallback: 'حذف العنصر' })}
                  >
                    <Trash2 size={14} />
                    <span>{t('delete', { fallback: 'حذف' })}</span>
                  </button>
                )}
                <button 
                  type="button"
                  onClick={clearDraft} 
                  className="py-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-red-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95" 
                  title={t('clearDraft', { fallback: 'مسح الكل' })}
                >
                  <RotateCcw size={14} />
                  <span>{t('clearDraft', { fallback: 'مسح التصميم' })}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Actions (Desktop Only - Mobile handles this in fixed bar) */}
          <div className="hidden md:flex bg-white rounded-3xl p-5 shadow-sm border border-border/50 flex-col gap-4">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500 font-medium">{t('totalPrice', { fallback: 'السعر الإجمالي' })}</span>
                {totalOrderQuantity > 1 && (
                  <span className="text-xs text-gray-400 font-mono">
                    ({totalPrice} ₺ × {totalOrderQuantity} {locale === 'tr' ? 'adet' : locale === 'en' ? 'pcs' : 'قطع'})
                  </span>
                )}
              </div>
              <span className="text-3xl font-black text-[var(--color-primary)]">{grandTotalPrice} ₺</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleAction('save')} disabled={isSaving} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-xl font-bold transition-colors disabled:opacity-50">
                <Save size={20} />
              </button>
              <button onClick={() => handleAction('cart')} disabled={isSaving} className="flex-[3] flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:opacity-90 text-white py-3 rounded-xl font-bold transition-all shadow-md disabled:opacity-50">
                <ShoppingCart size={20} /> {isSaving ? t('processing') : t('addToCart')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation (Clean 4-Tool Grid Layout) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 z-40 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-4 w-full px-2 py-1.5 gap-1">
          <button 
            onClick={() => setActiveMobileTab(activeMobileTab === 'elements' ? null : 'elements')} 
            className={cn("flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all active:scale-95", activeMobileTab === 'elements' ? "text-[var(--color-primary)] bg-orange-50 font-bold" : "text-gray-600 hover:text-gray-900")}
          >
            <LayoutTemplate size={20}/>
            <span className="text-[11px] font-bold mt-1 truncate max-w-full">{t('addElements')}</span>
          </button>
          
          <button 
            onClick={() => setActiveMobileTab(activeMobileTab === 'text' ? null : 'text')} 
            className={cn("flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all active:scale-95", activeMobileTab === 'text' ? "text-[var(--color-primary)] bg-orange-50 font-bold" : "text-gray-600 hover:text-gray-900")}
          >
            <Type size={20}/>
            <span className="text-[11px] font-bold mt-1 truncate max-w-full">{t('addText')}</span>
          </button>
          
          <button 
            onClick={() => setActiveMobileTab(activeMobileTab === 'layers' ? null : 'layers')} 
            className={cn("flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all active:scale-95", activeMobileTab === 'layers' ? "text-[var(--color-primary)] bg-orange-50 font-bold" : "text-gray-600 hover:text-gray-900")}
          >
            <Layers size={20}/>
            <span className="text-[11px] font-bold mt-1 truncate max-w-full">{t('layers')}</span>
          </button>

          <button 
            onClick={() => setActiveMobileTab(activeMobileTab === 'properties' ? null : 'properties')} 
            className={cn("flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all active:scale-95", activeMobileTab === 'properties' ? "text-[var(--color-primary)] bg-orange-50 font-bold" : "text-gray-600 hover:text-gray-900")}
          >
            <Settings size={20}/>
            <span className="text-[11px] font-bold mt-1 truncate max-w-full">{t('properties')}</span>
          </button>
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onSuccess={onAuthSuccess} />
      {isValidationModalOpen && (
        <ValidationModal 
          isOpen={isValidationModalOpen}
          issues={validationIssues} 
          onClose={() => setIsValidationModalOpen(false)} 
          onSafeMode={handleSafeMode}
          onFreeMode={handleFreeMode}
        />
      )}

      {/* Fullscreen Realistic Preview Modal with GPU-Accelerated Pinch-to-Zoom & Pan */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-6 animate-in fade-in duration-200">
          {/* Modal Header */}
          <div className="w-full flex items-center justify-between z-30 max-w-4xl px-2">
            <div className="flex items-center gap-2 text-white">
              <Eye size={20} className="text-amber-400" />
              <span className="font-bold text-sm sm:text-base md:text-lg">{tPreview('title')}</span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center"
              title={tPreview('close')}
            >
              <X size={22} />
            </button>
          </div>

          {/* Centered Realistic Preview Image with GPU-Accelerated Pinch-to-Zoom & Pan */}
          <div className="flex-1 w-full h-full max-h-[72vh] flex items-center justify-center p-2 overflow-hidden relative select-none">
            <TransformWrapper
              initialScale={1}
              minScale={1}
              maxScale={4}
              centerOnInit={true}
              limitToBounds={true}
              smooth={false}
              wheel={{ step: 0.15 }}
              panning={{ disabled: false, velocityDisabled: true }}
              doubleClick={{ mode: "toggle", step: 1.5 }}
            >
              {({ zoomIn, zoomOut, resetTransform, state }) => (
                <>
                  {/* Floating Zoom Controls for Modal */}
                  <div className="absolute top-2 start-2 flex items-center gap-1 bg-black/70 backdrop-blur-md p-1.5 rounded-xl border border-white/20 z-30 shadow-lg">
                    <button
                      type="button"
                      onClick={() => zoomIn(0.5)}
                      className="p-1.5 text-white hover:bg-white/20 rounded-lg transition-colors active:scale-95"
                      title={t('zoomIn')}
                    >
                      <Plus size={16} />
                    </button>
                    <span className="text-[10px] sm:text-[11px] font-mono font-bold text-white px-1.5 min-w-[36px] text-center">
                      {Math.round((state.scale || 1) * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => zoomOut(0.5)}
                      className="p-1.5 text-white hover:bg-white/20 rounded-lg transition-colors active:scale-95"
                      title={t('zoomOut')}
                    >
                      <Minus size={16} />
                    </button>
                    {state.scale > 1.05 && (
                      <button
                        type="button"
                        onClick={() => resetTransform()}
                        className="px-2 py-1 text-[10px] text-amber-400 font-bold hover:bg-white/20 rounded-lg transition-colors active:scale-95"
                      >
                        100%
                      </button>
                    )}
                  </div>

                  <TransformComponent
                    wrapperClass="!w-full !h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
                    contentClass="!w-full !h-full flex items-center justify-center"
                  >
                    <img
                      src={previewImage}
                      alt={tPreview('title')}
                      draggable={false}
                      className="max-h-[66vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10 bg-white/5 transform-gpu will-change-transform backface-hidden select-none pointer-events-none"
                    />
                  </TransformComponent>

                  {/* Subtle Zoom Hint */}
                  <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none z-20">
                    <span className="text-[10px] text-white/70 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 shadow-sm">
                      {tPreview('zoomHint')}
                    </span>
                  </div>
                </>
              )}
            </TransformWrapper>
          </div>

          {/* Modal Bottom CTA Bar */}
          <div className="w-full max-w-xl flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 z-30 bg-white/10 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between w-full sm:w-auto sm:flex-col sm:items-start px-2">
              <span className="text-xs text-gray-300">{t('totalPrice')}</span>
              <span className="font-black text-lg sm:text-xl text-white font-mono">{totalPrice} ₺</span>
            </div>
            <div className="flex flex-1 w-full gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPreviewImage(null);
                  handleAction('buy_now');
                }}
                disabled={isSaving}
                className="flex-1 py-3 px-4 bg-white text-gray-900 hover:bg-gray-100 font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Zap size={16} className="text-amber-500 fill-amber-500 shrink-0" />
                <span>{isSaving ? t('processing') : t('buyNow')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewImage(null);
                  handleAction('cart');
                }}
                disabled={isSaving}
                className="flex-1 py-3 px-4 bg-[var(--color-primary)] hover:opacity-90 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <ShoppingCart size={16} className="shrink-0" />
                <span>{isSaving ? t('processing') : t('addToCart')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset / Sticker Gallery Modal ("اختر من معرضنا") */}
      <AssetGalleryModal
        isOpen={isGalleryModalOpen}
        onClose={() => setIsGalleryModalOpen(false)}
        categories={displayCategories}
        assets={allStickersList}
        initialCategory={selectedStickerCategory}
        onSelectAsset={(asset) => {
          addSticker(asset.url, asset);
          showToast(t('itemAddedSuccess', { fallback: 'تمت إضافة العنصر إلى التصميم بنجاح' }), 'success');
          setIsGalleryModalOpen(false);
        }}
      />
      {/* Multi-Size & Quantity Matrix Modal */}
      <MultiVariantMatrixModal
        isOpen={isMatrixModalOpen}
        onClose={() => setIsMatrixModalOpen(false)}
        availableSizes={availableSizes}
        availableColors={availableColors}
        unitPrice={Number(totalPrice) || basePrice}
        selectedColor={selectedColor}
        selectedSize={selectedSize}
        currentMatrix={variantMatrix}
        totalOrderQuantity={totalOrderQuantity}
        getStockForVariant={getStockForVariant}
        syncAllColors={syncAllColors}
        onToggleSyncAllColors={(val) => {
          setSyncAllColors(val);
          syncAllColorsRef.current = val;
          if (val) {
            propagateDesignToAllColors();
          }
        }}
        onApplyMatrix={(breakdown, totalQty) => {
          setVariantMatrix(breakdown);
          setTotalOrderQuantity(totalQty);
          if (breakdown.length > 0) {
            setSelectedColor(breakdown[0].color);
            setSelectedSize(breakdown[0].size);
          }
          showToast(
            locale === 'tr' ? `${totalQty} adet matris seçimi uygulandı` : locale === 'en' ? `${totalQty} items selected in matrix` : `تم تطبيق تحديد ${totalQty} قطعة بنجاح`,
            'info'
          );
        }}
        onAddToCartDirect={(breakdown, totalQty) => {
          setVariantMatrix(breakdown);
          setTotalOrderQuantity(totalQty);
          if (breakdown.length > 0) {
            setSelectedColor(breakdown[0].color);
            setSelectedSize(breakdown[0].size);
          }
          handleAction('cart');
        }}
      />
    </div>
  );
}