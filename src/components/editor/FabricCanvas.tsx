"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { fabric } from 'fabric';
import { Ruler, Type, Upload, Sticker, Undo, Redo, AlignCenter, AlignLeft, AlignRight, Save, ShoppingCart, Trash2, LayoutTemplate, X, Layers, Settings, Plus, Minus, ZoomIn, ZoomOut, Hand, Zap, Eye, CheckCircle2, AlertTriangle, Sparkles, Tag, RotateCcw, RotateCw, Bookmark, Box, Shirt, ChevronDown, ArrowUp, ArrowDown, EyeOff, ChevronLeft, ChevronRight, Loader2, Search, Wand2, Target, Truck, ShieldCheck, Check, Crosshair, Copy, ArrowUpDown, FolderOpen, Lock, Unlock, AlertCircle, ArrowLeft, ArrowRight, Cloud } from 'lucide-react';
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
import MobileTextToolbar from './tools/MobileTextToolbar';
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
  subscribeToPricingSettings,
  calculateCustomProductPrice, 
  DEFAULT_PRICING_CONFIG, 
  PricingSettingsConfig, 
  PriceCalculationResult 
} from '@/lib/pricing';
import { optimizeImageForUpload } from '@/lib/image-optimizer';
import { setupModernFabricControls, applyModernObjectStyles as applyCustomModernStyles, applyModernStyleToObject } from '@/lib/fabricCustomControls';
import {
  setupSmartGuidesOnCanvas,
  applySmartSnappingToCanvas,
  applySmartScalingGuidesToCanvas,
  clearSmartGuidelinesFromCanvas,
} from '@/lib/fabricSmartGuides';
import GarmentPlacementGuide from './GarmentPlacementGuide';
import { resolveProductStudioProfile, resolveMugMeta } from '@/lib/productStudioProfile';
import {
  MugStudioControlsBar,
  MugPanoramicGuidesOverlay,
  MugPanoramicQuickBar,
  MugPanoramicSheetBackdrop,
  MugPrintMode,
  MugPanoramaZone,
} from './MugStudioControls';
import {
  MugLivePanoramaPanel,
  MUG_CAMERA_ANGLES,
  renderMugWrapThumbnailDataUrl,
} from './Mug3DStage';
import Mug3DPreviewModal from './Mug3DPreviewModal';
import { PlacementSpec, getPlacementById, isFaceMatching, getPlacementsForGarment } from '@/lib/printPlacementConfig';

export interface PreviewSlideItem {
  face: string;
  designUrl?: string;
  mockupUrl?: string;
}

export const MUG_PANORAMA_SHEET_WIDTH = 1840; // 23 cm @ 80 px/cm (<= 1 cm ceramic clearance beside handle)
export const MUG_PANORAMA_SHEET_HEIGHT = 760; // Exact 23 : 9.5 cm aspect ratio (80 px/cm)

function buildSerializedFaceJson(
  c: fabric.Canvas,
  isPanoramicSheet: boolean,
  nativeW: number,
  nativeH: number
) {
  const json = c.toJSON(SERIALIZE_PROPERTIES) as any;
  if (isPanoramicSheet) {
    json.width = MUG_PANORAMA_SHEET_WIDTH;
    json.height = MUG_PANORAMA_SHEET_HEIGHT;
    json.mugPanoramaSheet = true;
  } else {
    json.width = nativeW;
    json.height = nativeH;
  }
  return json;
}

/** Re-centers legacy panoramic mug drafts (e.g. 1600x760) onto the current 1840x760 wrap sheet without stretching artwork. */
function migrateLegacyMugPanoramaObjects(targetCanvas: fabric.StaticCanvas, parsed: any): boolean {
  if (
    !parsed?.mugPanoramaSheet ||
    !(Number(parsed?.width) > 0) ||
    Number(parsed?.width) === MUG_PANORAMA_SHEET_WIDTH
  ) {
    return false;
  }
  const legacyW = Number(parsed.width);
  const legacyH = Number(parsed?.height) || MUG_PANORAMA_SHEET_HEIGHT;
  const scaleXRatio = MUG_PANORAMA_SHEET_WIDTH / legacyW;
  const scaleYRatio = MUG_PANORAMA_SHEET_HEIGHT / legacyH;
  const userLoadedObjs = targetCanvas.getObjects().filter((o: any) => {
    const n = (o?.name || '').toLowerCase();
    return n !== 'background' && n !== 'mockup' && n !== 'print_area_guide' && n !== 'guideline';
  });
  userLoadedObjs.forEach((obj: any) => {
    const center = obj.getCenterPoint();
    const br = obj.getBoundingRect(true, true);
    const isFullBleedBg = br.width >= legacyW * 0.92;
    const nextCx = (center.x / legacyW) * MUG_PANORAMA_SHEET_WIDTH;
    const nextCy = (center.y / legacyH) * MUG_PANORAMA_SHEET_HEIGHT;
    if (isFullBleedBg) {
      const uniformCover = Math.max(scaleXRatio, scaleYRatio);
      obj.set({
        scaleX: (obj.scaleX || 1) * uniformCover,
        scaleY: (obj.scaleY || 1) * uniformCover,
      });
    }
    obj.setPositionByOrigin(new fabric.Point(nextCx, nextCy), 'center', 'center');
    obj.set({ clipPath: undefined });
    obj.setCoords();
  });
  return true;
}

const COLOR_MAP: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  gray: '#9CA3AF',
  navy: '#1E3A8A',
  blue: '#3B82F6',
  red: '#EF4444'
};

export const SERIALIZE_PROPERTIES = [
  'id', 'name', 'selectable', 'evented', 'src', 'originalAssetId', 'crossOrigin',
  'isCustomUpload', 'assetName', 'assetPrice', 'fontSize', 'fontFamily',
  'fontWeight', 'fontStyle', 'underline', 'fill', 'stroke', 'strokeWidth',
  'textAlign', 'lineHeight', 'charSpacing', 'opacity', 'scaleX', 'scaleY',
  'angle', 'left', 'top', 'width', 'height', 'flipX', 'flipY',
  'assignedPlacementId', 'placementId', 'targetFace',
  'originMode', 'createdInMode',
  'isLocked', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY',
  'hasControls', 'hasBorders'
];

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

function wipeFullCanvasContext(fabricCanvas: any, ctx: CanvasRenderingContext2D | null | undefined) {
  if (!ctx) return fabricCanvas;
  const retina = fabricCanvas?.getRetinaScaling ? fabricCanvas.getRetinaScaling() : (fabricCanvas?.retinaScaling || 1);
  const backingEl = ctx.canvas;
  const clearW = Math.max(backingEl?.width || 0, Math.ceil((fabricCanvas?.getWidth?.() || 0) * retina));
  const clearH = Math.max(backingEl?.height || 0, Math.ceil((fabricCanvas?.getHeight?.() || 0) * retina));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, clearW, clearH);
  ctx.restore();
  return fabricCanvas;
}

function applyActiveSelectionBoundsStyle(
  activeObj: fabric.Object,
  canvasWidth: number,
  isOutOfBounds: boolean
) {
  const scale = Math.max(1, canvasWidth / 400);
  const strokeColor = isOutOfBounds ? '#dc2626' : '#2563EB';
  (activeObj.set as any)({
    borderColor: strokeColor,
    cornerStrokeColor: strokeColor,
    editingBorderColor: strokeColor,
    cursorColor: strokeColor,
    borderDashArray: [Math.round(5 * scale), Math.round(4 * scale)],
    borderScaleFactor: Math.max(1.5, Math.round(1.6 * scale * 0.52)),
    padding: Math.round(5 * scale),
  });
}

// Mobile-First Global Fabric Handle & Touch Configuration with High Quality Image Smoothing
if (typeof window !== 'undefined' && fabric) {
  setupModernFabricControls(fabric);

  // Robust null-safety patch for fabric.util.setImageSmoothing to prevent TypeError: Cannot read properties of null (reading 'imageSmoothingEnabled')
  if (fabric.util) {
    const origSetImageSmoothing = fabric.util.setImageSmoothing;
    fabric.util.setImageSmoothing = function(ctx: CanvasRenderingContext2D | null | undefined, value: boolean) {
      if (!ctx) return;
      try {
        if (origSetImageSmoothing) {
          origSetImageSmoothing(ctx, value);
        } else {
          (ctx as any).imageSmoothingEnabled = value;
        }
      } catch (e) {}
    };
  }

  if (fabric.Canvas) {
    // Safe renderCanvas wrapper guarding against null contextContainer / disposed canvas
    const origRenderCanvas = fabric.Canvas.prototype.renderCanvas;
    fabric.Canvas.prototype.renderCanvas = function(ctx: CanvasRenderingContext2D | null | undefined, objects: any) {
      if (!ctx || !(this as any).contextContainer || (this as any).disposed) {
        return this;
      }
      try {
        return origRenderCanvas.call(this, ctx, objects);
      } catch (err) {
        console.warn("Fabric renderCanvas prevented crash:", err);
        return this;
      }
    };

    // Safe renderAll wrapper guarding against disposed canvas or null context
    const origRenderAll = fabric.Canvas.prototype.renderAll;
    fabric.Canvas.prototype.renderAll = function() {
      if (!(this as any).contextContainer || (this as any).disposed) {
        return this;
      }
      try {
        return origRenderAll.call(this);
      } catch (err) {
        console.warn("Fabric renderAll prevented crash:", err);
        return this;
      }
    };

    fabric.Canvas.prototype.clearContext = function(ctx: CanvasRenderingContext2D) {
      return wipeFullCanvasContext(this, ctx);
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
  onChangeProduct?: () => void;
}

const PRICING = {
  text: 10,
  image: 20,
  sticker: 5,
};

export default function FabricCanvas({ productId, basePrice, productFaces, productData, initialColor, initialSize, initialQuantity, onChangeProduct }: FabricCanvasProps) {
  const t = useTranslations('Editor');
  const tPreview = useTranslations('Preview');
  const tMug = useTranslations('MugStudio');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const designIdFromUrl = searchParams.get('designId');
  const mode = searchParams.get('mode');
  const colorFromUrl = searchParams.get('color');
  const sizeFromUrl = searchParams.get('size');
  const quantityFromUrl = searchParams.get('quantity');
  const printMethodFromUrl = searchParams.get('printMethod') || searchParams.get('print_method');

  const studioProfile = useMemo(() => resolveProductStudioProfile(productData), [productData]);
  const mugMeta = useMemo(() => resolveMugMeta(productData), [productData]);
  const [mug3DPreviewOpen, setMug3DPreviewOpen] = useState(false);
  const [isQualityTipsModalOpen, setIsQualityTipsModalOpen] = useState(false);
  const [liveDimensions, setLiveDimensions] = useState<{
    widthCm: string;
    heightCm: string;
    placementId: string;
    placementName: string;
    placementWidthCm: number;
    placementHeightCm: number;
    collarOffsetCm: string;
    isCentered: boolean;
    isScaling: boolean;
    boxLeftPercent: number;
    boxTopPercent: number;
    boxWidthPercent?: number;
    boxHeightPercent?: number;
    effectiveDpi?: number;
    qualityLevel?: 'excellent' | 'acceptable' | 'low';
    isImage?: boolean;
    isOpaqueJpg?: boolean;
    sourceWidthPx: number;
    sourceHeightPx: number;
  } | null>(null);
  const scaleHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mug3DSlides, setMug3DSlides] = useState<PreviewSlideItem[]>([]);
  const [liveMugTextureUrl, setLiveMugTextureUrl] = useState<string | null>(null);
  const [showLive3DPanel, setShowLive3DPanel] = useState<boolean>(true);
  const [mobilePanoramaView, setMobilePanoramaView] = useState<'2d' | '3d'>('2d');
  const [liveYawRequest, setLiveYawRequest] = useState<{ yaw: number; seq: number } | null>(null);
  const liveTextureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLiveMugTextureRefreshRef = useRef<(targetCanvas?: fabric.Canvas | null, delayMs?: number) => void>(() => {});
  const resolvedInitialColor = initialColor || colorFromUrl || productData?.selectedColor || 'white';
  const resolvedInitialSize = initialSize || sizeFromUrl || productData?.selectedSize || studioProfile.defaultSelectedSize;
  const resolvedInitialQuantity = initialQuantity || (quantityFromUrl ? Math.max(1, parseInt(quantityFromUrl, 10) || 1) : null) || productData?.initialQuantity || 1;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null);
  const isTextActive = Boolean(activeObject && (activeObject.type === 'textbox' || activeObject.type === 'i-text'));
  
  // The faces we support depending on the product
  const configFaces = productData?.config?.faces || { front: { name: 'Front', printArea: { id: 'front', name: 'Front', left: 0, top: 0, width: 1000, height: 1000 } } };
  const availableFaces = Object.keys(configFaces);
  
  const [activeFace, setActiveFace] = useState<string>(availableFaces[0] || 'front');

  const mugSingleFaceStorageKey = `studio_mug_single_face_${productId}`;
  const [mugSingleSideFace, setMugSingleSideFace] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(mugSingleFaceStorageKey);
        if (saved && availableFaces.includes(saved)) return saved;
      } catch {}
    }
    return availableFaces[0] || 'front';
  });
  const mugSingleSideFaceRef = useRef<string>(mugSingleSideFace);
  mugSingleSideFaceRef.current = mugSingleSideFace;

  const updateMugSingleSideFace = useCallback((face: string) => {
    const validFace = availableFaces.includes(face) ? face : (availableFaces[0] || 'front');
    mugSingleSideFaceRef.current = validFace;
    setMugSingleSideFace(validFace);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(mugSingleFaceStorageKey, validFace);
      } catch {}
    }
  }, [availableFaces, mugSingleFaceStorageKey]);
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
  const [previewSlides, setPreviewSlides] = useState<{ face: string; label: string; imageUrl: string; hasDesign: boolean }[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [previewIntent, setPreviewIntent] = useState<'cart_confirm' | 'inspect' | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [modalZoom, setModalZoom] = useState<number>(1);
  const [modalPan, setModalPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalTouchDistRef = useRef<number | null>(null);
  const isModalDraggingRef = useRef<boolean>(false);
  const modalLastTouchPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [imageQualityReport, setImageQualityReport] = useState<{ status: string, message: string, color: string } | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isMugSingleFaceConflictOpen, setIsMugSingleFaceConflictOpen] = useState(false);
  const [mugConflictFaces, setMugConflictFaces] = useState<string[]>([]);
  const [validationIssues, setValidationIssues] = useState<{ type: 'error' | 'warning', message: string }[]>([]);
  const [customizationMode, setCustomizationMode] = useState<'SAFE' | 'FREE'>('SAFE');
  const [activeMobileTab, setActiveMobileTab] = useState<string | null>(null);
  const [activeToolTab, setActiveToolTab] = useState<'stickers' | 'upload' | 'text' | 'ai'>('stickers');
  const [stickerSearchQuery, setStickerSearchQuery] = useState<string>('');
  const [isPlacementGuideModalOpen, setIsPlacementGuideModalOpen] = useState<boolean>(false);
  const [smartAlignmentEnabled, setSmartAlignmentEnabled] = useState<boolean>(true);
  const [showSafeZone, setShowSafeZone] = useState<boolean>(true);
  const [showPlacementDetailsBar, setShowPlacementDetailsBar] = useState<boolean>(true);
  const [isSizeGuideModalOpen, setIsSizeGuideModalOpen] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [isObjectOutOfBounds, setIsObjectOutOfBounds] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
  
  const [selectedSize, setSelectedSize] = useState(resolvedInitialSize);
  const [selectedColor, setSelectedColor] = useState(resolvedInitialColor);
  const availableSizes = Array.isArray(productData?.sizes) && productData.sizes.length > 0 ? productData.sizes : studioProfile.defaultVariantSizes;
  const availableColors = Array.isArray(productData?.colors) && productData.colors.length > 0 ? productData.colors : ['white', 'black', 'navy', '#DC2626', '#4B5563'];

  useEffect(() => {
    if (!studioProfile.hasApparelSizes && Array.isArray(availableSizes) && availableSizes.length > 0) {
      if (!availableSizes.some((s: string) => s.trim().toLowerCase() === (selectedSize || '').trim().toLowerCase())) {
        setSelectedSize(availableSizes[0]);
      }
    }
  }, [studioProfile.hasApparelSizes, availableSizes, selectedSize]);
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
  const placementsByColorRef = useRef<Record<string, string[]>>(placementsByColor);
  placementsByColorRef.current = placementsByColor;
  const [syncPlacementsAcrossColors, setSyncPlacementsAcrossColors] = useState<boolean>(false);
  const syncPlacementsAcrossColorsRef = useRef(syncPlacementsAcrossColors);
  syncPlacementsAcrossColorsRef.current = syncPlacementsAcrossColors;

  // Free Placement Mode state (الوضع الحر)
  const [isFreeMode, setIsFreeMode] = useState<boolean>(false);
  const isFreeModeRef = useRef<boolean>(isFreeMode);
  isFreeModeRef.current = isFreeMode;

  const checkObjectBoundsRef = useRef<((targetCanvas?: fabric.Canvas | null) => void) | null>(null);
  const handleToggleFreeModeRef = useRef<((enabled: boolean) => void) | null>(null);

  const handleToggleFreeMode = useCallback((enabled: boolean) => {
    setIsFreeMode(enabled);
    isFreeModeRef.current = enabled;
    if (handleToggleFreeModeRef.current) {
      handleToggleFreeModeRef.current(enabled);
    } else {
      if (canvas && checkObjectBoundsRef.current) {
        setTimeout(() => {
          checkObjectBoundsRef.current?.(canvas);
        }, 50);
      }
    }
  }, [canvas]);

  // Hovered placement during drag & drop snapping
  const [hoveredPlacementId, setHoveredPlacementId] = useState<string | null>(null);
  const hoveredPlacementIdRef = useRef<string | null>(null);
  hoveredPlacementIdRef.current = hoveredPlacementId;

  // Active / Focused placement (Single placement focus strategy: only 1 placement visible at rest, all visible while dragging)
  const [focusedPlacementId, setFocusedPlacementId] = useState<string | null>(null);
  const [isObjectDragging, setIsObjectDragging] = useState<boolean>(false);
  const isObjectDraggingRef = useRef<boolean>(false);
  const isObjectScalingRef = useRef<boolean>(false);
  const smartAlignmentEnabledRef = useRef<boolean>(smartAlignmentEnabled);
  smartAlignmentEnabledRef.current = smartAlignmentEnabled;

  // Dynamic Animated Guidance & Real Product Specs Banner
  const [showTypewriterHint, setShowTypewriterHint] = useState<boolean>(true);
  const [typewriterIndex, setTypewriterIndex] = useState<number>(0);

  // Helper to determine if a fabric color is dark (relative luminance < 145)
  const isFabricColorDark = useCallback((colorStr?: string): boolean => {
    if (!colorStr) return false;
    const s = colorStr.trim().toLowerCase();
    if (['black', 'siyah', 'أسود', 'navy', 'lacivert', 'كحلي', 'dark', 'charcoal', 'füme', 'maroon', 'bordo', 'antrasit', 'brown', 'kahve', 'بني'].some(k => s.includes(k))) {
      return true;
    }
    if (['white', 'beyaz', 'أبيض', 'cream', 'krem', 'بيج', 'beige', 'light', 'açık', 'transparent'].some(k => s.includes(k))) {
      return false;
    }
    if (s.startsWith('#')) {
      let hex = s.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          return luminance < 145;
        }
      }
    }
    return false;
  }, []);

  // Extract explicit print type/strategy metadata from Firestore product document
  const explicitRawStrategy =
    productData?.config?.printStrategy ||
    productData?.customization_config?.printStrategy ||
    productData?.print_strategy;

  const rawExplicitPrint = useMemo(() => {
    const facePrintMethod = (() => {
      const facesObj = productData?.config?.faces || productData?.customization_config?.faces;
      if (!facesObj || typeof facesObj !== 'object') return '';
      const activeMethod = facesObj[activeFace]?.printArea?.printMethod;
      if (typeof activeMethod === 'string' && activeMethod.trim()) return activeMethod.trim();
      const firstFace = Object.values(facesObj).find((f: any) => f?.printArea?.printMethod) as any;
      return typeof firstFace?.printArea?.printMethod === 'string' ? firstFace.printArea.printMethod.trim() : '';
    })();

    const candidate =
      productData?.[`print_type_${locale}`] ||
      productData?.print_type_en ||
      productData?.print_type_tr ||
      productData?.print_type_ar ||
      productData?.print_type ||
      productData?.print_method ||
      productData?.printing_method ||
      productData?.print_technology ||
      productData?.default_print_method ||
      productData?.config?.defaultPrintMethod ||
      productData?.customization_config?.defaultPrintMethod ||
      facePrintMethod ||
      '';

    return typeof candidate === 'string' ? candidate.trim() : '';
  }, [productData, locale, activeFace]);

  // Determine Product Print Strategy from Firestore data
  const printStrategy = useMemo(() => {
    if (explicitRawStrategy === 'customer_choice' || explicitRawStrategy === 'sublimation_only' || explicitRawStrategy === 'dtf_only') {
      return explicitRawStrategy;
    }
    const cat = (productData?.category_id || productData?.category || productData?.config?.garmentType || '').toLowerCase();
    if (cat.includes('mug') || cat.includes('كوب') || cat.includes('kupa')) {
      return 'sublimation_only';
    }
    const lowerPrint = rawExplicitPrint.toLowerCase();
    const mentionsSublimation =
      lowerPrint.includes('sublim') ||
      lowerPrint.includes('süblim') ||
      lowerPrint.includes('سبلم') ||
      lowerPrint.includes('سوبلم') ||
      lowerPrint.includes('تسام');
    const mentionsDtf = lowerPrint.includes('dtf') || lowerPrint.includes('دي تي اف');
    if (mentionsSublimation && mentionsDtf) {
      return 'customer_choice';
    }
    if (mentionsSublimation) {
      return 'sublimation_only';
    }
    return 'dtf_only';
  }, [explicitRawStrategy, productData, rawExplicitPrint]);

  const isCustomerChoiceAllowed = printStrategy === 'customer_choice';
  const isCustomerChoiceAllowedRef = useRef<boolean>(isCustomerChoiceAllowed);
  isCustomerChoiceAllowedRef.current = isCustomerChoiceAllowed;

  const defaultResolvedMethod = useMemo<'DTF' | 'Sublimation'>(() => {
    if (isCustomerChoiceAllowed && printMethodFromUrl) {
      const lowerUrl = printMethodFromUrl.toLowerCase();
      if (lowerUrl.includes('sublim') || lowerUrl.includes('süblim')) {
        return 'Sublimation';
      }
      if (lowerUrl.includes('dtf')) {
        return 'DTF';
      }
    }
    const rawDefault = String(
      productData?.config?.defaultPrintMethod ||
      productData?.customization_config?.defaultPrintMethod ||
      productData?.default_print_method ||
      ''
    ).toLowerCase();
    if (rawDefault.includes('sublim') || rawDefault.includes('süblim') || rawDefault.includes('سبلم')) {
      return 'Sublimation';
    }
    if (printStrategy === 'sublimation_only') {
      return 'Sublimation';
    }
    return 'DTF';
  }, [isCustomerChoiceAllowed, printMethodFromUrl, productData, printStrategy]);

  const [selectedPrintMethod, setSelectedPrintMethod] = useState<'DTF' | 'Sublimation'>(defaultResolvedMethod);
  const userModifiedPrintMethodRef = useRef<boolean>(false);

  useEffect(() => {
    userModifiedPrintMethodRef.current = false;
  }, [productId]);

  // Sync selectedPrintMethod if defaultResolvedMethod changes before manual selection
  useEffect(() => {
    if (!userModifiedPrintMethodRef.current) {
      setSelectedPrintMethod(defaultResolvedMethod);
    }
  }, [defaultResolvedMethod]);

  const isCurrentColorDark = useMemo(() => isFabricColorDark(selectedColor), [selectedColor, isFabricColorDark]);

  // Dynamically resolve actual print method label from state and product data
  const dynamicPrintMethod = useMemo(() => {
    if (isCustomerChoiceAllowed) {
      return selectedPrintMethod === 'Sublimation'
        ? (locale === 'tr' ? 'Süblimasyon' : 'Sublimation')
        : 'DTF';
    }

    if (printStrategy === 'sublimation_only') {
      return locale === 'tr' ? 'Süblimasyon' : 'Sublimation';
    }

    if (explicitRawStrategy === 'dtf_only') {
      return 'DTF';
    }

    const raw = rawExplicitPrint;
    if (!raw) {
      const cat = (productData?.category_id || productData?.category || productData?.config?.garmentType || '').toLowerCase();
      if (cat.includes('mug') || cat.includes('كوب') || cat.includes('kupa')) {
        return locale === 'tr' ? 'Süblimasyon' : 'Sublimation';
      }
      return 'DTF';
    }

    const lower = raw.toLowerCase();
    if (lower.includes('sublim') || lower.includes('سبلم') || lower.includes('سوبلم') || lower.includes('süblim') || lower.includes('تسام')) {
      return locale === 'tr' ? 'Süblimasyon' : 'Sublimation';
    }
    if (lower.includes('dtf') || lower.includes('دي تي اف')) {
      return 'DTF';
    }
    if (lower.includes('embroid') || lower.includes('تطريز') || lower.includes('nakış')) {
      return locale === 'ar' ? 'تطريز' : locale === 'tr' ? 'Nakış' : 'Embroidery';
    }

    return raw;
  }, [isCustomerChoiceAllowed, selectedPrintMethod, printStrategy, explicitRawStrategy, rawExplicitPrint, productData, locale]);

  const guidanceTips = useMemo(() => {
    const isAr = locale === 'ar';
    const isTr = locale === 'tr';

    const cat = (productData?.category_id || productData?.category || productData?.config?.garmentType || '').toLowerCase();
    const isMug = cat.includes('mug') || cat.includes('كوب') || cat.includes('kupa');
    const isHat = cat.includes('hat') || cat.includes('cap') || cat.includes('قبعة') || cat.includes('sapka');
    const isHoodie = cat.includes('hoodie') || cat.includes('هودي');

    // 1. Real Fabric / Material specification
    const realFabric = productData?.[`fabric_type_${locale}`] || productData?.fabric_type_en || productData?.fabric_type || productData?.material;
    let fabricText = '';
    if (realFabric) {
      fabricText = `${isAr ? 'نوع الخامة' : isTr ? 'Kumaş / Malzeme' : 'Material'}: ${realFabric}`;
    } else if (isMug) {
      fabricText = isAr ? 'خامة فاخرة: سيراميك حراري عالي الجودة آمن لغسالة الأطباق والميكروويف'
                        : isTr ? 'Özellik: Bulaşık makinesi ve mikrodalgaya dayanıklı kaliteli porselen seramik'
                        : 'Material: Dishwasher & microwave safe high-grade heat-resistant ceramic';
    } else if (isHat) {
      fabricText = isAr ? 'خامة فاخرة: 100% قطن تويل متين ومقاوم للتشوه مع حزام تعديل مريح'
                        : isTr ? 'Malzeme: %100 dayanıklı pamuklu dimi kumaş, ayarlanabilir metal toka'
                        : 'Material: 100% durable structured cotton twill with adjustable strap';
    } else if (isHoodie) {
      fabricText = isAr ? 'خامة فاخرة: قطن تركي ثقيل 320gsm مبطن بالفليس فائق الدفء والنعومة'
                        : isTr ? 'Malzeme: 320gsm içi şardonlu polar astarlı %100 pamuklu kumaş'
                        : 'Material: Heavyweight 320gsm Turkish cotton with soft brushed fleece';
    } else {
      fabricText = isAr ? 'خامة فاخرة: 100% قطن تركي ممشط 240gsm بقصة أوفر سايز عصرية وثبات عالي'
                        : isTr ? 'Kumaş: 240gsm %100 taranmış Türk pamuğu, dökümlü oversize kalıp'
                        : 'Material: 240gsm 100% combed Turkish cotton in premium oversize fit';
    }

    // 2. Real Print Type specification
    const realPrint = productData?.[`print_type_${locale}`] || productData?.print_type_en || productData?.print_type || productData?.print_method || productData?.printing_method || productData?.print_technology;
    let printText = '';
    if (realPrint) {
      printText = `${isAr ? 'نوع الطباعة' : isTr ? 'Baskı Türü' : 'Print Type'}: ${realPrint}`;
    } else {
      printText = isAr ? `تقنية الطباعة: طباعة حرارية ${dynamicPrintMethod} متطورة فائقة النقاء وعالية الثبات مع الغسيل`
                       : isTr ? `Baskı Türü: Yüksek çözünürlüklü ${dynamicPrintMethod} termal transfer baskı`
                       : `Print Quality: High-resolution ${dynamicPrintMethod} thermal transfer with lasting colors`;
    }

    // 3. Real Product Features
    const realFeatures = productData?.[`features_${locale}`] || productData?.features_en || productData?.features;

    const list: { icon: string; tag: string; text: string }[] = [
      {
        icon: isMug ? '☕' : isHat ? '🧢' : '🧵',
        tag: isAr ? 'مواصفات الخامة' : isTr ? 'Malzeme' : 'Material',
        text: fabricText
      },
      {
        icon: '🖨️',
        tag: isAr ? 'جودة الطباعة' : isTr ? 'Baskı Teknolojisi' : 'Print Quality',
        text: printText
      }
    ];

    if (realFeatures) {
      list.push({
        icon: '⭐',
        tag: isAr ? 'مميزات المنتج' : isTr ? 'Özellikler' : 'Features',
        text: `${isAr ? 'المميزات' : isTr ? 'Özellikler' : 'Features'}: ${realFeatures}`
      });
    }

    // Interactive guidance hints
    list.push(
      {
        icon: '🎨',
        tag: isAr ? 'تغيير الألوان' : isTr ? 'Renk Değiştir' : 'Color Palette',
        text: isAr ? 'ألوان متعددة: اضغط على أي عينة لونية في الأسفل لتغيير لون المنتج ومعاينة التصميم فوراً'
                   : isTr ? 'Renk Seçimi: Ürün rengini anında değiştirmek ve tasarımı görmek için aşağıdaki renk paletine dokunun'
                   : 'Color Switcher: Click any color swatch below to instantly change product color and preview'
      },
      {
        icon: '📦',
        tag: studioProfile.hasApparelSizes
          ? (isAr ? 'طلب مجمّع' : isTr ? 'Çoklu Sipariş' : 'Bulk Sizes')
          : (isAr ? 'تعدد الألوان' : isTr ? 'Çoklu Sipariş' : 'Bulk Order'),
        text: studioProfile.hasApparelSizes
          ? (isAr ? 'طلب مجمّع: يمكنك طلب مقاسات وألوان متعددة لنفس تصميمك دفعة واحدة من جدول المقاسات'
                   : isTr ? 'Çoklu Beden: Aynı tasarım için tek seferde farklı beden ve renkleri seçip sipariş verebilirsiniz'
                   : 'Multi-Variant: Order multiple sizes and colors for the same design in a single batch')
          : (isAr ? 'تعدد الألوان والكميات: يمكنك تحديد الكمية المطلوبة أو طلب عدة ألوان مختلفة لتصميمك دفعة واحدة'
                   : isTr ? 'Çoklu Adet ve Renk: Aynı tasarım için tek seferde dilediğiniz adet ve renklerde sipariş verebilirsiniz'
                   : 'Bulk Quantity: Order multiple colors and quantities for your custom design in one batch')
      },
      {
        icon: '🎯',
        tag: isAr ? 'توحيد المواضع' : isTr ? 'Baskı Alanı Kilitleme' : 'Sync Placements',
        text: isAr ? 'توحيد المواضع: يمكنك تثبيت وتوحيد مواضع الطباعة عبر جميع الألوان بنقرة واحدة من دليل المواضع'
                   : isTr ? 'Baskı Alanı Rehberi: Baskı alanlarını tüm renklere tek tıkla uygulayabilir veya ayırabilirsiniz'
                   : 'Placement Guide: Lock or customize print placements across all colors via the placement guide'
      },
      {
        icon: '✨',
        tag: isAr ? 'الذكاء الاصطناعي' : isTr ? 'Yapay Zeka' : 'AI Studio',
        text: isAr ? 'الذكاء الاصطناعي: استخدم أداة توليد الصور بالذكاء الاصطناعي في القائمة لابتكار رسومات حصرية بنقرة واحدة'
                   : isTr ? 'Yapay Zeka: Benzersiz özel görseller ve grafikler üretmek için AI tasarım üreticisini kullanın'
                   : 'AI Generator: Generate unique, high-resolution graphics instantly with our AI design tool'
      },
      {
        icon: '⚡',
        tag: isAr ? 'محاذاة ذكية' : isTr ? 'Akıllı Hizalama' : 'Smart Snap',
        text: isAr ? 'إرشاد ذكي: انقر واسحب الشعار بحرية لتغيير موضعه مع خطوط المحاذاة التلقائية الذكية'
                   : isTr ? 'Akıllı Hizalama: Tasarımı tuval üzerinde serbestçe sürükleyin, akıllı kılavuzlarla hizalayın'
                   : 'Smart Alignment: Freely drag elements across the canvas with automatic smart snap guidelines'
      }
    );

    return list;
  }, [productData, locale, studioProfile]);

  // Real product specifications for header subtitle (strictly from DB, never fabricated)
  const realProductHeaderSpecs = useMemo(() => {
    const parts: string[] = [];

    // 1. Material / Fabric composition from DB
    const mat = productData?.[`material_${locale}`] || 
                productData?.material || 
                productData?.[`fabric_type_${locale}`] || 
                productData?.fabric_type || 
                productData?.fabric_composition;
    if (mat && typeof mat === 'string' && mat.trim()) {
      parts.push(mat.trim());
    }

    // 2. Real GSM or fabric weight
    const gsm = productData?.gsm || productData?.weight;
    if (gsm) {
      parts.push(`${gsm}${typeof gsm === 'number' ? 'gsm' : ''}`);
    }

    // 3. Real Print Technology from DB
    const printType = productData?.[`print_type_${locale}`] || productData?.print_type;
    if (printType && typeof printType === 'string' && printType.trim()) {
      parts.push(printType.trim());
    }

    // 4. Real Fit / Cut from DB
    const fit = productData?.[`fit_${locale}`] || productData?.fit;
    if (fit && typeof fit === 'string' && fit.trim()) {
      parts.push(fit.trim());
    }

    // 5. Fallback: If no material entered in DB, use product category name from DB
    if (parts.length === 0) {
      const cat = productData?.[`category_${locale}`] || 
                  productData?.category_name || 
                  productData?.category || 
                  productData?.category_id;
      if (cat && typeof cat === 'string' && cat.trim()) {
        parts.push(cat.trim());
      }
    }

    return parts.join(' • ');
  }, [productData, locale]);

  useEffect(() => {
    if (!showTypewriterHint || guidanceTips.length === 0) return;
    const interval = setInterval(() => {
      setTypewriterIndex(prev => (prev + 1) % guidanceTips.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [showTypewriterHint, guidanceTips.length]);

  const normalizeColorKey = useCallback((color?: string | null): string => {
    if (!color) return 'default';
    const s = color.trim().toLowerCase();
    return COLOR_MAP[s]?.toLowerCase() || s;
  }, []);

  const activeColorKey = normalizeColorKey(selectedColor);

  const currentSelectedPlacementIds = useMemo(() => {
    if (syncPlacementsAcrossColors) {
      return placementsByColor['synced_all'] || placementsByColor['__synced__'] || placementsByColor[activeColorKey] || [];
    }
    return placementsByColor[activeColorKey] || [];
  }, [placementsByColor, activeColorKey, syncPlacementsAcrossColors]);

  const activeMugMode: MugPrintMode = useMemo(() => {
    if (currentSelectedPlacementIds.includes('mug_full_wrap')) return 'mug_full_wrap';
    if (currentSelectedPlacementIds.includes('mug_back')) return 'mug_two_sided';
    return 'mug_front';
  }, [currentSelectedPlacementIds]);

  const isMugPanoramicWorkspace = studioProfile.family === 'mug' && !isFreeMode && activeMugMode === 'mug_full_wrap';
  const isMugPanoramicWorkspaceRef = useRef<boolean>(isMugPanoramicWorkspace);
  isMugPanoramicWorkspaceRef.current = isMugPanoramicWorkspace;
  const isPanoramicFace = isFaceMatching('front', activeFace) && isMugPanoramicWorkspace;

  const isMugSingleMode = useMemo(() => (
    studioProfile.family === 'mug'
    && currentSelectedPlacementIds.includes('mug_front')
    && !currentSelectedPlacementIds.includes('mug_full_wrap')
    && !currentSelectedPlacementIds.includes('mug_back')
  ), [studioProfile.family, currentSelectedPlacementIds]);

  const allSelectedPlacements = useMemo(() => {
    const resolvedSingleFace = availableFaces.includes(mugSingleSideFace)
      ? mugSingleSideFace
      : (availableFaces[0] || 'front');
    const singleFaceLabels: Record<string, { nameAr: string; nameTr: string; nameEn: string }> = {
      back: { nameAr: 'الجهة الخلفية للكوب', nameTr: 'Kupa Arka Yüzeyi', nameEn: 'Mug Back Side' },
      other: { nameAr: 'الجهة الجانبية للكوب', nameTr: 'Kupa Yan Yüzeyi', nameEn: 'Mug Side View' },
    };
    return currentSelectedPlacementIds
      .map(id => {
        const spec = getPlacementById(id, productData?.config?.garmentType);
        if (!spec) return null;
        if (isMugSingleMode && id === 'mug_front') {
          return {
            ...spec,
            ...(singleFaceLabels[resolvedSingleFace] || {}),
            targetFace: resolvedSingleFace,
          };
        }
        return spec;
      })
      .filter((p): p is PlacementSpec => !!p);
  }, [currentSelectedPlacementIds, productData, isMugSingleMode, mugSingleSideFace, availableFaces]);

  const activeFaceSelectedPlacements = useMemo(() => {
    return allSelectedPlacements.filter(
      (p) =>
        isFaceMatching(p.targetFace, activeFace) ||
        (studioProfile.family === 'mug' && p.id === 'mug_full_wrap')
    );
  }, [allSelectedPlacements, activeFace, studioProfile.family]);

  const otherFacesSelectedPlacements = useMemo(() => {
    return allSelectedPlacements.filter(
      (p) =>
        !(
          isFaceMatching(p.targetFace, activeFace) ||
          (studioProfile.family === 'mug' && p.id === 'mug_full_wrap')
        )
    );
  }, [allSelectedPlacements, activeFace, studioProfile.family]);

  const otherFacesSummary = useMemo(() => {
    const groups: Record<string, { face: string; count: number; firstPlacementId: string; label: string }> = {};
    for (const spec of otherFacesSelectedPlacements) {
      if (!groups[spec.targetFace]) {
        const faceLabel = spec.targetFace === 'front' ? (locale === 'tr' ? 'Ön' : locale === 'en' ? 'Front' : 'الأمام') :
                          spec.targetFace === 'back' ? (locale === 'tr' ? 'Arka' : locale === 'en' ? 'Back' : 'الخلف') :
                          spec.targetFace === 'right' ? (locale === 'tr' ? 'Sağ Kol' : locale === 'en' ? 'Right Sleeve' : 'الكتف الأيمن') :
                          (locale === 'tr' ? 'Sol Kol' : locale === 'en' ? 'Left Sleeve' : 'الكتف الأيسر');
        groups[spec.targetFace] = {
          face: spec.targetFace,
          count: 0,
          firstPlacementId: spec.id,
          label: faceLabel
        };
      }
      groups[spec.targetFace].count += 1;
    }
    return Object.values(groups);
  }, [otherFacesSelectedPlacements, locale]);

  const activeFaceSelectedPlacementsRef = useRef<PlacementSpec[]>(activeFaceSelectedPlacements);
  activeFaceSelectedPlacementsRef.current = activeFaceSelectedPlacements;

  const mugSecondSideUpgradePrice = useMemo(() => {
    return pricingConfig?.customization?.placement_prices?.mug_back ?? 35;
  }, [pricingConfig]);

  const getPlacementExtraPrice = useCallback((spec: PlacementSpec) => {
    const placementPrices = pricingConfig?.customization?.placement_prices;
    const placementRules = pricingConfig?.customization?.placement_rules;
    const includeFirstFree = placementRules?.include_first_placement_free ?? true;

    if (placementPrices && typeof placementPrices[spec.id] === 'number') {
      const pPrice = placementPrices[spec.id] ?? 0;
      if (isFaceMatching(spec.targetFace, 'front')) {
        return includeFirstFree ? pPrice : (pPrice || 0);
      }
      return pPrice;
    }

    const facePrices = pricingConfig?.customization?.face_prices || DEFAULT_PRICING_CONFIG.customization.face_prices;
    const isFirstFaceIncluded = pricingConfig?.customization?.base_includes_first_face !== false;
    if (isFaceMatching(spec.targetFace, 'front')) {
      return isFirstFaceIncluded ? 0 : (facePrices.front || 0);
    }
    if (isFaceMatching(spec.targetFace, 'back')) {
      return facePrices.back ?? 35;
    }
    if (isFaceMatching(spec.targetFace, 'left') || isFaceMatching(spec.targetFace, 'left_shoulder')) {
      return facePrices.left_shoulder ?? 20;
    }
    if (isFaceMatching(spec.targetFace, 'right') || isFaceMatching(spec.targetFace, 'right_shoulder')) {
      return facePrices.right_shoulder ?? 20;
    }
    return facePrices.other ?? 20;
  }, [pricingConfig]);

  // Determine the single active/actual placement zone for the active face (prevents multi-box collision)
  const activeGuidelinePlacementId = useMemo(() => {
    if (hoveredPlacementId && activeFaceSelectedPlacements.some((p) => p.id === hoveredPlacementId)) {
      return hoveredPlacementId;
    }
    const assignedId = (activeObject as any)?.assignedPlacementId;
    if (assignedId && activeFaceSelectedPlacements.some((p) => p.id === assignedId)) {
      return assignedId;
    }
    if (focusedPlacementId && activeFaceSelectedPlacements.some((p) => p.id === focusedPlacementId)) {
      return focusedPlacementId;
    }
    return activeFaceSelectedPlacements[0]?.id || null;
  }, [hoveredPlacementId, activeObject, focusedPlacementId, activeFaceSelectedPlacements]);

  const currentActivePlacementSpec = useMemo(() => {
    if (isFreeMode) return null;
    return activeFaceSelectedPlacements.find((p) => p.id === activeGuidelinePlacementId) || activeFaceSelectedPlacements[0] || null;
  }, [isFreeMode, activeFaceSelectedPlacements, activeGuidelinePlacementId]);

  // Placements available for the current garment face
  const availablePlacementsForActiveFace = useMemo(() => {
    const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
    const allForFace = getPlacementsForGarment(gType, activeFace);
    if (productData?.config?.allowedPlacements && productData.config.allowedPlacements.length > 0) {
      return allForFace.filter(p => productData.config.allowedPlacements.includes(p.id));
    }
    return allForFace;
  }, [productData, activeFace]);

  // Placement Required Modal state (triggers when user attempts to add art without selecting a placement)
  const [isPlacementRequiredModalOpen, setIsPlacementRequiredModalOpen] = useState(false);
  const [pendingAddCallback, setPendingAddCallback] = useState<(() => void) | null>(null);
  const pendingAddCallbackRef = useRef<(() => void) | null>(null);
  pendingAddCallbackRef.current = pendingAddCallback;

  const ensurePlacementSelected = useCallback((onProceed: () => void): boolean => {
    if (isFreeModeRef.current || activeFaceSelectedPlacementsRef.current.length > 0) {
      return true;
    }

    if (availablePlacementsForActiveFace.length === 0) {
      return true;
    }

    pendingAddCallbackRef.current = onProceed;
    setPendingAddCallback(() => onProceed);
    setIsPlacementRequiredModalOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setActiveMobileTab(null);
    }
    return false;
  }, [availablePlacementsForActiveFace]);

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

  // Synchronize mobile drawer & modal open state to document.body and Header
  const isAnyMobileDrawerOrModalOpen = Boolean(
    activeMobileTab ||
    isPlacementGuideModalOpen ||
    isMatrixModalOpen ||
    isValidationModalOpen ||
    isMugSingleFaceConflictOpen ||
    isSizeGuideModalOpen ||
    isQualityTipsModalOpen ||
    isPlacementRequiredModalOpen ||
    isGalleryModalOpen ||
    previewImage ||
    mug3DPreviewOpen ||
    isAuthModalOpen
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('studio-drawer-open', isAnyMobileDrawerOrModalOpen);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('STUDIO_DRAWER_TOGGLE', { 
        detail: { isOpen: isAnyMobileDrawerOrModalOpen } 
      }));
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('studio-drawer-open');
      }
    };
  }, [isAnyMobileDrawerOrModalOpen]);

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

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info', durationMs: number = 2500) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastNotification({ type, text });
    toastTimerRef.current = setTimeout(() => {
      setToastNotification(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Physical Constraint Guard: If customer chooses dark garment, automatically fall back to DTF
  useEffect(() => {
    if (isCustomerChoiceAllowed && isCurrentColorDark && selectedPrintMethod === 'Sublimation') {
      setSelectedPrintMethod('DTF');
      showToast(
        locale === 'tr'
          ? 'Koyu kumaşlarda beyaz astar mürekkebi gerektiği için baskı türü otomatik olarak DTF termal olarak ayarlandı.'
          : locale === 'en'
          ? 'Automatically switched to DTF: Sublimation requires white/light fabrics due to lack of white ink.'
          : 'تم التحويل تلقائياً إلى طباعة DTF: لأن تقنية السبليميشن تتطلب قماشاً أبيض أو فاتحاً لعدم وجود حبر أبيض.',
        'info',
        4000
      );
    }
  }, [selectedColor, isCustomerChoiceAllowed, isCurrentColorDark, selectedPrintMethod, locale, showToast]);

  const handleSelectPrintMethod = useCallback((method: 'DTF' | 'Sublimation') => {
    if (method === 'Sublimation' && isCurrentColorDark) {
      showToast(
        locale === 'tr'
          ? 'Uyarı: Süblimasyon baskı sadece açık/beyaz kumaşlarda uygulanabilir. Lütfen açık bir kumaş rengi seçin veya DTF kullanın.'
          : locale === 'en'
          ? 'Notice: Sublimation requires light/white fabrics. Please choose a light color or stick with DTF.'
          : 'تنبيه: طباعة السبليميشن غير متاحة على الأقمشة الداكنة لعدم وجود حبر أبيض. يرجى اختيار لون قماش فاتح لتفعيلها، أو استخدام DTF.',
        'info',
        4000
      );
      return;
    }

    userModifiedPrintMethodRef.current = true;
    setSelectedPrintMethod(method);
    showToast(
      method === 'Sublimation'
        ? (locale === 'tr' ? 'Süblimasyon baskı seçildi: Kumaşla bütünleşen, sıfır hisli nefes alan baskı.' : locale === 'en' ? 'Sublimation print selected: Breathable, zero-feel print.' : 'تم تفعيل طباعة السبليميشن: ألوان متغلغلة داخل النسيج بنعومة 100% بدون أي ملمس.')
        : (locale === 'tr' ? 'DTF termal baskı seçildi: Canlı renkler ve yüksek yıkama direnci.' : locale === 'en' ? 'DTF thermal print selected: Vivid colors and high wash resistance.' : 'تم تفعيل طباعة DTF الحرارية: ألوان زاهية وبارزة مقاومة للغسيل.'),
      'success',
      3000
    );
  }, [isCurrentColorDark, locale, showToast]);

  const latestTotalPriceRef = useRef(totalPrice);
  latestTotalPriceRef.current = totalPrice;
  const latestPriceBreakdownRef = useRef(priceBreakdown);
  latestPriceBreakdownRef.current = priceBreakdown;

  const pricingConfigRef = useRef<PricingSettingsConfig>(pricingConfig);
  pricingConfigRef.current = pricingConfig;

  const currentSelectedPlacementIdsRef = useRef<string[]>(currentSelectedPlacementIds);
  currentSelectedPlacementIdsRef.current = currentSelectedPlacementIds;

  const recalculatePriceRef = useRef<any>(null);

  // Robust Centralized Hybrid Pricing Recalculator (Stabilized against infinite re-render loops)
  const recalculatePrice = useCallback((
    targetCanvas?: fabric.Canvas | null, 
    explicitFacesData?: Record<string, any>,
    explicitPlacementIds?: string[],
    explicitConfig?: PricingSettingsConfig
  ) => {
    const c = targetCanvas || canvas;
    let currentFaceObj: any = null;
    if (c && !(c as any).disposed && c.getElement && c.getElement()) {
      try {
        currentFaceObj = c.toJSON(SERIALIZE_PROPERTIES);
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
        shouldInclude = isColorEqual(cColor, selectedColorRef.current || selectedColor);
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
      parsedFacesMap[activeFaceRef.current || activeFace] = currentFaceObj;
    }

    const activeCfg = explicitConfig || pricingConfigRef.current || pricingConfig;
    const activePlacements = explicitPlacementIds || currentSelectedPlacementIdsRef.current || currentSelectedPlacementIds;
    const activeFreeMode = isFreeModeRef.current ?? isFreeMode;

    const calcResult = calculateCustomProductPrice({
      basePrice,
      facesData: parsedFacesMap,
      assetsList: designAssets,
      pricingConfig: activeCfg,
      selectedPlacementIds: activePlacements,
      isFreeMode: activeFreeMode,
      locale,
      garmentType: studioProfile.normalizedPlacementType,
    });

    setTotalPrice(prev => (prev !== calcResult.totalPrice ? calcResult.totalPrice : prev));
    setPriceBreakdown(prev => (JSON.stringify(prev) !== JSON.stringify(calcResult) ? calcResult : prev));
  }, [canvas, activeFace, selectedColor, basePrice, designAssets, pricingConfig, currentSelectedPlacementIds, isFreeMode, locale]);

  recalculatePriceRef.current = recalculatePrice;

  // Real-time listener to centralized pricing settings (Live Firestore Sync)
  useEffect(() => {
    const unsubscribe = subscribeToPricingSettings(cfg => {
      if (cfg) {
        setPricingConfig(cfg);
        pricingConfigRef.current = cfg;
        recalculatePrice(undefined, undefined, undefined, cfg);
      }
    });
    return () => unsubscribe();
  }, [recalculatePrice]);

  // Reactively recalculate price whenever fresh pricing settings, assets, or placements change
  useEffect(() => {
    recalculatePrice();
  }, [recalculatePrice, pricingConfig, designAssets, currentSelectedPlacementIds, isFreeMode]);

  // Load persistent user uploads and recently used library assets
  useEffect(() => {
    // 1. Instant local storage cache
    try {
      const cachedUploads = localStorage.getItem('studio_user_uploads');
      if (cachedUploads) setUserUploads(JSON.parse(cachedUploads));
      const cachedRecents = localStorage.getItem('studio_recent_library_assets');
      if (cachedRecents) setRecentAssets(JSON.parse(cachedRecents));
    } catch (e) {}

    // 2. Fetch authenticated user's uploads and saved designs from Firestore
    const currentUser = auth?.currentUser;
    if (currentUser && db) {
      const qUploads = query(
        collection(db, 'user_uploads'),
        where('user_id', '==', currentUser.uid)
      );
      const qDesigns = query(
        collection(db, 'designs'),
        where('user_id', '==', currentUser.uid)
      );

      Promise.all([
        getDocs(qUploads).catch(() => ({ docs: [] })),
        getDocs(qDesigns).catch(() => ({ docs: [] }))
      ]).then(([uploadsSnap, designsSnap]) => {
        const firestoreUploads: UserUploadItem[] = (uploadsSnap as any).docs.map((d: any) => ({
          id: d.id,
          url: d.data().url,
          name: d.data().name || 'Design',
          createdAt: d.data().created_at,
          size: d.data().size,
        }));

        const firestoreDesigns: UserUploadItem[] = (designsSnap as any).docs
          .filter((d: any) => d.data()?.preview_image_url || d.data()?.print_ready_url)
          .map((d: any) => ({
            id: `design-${d.id}`,
            url: d.data().preview_image_url || d.data().print_ready_url,
            name: d.data().placement_title || 'تصميمي المحفوظ',
            createdAt: d.data().created_at,
          }));

        const combined = [...firestoreDesigns, ...firestoreUploads];
        if (combined.length > 0) {
          setUserUploads((prev) => {
            const existingUrls = new Set(combined.map((u) => u.url));
            const merged = [...combined, ...prev.filter((p) => !existingUrls.has(p.url))];
            try {
              localStorage.setItem('studio_user_uploads', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }
      }).catch((err) => {
        console.warn("Could not fetch user media from Firestore:", err);
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

  

  const handleKeepSingleFaceFromConflict = (chosenFace: string) => {
    updateMugSingleSideFace(chosenFace);
    if (activeFace !== chosenFace) {
      switchFace(chosenFace);
    }

    // Clear designs from all other conflicting faces to preserve single face integrity
    mugConflictFaces.forEach((otherFace) => {
      if (otherFace !== chosenFace) {
        const key = getFaceStateKey(otherFace, selectedColor);
        facesData.current[key] = JSON.stringify({ objects: [] });
      }
    });

    setIsMugSingleFaceConflictOpen(false);
    setTimeout(() => {
      if (canvas) {
        recalculatePrice(canvas);
      }
      runValidation();
    }, 120);
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
    if (!ensurePlacementSelected(() => handleSelectUpload(item))) return;
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
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setActiveMobileTab(null);
      }
      showToast(t('itemAddedSuccess', { fallback: 'تمت إضافة التصميم إلى مساحة العمل' }), 'success');
    });
  };

  const handleSelectRecentAsset = (item: RecentAssetItem) => {
    if (!ensurePlacementSelected(() => handleSelectRecentAsset(item))) return;
    addSticker(item.url, item);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setActiveMobileTab(null);
    }
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

  const saveDraftImmediate = useCallback((targetCanvas?: fabric.Canvas) => {
    const c = targetCanvas || canvas;
    if (isRestoring.current || typeof window === 'undefined') return;

    try {
      if (c && !(c as any).disposed && c.getElement && c.getElement()) {
        const json = buildSerializedFaceJson(c, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current);
        const currentKey = getFaceStateKey(activeFaceRef.current, selectedColorRef.current);
        facesData.current[currentKey] = JSON.stringify(json);
      }

      const activeKey = normalizeColorKey(selectedColorRef.current || selectedColor);
      const currentPlacementsMap = placementsByColorRef.current || {};
      const activeSelectedPlacementIds = syncPlacementsAcrossColorsRef.current
        ? (currentPlacementsMap['__synced__'] || currentPlacementsMap[activeKey] || [])
        : (currentPlacementsMap[activeKey] || []);

      const draftPayload = {
        faces: facesData.current,
        totalPrice: latestTotalPriceRef.current,
        priceBreakdown: latestPriceBreakdownRef.current,
        selectedSize,
        selectedColor,
        selectedPrintMethod,
        variantMatrix,
        totalOrderQuantity,
        activeFace,
        placementsByColor: currentPlacementsMap,
        syncPlacementsAcrossColors: syncPlacementsAcrossColorsRef.current,
        selectedPlacementIds: activeSelectedPlacementIds,
        updatedAt: new Date().toISOString()
      };

      try {
        localStorage.setItem(storageKey, JSON.stringify(draftPayload));
        localStorage.setItem(`studio_saved_placements_${productId}`, JSON.stringify(currentPlacementsMap));
      } catch (storageErr) {
        console.warn("LocalStorage save issue:", storageErr);
      }
    } catch (err) {
      console.error("❌ Auto-save failed:", err);
    }
  }, [canvas, selectedSize, selectedColor, selectedPrintMethod, storageKey, getFaceStateKey, variantMatrix, totalOrderQuantity, activeFace, productId, normalizeColorKey]);

  const saveDraft = useCallback((targetCanvas?: fabric.Canvas) => {
    const c = targetCanvas || canvas;
    if (!c || isRestoring.current || typeof window === 'undefined') return;

    if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);

    saveDraftTimerRef.current = setTimeout(() => {
      saveDraftImmediate(c);
    }, 500);
  }, [canvas, saveDraftImmediate]);

  useEffect(() => {
    if (userModifiedPrintMethodRef.current && canvas) {
      saveDraft(canvas);
    }
  }, [selectedPrintMethod, canvas, saveDraft]);

  // Synchronously flush draft when force-save-design event (e.g. language switch) or page unload fires
  useEffect(() => {
    const handleForceSave = () => {
      saveDraftImmediate(canvas || undefined);
    };
    window.addEventListener('force-save-design', handleForceSave);
    window.addEventListener('beforeunload', handleForceSave);
    return () => {
      window.removeEventListener('force-save-design', handleForceSave);
      window.removeEventListener('beforeunload', handleForceSave);
    };
  }, [canvas, saveDraftImmediate]);

  const propagateDesignToAllColors = useCallback((explicitCanvas?: fabric.Canvas) => {
    const targetCanvas = explicitCanvas || canvas;
    if (uniqueSelectedColors.length <= 1) return;
    
    // 1. Save current active face to memory
    if (targetCanvas && !isRestoring.current) {
      try {
        const json = JSON.stringify(buildSerializedFaceJson(targetCanvas, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current));
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
  // On mobile & tablet (< 1024px), default initial zoom is 1.5x (150%) so the garment appears clear and large
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isPanMode, setIsPanMode] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanModeRef = useRef<boolean>(false);
  isPanModeRef.current = isPanMode;
  const mockupContainerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  // Initialize mobile / tablet default zoom to 150% (1.5x) for optimal UI/UX clarity
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setZoomLevel(1.5);
    }
  }, []);

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
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    // On mobile/tablet, if already at 1.5 centered, allow toggling to 1.0 so user can see full unzoomed garment;
    // otherwise reset back to 1.5 (150%) centered!
    const targetZoom = isMobile ? (zoomLevel === 1.5 && panOffset.x === 0 && panOffset.y === 0 ? 1 : 1.5) : 1;
    setZoomLevel(targetZoom);
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

  // Filtered list by selected category and search query
  const filteredStickers = useMemo(() => {
    let list = selectedStickerCategory === 'all'
      ? allStickersList
      : allStickersList.filter(s => (s.category || 'أخرى') === selectedStickerCategory);

    if (stickerSearchQuery.trim()) {
      const q = stickerSearchQuery.trim().toLowerCase();
      list = list.filter(s => (s.name || '').toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q));
    }
    return list;
  }, [allStickersList, selectedStickerCategory, stickerSearchQuery]);

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
            const savedDesignMethod = String(data.print_method || data.print_type || '').toLowerCase();
            if (isCustomerChoiceAllowedRef.current && savedDesignMethod) {
              if (savedDesignMethod.includes('sublim') || savedDesignMethod.includes('süblim')) {
                userModifiedPrintMethodRef.current = true;
                setSelectedPrintMethod('Sublimation');
              } else if (savedDesignMethod.includes('dtf')) {
                userModifiedPrintMethodRef.current = true;
                setSelectedPrintMethod('DTF');
              }
            }
            
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
                let parsedTargetJson: any = null;
                try {
                  parsedTargetJson = typeof targetJson === 'string' ? JSON.parse(targetJson) : targetJson;
                } catch {}
                canvas.loadFromJSON(targetJson, () => {
                  if (canvas && canvas.getContext() && canvas.getElement()) {
                    if (isMugPanoramicWorkspaceRef.current && isFaceMatching('front', activeFace)) {
                      migrateLegacyMugPanoramaObjects(canvas, parsedTargetJson);
                    }
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
        isFaceMatching(img.face, targetFace) &&
        (isColorEqual(img.colorHex, color) || isColorEqual(img.color, color) || isColorEqual(img.colorName, color) || isColorEqual(img.colorName_ar, color) || isColorEqual(img.colorName_tr, color) || isColorEqual(img.colorName_en, color))
      );
      if (matchingBlank?.url) return matchingBlank.url;

      const matchingReady = rawImages.find((img: any) => 
        (img && typeof img === 'object') &&
        isFaceMatching(img.face, targetFace) &&
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
        if (matchingVariant.base_images) {
          if (matchingVariant.base_images[targetFace]) return matchingVariant.base_images[targetFace];
          for (const [k, v] of Object.entries(matchingVariant.base_images)) {
            if (isFaceMatching(k, targetFace) && v) return v as string;
          }
        }
        if (matchingVariant.images) {
          if (matchingVariant.images[targetFace]) return matchingVariant.images[targetFace];
          for (const [k, v] of Object.entries(matchingVariant.images)) {
            if (isFaceMatching(k, targetFace) && v) return v as string;
          }
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
    if (productFaces[face as keyof typeof productFaces]) {
      return productFaces[face as keyof typeof productFaces];
    }
    for (const [k, v] of Object.entries(productFaces)) {
      if (isFaceMatching(k, face) && v) return v as string;
    }
    // If face is sleeve, check for any sleeve mockup before front
    if (isFaceMatching(face, 'right') || isFaceMatching(face, 'left')) {
      for (const [k, v] of Object.entries(productFaces)) {
        if ((isFaceMatching(k, 'right') || isFaceMatching(k, 'left')) && v) return v as string;
      }
    }
    return productFaces['front'] || '';
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

  // True Native Workspace Dimensions (Unwrapped 23x9.5 Panoramic Sheet when mug_full_wrap active, else Mockup Native Size)
  const nativeWidth = isMugPanoramicWorkspace
    ? MUG_PANORAMA_SHEET_WIDTH
    : mockupNaturalSize.width > 0
      ? mockupNaturalSize.width
      : (Number(resolvedFaceConfig?.nativeWidth) || 1000);

  const nativeHeight = isMugPanoramicWorkspace
    ? MUG_PANORAMA_SHEET_HEIGHT
    : mockupNaturalSize.height > 0
      ? mockupNaturalSize.height
      : (Number(resolvedFaceConfig?.nativeHeight) || 1000);

  const nativeWidthRef = useRef<number>(nativeWidth);
  nativeWidthRef.current = nativeWidth;
  const nativeHeightRef = useRef<number>(nativeHeight);
  nativeHeightRef.current = nativeHeight;

  const nativeAspectRatio = nativeWidth / nativeHeight;

  // Responsive Mockup Stage Observer: strictly locks canvas & mockup to native aspect ratio
  useEffect(() => {
    const el = mockupContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateStageDimensions = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const padW = isMugPanoramicWorkspace ? (isMobile ? 20 : 52) : (isMobile ? 16 : 24);
      const padH = isMugPanoramicWorkspace ? (isMobile ? 42 : 34) : (isMobile ? 24 : 24);
      const availW = Math.max(100, rect.width - padW);
      const availH = Math.max(80, rect.height - padH);
      if (nativeWidth <= 0 || nativeHeight <= 0) return;

      const scale = Math.min(availW / nativeWidth, availH / nativeHeight);
      const computedW = Math.round(nativeWidth * scale);
      const computedH = Math.round(nativeHeight * scale);

      setStageSize((prev) => {
        if (prev && prev.width === computedW && prev.height === computedH) return prev;
        return { width: computedW, height: computedH };
      });
    };

    updateStageDimensions();
    const ro = new ResizeObserver(updateStageDimensions);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nativeWidth, nativeHeight, isMugPanoramicWorkspace, showLive3DPanel, mobilePanoramaView]);

  // Free Mode Printable Area bounds (per product face)
  const freePrintZone = React.useMemo(() => {
    const freeBounds = productData?.config?.freeModeBounds?.[activeFace];
    const nw = nativeWidth;
    const nh = nativeHeight;
    if (freeBounds && freeBounds.width > 0 && freeBounds.height > 0) {
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

    const facePa = productData?.config?.faces?.[activeFace]?.printArea;
    if (
      studioProfile.family !== 'apparel' &&
      facePa &&
      facePa.width > 0 &&
      facePa.height > 0 &&
      (facePa.nativeWidth || nw) > 0 &&
      (facePa.nativeHeight || nh) > 0
    ) {
      const fNw = facePa.nativeWidth || nw;
      const fNh = facePa.nativeHeight || nh;
      return {
        left: (facePa.left / fNw) * nw,
        top: (facePa.top / fNh) * nh,
        width: (facePa.width / fNw) * nw,
        height: (facePa.height / fNh) * nh,
        nativeWidth: nw,
        nativeHeight: nh,
      };
    }

    if (studioProfile.family === 'mug') {
      const fw = Math.round(nw * 0.56);
      const fh = Math.round(nh * 0.48);
      const fx = Math.round(nw * 0.22);
      const fy = Math.round(nh * 0.27);
      return {
        left: fx,
        top: fy,
        width: fw,
        height: fh,
        nativeWidth: nw,
        nativeHeight: nh,
      };
    }

    if (studioProfile.family === 'hat') {
      const fw = Math.round(nw * 0.38);
      const fh = Math.round(nh * 0.24);
      const fx = Math.round((nw - fw) / 2);
      const fy = Math.round(nh * 0.30);
      return {
        left: fx,
        top: fy,
        width: fw,
        height: fh,
        nativeWidth: nw,
        nativeHeight: nh,
      };
    }

    if (studioProfile.family === 'phone_case') {
      const fw = Math.round(nw * 0.40);
      const fh = Math.round(nh * 0.68);
      const fx = Math.round((nw - fw) / 2);
      const fy = Math.round(nh * 0.16);
      return {
        left: fx,
        top: fy,
        width: fw,
        height: fh,
        nativeWidth: nw,
        nativeHeight: nh,
      };
    }

    const isSleeve = activeFace === 'left' || activeFace === 'right' || activeFace === 'left_shoulder' || activeFace === 'right_shoulder';
    const fw = Math.round(nw * (isSleeve ? 0.48 : 0.62));
    const fh = Math.round(nh * (isSleeve ? 0.68 : 0.76));
    const fx = Math.round((nw - fw) / 2);
    const fy = Math.round(nh * (isSleeve ? 0.16 : 0.13));
    return {
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      nativeWidth: nw,
      nativeHeight: nh,
    };
  }, [productData?.config?.freeModeBounds, productData?.config?.faces, studioProfile.family, activeFace, nativeWidth, nativeHeight]);

  const freePrintZoneRef = useRef<any>(freePrintZone);
  freePrintZoneRef.current = freePrintZone;

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
    if (
      !canvas ||
      (canvas as any).disposed ||
      !(canvas as any).lowerCanvasEl ||
      !canvas.getContext?.() ||
      !canvas.getElement?.()
    ) {
      return;
    }
    if (canvas.getWidth() !== totalCanvasWidth || canvas.getHeight() !== totalCanvasHeight) {
      canvas.setWidth(totalCanvasWidth);
      canvas.setHeight(totalCanvasHeight);
      (canvas as any).printAreaWidth = totalCanvasWidth;
      (canvas as any).printAreaHeight = totalCanvasHeight;
      canvas.renderAll();
      scheduleLiveMugTextureRefreshRef.current?.(canvas, 60);
    }
  }, [canvas, totalCanvasWidth, totalCanvasHeight]);

  // Helper to resolve precise placement coordinates in Fabric virtual canvas space (1:1 with mockup space)
  const getPlacementFabricBounds = useCallback((
    spec: PlacementSpec,
    customNw?: number,
    customNh?: number,
    forceNonPanoramic?: boolean,
    customFace?: string
  ) => {
    const resolvedFace = customFace || activeFace;
    const box = spec.canvasBox;
    const nw = customNw ?? nativeWidth;
    const nh = customNh ?? nativeHeight;

    const rawX = (box.leftPercent / 100) * nw;
    const rawY = (box.topPercent / 100) * nh;
    const rawW = (box.maxWidthPercent / 100) * nw;
    const rawH = (box.maxHeightPercent / 100) * nh;

    // Physical dimensions from spec (e.g. 30x40 cm for full front, 23x9.5 cm for mug wrap)
    const recW = spec.dimensions?.recommended?.widthCm || 30;
    const recH = spec.dimensions?.recommended?.heightCm || 40;

    let fabricLeft: number;
    let fabricTop: number;
    let fabricWidth: number;
    let fabricHeight: number;
    let calibratedWidthCm: number | undefined;
    let calibratedHeightCm: number | undefined;

    // 0. Unwrapped 23x9.5 Panoramic Mug Sheet Workspace (1:1 coordinate fidelity = 80 px/cm)
    if (!forceNonPanoramic && isMugPanoramicWorkspace && spec.id === 'mug_full_wrap') {
      return {
        spec,
        id: spec.id,
        nameAr: spec.nameAr,
        nameEn: spec.nameEn,
        nameTr: spec.nameTr,
        mockupX: 0,
        mockupY: 0,
        mockupW: MUG_PANORAMA_SHEET_WIDTH,
        mockupH: MUG_PANORAMA_SHEET_HEIGHT,
        fabricLeft: 0,
        fabricTop: 0,
        fabricWidth: MUG_PANORAMA_SHEET_WIDTH,
        fabricHeight: MUG_PANORAMA_SHEET_HEIGHT,
        fabricCenterX: MUG_PANORAMA_SHEET_WIDTH / 2,
        fabricCenterY: MUG_PANORAMA_SHEET_HEIGHT / 2,
        calibratedWidthCm: spec.dimensions.recommended.widthCm || 23,
        calibratedHeightCm: spec.dimensions.recommended.heightCm || 9.5,
      };
    }

    // 1. Highest priority: Admin-calibrated placement rectangle (with face-aware Mug overrides)
    const calibratedMap = productData?.config?.calibratedPlacements as Record<string, any> | undefined;
    let calibrated = calibratedMap?.[spec.id];
    if (studioProfile.family === 'mug' && calibratedMap) {
      if (spec.id === 'mug_full_wrap' && resolvedFace === 'back' && calibratedMap['mug_full_wrap_back']) {
        calibrated = calibratedMap['mug_full_wrap_back'];
      } else if (spec.id === 'mug_full_wrap' && resolvedFace === 'other' && calibratedMap['mug_full_wrap_other']) {
        calibrated = calibratedMap['mug_full_wrap_other'];
      } else if (spec.id === 'mug_front' && resolvedFace === 'other' && calibratedMap['mug_front_other']) {
        calibrated = calibratedMap['mug_front_other'];
      } else if (spec.id === 'mug_front' && resolvedFace === 'back') {
        calibrated = calibratedMap['mug_front_back'] || calibratedMap['mug_back'] || calibrated;
      }
    }

    const facePa = productData?.config?.faces?.[resolvedFace]?.printArea;

    if (calibrated && calibrated.width > 0 && calibrated.height > 0) {
      const cNw = calibrated.nativeWidth || nw;
      const cNh = calibrated.nativeHeight || nh;
      fabricLeft = Math.round((calibrated.x / cNw) * nw);
      fabricTop = Math.round((calibrated.y / cNh) * nh);
      fabricWidth = Math.round((calibrated.width / cNw) * nw);
      fabricHeight = Math.round((calibrated.height / cNh) * nh);
      calibratedWidthCm = calibrated.physicalWidthCm;
      calibratedHeightCm = calibrated.physicalHeightCm;
    } else if (
      studioProfile.family === 'mug' &&
      facePa &&
      facePa.width > 0 &&
      facePa.height > 0 &&
      (facePa.nativeWidth || nw) > 0 &&
      (facePa.nativeHeight || nh) > 0
    ) {
      // Auto-detected or face-calibrated mug cylinder bounds from uploaded mockup
      const fNw = facePa.nativeWidth || nw;
      const fNh = facePa.nativeHeight || nh;
      const baseLeft = Math.round((facePa.left / fNw) * nw);
      const baseTop = Math.round((facePa.top / fNh) * nh);
      const baseW = Math.round((facePa.width / fNw) * nw);
      const baseH = Math.round((facePa.height / fNh) * nh);

      if (spec.id === 'mug_full_wrap') {
        fabricLeft = baseLeft;
        fabricTop = baseTop;
        fabricWidth = baseW;
        fabricHeight = baseH;
      } else {
        // Single face centered cleanly inside the safe cylinder wall
        fabricWidth = Math.round(baseW * 0.72);
        fabricHeight = Math.round(baseH * 0.94);
        fabricLeft = Math.round(baseLeft + (baseW - fabricWidth) / 2);
        fabricTop = Math.round(baseTop + (baseH - fabricHeight) / 2);
      }
    } else if (studioProfile.family !== 'apparel') {
      // Non-apparel (Mug, Hat, Phone Case, Generic): honor calibrated canvasBox percentages directly
      fabricWidth = Math.max(40, Math.round(rawW));
      fabricHeight = Math.max(40, Math.round(rawH));
      fabricLeft = Math.round(rawX);
      fabricTop = Math.round(rawY);
    } else {
      // Apparel pixel density: calibrated to standard ~55cm chest over ~65% of mockup width
      const pxPerCm = (nw * 0.65) / 55;
      fabricWidth = Math.round(recW * pxPerCm);
      fabricHeight = Math.round(recH * pxPerCm);

      // Safeguard: do not exceed garment printable zone bounds
      const maxAllowedW = nw * 0.75;
      const maxAllowedH = nh * 0.58;
      if (fabricWidth > maxAllowedW || fabricHeight > maxAllowedH) {
        const scaleFit = Math.min(maxAllowedW / fabricWidth, maxAllowedH / fabricHeight);
        fabricWidth = Math.round(fabricWidth * scaleFit);
        fabricHeight = Math.round(fabricHeight * scaleFit);
      }

      const isCentered = spec.id === 'full_front' || spec.id === 'center_chest' || spec.id === 'full_back' || spec.id === 'back_collar';
      fabricLeft = isCentered ? Math.round((nw - fabricWidth) / 2) : Math.round(rawX);
      fabricTop = Math.round(rawY);
    }

    const fabricCenterX = fabricLeft + fabricWidth / 2;
    const fabricCenterY = fabricTop + fabricHeight / 2;

    const mockupX = fabricLeft;
    const mockupY = fabricTop;
    const mockupW = fabricWidth;
    const mockupH = fabricHeight;

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
      calibratedWidthCm,
      calibratedHeightCm,
    };
  }, [nativeWidth, nativeHeight, productData?.config?.calibratedPlacements, productData?.config?.faces, studioProfile.family, activeFace]);

  // Universal Print Boundary Validator (Used across Drag, Scale, Select, Undo/Redo & Save)
  const isObjectInsidePrintBounds = useCallback((obj: fabric.Object | null | undefined): boolean => {
    if (!obj || obj.name === 'background' || obj.name === 'mockup' || obj.name === 'print_area_guide') {
      return true;
    }

    const br = obj.getBoundingRect(true, true);
    if (!br || br.width <= 0 || br.height <= 0) return true;

    const objArea = br.width * br.height;
    const centerPt = obj.getCenterPoint();

    // Helper to test if object is reasonably contained inside a rectangular print zone
    const checkZoneContainment = (zone: { left: number; top: number; width: number; height: number }, isStandardPlacement: boolean = false) => {
      // Proportional tolerance: generous margin based on zone dimensions
      // In professional print customizers (e.g. Printful / CustomInk), a design isn't out-of-bounds unless it noticeably breaches the area.
      // 12% tolerance allows slight positioning adjustments and multi-object compositions (e.g. text + graphic).
      const tolX = Math.max(isStandardPlacement ? 70 : 120, zone.width * 0.12);
      const tolY = Math.max(isStandardPlacement ? 70 : 120, zone.height * 0.12);

      // Condition A: Entire bounding box is within zone + tolerance margin
      const withinMargin = 
        br.left >= zone.left - tolX &&
        (br.left + br.width) <= zone.left + zone.width + tolX &&
        br.top >= zone.top - tolY &&
        (br.top + br.height) <= zone.top + zone.height + tolY;

      if (withinMargin) return true;

      // Condition B: Area overlap test
      // If object's center is reasonably within the zone and at least 70% of the graphic is inside the zone:
      const interLeft = Math.max(br.left, zone.left);
      const interTop = Math.max(br.top, zone.top);
      const interRight = Math.min(br.left + br.width, zone.left + zone.width);
      const interBottom = Math.min(br.top + br.height, zone.top + zone.height);

      const interW = Math.max(0, interRight - interLeft);
      const interH = Math.max(0, interBottom - interTop);
      const interArea = interW * interH;
      const overlapRatio = objArea > 0 ? interArea / objArea : 1;

      const centerInside = 
        centerPt.x >= zone.left - tolX &&
        centerPt.x <= zone.left + zone.width + tolX &&
        centerPt.y >= zone.top - tolY &&
        centerPt.y <= zone.top + zone.height + tolY;

      if (centerInside && overlapRatio >= 0.70) {
        return true;
      }

      return false;
    };

    if (isFreeModeRef.current) {
      return checkZoneContainment(freePrintZone, false);
    }

    if (activeFaceSelectedPlacementsRef.current.length > 0) {
      // Return true if object is inside ANY selected placement on this face
      for (const spec of activeFaceSelectedPlacementsRef.current) {
        const p = getPlacementFabricBounds(spec);
        const zone = {
          left: p.fabricLeft,
          top: p.fabricTop,
          width: p.fabricWidth,
          height: p.fabricHeight,
        };
        if (checkZoneContainment(zone, true)) {
          return true;
        }
      }
      return false;
    }

    // Default garment surface bounds (keeps element within canvas margins)
    return (
      br.left >= -80 &&
      (br.left + br.width) <= nativeWidth + 80 &&
      br.top >= -80 &&
      (br.top + br.height) <= nativeHeight + 80
    );
  }, [freePrintZone, getPlacementFabricBounds, nativeWidth, nativeHeight]);

  const isObjectInsidePrintBoundsRef = useRef(isObjectInsidePrintBounds);
  isObjectInsidePrintBoundsRef.current = isObjectInsidePrintBounds;

  // Helper to apply strict boundary clipping to an object so that any portion outside the active placement (or freePrintZone) is clipped/hidden
  const applyPrintBoundaryClip = useCallback((obj: fabric.Object | null | undefined) => {
    if (!obj || obj.name === 'background' || obj.name === 'mockup' || obj.name === 'print_area_guide') return;

    const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
    const currentFace = activeFaceRef.current || activeFace;

    let boundary: { left: number; top: number; width: number; height: number; rx?: number; ry?: number } | null = null;

    if (isFreeModeRef.current) {
      boundary = {
        left: freePrintZone.left,
        top: freePrintZone.top,
        width: freePrintZone.width,
        height: freePrintZone.height,
        rx: 24,
        ry: 24,
      };
    } else {
      let spec: PlacementSpec | undefined;
      const assignedId = (obj as any).assignedPlacementId;
      if (assignedId) {
        spec = getPlacementById(assignedId, gType);
      }
      if (!spec && activeFaceSelectedPlacementsRef.current.length > 0) {
        const centerPt = obj.getCenterPoint ? obj.getCenterPoint() : { x: obj.left || 0, y: obj.top || 0 };
        const allFaceSpecs = getPlacementsForGarment(gType, currentFace);
        const candidates = allFaceSpecs
          .filter(s => activeFaceSelectedPlacementsRef.current.some(ap => ap.id === s.id))
          .map(s => {
            const p = getPlacementFabricBounds(s);
            const isInside =
              centerPt.x >= p.fabricLeft &&
              centerPt.x <= p.fabricLeft + p.fabricWidth &&
              centerPt.y >= p.fabricTop &&
              centerPt.y <= p.fabricTop + p.fabricHeight;
            return { s, p, isInside };
          });
        spec = candidates.find(c => c.isInside)?.s || activeFaceSelectedPlacementsRef.current[0];
      }

      if (!spec) {
        const allFaceSpecs = getPlacementsForGarment(gType, currentFace);
        spec = activeFaceSelectedPlacementsRef.current[0] || allFaceSpecs[0];
      }

      if (spec) {
        const p = getPlacementFabricBounds(spec);
        const radius = isMugPanoramicWorkspaceRef.current && spec.id === 'mug_full_wrap' ? 8 : 16;
        boundary = {
          left: p.fabricLeft,
          top: p.fabricTop,
          width: p.fabricWidth,
          height: p.fabricHeight,
          rx: radius,
          ry: radius,
        };
      }
    }

    if (boundary) {
      const clipRect = new fabric.Rect({
        left: boundary.left,
        top: boundary.top,
        width: boundary.width,
        height: boundary.height,
        rx: boundary.rx || 12,
        ry: boundary.ry || 12,
        absolutePositioned: true,
      });
      obj.clipPath = clipRect;
    } else {
      delete (obj as any).clipPath;
    }
  }, [productData, activeFace, freePrintZone, getPlacementFabricBounds]);

  const applyPrintBoundaryClipRef = useRef(applyPrintBoundaryClip);
  useEffect(() => {
    applyPrintBoundaryClipRef.current = applyPrintBoundaryClip;
  }, [applyPrintBoundaryClip]);

  // Universal Live Object Placement & Physical Metrics Calculator
  const computeLiveMetrics = useCallback((obj: fabric.Object | null | undefined, isScaling: boolean = false) => {
    if (scaleHudTimerRef.current) {
      clearTimeout(scaleHudTimerRef.current);
      scaleHudTimerRef.current = null;
    }
    if (!obj || (obj as any).isLocked || obj.selectable === false) {
      setLiveDimensions(null);
      return;
    }

    // Clip rendering cleanly to active print boundary so excess parts are hidden
    applyPrintBoundaryClip(obj);

    const nw = nativeWidth;
    const nh = nativeHeight;
    const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
    const currentFace = activeFaceRef.current || activeFace;

    // 1. Find placement specification for this object
    let spec: PlacementSpec | undefined;
    const assignedId = (obj as any).assignedPlacementId;
    if (assignedId) {
      spec = getPlacementById(assignedId, gType);
    }

    const allFaceSpecs = getPlacementsForGarment(gType, currentFace);

    if (!spec) {
      const centerPt = (obj as any).getCenterPoint ? (obj as any).getCenterPoint() : { x: obj.left || 0, y: obj.top || 0 };
      const candidates = allFaceSpecs
        .map(s => {
          const p = getPlacementFabricBounds(s);
          const isInside =
            centerPt.x >= p.fabricLeft &&
            centerPt.x <= p.fabricLeft + p.fabricWidth &&
            centerPt.y >= p.fabricTop &&
            centerPt.y <= p.fabricTop + p.fabricHeight;
          const area = p.fabricWidth * p.fabricHeight;
          const dist = Math.hypot(centerPt.x - p.fabricCenterX, centerPt.y - p.fabricCenterY);
          return { s, p, isInside, area, dist };
        })
        .filter(c => c.isInside);

      candidates.sort((a, b) => {
        if (Math.abs(a.area - b.area) > 500) return a.area - b.area;
        return a.dist - b.dist;
      });

      spec = candidates[0]?.s;
    }

    if (!spec) {
      spec = activeFaceSelectedPlacementsRef.current[0] || allFaceSpecs[0];
    }

    if (!spec) {
      setLiveDimensions(null);
      return;
    }

    const pBounds = getPlacementFabricBounds(spec);
    const scaleX = typeof obj.scaleX === 'number' ? obj.scaleX : 1;
    const scaleY = typeof obj.scaleY === 'number' ? obj.scaleY : 1;
    const scaledW = (obj.width || 0) * scaleX;
    const scaledH = (obj.height || 0) * scaleY;

    const placementW_px = pBounds.fabricWidth;
    const placementH_px = pBounds.fabricHeight;
    const placementLeft_px = pBounds.fabricLeft;
    const placementTop_px = pBounds.fabricTop;
    const placementCenterX_px = pBounds.fabricCenterX;

    const recW_cm = spec.dimensions.recommended.widthCm;
    const recH_cm = spec.dimensions.recommended.heightCm;
    const pxPerCm = placementW_px / recW_cm;

    const widthCm = (scaledW / pxPerCm).toFixed(1);
    const heightCm = (scaledH / pxPerCm).toFixed(1);

    const objLeft = typeof obj.left === 'number' ? obj.left : 0;
    const objTop = typeof obj.top === 'number' ? obj.top : 0;
    const actualObjLeft = objLeft - (obj.originX === 'center' ? scaledW / 2 : 0);
    const actualObjTop = objTop - (obj.originY === 'center' ? scaledH / 2 : 0);
    const centerPtX = objLeft + (obj.originX === 'center' ? 0 : scaledW / 2);

    const relativeTop_cm = Math.max(0, (actualObjTop - placementTop_px) / pxPerCm);
    const collarOffsetCm =
      studioProfile.family === 'apparel'
        ? (spec.offsetFromCollarCm + relativeTop_cm).toFixed(1)
        : '';

    const diffCenter_cm = Math.abs(centerPtX - placementCenterX_px) / pxPerCm;
    const isCentered = diffCenter_cm <= 1.2;

    const boxLeftPercent = (actualObjLeft / nw) * 100;
    const boxTopPercent = (actualObjTop / nh) * 100;
    const boxWidthPercent = (scaledW / nw) * 100;
    const boxHeightPercent = (scaledH / nh) * 100;

    const placementName = locale === 'tr' ? spec.nameTr : locale === 'en' ? spec.nameEn : spec.nameAr;

    // Real-Time Effective Print DPI and Quality Calculation
    const isImage = obj.type === 'image' || !!(obj as any)._element;
    const el = (obj as any)._element as HTMLImageElement | undefined;
    const sourceWidthPx = el?.naturalWidth || el?.width || (obj as any).width || 0;
    const sourceHeightPx = el?.naturalHeight || el?.height || (obj as any).height || 0;

    const src = (obj as any).src || (obj as any).originalAssetUrl || el?.src || '';
    const isOpaqueJpg = isImage && typeof src === 'string' && (
      src.toLowerCase().includes('.jpg') ||
      src.toLowerCase().includes('.jpeg') ||
      src.startsWith('data:image/jpeg')
    );

    const widthCmNum = parseFloat(widthCm) || 1;
    let effectiveDpi = 300;
    let qualityLevel: 'excellent' | 'acceptable' | 'low' = 'excellent';

    if (isImage && sourceWidthPx > 0) {
      effectiveDpi = Math.round((sourceWidthPx * 2.54) / widthCmNum);
      if (effectiveDpi >= 250) {
        qualityLevel = 'excellent';
      } else if (effectiveDpi >= 150) {
        qualityLevel = 'acceptable';
      } else {
        qualityLevel = 'low';
      }
    }

    setLiveDimensions({
      widthCm,
      heightCm,
      placementId: spec.id,
      placementName,
      placementWidthCm: recW_cm,
      placementHeightCm: recH_cm,
      collarOffsetCm,
      isCentered,
      isScaling,
      boxLeftPercent,
      boxTopPercent,
      boxWidthPercent,
      boxHeightPercent,
      effectiveDpi,
      qualityLevel,
      isImage,
      isOpaqueJpg,
      sourceWidthPx,
      sourceHeightPx,
    });
  }, [nativeWidth, nativeHeight, productData, activeFace, getPlacementFabricBounds, applyPrintBoundaryClip, locale, studioProfile.family]);


  // Smart Placement Auto-Reconciliation Engine
  // Ensures canvas objects remain linked to active print placements, without overriding user decisions
  const reconcilePlacementsForActiveState = useCallback((targetCanvas?: fabric.Canvas | null) => {
    const c = targetCanvas || canvas;
    if (!c || isRestoring.current) return;

    const activeKey = normalizeColorKey(selectedColorRef.current || selectedColor);
    const currentPlacements = placementsByColorRef.current[activeKey] || [];

    const userObjects = c.getObjects().filter((o: any) => 
      o && o.name !== 'background' && o.name !== 'mockup' && o.name !== 'print_area_guide'
    );

    // If no placements are selected for this color/state, clean up any stale assigned placement IDs on objects
    if (currentPlacements.length === 0) {
      userObjects.forEach((obj: any) => {
        if (obj.assignedPlacementId || obj.placementId) {
          obj.assignedPlacementId = null;
          obj.placementId = null;
        }
      });
      return;
    }

    const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
    const targetFaceName = activeFaceRef.current || activeFace;
    const rawAvailableSpecs = getPlacementsForGarment(gType, targetFaceName).filter(s => currentPlacements.includes(s.id));
    const availableSpecs = rawAvailableSpecs.length > 0
      ? rawAvailableSpecs
      : activeFaceSelectedPlacementsRef.current.filter(s => currentPlacements.includes(s.id));

    if (availableSpecs.length === 0) return;

    for (const obj of userObjects) {
      const assignedId = (obj as any).assignedPlacementId || (obj as any).placementId;
      if (assignedId && !currentPlacements.includes(assignedId)) {
        (obj as any).assignedPlacementId = null;
        (obj as any).placementId = null;
      } else if (!assignedId) {
        const pt = obj.getCenterPoint ? obj.getCenterPoint() : { x: obj.left || 0, y: obj.top || 0 };
        for (const spec of availableSpecs) {
          const bounds = getPlacementFabricBounds(spec);
          if (
            pt.x >= bounds.fabricLeft &&
            pt.x <= bounds.fabricLeft + bounds.fabricWidth &&
            pt.y >= bounds.fabricTop &&
            pt.y <= bounds.fabricTop + bounds.fabricHeight
          ) {
            (obj as any).assignedPlacementId = spec.id;
            break;
          }
        }
      }
    }
  }, [canvas, productData, selectedColor, activeFace, getPlacementFabricBounds, normalizeColorKey]);

  // Periodic passive reconciliation to guarantee no placement is lost after language switch or mount
  useEffect(() => {
    if (!canvas || (canvas as any).disposed || !(canvas as any).lowerCanvasEl) return;
    const timer = setTimeout(() => {
      if (!canvas || (canvas as any).disposed || !(canvas as any).lowerCanvasEl) return;
      reconcilePlacementsForActiveState(canvas);
    }, 250);
    return () => clearTimeout(timer);
  }, [canvas, activeFace, selectedColor, reconcilePlacementsForActiveState]);

  // Helper to format controls, auto-scale within placement or free bounds, and position object
  const prepareAndAddObject = (obj: fabric.Object, canvasInstance?: fabric.Canvas) => {
    const c = canvasInstance || canvas;
    if (!c) return;

    // Mark as intentionally positioned to prevent object:added listener from re-scaling/re-centering
    (obj as any).__alreadyPositioned = true;

    // Approved Standards Mode: Automatically insert into target approved placement!
    if (!isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length > 0) {
      const existingObjects = c.getObjects().filter(o => 
        o.name !== 'background' && 
        o.name !== 'mockup' && 
        o.name !== 'print_area_guide' &&
        !(o as any).isLocked &&
        o.selectable !== false
      );
      
      let targetPlacement: PlacementSpec | null = null;

      // 1. If user clicked/focused a placement (e.g. left_chest in top bar or sidebar), prioritize it!
      if (focusedPlacementId) {
        targetPlacement = activeFaceSelectedPlacementsRef.current.find(s => s.id === focusedPlacementId) || null;
      }

      // 2. If not focused, look for a placement that doesn't have active (non-locked) objects
      if (!targetPlacement) {
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
      }

      // 3. Fallback to first placement
      if (!targetPlacement) {
        targetPlacement = activeFaceSelectedPlacementsRef.current[0];
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
      (obj as any).originMode = 'approved';
      (obj as any).createdInMode = 'approved';
      setFocusedPlacementId(targetPlacement.id);

      c.add(obj);
      c.setActiveObject(obj);
      obj.setCoords();
      applyCustomModernStyles(c);
      c.renderAll();

      showToast(
        locale === 'tr' ? `Tasarım ${targetPlacement.nameTr} alanına yerleştirildi` :
        locale === 'en' ? `Design placed in ${targetPlacement.nameEn}` :
        `تم وضع التصميم داخل: ${targetPlacement.nameAr}`,
        'info',
        2500
      );
      return;
    }

    // Guard: If in Approved Mode and no placement is selected yet, trigger placement prompt
    if (!isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length === 0 && availablePlacementsForActiveFace.length > 0) {
      if (!isPlacementRequiredModalOpen) {
        pendingAddCallbackRef.current = () => prepareAndAddObject(obj, canvasInstance);
        setPendingAddCallback(() => () => prepareAndAddObject(obj, canvasInstance));
        setIsPlacementRequiredModalOpen(true);
      }
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
    (obj as any).assignedPlacementId = null;
    (obj as any).originMode = 'free';
    (obj as any).createdInMode = 'free';

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
      return wipeFullCanvasContext(this, ctx);
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

    // Attach Smart Alignment Guides & Magnetic Snapping Engine (Upper-Canvas Renderer)
    setupSmartGuidesOnCanvas(initCanvas, () => isObjectDraggingRef.current || isObjectScalingRef.current);

    const handleGlobalPointerUp = () => {
      isObjectDraggingRef.current = false;
      isObjectScalingRef.current = false;
      setIsObjectDragging(false);
      clearSmartGuidelinesFromCanvas(initCanvas);
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    window.addEventListener('touchcancel', handleGlobalPointerUp);
    window.addEventListener('blur', handleGlobalPointerUp);
    
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
      scheduleLiveMugTextureRefreshRef.current?.(initCanvas, 50);
    });

    const onCanvasModified = () => {
      if (isDisposed || isRestoring.current) return;
      saveHistoryStateCanvas(initCanvas);
      saveDraft(initCanvas);
      scheduleLiveMugTextureRefreshRef.current?.(initCanvas, 50);
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
      if (!activeObj || (activeObj as any).isLocked || activeObj.selectable === false) {
        setValidationWarning(null);
        return;
      }

      // 1. Boundary Clamping: Keep at least 20px visible inside the active canvas
      const minVisible = 20;
      const cw = initCanvas.getWidth() || nativeWidthRef.current;
      const ch = initCanvas.getHeight() || nativeHeightRef.current;
      const bound = activeObj.getBoundingRect(true, true);
      let newLeft = activeObj.left || 0;
      let newTop = activeObj.top || 0;

      if (bound.left + bound.width < minVisible) {
        newLeft += (minVisible - (bound.left + bound.width));
      }
      if (bound.left > cw - minVisible) {
        newLeft -= (bound.left - (cw - minVisible));
      }
      if (bound.top + bound.height < minVisible) {
        newTop += (minVisible - (bound.top + bound.height));
      }
      if (bound.top > ch - minVisible) {
        newTop -= (bound.top - (ch - minVisible));
      }

      if (newLeft !== activeObj.left || newTop !== activeObj.top) {
        activeObj.set({ left: newLeft, top: newTop });
        activeObj.setCoords();
      }

      // 2. Centerline Snapping (Only for centered placements, bypass for off-center chest logos or sleeves)
      const isOffCenterPlacement = 
        (activeObj as any).assignedPlacementId === 'left_chest' ||
        (activeObj as any).assignedPlacementId === 'right_sleeve' ||
        (activeObj as any).assignedPlacementId === 'left_sleeve' ||
        (activeObj as any).assignedPlacementId?.includes('shoulder') ||
        (activeObj as any).assignedPlacementId?.includes('sleeve') ||
        (activeObj as any).assignedPlacementId?.includes('left') ||
        (activeObj as any).assignedPlacementId?.includes('right');

      if (!isOffCenterPlacement) {
        const centerX = cw / 2;
        const SNAP_ZONE = Math.round(cw * 0.008);
        const centerPt = activeObj.getCenterPoint();

        if (Math.abs(centerPt.x - centerX) < SNAP_ZONE) {
          activeObj.set({ left: (activeObj.left || 0) + (centerX - centerPt.x) });
        }
      }

      // 3. Print Area & Placement Boundary Validation
      const isOutOfBounds = !isObjectInsidePrintBoundsRef.current(activeObj);

      applyActiveSelectionBoundsStyle(activeObj, initCanvas.getWidth(), isOutOfBounds);
      setIsObjectOutOfBounds(isOutOfBounds);
      if (!isOutOfBounds) {
        setIsWarningDismissed(false);
      }
    };

    // Real-time hover detection over approved placement boxes during object drag
    const handleObjectMoving = (e: fabric.IEvent) => {
      const activeObj = e.target || initCanvas.getActiveObject();
      if (!activeObj || (activeObj as any).isLocked || activeObj.selectable === false) return;

      if (!isObjectDraggingRef.current) {
        isObjectDraggingRef.current = true;
        setIsObjectDragging(true);
      }

      if (!isFreeModeRef.current && activeFaceSelectedPlacementsRef.current.length > 0) {
        const centerPt = activeObj.getCenterPoint();

        // Placements that already contain a locked object shouldn't magnetically snatch new elements
        const lockedPlacementIds = new Set<string>();
        initCanvas.getObjects().forEach((o: any) => {
          if ((o.isLocked || o.selectable === false) && o.assignedPlacementId && o !== activeObj) {
            lockedPlacementIds.add(o.assignedPlacementId);
          }
        });

        // Evaluate candidate placements on this face
        const candidates = activeFaceSelectedPlacementsRef.current
          .map(spec => {
            const p = getPlacementFabricBounds(spec);
            const isDirectlyInside =
              centerPt.x >= p.fabricLeft &&
              centerPt.x <= p.fabricLeft + p.fabricWidth &&
              centerPt.y >= p.fabricTop &&
              centerPt.y <= p.fabricTop + p.fabricHeight;
            const isNear =
              centerPt.x >= p.fabricLeft - 30 &&
              centerPt.x <= p.fabricLeft + p.fabricWidth + 30 &&
              centerPt.y >= p.fabricTop - 30 &&
              centerPt.y <= p.fabricTop + p.fabricHeight + 30;
            const area = p.fabricWidth * p.fabricHeight;
            const dist = Math.hypot(centerPt.x - p.fabricCenterX, centerPt.y - p.fabricCenterY);
            const isPlacementLocked = lockedPlacementIds.has(spec.id);
            const isAssigned = (activeObj as any).assignedPlacementId === spec.id;
            const isFocused = focusedPlacementId === spec.id;
            return { spec, p, isDirectlyInside, isNear, area, dist, isPlacementLocked, isAssigned, isFocused };
          })
          .filter(c => c.isDirectlyInside || c.isNear);

        // Sort candidates:
        // 1. Non-locked placements first (locked placement treated as non-existent for snapping)
        // 2. Currently assigned or focused placement
        // 3. Directly inside beats near margin
        // 4. Smaller area beats large encompassing area (left chest beats center chest!)
        // 5. Distance to center
        candidates.sort((a, b) => {
          if (a.isPlacementLocked !== b.isPlacementLocked) return a.isPlacementLocked ? 1 : -1;
          if (a.isAssigned !== b.isAssigned) return a.isAssigned ? -1 : 1;
          if (a.isFocused !== b.isFocused) return a.isFocused ? -1 : 1;
          if (a.isDirectlyInside !== b.isDirectlyInside) return a.isDirectlyInside ? -1 : 1;
          if (Math.abs(a.area - b.area) > 500) return a.area - b.area;
          return a.dist - b.dist;
        });

        const bestMatch = candidates[0];
        const matchedPlacementId = bestMatch ? bestMatch.spec.id : null;

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
      if (!activeObj || (activeObj as any).isLocked || activeObj.selectable === false) return;

      if (!isFreeModeRef.current) {
        const centerPt = activeObj.getCenterPoint();
        const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
        const currentFace = activeFaceRef.current || activeFace;
        const allFaceSpecs = getPlacementsForGarment(gType, currentFace);

        // Placements that already contain a locked object shouldn't snatch new elements
        const lockedPlacementIds = new Set<string>();
        initCanvas.getObjects().forEach((o: any) => {
          if ((o.isLocked || o.selectable === false) && o.assignedPlacementId && o !== activeObj) {
            lockedPlacementIds.add(o.assignedPlacementId);
          }
        });

        // Search in selected placements first, or fallback to all face specs
        const searchSpecs = activeFaceSelectedPlacementsRef.current.length > 0
          ? activeFaceSelectedPlacementsRef.current
          : allFaceSpecs;

        // Find candidate placements
        const candidates = searchSpecs
          .map(spec => {
            const p = getPlacementFabricBounds(spec);
            const isDirectlyInside =
              centerPt.x >= p.fabricLeft &&
              centerPt.x <= p.fabricLeft + p.fabricWidth &&
              centerPt.y >= p.fabricTop &&
              centerPt.y <= p.fabricTop + p.fabricHeight;
            const isNear =
              centerPt.x >= p.fabricLeft - 40 &&
              centerPt.x <= p.fabricLeft + p.fabricWidth + 40 &&
              centerPt.y >= p.fabricTop - 40 &&
              centerPt.y <= p.fabricTop + p.fabricHeight + 40;
            const area = p.fabricWidth * p.fabricHeight;
            const dist = Math.hypot(centerPt.x - p.fabricCenterX, centerPt.y - p.fabricCenterY);
            const isPlacementLocked = lockedPlacementIds.has(spec.id);
            const isAssigned = (activeObj as any).assignedPlacementId === spec.id;
            const isFocused = focusedPlacementId === spec.id;
            return { spec, p, isDirectlyInside, isNear, area, dist, isPlacementLocked, isAssigned, isFocused };
          })
          .filter(c => c.isDirectlyInside || c.isNear);

        // If not directly inside or near, check allFaceSpecs for direct containment
        if (candidates.length === 0 && allFaceSpecs.length > 0) {
          allFaceSpecs.forEach(spec => {
            if (lockedPlacementIds.has(spec.id)) return;
            const p = getPlacementFabricBounds(spec);
            const isDirectlyInside =
              centerPt.x >= p.fabricLeft &&
              centerPt.x <= p.fabricLeft + p.fabricWidth &&
              centerPt.y >= p.fabricTop &&
              centerPt.y <= p.fabricTop + p.fabricHeight;
            if (isDirectlyInside) {
              candidates.push({
                spec,
                p,
                isDirectlyInside: true,
                isNear: true,
                area: p.fabricWidth * p.fabricHeight,
                dist: Math.hypot(centerPt.x - p.fabricCenterX, centerPt.y - p.fabricCenterY),
                isPlacementLocked: false,
                isAssigned: false,
                isFocused: focusedPlacementId === spec.id,
              });
            }
          });
        }

        // Snap radius fallback if selected placements exist
        if (candidates.length === 0 && activeFaceSelectedPlacementsRef.current.length > 0) {
          activeFaceSelectedPlacementsRef.current.forEach(spec => {
            if (lockedPlacementIds.has(spec.id)) return;
            const p = getPlacementFabricBounds(spec);
            const dist = Math.hypot(centerPt.x - p.fabricCenterX, centerPt.y - p.fabricCenterY);
            if (dist < 200) {
              const area = p.fabricWidth * p.fabricHeight;
              candidates.push({
                spec,
                p,
                isDirectlyInside: false,
                isNear: false,
                area,
                dist,
                isPlacementLocked: false,
                isAssigned: false,
                isFocused: focusedPlacementId === spec.id,
              });
            }
          });
        }

        candidates.sort((a, b) => {
          if (a.isPlacementLocked !== b.isPlacementLocked) return a.isPlacementLocked ? 1 : -1;
          if (a.isAssigned !== b.isAssigned) return a.isAssigned ? -1 : 1;
          if (a.isFocused !== b.isFocused) return a.isFocused ? -1 : 1;
          if (a.isDirectlyInside !== b.isDirectlyInside) return a.isDirectlyInside ? -1 : 1;
          if (Math.abs(a.area - b.area) > 500) return a.area - b.area;
          return a.dist - b.dist;
        });

        const bestMatch = candidates[0];

        if (bestMatch) {
          const targetSpec = bestMatch.spec;
          const p = bestMatch.p;
          const previousPlacementId = (activeObj as any).assignedPlacementId;
          const wasFreeMode = (activeObj as any).originMode === 'free';

          // If dropped directly inside this placement (isDirectlyInside):
          // RESPECT USER MANUAL POSITION! Only snap to center if switching from a different placement or outside!
          if (!bestMatch.isDirectlyInside && (!previousPlacementId || previousPlacementId !== targetSpec.id)) {
            activeObj.set({
              originX: 'center',
              originY: 'center',
              left: p.fabricCenterX,
              top: p.fabricCenterY,
            });
          }

          // Scale down only if genuinely oversized for the placement bounds
          const maxW = p.fabricWidth * 0.95;
          const maxH = p.fabricHeight * 0.95;
          const curW = activeObj.getScaledWidth();
          const curH = activeObj.getScaledHeight();
          if (curW > maxW || curH > maxH) {
            const scaleFactor = Math.min(maxW / (activeObj.width || 1), maxH / (activeObj.height || 1));
            activeObj.scale(scaleFactor);
          }

          if (previousPlacementId !== targetSpec.id || wasFreeMode) {
            showToast(
              locale === 'tr' ? `Tasarım ${targetSpec.nameTr} alanına yerleştirildi ve onaylı fiyatlandırma uygulandı 🎯` :
              locale === 'en' ? `Design placed in ${targetSpec.nameEn} and standard pricing applied 🎯` :
              `تم وضع وتثبيت التصميم في: ${targetSpec.nameAr} واعتماد تسعير المواضع 🎯`,
              'success',
              2500
            );
          }

          (activeObj as any).assignedPlacementId = targetSpec.id;
          (activeObj as any).originMode = 'approved';
          activeObj.setCoords();
          initCanvas.renderAll();
          setFocusedPlacementId(targetSpec.id);

          // Ensure target placement is added to selected placements list
          const activeColor = normalizeColorKey(selectedColorRef.current || selectedColor);
          const currentPlacements = placementsByColorRef.current[activeColor] || [];
          if (!currentPlacements.includes(targetSpec.id)) {
            const updated = [...currentPlacements, targetSpec.id];
            const nextMap = { ...placementsByColorRef.current, [activeColor]: updated };
            setPlacementsByColor(nextMap);
            placementsByColorRef.current = nextMap;
            currentSelectedPlacementIdsRef.current = updated;
          }

          // Recalculate price in real time
          recalculatePrice(initCanvas);
        } else if ((activeObj as any).originMode === 'free') {
          // Object remains unaligned free mode outside approved placements
          (activeObj as any).assignedPlacementId = null;
          recalculatePrice(initCanvas);
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
        const dedicatedRaw = localStorage.getItem(`studio_saved_placements_${productId}`);
        let restoredPlacements: Record<string, string[]> = {};
        let hasDedicatedPlacements = false;

        if (dedicatedRaw) {
          try {
            const parsedDed = JSON.parse(dedicatedRaw);
            if (parsedDed && typeof parsedDed === 'object') {
              restoredPlacements = parsedDed;
              hasDedicatedPlacements = true;
            }
          } catch {}
        }

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
            // Only use savedRaw placements if dedicatedRaw did not provide placements
            if (!hasDedicatedPlacements) {
              if (parsed.placementsByColor && typeof parsed.placementsByColor === 'object') {
                restoredPlacements = parsed.placementsByColor;
              } else if (Array.isArray(parsed.selectedPlacementIds)) {
                const initialKey = normalizeColorKey(parsed.selectedColor || resolvedInitialColor);
                restoredPlacements[initialKey] = parsed.selectedPlacementIds;
              }
            }

            if (typeof parsed.syncPlacementsAcrossColors === 'boolean') {
              setSyncPlacementsAcrossColors(parsed.syncPlacementsAcrossColors);
              syncPlacementsAcrossColorsRef.current = parsed.syncPlacementsAcrossColors;
            }
            if (isCustomerChoiceAllowedRef.current && (parsed.selectedPrintMethod === 'Sublimation' || parsed.selectedPrintMethod === 'DTF')) {
              userModifiedPrintMethodRef.current = true;
              setSelectedPrintMethod(parsed.selectedPrintMethod);
            }

            const activeColorKeyResolved = normalizeColorKey(parsed.selectedColor || resolvedInitialColor);
            const activePlacementsList = restoredPlacements['__synced__'] || restoredPlacements[activeColorKeyResolved] || [];
            currentSelectedPlacementIdsRef.current = activePlacementsList;

            // Immediately recalculate price with restored faces and active placements using live pricing rules
            recalculatePrice(undefined, parsed.faces, activePlacementsList);
            console.log("📥 Draft memory loaded with matrix & pricing.");
          }
        }

        if (hasDedicatedPlacements || Object.keys(restoredPlacements).length > 0) {
          setPlacementsByColor(restoredPlacements);
          placementsByColorRef.current = restoredPlacements;
          const activeColorKeyResolved = normalizeColorKey(selectedColorRef.current || selectedColor || resolvedInitialColor);
          const activePlacementsList = restoredPlacements['__synced__'] || restoredPlacements[activeColorKeyResolved] || [];
          currentSelectedPlacementIdsRef.current = activePlacementsList;
          recalculatePrice(undefined, undefined, activePlacementsList);
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

              // Restore locked state on objects
              initCanvas.getObjects().forEach((obj: any) => {
                if (obj.isLocked === true || obj.lockMovementX === true) {
                  obj.set({
                    selectable: false,
                    evented: false,
                    lockMovementX: true,
                    lockMovementY: true,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    hasControls: false,
                    hasBorders: false,
                  });
                  obj.isLocked = true;
                }
              });

              if (isMugPanoramicWorkspaceRef.current && !parsed?.mugPanoramaSheet && isFaceMatching('front', activeFace)) {
                const savedNw = Number(parsed?.width) || (mockupNaturalSize.width > 0 ? mockupNaturalSize.width : 1000);
                const savedNh = Number(parsed?.height) || (mockupNaturalSize.height > 0 ? mockupNaturalSize.height : 1000);
                const frontSpec = getPlacementById('mug_front', 'mug');
                const oldFrontBounds = frontSpec
                  ? getPlacementFabricBounds(frontSpec, savedNw, savedNh, true)
                  : { fabricLeft: 0, fabricTop: 0, fabricWidth: savedNw, fabricHeight: savedNh };
                const panoTargetBox = { left: 580, top: 20, width: 680, height: 720 };
                const userLoadedObjs = initCanvas.getObjects().filter((o: any) => {
                  const n = (o?.name || '').toLowerCase();
                  return n !== 'background' && n !== 'mockup' && n !== 'print_area_guide' && n !== 'guideline';
                });
                if (userLoadedObjs.length > 0) {
                  const ratio = Math.min(
                    panoTargetBox.width / Math.max(1, oldFrontBounds.fabricWidth),
                    panoTargetBox.height / Math.max(1, oldFrontBounds.fabricHeight)
                  );
                  userLoadedObjs.forEach((obj: any) => {
                    const center = obj.getCenterPoint();
                    const relX = (center.x - oldFrontBounds.fabricLeft) / Math.max(1, oldFrontBounds.fabricWidth);
                    const relY = (center.y - oldFrontBounds.fabricTop) / Math.max(1, oldFrontBounds.fabricHeight);
                    const nextCx = panoTargetBox.left + Math.max(0.02, Math.min(0.98, relX)) * panoTargetBox.width;
                    const nextCy = panoTargetBox.top + Math.max(0.02, Math.min(0.98, relY)) * panoTargetBox.height;
                    obj.set({
                      scaleX: (obj.scaleX || 1) * ratio,
                      scaleY: (obj.scaleY || 1) * ratio,
                      clipPath: undefined,
                    });
                    obj.setPositionByOrigin(new fabric.Point(nextCx, nextCy), 'center', 'center');
                    obj.assignedPlacementId = 'mug_full_wrap';
                    obj.originMode = 'approved';
                    obj.setCoords();
                  });
                }
              } else if (
                isMugPanoramicWorkspaceRef.current &&
                parsed?.mugPanoramaSheet &&
                isFaceMatching('front', activeFace)
              ) {
                migrateLegacyMugPanoramaObjects(initCanvas, parsed);
              }

              initCanvas.renderAll();
              const initialJson = JSON.stringify(
                buildSerializedFaceJson(
                  initCanvas,
                  isMugPanoramicWorkspaceRef.current && isFaceMatching('front', activeFace),
                  nativeWidthRef.current,
                  nativeHeightRef.current
                )
              );
              historyRef.current = [initialJson];
              historyStepRef.current = 0;
              setCanUndo(false);
              setCanRedo(false);
              recalculatePrice(initCanvas);
              const currentKey = getFaceStateKey(activeFace, selectedColor);
              facesData.current[currentKey] = initialJson;

              // Smart Placement Auto-Reconciliation
              setTimeout(() => {
                if (isDisposed || !(initCanvas as any).lowerCanvasEl) return;
                reconcilePlacementsForActiveState(initCanvas);
                scheduleLiveMugTextureRefreshRef.current?.(initCanvas, 60);
              }, 60);

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
      const initialJson = JSON.stringify(
        buildSerializedFaceJson(
          initCanvas,
          isMugPanoramicWorkspaceRef.current && isFaceMatching('front', activeFace),
          nativeWidthRef.current,
          nativeHeightRef.current
        )
      );
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
          const json = JSON.stringify(
            buildSerializedFaceJson(
              initCanvas,
              isMugPanoramicWorkspaceRef.current && isFaceMatching('front', activeFace),
              nativeWidthRef.current,
              nativeHeightRef.current
            )
          );
          const currentKey = getFaceStateKey(activeFace, selectedColor);
          facesData.current[currentKey] = json;
        } catch (e) {}
      }

      isDisposed = true;
      isRestoring.current = true; // منع الحفظ أثناء التدمير
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      window.removeEventListener('touchcancel', handleGlobalPointerUp);
      window.removeEventListener('blur', handleGlobalPointerUp);
      if (restoreTimer) clearTimeout(restoreTimer);
      if (initCanvas) {
        try {
          (initCanvas as any).cancelRequestedRender?.();
          (initCanvas as any).disposed = true;
          initCanvas.dispose();
        } catch(e) {}
      }
    };
  }, [activeFace, selectedColor]); // Re-initialize when active face or color changes

  const applyModernObjectStyles = (targetCanvas: fabric.Canvas) => {
    applyCustomModernStyles(targetCanvas);
  };

  const saveHistoryStateCanvas = (c: fabric.Canvas) => {
    if (!c || isRestoring.current) return;
    const json = JSON.stringify(buildSerializedFaceJson(c, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current));
    
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
    const isOutOfBounds = !isObjectInsidePrintBounds(activeObj);
    applyActiveSelectionBoundsStyle(activeObj, c.getWidth(), isOutOfBounds);
    setIsObjectOutOfBounds(isOutOfBounds);
    if (!isOutOfBounds) {
      setIsWarningDismissed(false);
    }
  }, [canvas, isObjectInsidePrintBounds]);

  checkObjectBoundsRef.current = checkObjectBounds;

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
          scheduleLiveMugTextureRefreshRef.current?.(canvas, 60);
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
          scheduleLiveMugTextureRefreshRef.current?.(canvas, 60);
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

  const resolveTargetFace = useCallback((face: string): string => {
    if (availableFaces.includes(face)) return face;
    const match = availableFaces.find(af => isFaceMatching(af, face));
    if (match) return match;
    if (isFaceMatching(face, 'right') || isFaceMatching(face, 'left') || face === 'sleeve' || face === 'sleeves') {
      const anySleeve = availableFaces.find(af => isFaceMatching(af, 'right') || isFaceMatching(af, 'left'));
      if (anySleeve) return anySleeve;
    }
    return face;
  }, [availableFaces]);

  const switchFace = useCallback((face: string) => {
    const resolvedFace = resolveTargetFace(face);
    if (resolvedFace === activeFace) return;
    if (canvas && !isRestoring.current) {
      try {
        const json = JSON.stringify(buildSerializedFaceJson(canvas, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current));
        const currentKey = getFaceStateKey(activeFace, selectedColor);
        facesData.current[currentKey] = json;
      } catch (e) {}
    }
    setActiveFace(resolvedFace);
  }, [canvas, activeFace, selectedColor, getFaceStateKey, resolveTargetFace]);

  const handleSelectMugModeRef = useRef<((mode: MugPrintMode) => void) | null>(null);

  const handleTogglePlacement = useCallback((placement: PlacementSpec) => {
    const targetFace = placement.targetFace;
    const wasSelected = currentSelectedPlacementIds.includes(placement.id);

    const currentList = syncPlacementsAcrossColorsRef.current
      ? (placementsByColorRef.current['__synced__'] || placementsByColorRef.current[activeColorKey] || [])
      : (placementsByColorRef.current[activeColorKey] || []);

    const updatedList = wasSelected
      ? currentList.filter(id => id !== placement.id)
      : [...currentList, placement.id];

    let nextMap: Record<string, string[]>;
    if (syncPlacementsAcrossColorsRef.current) {
      nextMap = {
        ...placementsByColorRef.current,
        ['__synced__']: updatedList,
        [activeColorKey]: updatedList,
      };
      availableColors.forEach((c: string) => {
        nextMap[normalizeColorKey(c)] = updatedList;
      });
      uniqueSelectedColors.forEach((c: string) => {
        nextMap[normalizeColorKey(c)] = updatedList;
      });
    } else {
      nextMap = {
        ...placementsByColorRef.current,
        [activeColorKey]: updatedList,
      };
    }

    setPlacementsByColor(nextMap);
    placementsByColorRef.current = nextMap;
    currentSelectedPlacementIdsRef.current = updatedList;

    // Immediately recalculate price with updated placement selection
    recalculatePrice(canvas, undefined, updatedList);

    try {
      localStorage.setItem(`studio_saved_placements_${productId}`, JSON.stringify(nextMap));
    } catch {}

    if (!wasSelected) {
      setFocusedPlacementId(placement.id);
      if (targetFace && !isFaceMatching(targetFace, activeFace)) {
        switchFace(targetFace);
      }
    } else {
      setFocusedPlacementId(prev => (prev === placement.id ? null : prev));

      // Option 1: Immediately remove artwork and stickers belonging to this placement from the active canvas
      if (canvas) {
        const objectsToRemove: any[] = [];
        const isCurrentFace = isFaceMatching(targetFace, activeFaceRef.current || activeFace);
        let bounds: any = null;
        try {
          bounds = getPlacementFabricBounds(placement);
        } catch {}

        canvas.getObjects().forEach((o: any) => {
          if (!o || o.name === 'background' || o.name === 'mockup' || o.name === 'print_area_guide') return;

          const isAssigned = (o.assignedPlacementId === placement.id || o.placementId === placement.id);
          let isInsideZone = false;
          if (isCurrentFace && bounds && !o.assignedPlacementId) {
            const pt = o.getCenterPoint ? o.getCenterPoint() : { x: o.left || 0, y: o.top || 0 };
            isInsideZone = (
              pt.x >= bounds.fabricLeft &&
              pt.x <= bounds.fabricLeft + bounds.fabricWidth &&
              pt.y >= bounds.fabricTop &&
              pt.y <= bounds.fabricTop + bounds.fabricHeight
            );
          }

          if (isAssigned || isInsideZone) {
            objectsToRemove.push(o);
          }
        });

        if (objectsToRemove.length > 0) {
          objectsToRemove.forEach(obj => {
            if (canvas.getActiveObject() === obj) {
              canvas.discardActiveObject();
            }
            canvas.remove(obj);
          });
          canvas.requestRenderAll();
          saveHistoryStateCanvas(canvas);
        }
      }

      // Option 1: Also remove artwork belonging to this placement from memory (facesData)
      if (facesData.current) {
        Object.keys(facesData.current).forEach(k => {
          const raw = facesData.current[k];
          if (!raw) return;
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed?.objects && Array.isArray(parsed.objects)) {
              const beforeCount = parsed.objects.length;
              parsed.objects = parsed.objects.filter((o: any) => {
                if (o.name === 'background' || o.name === 'mockup' || o.name === 'print_area_guide') return true;
                return o.assignedPlacementId !== placement.id && o.placementId !== placement.id;
              });
              if (parsed.objects.length !== beforeCount) {
                facesData.current[k] = JSON.stringify(parsed);
              }
            }
          } catch {}
        });
      }

      // Sync and immediately recalculate price
      saveDraftImmediate();
      recalculatePrice(canvas, undefined, updatedList);
    }

    if (canvas && !wasSelected) {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
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

    // Immediately persist change
    saveDraftImmediate();
  }, [activeColorKey, activeFace, canvas, currentSelectedPlacementIds, switchFace, availableColors, uniqueSelectedColors, normalizeColorKey, productId, getPlacementFabricBounds, saveDraftImmediate, recalculatePrice]);

  const applyExplicitPlacementList = useCallback((updatedList: string[]) => {
    let nextMap: Record<string, string[]>;
    if (syncPlacementsAcrossColorsRef.current) {
      nextMap = {
        ...placementsByColorRef.current,
        synced_all: updatedList,
        '__synced__': updatedList,
        [activeColorKey]: updatedList,
      };
      uniqueSelectedColors.forEach((c: string) => {
        nextMap[normalizeColorKey(c)] = updatedList;
      });
    } else {
      nextMap = {
        ...placementsByColorRef.current,
        [activeColorKey]: updatedList,
      };
    }

    setPlacementsByColor(nextMap);
    placementsByColorRef.current = nextMap;
    currentSelectedPlacementIdsRef.current = updatedList;
    recalculatePrice(canvas, undefined, updatedList);

    try {
      localStorage.setItem(`studio_saved_placements_${productId}`, JSON.stringify(nextMap));
    } catch {}
    saveDraftImmediate();
  }, [activeColorKey, canvas, uniqueSelectedColors, normalizeColorKey, productId, saveDraftImmediate, recalculatePrice]);

  const isMugFaceLocked = useCallback((face: string): boolean => {
    if (studioProfile.family !== 'mug') return false;
    if (activeMugMode === 'mug_full_wrap') {
      return !isFaceMatching('front', face);
    }
    if (activeMugMode === 'mug_two_sided') {
      return !isFaceMatching('front', face) && !isFaceMatching('back', face);
    }
    return false;
  }, [studioProfile.family, activeMugMode]);

  const remapUserObjectsBetweenBoxes = useCallback((
    targetCanvas: fabric.Canvas,
    sourceBox: { left: number; top: number; width: number; height: number },
    targetBox: { left: number; top: number; width: number; height: number },
    targetPlacementId: string
  ) => {
    const userObjs = targetCanvas.getObjects().filter((o: any) => {
      const n = (o?.name || '').toLowerCase();
      return n !== 'background' && n !== 'mockup' && n !== 'print_area_guide' && n !== 'guideline';
    });
    if (userObjs.length === 0) return;

    const ratio = Math.min(
      targetBox.width / Math.max(1, sourceBox.width),
      targetBox.height / Math.max(1, sourceBox.height)
    );

    userObjs.forEach((obj: any) => {
      const center = obj.getCenterPoint();
      const relX = (center.x - sourceBox.left) / Math.max(1, sourceBox.width);
      const relY = (center.y - sourceBox.top) / Math.max(1, sourceBox.height);
      const nextCx = targetBox.left + Math.max(0.02, Math.min(0.98, relX)) * targetBox.width;
      const nextCy = targetBox.top + Math.max(0.02, Math.min(0.98, relY)) * targetBox.height;

      obj.set({
        scaleX: (obj.scaleX || 1) * ratio,
        scaleY: (obj.scaleY || 1) * ratio,
        clipPath: undefined,
      });
      obj.setPositionByOrigin(new fabric.Point(nextCx, nextCy), 'center', 'center');
      obj.assignedPlacementId = targetPlacementId;
      obj.originMode = 'approved';
      obj.setCoords();
    });
  }, []);

  const handleSelectMugMode = useCallback((mode: MugPrintMode) => {
    const prevMode = activeMugMode;
    if (mode === prevMode) return;

    const PANO_CENTER_PANEL = { left: 580, top: 20, width: 680, height: 720 };

    if (mode === 'mug_full_wrap') {
      const isCanvasAlive = Boolean(
        canvas &&
        !(canvas as any).disposed &&
        (canvas as any).lowerCanvasEl &&
        canvas.getContext?.()
      );
      if (isCanvasAlive && canvas && isFaceMatching('front', activeFace)) {
        const prevSpec = getPlacementById(prevMode === 'mug_two_sided' ? 'mug_front' : 'mug_front', 'mug');
        const oldBounds = prevSpec
          ? getPlacementFabricBounds(prevSpec)
          : { fabricLeft: 0, fabricTop: 0, fabricWidth: nativeWidthRef.current, fabricHeight: nativeHeightRef.current };
        remapUserObjectsBetweenBoxes(
          canvas,
          { left: oldBounds.fabricLeft, top: oldBounds.fabricTop, width: oldBounds.fabricWidth, height: oldBounds.fabricHeight },
          PANO_CENTER_PANEL,
          'mug_full_wrap'
        );
        canvas.setWidth(MUG_PANORAMA_SHEET_WIDTH);
        canvas.setHeight(MUG_PANORAMA_SHEET_HEIGHT);
        canvas.requestRenderAll();
      }

      setMobilePanoramaView('2d');
      applyExplicitPlacementList(['mug_full_wrap']);
      setFocusedPlacementId('mug_full_wrap');
      if (!isFaceMatching('front', activeFace)) {
        switchFace('front');
      } else if (isCanvasAlive && canvas) {
        saveHistoryStateCanvas(canvas);
        scheduleLiveMugTextureRefreshRef.current?.(canvas, 60);
      }
      return;
    }

    const leavingPanorama = prevMode === 'mug_full_wrap';
    const nextPlacementId = mode === 'mug_two_sided' && isFaceMatching('back', activeFace) ? 'mug_back' : 'mug_front';
    const isCanvasAliveForExit = Boolean(
      canvas &&
      !(canvas as any).disposed &&
      (canvas as any).lowerCanvasEl &&
      canvas.getContext?.()
    );

    if (leavingPanorama && isCanvasAliveForExit && canvas && isFaceMatching('front', activeFace)) {
      const nonPanoW = mockupNaturalSize.width > 0
        ? mockupNaturalSize.width
        : (Number(resolvedFaceConfig?.nativeWidth) || 1000);
      const nonPanoH = mockupNaturalSize.height > 0
        ? mockupNaturalSize.height
        : (Number(resolvedFaceConfig?.nativeHeight) || 1000);
      const frontSpec = getPlacementById('mug_front', 'mug');
      const targetBounds = frontSpec
        ? getPlacementFabricBounds(frontSpec, nonPanoW, nonPanoH, true)
        : { fabricLeft: 0, fabricTop: 0, fabricWidth: nonPanoW, fabricHeight: nonPanoH };

      const userObjs = canvas.getObjects().filter((o: any) => {
        const n = (o?.name || '').toLowerCase();
        return n !== 'background' && n !== 'mockup' && n !== 'print_area_guide' && n !== 'guideline';
      });
      const spansWidePanorama = userObjs.some((o: any) => {
        const br = o.getBoundingRect(true, true);
        return br.left < 480 || br.left + br.width > 1360;
      });
      const sourceBox = spansWidePanorama
        ? { left: 0, top: 0, width: MUG_PANORAMA_SHEET_WIDTH, height: MUG_PANORAMA_SHEET_HEIGHT }
        : PANO_CENTER_PANEL;

      remapUserObjectsBetweenBoxes(
        canvas,
        sourceBox,
        { left: targetBounds.fabricLeft, top: targetBounds.fabricTop, width: targetBounds.fabricWidth, height: targetBounds.fabricHeight },
        nextPlacementId
      );
      canvas.setWidth(nonPanoW);
      canvas.setHeight(nonPanoH);
      canvas.requestRenderAll();
    }

    if (mode === 'mug_front') {
      const targetSingleFace = availableFaces.includes(activeFace)
        ? activeFace
        : (availableFaces[0] || 'front');
      updateMugSingleSideFace(targetSingleFace);
      applyExplicitPlacementList(['mug_front']);
      setFocusedPlacementId('mug_front');
    } else {
      applyExplicitPlacementList(['mug_front', 'mug_back']);
      if (!isFaceMatching('front', activeFace) && !isFaceMatching('back', activeFace)) {
        switchFace('front');
        setFocusedPlacementId('mug_front');
      } else {
        setFocusedPlacementId(isFaceMatching('back', activeFace) ? 'mug_back' : 'mug_front');
      }
    }

    if (canvas && !leavingPanorama) {
      return;
    }
    if (isCanvasAliveForExit && canvas && isFaceMatching('front', activeFace)) {
      saveHistoryStateCanvas(canvas);
    }
  }, [
    activeMugMode,
    canvas,
    activeFace,
    availableFaces,
    mockupNaturalSize,
    resolvedFaceConfig,
    getPlacementFabricBounds,
    remapUserObjectsBetweenBoxes,
    applyExplicitPlacementList,
    switchFace,
    updateMugSingleSideFace,
  ]);
  handleSelectMugModeRef.current = handleSelectMugMode;

  const getTargetPanoramaActionObject = useCallback(() => {
    if (!canvas) return null;
    const active = canvas.getActiveObject();
    if (active) {
      const n = ((active as any).name || '').toLowerCase();
      if (n !== 'background' && n !== 'mockup' && n !== 'print_area_guide' && n !== 'guideline') {
        return active;
      }
    }
    const userObjs = canvas.getObjects().filter((o: any) => {
      const n = (o?.name || '').toLowerCase();
      return n !== 'background' && n !== 'mockup' && n !== 'print_area_guide' && n !== 'guideline';
    });
    return userObjs.length > 0 ? userObjs[userObjs.length - 1] : null;
  }, [canvas]);

  const handleFillPanoramaWrap = useCallback(() => {
    if (!canvas || !isMugPanoramicWorkspaceRef.current) return;
    const obj = getTargetPanoramaActionObject();
    if (!obj) {
      showToast(
        locale === 'tr'
          ? 'Önce bardağa bir fotoğraf veya tasarım ekleyin'
          : locale === 'en'
            ? 'Add a photo or design to the sheet first'
            : 'أضف صورة أو تصميماً أولاً لملء البانوراما',
        'info'
      );
      return;
    }

    const bw = Math.max(1, obj.getScaledWidth());
    const bh = Math.max(1, obj.getScaledHeight());
    const coverScale = Math.max(MUG_PANORAMA_SHEET_WIDTH / bw, MUG_PANORAMA_SHEET_HEIGHT / bh);
    obj.set({
      scaleX: (obj.scaleX || 1) * coverScale,
      scaleY: (obj.scaleY || 1) * coverScale,
      angle: 0,
    });
    obj.setPositionByOrigin(
      new fabric.Point(MUG_PANORAMA_SHEET_WIDTH / 2, MUG_PANORAMA_SHEET_HEIGHT / 2),
      'center',
      'center'
    );
    (obj as any).assignedPlacementId = 'mug_full_wrap';
    obj.setCoords();
    canvas.setActiveObject(obj);
    setActiveObject(obj);
    canvas.requestRenderAll();
    saveHistoryStateCanvas(canvas);
    scheduleLiveMugTextureRefreshRef.current?.(canvas, 40);
    setLiveYawRequest({ yaw: MUG_CAMERA_ANGLES.panorama, seq: Date.now() });
  }, [canvas, getTargetPanoramaActionObject, locale]);

  const handleSnapPanoramaZone = useCallback((zone: MugPanoramaZone) => {
    if (!canvas || !isMugPanoramicWorkspaceRef.current) return;
    const zoneTargets: Record<MugPanoramaZone, { cx: number; maxW: number; yaw: number }> = {
      left: { cx: MUG_PANORAMA_SHEET_WIDTH * 0.185, maxW: MUG_PANORAMA_SHEET_WIDTH * 0.30, yaw: MUG_CAMERA_ANGLES.left },
      center: { cx: MUG_PANORAMA_SHEET_WIDTH * 0.50, maxW: MUG_PANORAMA_SHEET_WIDTH * 0.28, yaw: MUG_CAMERA_ANGLES.panorama },
      right: { cx: MUG_PANORAMA_SHEET_WIDTH * 0.815, maxW: MUG_PANORAMA_SHEET_WIDTH * 0.30, yaw: MUG_CAMERA_ANGLES.right },
    };
    const cfg = zoneTargets[zone];
    setLiveYawRequest({ yaw: cfg.yaw, seq: Date.now() });

    const obj = getTargetPanoramaActionObject();
    if (!obj) {
      showToast(
        locale === 'tr'
          ? 'Önce bir tasarım ekleyin veya seçin'
          : locale === 'en'
            ? 'Add or select an element first'
            : 'أضف أو حدد عنصراً أولاً لنقله إلى هذه المنطقة',
        'info'
      );
      return;
    }

    const curW = Math.max(1, obj.getScaledWidth());
    const curH = Math.max(1, obj.getScaledHeight());
    const maxH = MUG_PANORAMA_SHEET_HEIGHT * 0.86;
    if (curW > cfg.maxW || curH > maxH) {
      const shrink = Math.min(cfg.maxW / curW, maxH / curH);
      obj.set({
        scaleX: (obj.scaleX || 1) * shrink,
        scaleY: (obj.scaleY || 1) * shrink,
      });
    }
    obj.setPositionByOrigin(
      new fabric.Point(cfg.cx, MUG_PANORAMA_SHEET_HEIGHT * 0.5),
      'center',
      'center'
    );
    (obj as any).assignedPlacementId = 'mug_full_wrap';
    obj.setCoords();
    canvas.setActiveObject(obj);
    setActiveObject(obj);
    canvas.requestRenderAll();
    saveHistoryStateCanvas(canvas);
    scheduleLiveMugTextureRefreshRef.current?.(canvas, 40);
  }, [canvas, getTargetPanoramaActionObject, locale]);

  const handleBottomFaceSelect = useCallback((face: string) => {
    if (isMugFaceLocked(face)) return;
    if (isMugSingleMode) {
      updateMugSingleSideFace(face);
    }
    if (activeFace !== face) {
      switchFace(face);
    }
    if (studioProfile.family === 'mug' && activeMugMode === 'mug_two_sided') {
      setFocusedPlacementId(isFaceMatching('back', face) ? 'mug_back' : 'mug_front');
    } else if (studioProfile.family === 'mug' && activeMugMode === 'mug_front') {
      setFocusedPlacementId('mug_front');
    }
  }, [isMugFaceLocked, isMugSingleMode, updateMugSingleSideFace, activeFace, switchFace, studioProfile.family, activeMugMode]);

  useEffect(() => {
    if (studioProfile.family !== 'mug') return;
    if (isMugFaceLocked(activeFace)) {
      switchFace('front');
    }
  }, [studioProfile.family, activeMugMode, activeFace, isMugFaceLocked, switchFace]);

  const handleDuplicateMugFaceToOpposite = useCallback(() => {
    if (!canvas) return;
    const isCurrentlyBack = isFaceMatching('back', activeFaceRef.current || activeFace);
    const sourceFace = isCurrentlyBack ? 'back' : 'front';
    const targetFace = isCurrentlyBack ? 'front' : 'back';
    const targetPlacementId = targetFace === 'back' ? 'mug_back' : 'mug_front';

    const currentKey = getFaceStateKey(sourceFace, selectedColor);
    const serialized = canvas.toJSON(SERIALIZE_PROPERTIES);
    facesData.current[currentKey] = JSON.stringify(serialized);

    const clonedObjs = (serialized.objects || [])
      .filter((o: any) => {
        const n = (o?.name || '').toLowerCase();
        return n !== 'background' && n !== 'mockup' && n !== 'print_area_guide' && n !== 'guideline';
      })
      .map((o: any) => ({
        ...o,
        assignedPlacementId: targetPlacementId,
        originMode: 'approved',
      }));

    if (clonedObjs.length === 0) {
      showToast(
        locale === 'tr' ? 'Önce bu yüze bir tasarım ekleyin' : locale === 'en' ? 'Add a design to this side first' : 'أضف تصميماً على هذا الوجه أولاً',
        'info'
      );
      return;
    }

    const oppKey = getFaceStateKey(targetFace, selectedColor);
    let baseOppJson: any = { version: serialized.version, objects: [] };
    try {
      const existingRaw = facesData.current[oppKey];
      if (existingRaw) {
        const parsedOpp = JSON.parse(existingRaw);
        const keepSys = (parsedOpp.objects || []).filter((o: any) => {
          const n = (o?.name || '').toLowerCase();
          return n === 'background' || n === 'mockup' || n === 'print_area_guide';
        });
        baseOppJson = { ...parsedOpp, objects: [...keepSys, ...clonedObjs] };
      } else {
        baseOppJson = { version: serialized.version, objects: clonedObjs };
      }
    } catch {
      baseOppJson = { version: serialized.version, objects: clonedObjs };
    }

    facesData.current[oppKey] = JSON.stringify(baseOppJson);
    applyExplicitPlacementList(['mug_front', 'mug_back']);
    switchFace(targetFace);
    showToast(
      locale === 'tr'
        ? 'Tasarım karşı kupa yüzeyine kopyalandı'
        : locale === 'en'
          ? 'Design duplicated to opposite mug side'
          : 'تم نسخ التصميم إلى الجهة المقابلة للكوب بنجاح',
      'success'
    );
  }, [canvas, activeFace, selectedColor, getFaceStateKey, applyExplicitPlacementList, switchFace, showToast, locale]);

  const handleSelectPlacementAndProceed = useCallback((placement: PlacementSpec) => {
    setIsPlacementRequiredModalOpen(false);
    setIsPlacementGuideModalOpen(false);
    handleTogglePlacement(placement);
    activeFaceSelectedPlacementsRef.current = [placement];

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setActiveMobileTab(null);
    }

    const cb = pendingAddCallbackRef.current;
    pendingAddCallbackRef.current = null;
    setPendingAddCallback(null);
    if (cb) {
      setTimeout(() => {
        cb();
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setActiveMobileTab(null);
        }
      }, 80);
    }
  }, [handleTogglePlacement]);

  const handleEnableFreeModeAndProceed = useCallback(() => {
    setIsPlacementRequiredModalOpen(false);
    setIsPlacementGuideModalOpen(false);
    handleToggleFreeMode(true);

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setActiveMobileTab(null);
    }

    const cb = pendingAddCallbackRef.current;
    pendingAddCallbackRef.current = null;
    setPendingAddCallback(null);
    if (cb) {
      setTimeout(() => {
        cb();
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setActiveMobileTab(null);
        }
      }, 80);
    }
  }, [handleToggleFreeMode]);

  const handleToggleSyncPlacements = useCallback(() => {
    setSyncPlacementsAcrossColors(prev => {
      const next = !prev;
      syncPlacementsAcrossColorsRef.current = next;
      try {
        localStorage.setItem(`studio_sync_placements_${productId}`, String(next));
      } catch {}
      if (next) {
        // Propagate current color's placements to all colors
        const currentList = placementsByColorRef.current[activeColorKey] || [];
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
          placementsByColorRef.current = newMap;
          try {
            localStorage.setItem(`studio_saved_placements_${productId}`, JSON.stringify(newMap));
          } catch {}
          return newMap;
        });
      }
      return next;
    });

    saveDraftImmediate();
  }, [activeColorKey, availableColors, uniqueSelectedColors, normalizeColorKey, productId, saveDraftImmediate]);

  const handleClearPlacements = useCallback(() => {
    const nextMap: Record<string, string[]> = {
      ...placementsByColorRef.current,
      [activeColorKey]: [],
      ['__synced__']: [],
    };
    if (syncPlacementsAcrossColorsRef.current) {
      availableColors.forEach((c: string) => {
        nextMap[normalizeColorKey(c)] = [];
      });
      uniqueSelectedColors.forEach((c: string) => {
        nextMap[normalizeColorKey(c)] = [];
      });
    }

    setPlacementsByColor(nextMap);
    placementsByColorRef.current = nextMap;
    currentSelectedPlacementIdsRef.current = [];

    // Immediately recalculate price with empty placements
    recalculatePrice(canvas, undefined, []);

    try {
      localStorage.setItem(`studio_saved_placements_${productId}`, JSON.stringify(nextMap));
    } catch {}

    setFocusedPlacementId(null);

    // Option 1: Remove placement-bound user objects from canvas
    if (canvas) {
      const objectsToRemove: any[] = [];
      canvas.getObjects().forEach((o: any) => {
        if (o && o.name !== 'background' && o.name !== 'mockup' && o.name !== 'print_area_guide') {
          if (o.assignedPlacementId || o.placementId) {
            objectsToRemove.push(o);
          }
        }
      });
      if (objectsToRemove.length > 0) {
        objectsToRemove.forEach(obj => {
          if (canvas.getActiveObject() === obj) canvas.discardActiveObject();
          canvas.remove(obj);
        });
        canvas.requestRenderAll();
        saveHistoryStateCanvas(canvas);
      }
    }

    // Option 1: Also remove placement-bound objects from facesData
    if (facesData.current) {
      Object.keys(facesData.current).forEach(k => {
        const raw = facesData.current[k];
        if (!raw) return;
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed?.objects && Array.isArray(parsed.objects)) {
            parsed.objects = parsed.objects.filter((o: any) => {
              if (o.name === 'background' || o.name === 'mockup' || o.name === 'print_area_guide') return true;
              return !o.assignedPlacementId && !o.placementId;
            });
            facesData.current[k] = JSON.stringify(parsed);
          }
        } catch {}
      });
    }

    // Immediately save draft to storageKey & studio_saved_placements
    saveDraftImmediate();
  }, [activeColorKey, productId, availableColors, uniqueSelectedColors, normalizeColorKey, canvas, saveDraftImmediate, recalculatePrice]);

  // Map and reconcile all elements created in Free Mode into approved print placements when returning to standard mode
  const mapFreeModeObjectsToApprovedPlacements = useCallback((targetCanvas?: fabric.Canvas | null) => {
    const c = targetCanvas || canvas;
    const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
    const activeColor = normalizeColorKey(selectedColorRef.current || selectedColor);

    const nextDiscoveredPlacements = new Set<string>(
      placementsByColorRef.current[activeColor] || []
    );

    let canvasModified = false;

    // 1. Process active canvas objects
    if (c && !(c as any).disposed && c.getElement && c.getElement()) {
      const currentFace = activeFaceRef.current || activeFace;
      const rawFacePlacements = getPlacementsForGarment(gType, currentFace);
      const facePlacements = rawFacePlacements.length > 0 ? rawFacePlacements : activeFaceSelectedPlacementsRef.current;

      if (facePlacements.length > 0) {
        c.getObjects().forEach((o: any) => {
          if (!o || o.name === 'background' || o.name === 'mockup' || o.name === 'print_area_guide') return;

          const pt = o.getCenterPoint ? o.getCenterPoint() : { x: o.left || 0, y: o.top || 0 };

          // Find best matching placement spec
          let bestSpec: PlacementSpec | null = null;
          let minDistance = Infinity;

          for (const spec of facePlacements) {
            const bounds = getPlacementFabricBounds(spec);
            const inside = (
              pt.x >= bounds.fabricLeft &&
              pt.x <= bounds.fabricLeft + bounds.fabricWidth &&
              pt.y >= bounds.fabricTop &&
              pt.y <= bounds.fabricTop + bounds.fabricHeight
            );

            if (inside) {
              bestSpec = spec;
              break;
            }

            const dist = Math.hypot(pt.x - bounds.fabricCenterX, pt.y - bounds.fabricCenterY);
            if (dist < minDistance) {
              minDistance = dist;
              bestSpec = spec;
            }
          }

          if (bestSpec) {
            (o as any).assignedPlacementId = bestSpec.id;
            (o as any).placementId = bestSpec.id;
            (o as any).originMode = 'approved';
            nextDiscoveredPlacements.add(bestSpec.id);

            // Bounds constraint: fit within approved zone
            const bounds = getPlacementFabricBounds(bestSpec);
            const oW = (o.getScaledWidth ? o.getScaledWidth() : o.width * (o.scaleX || 1)) || 100;
            const oH = (o.getScaledHeight ? o.getScaledHeight() : o.height * (o.scaleY || 1)) || 100;
            const maxAllowedW = bounds.fabricWidth * 0.95;
            const maxAllowedH = bounds.fabricHeight * 0.95;

            if (oW > maxAllowedW || oH > maxAllowedH) {
              const scaleDown = Math.min(maxAllowedW / oW, maxAllowedH / oH);
              o.scale((o.scaleX || 1) * scaleDown);
            }

            const newPt = o.getCenterPoint ? o.getCenterPoint() : { x: o.left, y: o.top };
            if (
              newPt.x < bounds.fabricLeft ||
              newPt.x > bounds.fabricLeft + bounds.fabricWidth ||
              newPt.y < bounds.fabricTop ||
              newPt.y > bounds.fabricTop + bounds.fabricHeight
            ) {
              o.set({
                left: bounds.fabricCenterX,
                top: bounds.fabricCenterY,
                originX: 'center',
                originY: 'center',
              });
              o.setCoords();
            }

            canvasModified = true;
          }
        });

        if (canvasModified) {
          c.requestRenderAll();
          saveHistoryStateCanvas(c);
        }
      }
    }

    // 2. Also map objects across all other stored faces in facesData.current
    if (facesData.current) {
      Object.keys(facesData.current).forEach(k => {
        let fFace = k;
        if (k.includes(':::')) {
          fFace = k.split(':::')[1];
        }
        const facePlacements = getPlacementsForGarment(gType, fFace);
        if (facePlacements.length === 0) return;

        const raw = facesData.current[k];
        if (!raw) return;

        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed?.objects && Array.isArray(parsed.objects)) {
            let faceModified = false;
            parsed.objects.forEach((o: any) => {
              if (o.name === 'background' || o.name === 'mockup' || o.name === 'print_area_guide') return;

              if (!o.assignedPlacementId && !o.placementId) {
                const ox = o.left || 0;
                const oy = o.top || 0;
                let best: PlacementSpec = facePlacements[0];
                let minD = Infinity;

                for (const spec of facePlacements) {
                  const bounds = getPlacementFabricBounds(spec);
                  const inside = (
                    ox >= bounds.fabricLeft &&
                    ox <= bounds.fabricLeft + bounds.fabricWidth &&
                    oy >= bounds.fabricTop &&
                    oy <= bounds.fabricTop + bounds.fabricHeight
                  );
                  if (inside) {
                    best = spec;
                    break;
                  }
                  const d = Math.hypot(ox - bounds.fabricCenterX, oy - bounds.fabricCenterY);
                  if (d < minD) {
                    minD = d;
                    best = spec;
                  }
                }

                o.assignedPlacementId = best.id;
                o.placementId = best.id;
                o.originMode = 'approved';
                nextDiscoveredPlacements.add(best.id);
                faceModified = true;
              } else if (o.assignedPlacementId || o.placementId) {
                o.originMode = 'approved';
                nextDiscoveredPlacements.add(o.assignedPlacementId || o.placementId);
              }
            });

            if (faceModified) {
              facesData.current[k] = JSON.stringify(parsed);
            }
          }
        } catch {}
      });
    }

    const updatedList = Array.from(nextDiscoveredPlacements);

    // If still empty but face has objects, default to first placement
    if (updatedList.length === 0) {
      const defaultFront = getPlacementsForGarment(gType, 'front')?.[0]?.id || 'left_chest';
      updatedList.push(defaultFront);
    }

    let nextMap: Record<string, string[]>;
    if (syncPlacementsAcrossColorsRef.current) {
      nextMap = {
        ...placementsByColorRef.current,
        ['__synced__']: updatedList,
        [activeColor]: updatedList,
      };
      availableColors.forEach((cCol: string) => {
        nextMap[normalizeColorKey(cCol)] = updatedList;
      });
    } else {
      nextMap = {
        ...placementsByColorRef.current,
        [activeColor]: updatedList,
      };
    }

    setPlacementsByColor(nextMap);
    placementsByColorRef.current = nextMap;
    currentSelectedPlacementIdsRef.current = updatedList;

    saveDraftImmediate();
    recalculatePrice(c, undefined, updatedList);

    showToast(
      locale === 'tr'
        ? 'Tüm tasarım ögeleri onaylı baskı alanlarına uyarlandı ve serbest mod ücreti kaldırıldı 🎯'
        : locale === 'en'
        ? 'All designs mapped to approved print placements and free mode fee removed 🎯'
        : 'تمت محاذاة جميع الملصقات للمواضع المعتمدة بنجاح وإلغاء رسوم الوضع الحر 🎯',
      'success',
      3500
    );
  }, [canvas, productData, selectedColor, activeFace, normalizeColorKey, getPlacementFabricBounds, availableColors, saveDraftImmediate, recalculatePrice, showToast, locale]);

  // Passive check when exiting Free Mode:
  // Recognizes elements that are ALREADY inside an approved zone, while leaving custom-placed items in place under Free Mode pricing.
  const checkAndReconcileFreeModeExit = useCallback((targetCanvas?: fabric.Canvas | null) => {
    const c = targetCanvas || canvas;
    const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
    const activeColor = normalizeColorKey(selectedColorRef.current || selectedColor);

    const nextDiscoveredPlacements = new Set<string>(
      placementsByColorRef.current[activeColor] || []
    );

    let hasRemainingUnaligned = false;

    // 1. Check active canvas objects
    if (c && !(c as any).disposed && c.getElement && c.getElement()) {
      const currentFace = activeFaceRef.current || activeFace;
      const rawFacePlacements = getPlacementsForGarment(gType, currentFace);
      const facePlacements = rawFacePlacements.length > 0 ? rawFacePlacements : activeFaceSelectedPlacementsRef.current;

      c.getObjects().forEach((o: any) => {
        if (!o || o.name === 'background' || o.name === 'mockup' || o.name === 'print_area_guide') return;

        const pt = o.getCenterPoint ? o.getCenterPoint() : { x: o.left || 0, y: o.top || 0 };

        let matchedSpec: PlacementSpec | null = null;
        for (const spec of facePlacements) {
          const bounds = getPlacementFabricBounds(spec);
          if (
            pt.x >= bounds.fabricLeft &&
            pt.x <= bounds.fabricLeft + bounds.fabricWidth &&
            pt.y >= bounds.fabricTop &&
            pt.y <= bounds.fabricTop + bounds.fabricHeight
          ) {
            matchedSpec = spec;
            break;
          }
        }

        if (matchedSpec) {
          (o as any).assignedPlacementId = matchedSpec.id;
          (o as any).originMode = 'approved';
          nextDiscoveredPlacements.add(matchedSpec.id);
        } else {
          // Outside approved zone: keep position, keep originMode = 'free'
          (o as any).originMode = 'free';
          (o as any).assignedPlacementId = null;
          hasRemainingUnaligned = true;
        }
      });
    }

    // 2. Check stored faces
    if (facesData.current) {
      Object.keys(facesData.current).forEach(k => {
        let fFace = k;
        if (k.includes(':::')) {
          fFace = k.split(':::')[1];
        }
        const facePlacements = getPlacementsForGarment(gType, fFace);
        const raw = facesData.current[k];
        if (!raw) return;

        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed?.objects && Array.isArray(parsed.objects)) {
            parsed.objects.forEach((o: any) => {
              if (o.name === 'background' || o.name === 'mockup' || o.name === 'print_area_guide') return;

              const ox = o.left || 0;
              const oy = o.top || 0;
              let matchedSpec: PlacementSpec | null = null;
              for (const spec of facePlacements) {
                const bounds = getPlacementFabricBounds(spec);
                if (
                  ox >= bounds.fabricLeft &&
                  ox <= bounds.fabricLeft + bounds.fabricWidth &&
                  oy >= bounds.fabricTop &&
                  oy <= bounds.fabricTop + bounds.fabricHeight
                ) {
                  matchedSpec = spec;
                  break;
                }
              }

              if (matchedSpec) {
                o.assignedPlacementId = matchedSpec.id;
                o.originMode = 'approved';
                nextDiscoveredPlacements.add(matchedSpec.id);
              } else if (o.originMode === 'free' || !o.assignedPlacementId) {
                o.originMode = 'free';
                o.assignedPlacementId = null;
                hasRemainingUnaligned = true;
              }
            });
            facesData.current[k] = JSON.stringify(parsed);
          }
        } catch {}
      });
    }

    const updatedList = Array.from(nextDiscoveredPlacements);
    if (updatedList.length > 0) {
      let nextMap: Record<string, string[]>;
      if (syncPlacementsAcrossColorsRef.current) {
        nextMap = {
          ...placementsByColorRef.current,
          ['__synced__']: updatedList,
          [activeColor]: updatedList,
        };
        availableColors.forEach((cCol: string) => {
          nextMap[normalizeColorKey(cCol)] = updatedList;
        });
      } else {
        nextMap = {
          ...placementsByColorRef.current,
          [activeColor]: updatedList,
        };
      }
      setPlacementsByColor(nextMap);
      placementsByColorRef.current = nextMap;
      currentSelectedPlacementIdsRef.current = updatedList;
    }

    saveDraftImmediate();
    recalculatePrice(c, undefined, updatedList);

    if (hasRemainingUnaligned) {
      showToast(
        locale === 'tr'
          ? 'Bilgi: Onaylı baskı alanlarının dışında öğeler mevcut (serbest mod ücreti geçerli). İlgili alana taşıyabilir veya "Hizala" butonunu kullanabilirsiniz 🎯'
          : locale === 'en'
          ? 'Notice: Stickers exist outside approved placements (free fee active). Move into a placement or click "Align" 🎯'
          : 'تنبيه: توجد ملصقات خارج المواضع المعتمدة (رسوم الوضع الحر سارية). يمكنك سحبها لموضع معتمد أو النقر على "محاذاة" 🎯',
        'info',
        4000
      );
    } else {
      showToast(
        locale === 'tr'
          ? 'Onaylı baskı alanlarına geçildi ve yerleşim bazlı fiyatlandırma uygulandı 🎯'
          : locale === 'en'
          ? 'Switched to approved placements and standard pricing applied 🎯'
          : 'تم التحول إلى المواضع المعتمدة وتطبيق تسعير المواضع بدقة 🎯',
        'success',
        3000
      );
    }
  }, [canvas, productData, selectedColor, activeFace, normalizeColorKey, getPlacementFabricBounds, availableColors, saveDraftImmediate, recalculatePrice, showToast, locale]);

  handleToggleFreeModeRef.current = (enabled: boolean) => {
    if (!enabled) {
      setTimeout(() => {
        checkAndReconcileFreeModeExit(canvas);
      }, 50);
    } else {
      recalculatePrice(canvas);
      if (canvas && checkObjectBoundsRef.current) {
        setTimeout(() => {
          checkObjectBoundsRef.current?.(canvas);
        }, 50);
      }
    }
  };

  const switchColor = useCallback((newColor: string) => {
    if (isColorEqual(selectedColor, newColor)) return;

    if (canvas && !isRestoring.current) {
      try {
        const json = JSON.stringify(buildSerializedFaceJson(canvas, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current));
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

  const addText = (customText?: string, options?: { fontFamily?: string; fontWeight?: string; fontStyle?: string }) => {
    if (!canvas) return;
    if (!ensurePlacementSelected(() => addText(customText, options))) return;
    const fallbackText = locale === 'tr' ? 'Metniniz' : locale === 'en' ? 'Your Text' : 'نصك هنا';
    const txt = customText || t('newText', { fallback: fallbackText });
    const isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(txt);
    const marginPx = Math.max(8, Math.round(currentPrintArea.width * 0.03));
    const targetTextWidth = Math.max(80, currentPrintArea.width - (marginPx * 2));
    
    // إنشاء نص تفاعلي بخط عريض وواضح
    const text = new fabric.IText(txt, {
      fontFamily: options?.fontFamily || (locale === 'ar' ? 'Cairo, Arial, sans-serif' : 'Montserrat, Arial, sans-serif'),
      fill: '#000000',
      fontSize: 40,
      fontWeight: options?.fontWeight || 'bold',
      fontStyle: options?.fontStyle || 'normal',
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
      const existingObjects = canvas.getObjects().filter(o => 
        o.name !== 'background' && 
        o.name !== 'mockup' && 
        o.name !== 'print_area_guide' &&
        !(o as any).isLocked &&
        o.selectable !== false
      );
      
      let targetPlacement: PlacementSpec | null = null;

      // 1. If user clicked/focused a placement (e.g. left_chest in top bar or sidebar), prioritize it!
      if (focusedPlacementId) {
        targetPlacement = activeFaceSelectedPlacementsRef.current.find(s => s.id === focusedPlacementId) || null;
      }

      // 2. If not focused, look for a placement that doesn't have active (non-locked) objects
      if (!targetPlacement) {
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
      }

      // 3. Fallback to first placement
      if (!targetPlacement) {
        targetPlacement = activeFaceSelectedPlacementsRef.current[0];
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
    const textMode = assignedPlacementId ? 'approved' : (isFreeModeRef.current ? 'free' : 'approved');
    (text as any).originMode = textMode;
    (text as any).createdInMode = isFreeModeRef.current ? 'free' : 'approved';
    if (assignedPlacementId) {
      (text as any).assignedPlacementId = assignedPlacementId;
    } else {
      (text as any).assignedPlacementId = null;
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

    const maxW = targetW * 0.95;
    const maxH = targetH * 0.95;
    let objW = obj.getScaledWidth();
    let objH = obj.getScaledHeight();

    // 1. Scale down only if genuinely oversized for the target print zone
    if (objW > maxW || objH > maxH) {
      const scaleFactor = Math.min(maxW / (obj.width || 1), maxH / (obj.height || 1));
      obj.scale(scaleFactor);
      objW = obj.getScaledWidth();
      objH = obj.getScaledHeight();
    }

    // 2. Intelligent Smart Nudge:
    // Respect the user's composition! If the user placed text on top and an image below,
    // gently pull the object back inside the borders rather than jumping on top of the text.
    const br = obj.getBoundingRect(true, true);
    const targetRight = targetLeft + targetW;
    const targetBottom = targetTop + targetH;

    let shiftX = 0;
    let shiftY = 0;

    if (br.left < targetLeft) {
      shiftX = targetLeft - br.left;
    } else if (br.left + br.width > targetRight) {
      shiftX = targetRight - (br.left + br.width);
    }

    if (br.top < targetTop) {
      shiftY = targetTop - br.top;
    } else if (br.top + br.height > targetBottom) {
      shiftY = targetBottom - (br.top + br.height);
    }

    const isCompletelyLost =
      br.left + br.width < targetLeft ||
      br.left > targetRight ||
      br.top + br.height < targetTop ||
      br.top > targetBottom;

    if (isCompletelyLost) {
      obj.set({
        originX: 'center',
        originY: 'center',
        left: targetLeft + targetW / 2,
        top: targetTop + targetH / 2,
      });
    } else {
      obj.set({
        left: (obj.left || 0) + shiftX,
        top: (obj.top || 0) + shiftY,
      });
    }

    obj.setCoords();
    applyCustomModernStyles(canvas);

    setIsObjectOutOfBounds(false);
    setIsWarningDismissed(false);
    canvas.requestRenderAll();
    canvas.renderAll();
    saveHistoryState();
  };

  const handleCenterHorizontal = useCallback(() => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    obj.centerH();
    obj.setCoords();
    canvas.renderAll();
    saveHistoryState();
  }, [canvas]);

  const handleCenterVertical = useCallback(() => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    obj.centerV();
    obj.setCoords();
    canvas.renderAll();
    saveHistoryState();
  }, [canvas]);



  const addSticker = (url: string, asset?: { id?: string; name?: string; price?: number; category?: string }) => {
    if (!canvas) return;
    if (!ensurePlacementSelected(() => addSticker(url, asset))) return;
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
    if (!ensurePlacementSelected(() => processImageFile(file))) return;

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
          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setActiveMobileTab(null);
          }
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
      const jsonState = buildSerializedFaceJson(canvas, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current);

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

      // 4. Generate Photorealistic Mockup Composite JPEG (3D Cylindrical Wrap for Panoramic Mug, or 1:1 Garment Overlay)
      let mockupImage = '';
      const mockupUrl = getFaceMockupForColor(activeFace, selectedColor);
      if (isMugPanoramicWorkspaceRef.current && printReadyImage) {
        const colorHex = COLOR_MAP[(selectedColor || '').toLowerCase()] || selectedColor || '#ffffff';
        mockupImage = (await renderMugWrapThumbnailDataUrl(printReadyImage, mugMeta, colorHex, selectedSize, 900)) || printReadyImage;
      } else if (mockupUrl) {
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
      if (isPanoramicFace) {
        migrateLegacyMugPanoramaObjects(staticCanvas, parsed);
      }
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

  const getFaceDisplayName = useCallback((face: string): string => {
    const f = (face || '').trim().toLowerCase();
    if (f === 'front') return locale === 'tr' ? 'Ön Yüz' : locale === 'en' ? 'Front Side' : 'الواجهة الأمامية';
    if (f === 'back') return locale === 'tr' ? 'Arka Yüz' : locale === 'en' ? 'Back Side' : 'الواجهة الخلفية';
    if (f === 'right_shoulder' || f === 'right') return locale === 'tr' ? 'Sağ Kol' : locale === 'en' ? 'Right Shoulder' : 'الكتف الأيمن';
    if (f === 'left_shoulder' || f === 'left') return locale === 'tr' ? 'Sol Kol' : locale === 'en' ? 'Left Shoulder' : 'الكتف الأيسر';
    if (f === 'collar') return locale === 'tr' ? 'Yaka' : locale === 'en' ? 'Collar' : 'الياقة';
    return face;
  }, [locale]);

  const checkFaceHasDesign = useCallback((face: string, color: string): boolean => {
    if (face === activeFace && isColorEqual(color, selectedColor)) {
      if (!canvas) return false;
      const objs = canvas.getObjects().filter(o => 
        o.name !== 'background' && o.name !== 'mockup' && o.name !== 'print_area_guide' && o.name !== 'guideline'
      );
      return objs.length > 0;
    }
    const faceKey = getFaceStateKey(face, color);
    const jsonStr = facesData.current[faceKey] || facesData.current[face];
    if (!jsonStr) return false;
    try {
      const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      const objs = (parsed?.objects || []).filter((o: any) =>
        o.name !== 'background' && o.name !== 'mockup' && o.name !== 'print_area_guide' && o.name !== 'guideline'
      );
      return objs.length > 0;
    } catch {
      return false;
    }
  }, [activeFace, selectedColor, canvas, getFaceStateKey]);

  const generateAllFacePreviews = useCallback(async (): Promise<{ face: string; label: string; imageUrl: string; hasDesign: boolean }[]> => {
    if (!canvas) return [];

    // 1. Commit active canvas state to facesData.current immediately
    try {
      const currentKey = getFaceStateKey(activeFace, selectedColor);
      facesData.current[currentKey] = JSON.stringify(buildSerializedFaceJson(canvas, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current));
    } catch (e) {
      console.warn("Could not serialize active canvas face:", e);
    }

    // 2. Identify which faces have user objects
    const designedFaces = availableFaces.filter(face => checkFaceHasDesign(face, selectedColor));

    // 3. Determine target faces to display in preview carousel:
    // If multiple faces have designs, include ALL designed faces!
    // If only 1 face has a design, include that face.
    // Fallback: activeFace.
    let targetFaces: string[] = [];
    if (designedFaces.length > 1) {
      const canonicalOrder = ['front', 'back', 'right_shoulder', 'left_shoulder', 'right', 'left', 'collar', 'other'];
      targetFaces = [...designedFaces].sort((a, b) => {
        const ia = canonicalOrder.indexOf(a) !== -1 ? canonicalOrder.indexOf(a) : 99;
        const ib = canonicalOrder.indexOf(b) !== -1 ? canonicalOrder.indexOf(b) : 99;
        return ia - ib;
      });
    } else if (designedFaces.length === 1) {
      targetFaces = [designedFaces[0]];
    } else {
      targetFaces = [activeFace];
    }

    // 4. Generate high-resolution composites in parallel for all target faces
    const activeFacePrintData = await exportDesignData();
    const activeMockupUrl = activeFacePrintData?.mockupImage || '';

    const slidePromises = targetFaces.map(async (face) => {
      try {
        let imageUrl = '';
        if (face === activeFace && activeMockupUrl) {
          imageUrl = activeMockupUrl;
        } else {
          const productMockupUrl = getFaceMockupForColor(face, selectedColor);
          const faceArea = configFaces[face]?.printArea || currentPrintArea;
          const faceKey = getFaceStateKey(face, selectedColor);
          const faceJson = facesData.current[faceKey] || facesData.current[face] || "";
          imageUrl = await generateFaceMockupPreview(face, faceJson, productMockupUrl, faceArea);
        }

        if (!imageUrl) return null;

        return {
          face,
          label: getFaceDisplayName(face),
          imageUrl,
          hasDesign: designedFaces.includes(face)
        };
      } catch (err) {
        console.warn(`Error generating preview slide for face ${face}:`, err);
        return null;
      }
    });

    const slides = (await Promise.all(slidePromises)).filter((s): s is { face: string; label: string; imageUrl: string; hasDesign: boolean } => !!s && !!s.imageUrl);
    return slides;
  }, [canvas, activeFace, selectedColor, availableFaces, checkFaceHasDesign, getFaceStateKey, exportDesignData, getFaceMockupForColor, configFaces, currentPrintArea, generateFaceMockupPreview, getFaceDisplayName]);

  const handleNextSlide = useCallback(() => {
    if (previewSlides.length <= 1) return;
    const nextIdx = (currentSlideIndex + 1) % previewSlides.length;
    setCurrentSlideIndex(nextIdx);
    setPreviewImage(previewSlides[nextIdx].imageUrl);
    setModalZoom(1);
    setModalPan({ x: 0, y: 0 });
  }, [previewSlides, currentSlideIndex]);

  const handlePrevSlide = useCallback(() => {
    if (previewSlides.length <= 1) return;
    const prevIdx = (currentSlideIndex - 1 + previewSlides.length) % previewSlides.length;
    setCurrentSlideIndex(prevIdx);
    setPreviewImage(previewSlides[prevIdx].imageUrl);
    setModalZoom(1);
    setModalPan({ x: 0, y: 0 });
  }, [previewSlides, currentSlideIndex]);

  const handleSelectSlide = useCallback((index: number) => {
    if (index >= 0 && index < previewSlides.length) {
      setCurrentSlideIndex(index);
      setPreviewImage(previewSlides[index].imageUrl);
      setModalZoom(1);
      setModalPan({ x: 0, y: 0 });
    }
  }, [previewSlides]);

  const prepareMugCroppedSlides = useCallback(async (slides: PreviewSlideItem[]): Promise<PreviewSlideItem[]> => {
    const baseNw = mockupNaturalSize.width > 0 ? mockupNaturalSize.width : (canvas?.width || 1000);
    const baseNh = mockupNaturalSize.height > 0 ? mockupNaturalSize.height : (canvas?.height || 1000);

    const cropUrlToPlacement = async (dataUrl: string, placementId: string, targetFace: string): Promise<string> => {
      if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
      const spec = getPlacementById(placementId, 'mug');
      if (!spec) return dataUrl;

      const faceArea = configFaces[targetFace]?.printArea;
      const fnw = targetFace === activeFace ? nativeWidth : (Number(faceArea?.nativeWidth) || baseNw);
      const fnh = targetFace === activeFace ? nativeHeight : (Number(faceArea?.nativeHeight) || baseNh);

      let cropLeft: number;
      let cropTop: number;
      let cropW: number;
      let cropH: number;

      if (isFreeMode) {
        const fb = productData?.config?.freeModeBounds?.[targetFace];
        if (fb && fb.width > 0 && fb.height > 0) {
          const fbNw = fb.nativeWidth || fnw;
          const fbNh = fb.nativeHeight || fnh;
          cropLeft = (fb.x / fbNw) * fnw;
          cropTop = (fb.y / fbNh) * fnh;
          cropW = (fb.width / fbNw) * fnw;
          cropH = (fb.height / fbNh) * fnh;
        } else if (faceArea && faceArea.width > 0 && faceArea.height > 0) {
          const fNw = faceArea.nativeWidth || fnw;
          const fNh = faceArea.nativeHeight || fnh;
          cropLeft = (faceArea.left / fNw) * fnw;
          cropTop = (faceArea.top / fNh) * fnh;
          cropW = (faceArea.width / fNw) * fnw;
          cropH = (faceArea.height / fNh) * fnh;
        } else {
          const bounds = getPlacementFabricBounds(spec, fnw, fnh, true, targetFace);
          cropLeft = bounds.fabricLeft;
          cropTop = bounds.fabricTop;
          cropW = bounds.fabricWidth;
          cropH = bounds.fabricHeight;
        }
      } else {
        const bounds = getPlacementFabricBounds(spec, fnw, fnh, true, targetFace);
        cropLeft = bounds.fabricLeft;
        cropTop = bounds.fabricTop;
        cropW = bounds.fabricWidth;
        cropH = bounds.fabricHeight;
      }

      const rx = Math.max(0, Math.min(1, cropLeft / fnw));
      const ry = Math.max(0, Math.min(1, cropTop / fnh));
      const rw = Math.max(0.05, Math.min(1 - rx, cropW / fnw));
      const rh = Math.max(0.05, Math.min(1 - ry, cropH / fnh));

      return new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const sx = Math.round(rx * img.width);
            const sy = Math.round(ry * img.height);
            const sw = Math.max(2, Math.round(rw * img.width));
            const sh = Math.max(2, Math.round(rh * img.height));
            const off = document.createElement('canvas');
            off.width = sw;
            off.height = sh;
            const ctx = off.getContext('2d');
            if (!ctx) {
              resolve(dataUrl);
              return;
            }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            resolve(off.toDataURL('image/png'));
          } catch {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      });
    };

    if (activeMugMode === 'mug_full_wrap') {
      return slides;
    }

    return Promise.all(
      slides.map(async (slide) => {
        if (!slide.designUrl) return slide;
        const pId = activeMugMode === 'mug_two_sided' && slide.face === 'back'
          ? 'mug_back'
          : 'mug_front';
        const cropped = await cropUrlToPlacement(slide.designUrl, pId, slide.face || activeFace);
        return { ...slide, designUrl: cropped };
      })
    );
  }, [mockupNaturalSize, canvas, configFaces, activeFace, nativeWidth, nativeHeight, isFreeMode, productData?.config?.freeModeBounds, getPlacementFabricBounds, activeMugMode]);

  const openCartConfirmationPreview = async () => {
    if (!canvas) return;
    setIsPreviewLoading(true);
    try {
      const slides = await generateAllFacePreviews();
      if (studioProfile.family === 'mug' && slides.length > 0) {
        const mugSlides = await prepareMugCroppedSlides(slides);
        setPreviewSlides(mugSlides as any);
        setMug3DSlides(mugSlides);
        setPreviewIntent('cart_confirm');
        setMug3DPreviewOpen(true);
      } else if (slides.length > 0) {
        setPreviewSlides(slides);
        const initialIdx = slides.findIndex(s => s.face === activeFace);
        const chosenIdx = initialIdx >= 0 ? initialIdx : 0;
        setCurrentSlideIndex(chosenIdx);
        setPreviewImage(slides[chosenIdx].imageUrl);
        setPreviewIntent('cart_confirm');
      } else {
        if (!auth?.currentUser) {
          setPendingAction('cart');
          setIsAuthModalOpen(true);
        } else {
          executeAction('cart');
        }
      }
    } catch (err) {
      console.error("Cart preview generation error:", err);
      if (!auth?.currentUser) {
        setPendingAction('cart');
        setIsAuthModalOpen(true);
      } else {
        executeAction('cart');
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!canvas) return;
    setIsPreviewLoading(true);
    try {
      const slides = await generateAllFacePreviews();
      if (studioProfile.family === 'mug' && slides.length > 0) {
        const mugSlides = await prepareMugCroppedSlides(slides);
        setPreviewSlides(mugSlides as any);
        setMug3DSlides(mugSlides);
        setPreviewIntent('inspect');
        setMug3DPreviewOpen(true);
      } else if (slides.length > 0) {
        setPreviewSlides(slides);
        const initialIdx = slides.findIndex(s => s.face === activeFace);
        const chosenIdx = initialIdx >= 0 ? initialIdx : 0;
        setCurrentSlideIndex(chosenIdx);
        setPreviewImage(slides[chosenIdx].imageUrl);
        setPreviewIntent('inspect');
      }
    } catch (err) {
      console.error("Preview Generation Error:", err);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const closePreviewModal = () => {
    setPreviewImage(null);
    setMug3DPreviewOpen(false);
    setMug3DSlides([]);
    setPreviewSlides([]);
    setCurrentSlideIndex(0);
    setPreviewIntent(null);
    setModalZoom(1);
    setModalPan({ x: 0, y: 0 });
  };

  const handleConfirmDesignAndAddToCart = async () => {
    if (!auth?.currentUser) {
      setPreviewImage(null);
      setMug3DPreviewOpen(false);
      setPreviewIntent(null);
      setPendingAction('cart');
      setIsAuthModalOpen(true);
      return;
    }

    try {
      await executeAction('cart');
      setPreviewImage(null);
      setMug3DPreviewOpen(false);
      setPreviewIntent(null);
    } catch (err) {
      console.error("Confirm Design Cart Error:", err);
    }
  };

  // Keyboard navigation for multi-face preview carousel
  useEffect(() => {
    if (!previewImage || previewSlides.length <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (locale === 'ar') handlePrevSlide();
        else handleNextSlide();
      } else if (e.key === 'ArrowLeft') {
        if (locale === 'ar') handleNextSlide();
        else handlePrevSlide();
      } else if (e.key === 'Escape') {
        closePreviewModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage, previewSlides.length, handleNextSlide, handlePrevSlide, locale]);

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
      facesData.current[currentSaveKey] = JSON.stringify(buildSerializedFaceJson(canvas, isMugPanoramicWorkspaceRef.current, nativeWidthRef.current, nativeHeightRef.current));
      
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
          ...(studioProfile.family === 'mug' ? { mug_meta: mugMeta } : {}),
          printAreas: Object.keys(configFaces).reduce((acc: any, face: string) => {
            acc[face] = configFaces[face]?.printArea || {};
            return acc;
          }, {})
        }),
        ...(studioProfile.family === 'mug' ? { mug_meta: mugMeta } : {}),
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
        print_method: selectedPrintMethod,
        print_type: selectedPrintMethod,
        print_strategy: printStrategy,
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
            print_method: selectedPrintMethod,
            print_type: selectedPrintMethod,
            print_strategy: printStrategy,
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

    // Mug Single-Face Protection & Upgrade Intercept:
    // When the customer is in Single Face mode ('mug_front'), they only get 1 face printed.
    // If they designed on multiple faces, prompt them to upgrade to Two-Sided or pick one face to keep.
    if (studioProfile.family === 'mug' && activeMugMode === 'mug_front') {
      const designedFaces = availableFaces.filter(face => checkFaceHasDesign(face, selectedColor));
      if (designedFaces.length > 1) {
        setMugConflictFaces(designedFaces);
        setIsMugSingleFaceConflictOpen(true);
        return;
      }
    }

    let hasOutofBounds = false;
    let hasDefaultText = false;

    objects.forEach(obj => {
      if (obj.name === 'background' || obj.name === 'mockup' || obj.name === 'print_area_guide') return;
      const insideBounds = isObjectInsidePrintBounds(obj);

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
      const targetAction = pendingAction || 'cart';
      if (targetAction === 'cart') {
        openCartConfirmationPreview();
      } else {
        if (!auth?.currentUser) {
          setPendingAction(targetAction);
          setIsAuthModalOpen(true);
        } else {
          executeAction(targetAction);
        }
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
    
    const targetAction = pendingAction || 'cart';
    if (targetAction === 'cart') {
      openCartConfirmationPreview();
    } else {
      if (!auth?.currentUser) {
        setPendingAction(targetAction);
        setIsAuthModalOpen(true);
      } else {
        executeAction(targetAction);
      }
    }
  };

  const handleFreeMode = () => {
    setIsValidationModalOpen(false);
    setCustomizationMode('FREE');
    const targetAction = pendingAction || 'cart';
    if (targetAction === 'cart') {
      openCartConfirmationPreview();
    } else {
      if (!auth?.currentUser) {
        setPendingAction(targetAction);
        setIsAuthModalOpen(true);
      } else {
        executeAction(targetAction);
      }
    }
  };

  const handleUpgradeToTwoSidedFromConflict = () => {
    handleSelectMugMode('mug_two_sided');
    setIsMugSingleFaceConflictOpen(false);
    setTimeout(() => {
      runValidation();
    }, 120);
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


  // Reliable mobile & desktop toolbar action dispatcher
  const lastToolbarActionRef = useRef<number>(0);
  const executeToolbarAction = useCallback((action: () => void) => {
    const now = Date.now();
    if (now - lastToolbarActionRef.current < 150) return;
    lastToolbarActionRef.current = now;
    if (canvas && activeObject) {
      try {
        const cur = canvas.getActiveObject();
        if (!cur) canvas.setActiveObject(activeObject);
      } catch {}
    }
    try {
      action();
    } catch (err) {
      console.error("Toolbar action execution error:", err);
    }
  }, [canvas, activeObject]);

  // Mobile swipe vs deliberate tap detection for the floating toolbar
  const toolbarTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isToolbarSwipingRef = useRef<boolean>(false);

  const handleToolbarTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length > 0) {
      toolbarTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
      isToolbarSwipingRef.current = false;
    }
  }, []);

  const handleToolbarTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (toolbarTouchStartRef.current && e.touches.length > 0) {
      const dx = Math.abs(e.touches[0].clientX - toolbarTouchStartRef.current.x);
      const dy = Math.abs(e.touches[0].clientY - toolbarTouchStartRef.current.y);
      if (dx > 6 || dy > 6) {
        isToolbarSwipingRef.current = true;
      }
    }
  }, []);

  const handleToolbarTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setTimeout(() => {
      isToolbarSwipingRef.current = false;
      toolbarTouchStartRef.current = null;
    }, 150);
  }, []);

  const createToolbarButtonHandler = useCallback((action: () => void) => {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
      },
      onTouchEnd: (e: React.TouchEvent) => {
        if (isToolbarSwipingRef.current) {
          e.stopPropagation();
          return;
        }
        if (toolbarTouchStartRef.current && (Date.now() - toolbarTouchStartRef.current.time > 450)) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        executeToolbarAction(action);
      },
      onClick: (e: React.MouseEvent) => {
        if (isToolbarSwipingRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        executeToolbarAction(action);
      }
    };
  }, [executeToolbarAction]);

  const handleCenterInPlacement = useCallback(() => {
    if (!canvas) return;
    const obj = canvas.getActiveObject() || activeObject;
    if (!obj || (obj as any).isLocked || obj.selectable === false) return;
    canvas.setActiveObject(obj);
    setActiveObject(obj);

    const assignedPlacementId = (obj as any).assignedPlacementId || focusedPlacementId;
    const gType = productData?.config?.garmentType || productData?.category || 'tshirt';
    const currentFace = activeFaceRef.current || activeFace;
    const allFaceSpecs = getPlacementsForGarment(gType, currentFace);
    const spec = allFaceSpecs.find(s => s.id === assignedPlacementId);

    if (spec) {
      const p = getPlacementFabricBounds(spec);
      const centerPt = obj.getCenterPoint();
      const dx = p.fabricCenterX - centerPt.x;
      const dy = p.fabricCenterY - centerPt.y;
      obj.set({
        left: (obj.left || 0) + dx,
        top: (obj.top || 0) + dy,
      });
      obj.setCoords();
      canvas.requestRenderAll();
      canvas.renderAll();
      saveHistoryState();
      showToast(
        locale === 'tr' ? `${spec.nameTr} alanına ortalandı 🎯` :
        locale === 'en' ? `Centered in ${spec.nameEn} 🎯` :
        `تم توسيط التصميم بدقة داخل: ${spec.nameAr} 🎯`,
        'success',
        2000
      );
    } else if (freePrintZone) {
      const targetCenterX = freePrintZone.left + freePrintZone.width / 2;
      const targetCenterY = freePrintZone.top + freePrintZone.height / 2;
      const centerPt = obj.getCenterPoint();
      const dx = targetCenterX - centerPt.x;
      const dy = targetCenterY - centerPt.y;
      obj.set({
        left: (obj.left || 0) + dx,
        top: (obj.top || 0) + dy,
      });
      obj.setCoords();
      canvas.requestRenderAll();
      canvas.renderAll();
      saveHistoryState();
      showToast(
        locale === 'tr' ? 'Baskı alanına ortalandı 🎯' :
        locale === 'en' ? 'Centered in print area 🎯' :
        'تم التوسيط داخل منطقة الطباعة 🎯',
        'success',
        1500
      );
    } else {
      obj.center();
      obj.setCoords();
      canvas.requestRenderAll();
      canvas.renderAll();
      saveHistoryState();
    }
    computeLiveMetrics(obj, false);
  }, [canvas, activeObject, focusedPlacementId, productData, activeFace, getPlacementFabricBounds, freePrintZone, locale, showToast, saveHistoryState, computeLiveMetrics]);

  const handleScaleActive = useCallback((factor: number) => {
    if (!canvas) return;
    const obj = canvas.getActiveObject() || activeObject;
    if (!obj || (obj as any).isLocked || obj.selectable === false) return;
    canvas.setActiveObject(obj);
    setActiveObject(obj);

    const currentScaleX = obj.scaleX || 1;
    const currentScaleY = obj.scaleY || 1;
    const newScaleX = Math.max(0.04, Math.min(10, currentScaleX * factor));
    const newScaleY = Math.max(0.04, Math.min(10, currentScaleY * factor));

    const centerPt = obj.getCenterPoint();
    obj.set({
      scaleX: newScaleX,
      scaleY: newScaleY,
    });
    const newCenterPt = obj.getCenterPoint();
    obj.set({
      left: (obj.left || 0) + (centerPt.x - newCenterPt.x),
      top: (obj.top || 0) + (centerPt.y - newCenterPt.y),
    });
    obj.setCoords();

    applyCustomModernStyles(canvas);
    canvas.requestRenderAll();
    canvas.renderAll();
    saveHistoryState();
    recalculatePrice(canvas);
    computeLiveMetrics(obj, true);
  }, [canvas, activeObject, saveHistoryState, recalculatePrice, computeLiveMetrics]);

  const handleNudgeActive = useCallback((dx: number, dy: number) => {
    if (!canvas) return;
    const obj = canvas.getActiveObject() || activeObject;
    if (!obj || (obj as any).isLocked || obj.selectable === false) return;
    canvas.setActiveObject(obj);
    setActiveObject(obj);

    obj.set({
      left: (obj.left || 0) + dx,
      top: (obj.top || 0) + dy,
    });
    obj.setCoords();
    canvas.requestRenderAll();
    canvas.renderAll();
    saveHistoryState();
    computeLiveMetrics(obj, false);
  }, [canvas, activeObject, saveHistoryState, computeLiveMetrics]);

  const handleDuplicateActive = useCallback(() => {
    if (!canvas) return;
    const obj = canvas.getActiveObject() || activeObject;
    if (!obj) return;
    obj.clone((cloned: fabric.Object) => {
      (cloned as any).originMode = (obj as any).originMode || (isFreeModeRef.current ? 'free' : 'approved');
      (cloned as any).createdInMode = (obj as any).createdInMode || (isFreeModeRef.current ? 'free' : 'approved');
      (cloned as any).assignedPlacementId = (obj as any).assignedPlacementId;
      cloned.set({
        left: (obj.left || 0) + 25,
        top: (obj.top || 0) + 25,
        evented: true,
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      setActiveObject(cloned);
      computeLiveMetrics(cloned, false);
      canvas.renderAll();
      saveHistoryState();
    });
  }, [canvas, activeObject, saveHistoryState, computeLiveMetrics]);

  const handleToggleLockActive = useCallback(() => {
    if (!canvas) return;
    const obj = canvas.getActiveObject() || activeObject;
    if (!obj) return;
    const isCurrentlyLocked = (obj as any).isLocked === true || (obj as any).lockMovementX === true;
    const nextLocked = !isCurrentlyLocked;
    obj.set({
      selectable: true,
      evented: true,
      lockMovementX: nextLocked,
      lockMovementY: nextLocked,
      lockRotation: nextLocked,
      lockScalingX: nextLocked,
      lockScalingY: nextLocked,
      hasControls: !nextLocked,
      hasBorders: true,
    });
    (obj as any).isLocked = nextLocked;
    canvas.setActiveObject(obj);
    setActiveObject(obj);

    if (nextLocked) {
      showToast(
        locale === 'tr' ? 'Katman kilitlendi 🔒 (Otomatik çekim devre dışı)' :
        locale === 'en' ? 'Layer locked 🔒 (Auto snap disabled)' :
        'تم قفل الطبقة بنجاح 🔒 - تم إيقاف الحركة والسحب',
        'success',
        2500
      );
    } else {
      showToast(
        locale === 'tr' ? 'Katman kilidi açıldı 🔓' :
        locale === 'en' ? 'Layer unlocked 🔓' :
        'تم إلغاء قفل الطبقة 🔓',
        'info',
        2000
      );
    }

    canvas.renderAll();
    saveHistoryState();
  }, [canvas, activeObject, locale, showToast, saveHistoryState]);

  // Quick Background Cleaner (White / solid background remover for JPGs)
  const handleRemoveBackgroundQuick = useCallback(() => {
    if (!canvas) return;
    const targetObj = canvas.getActiveObject() || activeObject;
    if (!targetObj) return;
    if (targetObj.type === 'image') {
      const img = targetObj as fabric.Image;
      if (!img.filters) img.filters = [];
      const filterIndex = (img.filters || []).findIndex(
        (f: any) => f?.type === 'RemoveColor' || f instanceof (fabric.Image.filters as any).RemoveColor
      );
      if (filterIndex >= 0) {
        img.filters.splice(filterIndex, 1);
      } else {
        const removeColor = new (fabric.Image.filters as any).RemoveColor({
          color: '#FFFFFF',
          distance: 0.22,
          threshold: 0.05
        });
        img.filters.push(removeColor);
      }
      img.applyFilters();
      canvas.setActiveObject(img);
      setActiveObject(img);
      canvas.requestRenderAll();
      canvas.renderAll();
      saveHistoryState();
      showToast(
        locale === 'tr' ? 'Arka plan temizlendi' : locale === 'en' ? 'Background cleared' : 'تم تفريغ الخلفية بنجاح',
        'success'
      );
    }
  }, [canvas, activeObject, saveHistoryState, showToast, locale]);

  const renderActiveObjectToolbar = (variant: 'docked' | 'inline' | 'floating') => {
    if (!activeObject) return null;
    const isDocked = variant === 'docked';
    const isInline = variant === 'inline';

    return (
      <div
        onPointerDown={(e) => { e.stopPropagation(); }}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onTouchStart={handleToolbarTouchStart}
        onTouchMove={handleToolbarTouchMove}
        onTouchEnd={handleToolbarTouchEnd}
        className={cn(
          "bg-slate-900/95 backdrop-blur-md text-white flex items-center border border-slate-700/80 pointer-events-auto whitespace-nowrap overflow-x-auto no-scrollbar touch-pan-x overscroll-x-contain select-none",
          isDocked
            ? "rounded-xl px-1.5 py-0.5 shadow-xs gap-0.5 text-[10.5px] max-w-full"
            : isInline
              ? "rounded-2xl px-1.5 py-0.5 shadow-md gap-1 text-xs max-w-[calc(100vw-24px)]"
              : cn(
                  "absolute top-1.5 sm:top-2.5 left-1/2 -translate-x-1/2 rounded-2xl px-1.5 py-0.5 sm:px-2.5 sm:py-1 shadow-2xl gap-1 sm:gap-1.5 text-xs z-[60] animate-in fade-in zoom-in-95 duration-150 max-w-[calc(100vw-24px)]",
                  studioProfile.family === 'mug' && !isFreeMode ? "lg:hidden" : ""
                )
        )}
      >
        {/* 1. Intelligent Center in Placement / Print Area */}
        <button
          type="button"
          {...createToolbarButtonHandler(handleCenterInPlacement)}
          className={cn(
            "flex items-center gap-1 hover:text-amber-400 bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 transition-all cursor-pointer font-semibold active:scale-95 border border-slate-700/60 shadow-xs shrink-0 touch-manipulation",
            isDocked ? "px-1.5 py-0.5 rounded-lg" : "px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-xl"
          )}
          title={
            locale === 'tr' ? 'Seçili Alana Ortala 🎯' :
            locale === 'en' ? 'Center in Placement 🎯' :
            'توسيط في الموضع المحدد 🎯'
          }
        >
          <Target size={isDocked ? 11 : 13} className="text-amber-400 shrink-0" />
          <span className={isDocked ? "text-[10px] hidden xl:inline" : "text-[10px] sm:text-[11px] hidden sm:inline"}>
            {locale === 'tr' ? 'Ortala' : locale === 'en' ? 'Center' : 'توسيط'}
          </span>
        </button>

        <span className={cn("w-px bg-slate-700/80 shrink-0", isDocked ? "h-3" : "h-3.5 sm:h-4")} />

        {/* 2. Scale Controls (Zoom Out / Zoom In) */}
        <div className={cn("flex items-center bg-slate-800/90 p-0.5 border border-slate-700/60 shadow-xs shrink-0", isDocked ? "rounded-lg" : "rounded-xl")}>
          <button
            type="button"
            {...createToolbarButtonHandler(() => handleScaleActive(0.9))}
            className={cn("hover:text-amber-400 hover:bg-slate-700/70 text-slate-200 transition-all cursor-pointer rounded-md active:scale-90 touch-manipulation", isDocked ? "p-0.5" : "p-0.5 sm:p-1 sm:rounded-lg")}
            title={locale === 'tr' ? 'Küçült (%10)' : locale === 'en' ? 'Scale Down (10%)' : 'تصغير'}
          >
            <Minus size={isDocked ? 11 : 12} />
          </button>
          <button
            type="button"
            {...createToolbarButtonHandler(() => handleScaleActive(1.1))}
            className={cn("hover:text-amber-400 hover:bg-slate-700/70 text-slate-200 transition-all cursor-pointer rounded-md active:scale-90 touch-manipulation", isDocked ? "p-0.5" : "p-0.5 sm:p-1 sm:rounded-lg")}
            title={locale === 'tr' ? 'Büyüt (%10)' : locale === 'en' ? 'Scale Up (10%)' : 'تكبير'}
          >
            <Plus size={isDocked ? 11 : 12} />
          </button>
        </div>

        {/* 3. Live Real-time Dimensions & Quality Pill */}
        {liveDimensions && (
          <>
            <span className={cn("w-px bg-slate-700/80 shrink-0", isDocked ? "h-3" : "h-3.5 sm:h-4")} />

            {!isDocked && (
              <div
                className="flex sm:hidden items-center gap-0.5 px-1 py-0.5 rounded-lg bg-slate-800/90 text-slate-200 border border-slate-700/60 font-mono text-[9px] shrink-0 pointer-events-none"
                dir="ltr"
                title={`المقاس: ${liveDimensions.widthCm}×${liveDimensions.heightCm} سم | ${liveDimensions.effectiveDpi} DPI`}
              >
                <span className="text-amber-400 font-bold">{liveDimensions.widthCm}×{liveDimensions.heightCm}</span>
                {(liveDimensions?.effectiveDpi ?? 0) > 0 && (
                  <span className="text-[8.5px] text-emerald-400 font-bold">
                    • {liveDimensions.effectiveDpi}DPI
                  </span>
                )}
              </div>
            )}

            <div
              className={cn(
                "items-center gap-1 font-mono font-bold border transition-all shrink-0 pointer-events-none",
                isDocked ? "flex px-1.5 py-0.5 rounded-lg text-[10px]" : "hidden sm:flex px-2 py-1 rounded-xl text-[10.5px] sm:text-[11px]",
                liveDimensions.isScaling
                  ? "bg-amber-500/25 text-amber-300 border-amber-400/80 shadow-xs shadow-amber-500/20 ring-1 ring-amber-400/50"
                  : "bg-slate-800/90 text-slate-200 border-slate-700/60"
              )}
              dir="ltr"
              title={
                locale === 'tr' ? `Fiziksel Boyut: ${liveDimensions.widthCm} × ${liveDimensions.heightCm} cm` :
                locale === 'en' ? `Actual Size: ${liveDimensions.widthCm} × ${liveDimensions.heightCm} cm` :
                `المقاس الفعلي على القماش: ${liveDimensions.widthCm} × ${liveDimensions.heightCm} سم`
              }
            >
              <Ruler size={isDocked ? 10 : 12} className={liveDimensions.isScaling ? "text-amber-400 animate-pulse shrink-0" : "text-amber-400 shrink-0"} />
              <span>{liveDimensions.widthCm}×{liveDimensions.heightCm}{isDocked ? '' : ' cm'}</span>
            </div>

            {(liveDimensions?.effectiveDpi ?? 0) > 0 && (
              <span className={cn(
                "font-mono font-black items-center gap-0.5 shrink-0 border pointer-events-none",
                isDocked ? "flex text-[9px] px-1.5 py-0.5 rounded-md" : "hidden sm:flex text-[9px] sm:text-[9.5px] px-1.5 sm:px-2 py-0.5 rounded-lg gap-1",
                liveDimensions.qualityLevel === 'excellent'
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : liveDimensions.qualityLevel === 'acceptable'
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-red-500/30 text-red-300 border-red-500/60"
              )} dir="ltr">
                <span>{liveDimensions.qualityLevel === 'excellent' ? '🟢' : liveDimensions.qualityLevel === 'acceptable' ? '🟠' : '🔴'}</span>
                <span>{liveDimensions.effectiveDpi}{isDocked ? '' : ' DPI'}</span>
              </span>
            )}

            {liveDimensions.isOpaqueJpg && (
              <button
                type="button"
                {...createToolbarButtonHandler(handleRemoveBackgroundQuick)}
                className={cn(
                  "bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs shrink-0 touch-manipulation",
                  isDocked ? "px-1.5 py-0.5 rounded-lg text-[9.5px]" : "px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-xl text-[10px]"
                )}
                title={locale === 'tr' ? 'Arka Planı Temizle' : locale === 'en' ? 'Remove Background' : 'إزالة خلفية الصورة'}
              >
                <Wand2 size={isDocked ? 10 : 11} className="shrink-0" />
                {!isDocked && (
                  <span className="hidden sm:inline">{locale === 'tr' ? 'Arka Planı Sil' : locale === 'en' ? 'Remove BG' : 'تفريغ'}</span>
                )}
              </button>
            )}
          </>
        )}

        <span className={cn("w-px bg-slate-700/80 shrink-0", isDocked ? "h-3" : "h-3.5 sm:h-4")} />

        {/* 4. Layer Utilities (Duplicate & Lock) */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            {...createToolbarButtonHandler(handleDuplicateActive)}
            className={cn("hover:text-amber-400 hover:bg-slate-800 text-slate-200 transition-all cursor-pointer rounded-lg active:scale-90 touch-manipulation", isDocked ? "p-1" : "p-1 sm:p-1.5")}
            title={locale === 'tr' ? 'Çoğalt' : locale === 'en' ? 'Duplicate' : 'تكرار العنصر'}
          >
            <Copy size={isDocked ? 11 : 13} />
          </button>
          <button
            type="button"
            {...createToolbarButtonHandler(handleToggleLockActive)}
            className={cn("hover:text-amber-400 hover:bg-slate-800 text-slate-200 transition-all cursor-pointer rounded-lg active:scale-90 touch-manipulation", isDocked ? "p-1" : "p-1 sm:p-1.5")}
            title={locale === 'tr' ? 'Kilitle / Kilidi Aç' : locale === 'en' ? 'Lock / Unlock' : 'قفل / فك قفل'}
          >
            {activeObject.lockMovementX ? <Lock size={isDocked ? 11 : 13} className="text-amber-400" /> : <Unlock size={isDocked ? 11 : 13} />}
          </button>
        </div>

        <span className={cn("w-px bg-slate-700/80 shrink-0", isDocked ? "h-3" : "h-3.5 sm:h-4")} />

        {/* 5. Delete (Prominent Red Button) */}
        <button
          type="button"
          {...createToolbarButtonHandler(deleteSelected)}
          className={cn(
            "flex items-center gap-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white transition-all cursor-pointer font-bold active:scale-95 shadow-xs shrink-0 touch-manipulation",
            isDocked ? "px-1.5 py-0.5 rounded-lg text-[10px]" : "p-1 sm:px-2.5 sm:py-1 rounded-xl text-[11px] sm:text-xs"
          )}
          title={t('delete', { fallback: 'حذف' })}
        >
          <Trash2 size={isDocked ? 11 : 13} className="shrink-0" />
          <span className={isDocked ? "hidden xl:inline" : "hidden sm:inline"}>
            {locale === 'tr' ? 'Sil' : locale === 'en' ? 'Delete' : 'حذف'}
          </span>
        </button>

        {/* 6. Directional Nudge D-Pad */}
        <div
          className={cn(
            "items-center bg-slate-800/90 border border-slate-700/60 shadow-xs shrink-0",
            isDocked ? "hidden xl:flex gap-0 rounded-lg p-0.5" : "hidden sm:flex gap-0.5 rounded-xl p-0.5"
          )}
          dir="ltr"
        >
          <button
            type="button"
            {...createToolbarButtonHandler(() => handleNudgeActive(-8, 0))}
            className={cn("hover:text-amber-400 hover:bg-slate-700/70 text-slate-200 transition-all cursor-pointer rounded-md active:scale-90", isDocked ? "p-0.5" : "p-1 rounded-lg")}
            title={locale === 'tr' ? 'Sola Kaydır' : locale === 'en' ? 'Nudge Left' : 'إزاحة لليسار'}
          >
            <ArrowLeft size={isDocked ? 11 : 13} />
          </button>
          <button
            type="button"
            {...createToolbarButtonHandler(() => handleNudgeActive(0, -8))}
            className={cn("hover:text-amber-400 hover:bg-slate-700/70 text-slate-200 transition-all cursor-pointer rounded-md active:scale-90", isDocked ? "p-0.5" : "p-1 rounded-lg")}
            title={locale === 'tr' ? 'Yukarı Kaydır' : locale === 'en' ? 'Nudge Up' : 'إزاحة للأعلى'}
          >
            <ArrowUp size={isDocked ? 11 : 13} />
          </button>
          <button
            type="button"
            {...createToolbarButtonHandler(() => handleNudgeActive(0, 8))}
            className={cn("hover:text-amber-400 hover:bg-slate-700/70 text-slate-200 transition-all cursor-pointer rounded-md active:scale-90", isDocked ? "p-0.5" : "p-1 rounded-lg")}
            title={locale === 'tr' ? 'Aşağı Kaydır' : locale === 'en' ? 'Nudge Down' : 'إزاحة للأسفل'}
          >
            <ArrowDown size={isDocked ? 11 : 13} />
          </button>
          <button
            type="button"
            {...createToolbarButtonHandler(() => handleNudgeActive(8, 0))}
            className={cn("hover:text-amber-400 hover:bg-slate-700/70 text-slate-200 transition-all cursor-pointer rounded-md active:scale-90", isDocked ? "p-0.5" : "p-1 rounded-lg")}
            title={locale === 'tr' ? 'Sağa Kaydır' : locale === 'en' ? 'Nudge Right' : 'إزاحة لليمين'}
          >
            <ArrowRight size={isDocked ? 11 : 13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex-1 min-h-0 flex flex-col gap-2 sm:gap-2.5 transition-all overflow-hidden">
      {/* ========================================================================= */}
      {/* 1. STUDIO HEADER NAVIGATION (PRO STUDIO BAR) */}
      {/* ========================================================================= */}
      {/* 1A. MOBILE SLIM SUBHEADER (Hidden on mobile to eliminate ghost icon and give 100% space to workspace) */}
      <header className="hidden w-full bg-white/95 backdrop-blur-xl border border-gray-200/90 shadow-2xs rounded-2xl px-2.5 py-1.5 items-center justify-between gap-1.5 shrink-0 z-30 select-none">
        {/* Brand/Product & Color */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[var(--color-primary)] to-amber-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
            <Sparkles size={13} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-heading font-black text-xs text-gray-900 truncate max-w-[140px]">
              {productData?.[`name_${locale}`] || productData?.name || 'Kendin Tasarla'}
            </span>
            <div className="flex items-center gap-1 text-[9px] text-gray-500 font-medium">
              <span className="text-gray-700 font-bold truncate max-w-[80px]">
                {getLocalizedColorName(selectedColor, locale)}
              </span>
              <span>•</span>
              <span className="text-[var(--color-primary)] font-bold">{isFreeMode ? (locale === 'tr' ? 'Serbest Mod' : locale === 'en' ? 'Free Mode' : 'الوضع الحر') : (locale === 'tr' ? 'Onaylı Baskı Alanı' : locale === 'en' ? 'Approved' : 'مواضع معتمدة')}</span>
            </div>
          </div>
        </div>

        {/* Quick Canvas Actions: Undo, Redo, 3D Preview, Reset, Save */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 disabled:opacity-30 active:scale-90 transition"
            title={locale === 'tr' ? 'Geri Al' : locale === 'en' ? 'Undo' : 'تراجع'}
          >
            <RotateCcw size={12} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 disabled:opacity-30 active:scale-90 transition"
            title={locale === 'tr' ? 'Yinele' : locale === 'en' ? 'Redo' : 'إعادة'}
          >
            <RotateCw size={12} />
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPreviewLoading}
            className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center active:scale-90 transition shadow-2xs"
            title={locale === 'tr' ? '3D Önizleme' : locale === 'en' ? '3D Preview' : 'معاينة 3D'}
          >
            <Box size={13} />
          </button>
          <button
            type="button"
            onClick={clearDraft}
            className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:text-red-600 active:scale-90 transition flex items-center justify-center"
            title={locale === 'tr' ? 'Temizle' : locale === 'en' ? 'Clear' : 'مسح'}
          >
            <Trash2 size={12} />
          </button>
          <button
            type="button"
            onClick={() => handleAction('save')}
            disabled={isSaving}
            className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 active:scale-90 transition flex items-center justify-center"
            title={locale === 'tr' ? 'Kaydet' : locale === 'en' ? 'Save' : 'حفظ'}
          >
            <Bookmark size={12} />
          </button>
        </div>
      </header>

      {/* 1B. DESKTOP PRO STUDIO BAR */}
      <header className="hidden md:flex w-full bg-white/95 backdrop-blur-xl border border-gray-200/90 shadow-xs rounded-2xl md:rounded-3xl px-3 sm:px-5 py-2.5 sm:py-3 flex-wrap items-center justify-between gap-3 shrink-0 z-30 transition-all select-none">
        {/* Brand & Product Specs & Change Product Button */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Animated Sparkle Badge with Ambient Glow */}
          <div className="relative group shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-[var(--color-primary)] via-orange-500 to-amber-400 blur-xs opacity-75 animate-ambient-glow" />
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-[var(--color-primary)] via-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/25 transition-transform duration-300 group-hover:scale-105">
              <Sparkles size={19} className="drop-shadow-xs animate-sparkle-twinkle" />
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-heading font-black text-xs sm:text-sm md:text-base text-gray-900 leading-tight truncate">
                {productData?.[`name_${locale}`] || productData?.[`title_${locale}`] || productData?.name || productData?.title
                  ? `${productData?.[`name_${locale}`] || productData?.[`title_${locale}`] || productData?.name || productData?.title} | Kendin Tasarla`
                  : (locale === 'tr' ? 'Kendin Tasarla | Özel Tasarım Stüdyosu' : locale === 'en' ? 'Kendin Tasarla | Custom Design Studio' : 'Kendin Tasarla | استوديو التصميم المخصص')}
              </span>
              <span className="hidden xl:inline-block text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-50 text-[var(--color-primary)] border border-orange-200">
                PRO STUDIO
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 font-medium flex-wrap">
              {realProductHeaderSpecs ? (
                <>
                  <span className="text-gray-700 font-bold truncate max-w-[220px] sm:max-w-xs md:max-w-md">
                    {realProductHeaderSpecs}
                  </span>
                  <span className="text-gray-300">•</span>
                </>
              ) : null}

              {auth?.currentUser ? (
                <button
                  type="button"
                  onClick={() => handleAction('save')}
                  title={locale === 'tr' ? 'Tasarımı hesabınıza senkronize edin' : locale === 'en' ? 'Sync and save design to your account' : 'حفظ التصميم ومزامنته في حسابك'}
                  className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-bold shrink-0 transition-colors cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <Cloud size={12} className="text-emerald-600" />
                  <span>{locale === 'tr' ? 'Hesabınızda Kayıtlı' : locale === 'en' ? 'Saved to Account' : 'محفوظ في حسابك'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction('save');
                    setIsAuthModalOpen(true);
                  }}
                  title={locale === 'tr' ? 'Tasarımlarınıza her cihazdan erişmek için giriş yapın' : locale === 'en' ? 'Sign in to access your designs on any device' : 'سجّل الدخول للوصول لتصاميمك من أي جهاز'}
                  className="text-amber-600 hover:text-amber-700 flex items-center gap-1 font-bold shrink-0 transition-colors cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>{locale === 'tr' ? 'Otomatik Kaydedildi • Hesaba Bağla' : locale === 'en' ? 'Auto-Saved • Save to Cloud' : 'تم الحفظ تلقائياً • احفظ في حسابك'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Change Product Button */}
          {onChangeProduct && (
            <button
              type="button"
              onClick={onChangeProduct}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-400 bg-gray-50/70 hover:bg-white text-xs font-bold text-gray-700 transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
              title={t('changeProduct', { fallback: 'تغيير الموديل' })}
            >
              <Shirt size={14} className="text-gray-500" />
              <span>{t('changeProduct', { fallback: 'تغيير الموديل' })}</span>
            </button>
          )}
        </div>

        {/* Center Quick Canvas Actions: Undo, Redo, Clear Canvas, 3D Preview */}
        <div className="flex items-center gap-1.5 order-3 md:order-2">
          <div className="flex items-center bg-gray-100/90 p-1 rounded-2xl border border-gray-200/70 text-gray-600">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center hover:bg-white hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
              title={locale === 'tr' ? 'Geri Al (Ctrl+Z)' : locale === 'en' ? 'Undo (Ctrl+Z)' : 'تراجع (Ctrl+Z)'}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center hover:bg-white hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
              title={locale === 'tr' ? 'Yinele (Ctrl+Y)' : locale === 'en' ? 'Redo (Ctrl+Y)' : 'إعادة (Ctrl+Y)'}
            >
              <RotateCw size={14} />
            </button>
            <div className="w-px h-4 bg-gray-300 mx-1" />
            <button
              type="button"
              onClick={clearDraft}
              className="px-2 h-7 sm:h-8 rounded-xl flex items-center gap-1 text-[11px] font-bold text-gray-600 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
              title={t('clearCanvas', { fallback: 'مسح الواجهة' })}
            >
              <Trash2 size={13} />
              <span className="hidden xl:inline">{t('clearCanvas', { fallback: 'مسح الواجهة' })}</span>
            </button>
          </div>

          {/* 3D Live Preview Button */}
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPreviewLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border border-gray-200/90 bg-white hover:bg-gray-50 text-gray-800 text-xs font-bold shadow-xs hover:shadow-md transition active:scale-95 cursor-pointer"
          >
            <Box size={15} className="text-[var(--color-primary)]" />
            <span className="hidden sm:inline">{locale === 'tr' ? '3D Canlı Önizleme' : locale === 'en' ? '3D Live Preview' : 'معاينة ثلاثية الأبعاد 3D'}</span>
            <span className="sm:hidden">{locale === 'tr' ? '3D' : locale === 'en' ? '3D' : 'معاينة'}</span>
          </button>
        </div>

        {/* Final Order & Cart CTAs: Save, Multi-Size Matrix, Cart, Buy Now */}
        <div className="flex items-center gap-2 order-2 md:order-3">
          {/* Save Design Button */}
          <button
            type="button"
            onClick={() => handleAction('save')}
            disabled={isSaving}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition active:scale-95 cursor-pointer shadow-2xs"
            title={locale === 'tr' ? 'Tasarımı Kaydet' : locale === 'en' ? 'Save Design' : 'حفظ التصميم'}
          >
            <Bookmark size={15} className="text-gray-500" />
            <span>{isSaving && pendingAction === 'save' ? '...' : (locale === 'tr' ? 'Tasarımı Kaydet' : locale === 'en' ? 'Save Design' : 'حفظ التصميم')}</span>
          </button>

          {/* Multi-Size & Quantity Matrix Trigger */}
          <button
            type="button"
            onClick={() => setIsMatrixModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300/80 font-black text-xs transition active:scale-95 cursor-pointer shadow-xs"
            title={studioProfile.getTopBarVariantButtonLabel(locale, totalOrderQuantity, variantMatrix?.length || 0)}
          >
            <Layers size={14} className="text-amber-600" />
            <span className="hidden sm:inline">
              {studioProfile.getTopBarVariantButtonLabel(locale, totalOrderQuantity, variantMatrix?.length || 0)}
            </span>
            <span className="bg-amber-500 text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {totalOrderQuantity}
            </span>
          </button>

          {/* Add to Cart Trigger with Price Badge */}
          <button
            type="button"
            onClick={() => handleAction('cart')}
            disabled={isSaving || isPreviewLoading}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-gray-900 hover:bg-black text-white shadow-sm hover:shadow-md transition active:scale-95 font-heading font-bold text-xs sm:text-sm cursor-pointer"
          >
            <ShoppingCart size={15} className="text-[var(--color-primary)]" />
            <span>{t('addToCart')}</span>
            <span className="bg-gray-800 text-amber-400 font-mono text-xs px-2 py-0.5 rounded-lg font-bold">
              {grandTotalPrice} ₺
            </span>
          </button>

          {/* Direct Instant Checkout (Buy Now) */}
          <button
            type="button"
            onClick={() => handleAction('buy_now')}
            disabled={isSaving}
            className="hidden sm:flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-orange-500 hover:from-orange-600 hover:to-orange-700 text-white font-heading font-black text-xs sm:text-sm shadow-md shadow-orange-500/20 transition active:scale-95 cursor-pointer"
          >
            <Zap size={14} className="fill-amber-300 text-amber-300" />
            <span>{t('buyNow')}</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN 3-COLUMN STUDIO LAYOUT (Exact architecture from stitch-studio-kenditasarl.html) */}
      {/* ========================================================================= */}
      <div className="studio-workspace-container flex-1 min-h-0 flex flex-col lg:flex-row w-full overflow-hidden relative bg-white lg:bg-[#FAF8F5] rounded-3xl border border-gray-200/90 shadow-sm select-none !pt-0">
        
        {/* Toast Notification Banner */}
        {toastNotification && (
          <div
            onClick={() => {
              if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
              }
              setToastNotification(null);
            }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200 cursor-pointer pointer-events-auto"
          >
            <div className={cn(
              "px-5 py-2.5 rounded-2xl shadow-xl border backdrop-blur-md flex items-center gap-2.5 font-bold text-sm select-none transition-all hover:scale-105 active:scale-95",
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

        {/* Mobile Backdrop Overlay for Tools Drawer */}
        {activeMobileTab === 'tools' && (
          <div 
            onClick={() => setActiveMobileTab(null)} 
            className="lg:hidden fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs transition-opacity duration-200" 
          />
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* COLUMN 1: LEFT TOOL SIDEBAR (الرسومات / رفع ملف / إضافة نص / ذكاء اصطناعي) */}
        {/* ------------------------------------------------------------------------- */}
        <aside 
          className={cn(
            "bg-white flex flex-col z-50 transition-all duration-300",
            // Desktop: normal 3-column left sidebar
            "lg:w-80 xl:w-96 lg:border-e lg:border-slate-200 lg:shrink-0 lg:relative lg:flex lg:h-full lg:shadow-none lg:z-auto",
            // Mobile: Bottom Sheet Drawer (Slides up from bottom - exact match to Image 3)
            activeMobileTab === 'tools'
              ? "fixed inset-x-0 bottom-0 h-[82dvh] max-h-[82dvh] rounded-t-3xl shadow-2xl border-t border-slate-200 flex flex-col overflow-hidden z-[100] animate-in slide-in-from-bottom duration-200 bg-white"
              : "hidden lg:flex"
          )} 
          data-purpose="studio-asset-toolbox"
        >
          {/* Mobile Bottom Sheet Header Bar (Icon + Title + Subtitle + Clear Close Button) - Matching Image 3 */}
          <div className="lg:hidden flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 bg-white shrink-0 select-none">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0",
                activeToolTab === 'stickers' ? "bg-gradient-to-tr from-amber-500 to-orange-500 shadow-orange-500/25" :
                activeToolTab === 'upload' ? "bg-gradient-to-tr from-blue-500 to-indigo-500 shadow-blue-500/25" :
                activeToolTab === 'text' ? "bg-gradient-to-tr from-purple-500 to-pink-500 shadow-purple-500/25" :
                "bg-gradient-to-tr from-violet-500 to-fuchsia-500 shadow-violet-500/25"
              )}>
                {activeToolTab === 'stickers' ? <LayoutTemplate size={20} /> :
                 activeToolTab === 'upload' ? <Upload size={20} /> :
                 activeToolTab === 'text' ? <Type size={20} /> :
                 <Wand2 size={20} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-gray-900 font-heading">
                    {activeToolTab === 'stickers' ? (locale === 'tr' ? 'Grafik ve Çıkartma Galerisi' : locale === 'en' ? 'Graphics & Sticker Library' : 'مكتبة الرسومات والملصقات') :
                     activeToolTab === 'upload' ? (locale === 'tr' ? 'Dosya Yükleme ve Tasarım' : locale === 'en' ? 'Upload Design File' : 'رفع ملف وتصميم') :
                     activeToolTab === 'text' ? (locale === 'tr' ? 'Metin Ekle ve Düzenle' : locale === 'en' ? 'Text & Typography' : 'إضافة وتنسيق النص') :
                     (locale === 'tr' ? 'Yapay Zeka Tasarım Stüdyosu' : locale === 'en' ? 'AI Design Studio' : 'استوديو الذكاء الاصطناعي')}
                  </h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    {activeToolTab === 'stickers' ? `${filteredStickers.length} ${locale === 'tr' ? 'Grafik' : locale === 'en' ? 'Items' : 'عنصر'}` :
                     activeToolTab === 'upload' ? 'PNG, SVG, AI' :
                     activeToolTab === 'text' ? 'Google Fonts' :
                     'AI 300DPI'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {activeToolTab === 'stickers' ? (locale === 'tr' ? 'Tasarımınıza eklemek için bir grafik seçin' : locale === 'en' ? 'Choose artwork to place on your garment' : 'اختر رسومات وملصقات جاهزة لإضافتها لتصميمك') :
                   activeToolTab === 'upload' ? (locale === 'tr' ? 'Kendi logonuzu veya görselinizi yükleyin' : locale === 'en' ? 'Upload your own custom logo or design' : 'ارفع شعارك أو صورتك الخاصة بدقة عالية') :
                   activeToolTab === 'text' ? (locale === 'tr' ? 'Özel yazı ekleyin ve fontları özelleştirin' : locale === 'en' ? 'Add custom text with stylish fonts' : 'أضف عباراتك المفضلة وخصص الخط والألوان') :
                   (locale === 'tr' ? 'Fikrinizi yazın, yapay zeka tasarlasın' : locale === 'en' ? 'Describe your idea and AI will create it' : 'اكتب فكرتك وسيقوم الذكاء الاصطناعي برسمها')}
                </p>
              </div>
            </div>

            {/* Clear Prominent Close Button matching Image 3 */}
            <button
              type="button"
              onClick={() => setActiveMobileTab(null)}
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-all cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          {/* Primary Tool Category Tabs */}
          <nav aria-label={locale === 'tr' ? 'Tasarım Araçları' : locale === 'en' ? 'Design Tools' : 'أدوات التصميم'} className="grid grid-cols-4 p-2 gap-1 border-b border-slate-100 bg-slate-50/70 shrink-0">
            {/* Tab 1: Stickers */}
            <button
              type="button"
              id="sidebarTabStickers"
              onClick={() => setActiveToolTab('stickers')}
              className={cn(
                "flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-bold text-xs gap-1.5 cursor-pointer transition-all",
                activeToolTab === 'stickers'
                  ? "bg-white text-[var(--color-primary)] shadow-xs border border-slate-200/80 font-black"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              )}
            >
              <LayoutTemplate size={16} />
              <span>{locale === 'tr' ? 'Grafikler' : locale === 'en' ? 'Graphics' : 'الرسومات'}</span>
            </button>

            {/* Tab 2: Upload File */}
            <button
              type="button"
              id="sidebarTabUpload"
              onClick={() => setActiveToolTab('upload')}
              className={cn(
                "flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-bold text-xs gap-1.5 cursor-pointer transition-all",
                activeToolTab === 'upload'
                  ? "bg-white text-[var(--color-primary)] shadow-xs border border-slate-200/80 font-black"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              )}
            >
              <Upload size={16} />
              <span>{locale === 'tr' ? 'Dosya Yükle' : locale === 'en' ? 'Upload' : 'رفع ملف'}</span>
            </button>

            {/* Tab 3: Add Text */}
            <button
              type="button"
              id="sidebarTabText"
              onClick={() => setActiveToolTab('text')}
              className={cn(
                "flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-bold text-xs gap-1.5 cursor-pointer transition-all",
                activeToolTab === 'text'
                  ? "bg-white text-[var(--color-primary)] shadow-xs border border-slate-200/80 font-black"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              )}
            >
              <Type size={16} />
              <span>{locale === 'tr' ? 'Metin Ekle' : locale === 'en' ? 'Text' : 'إضافة نص'}</span>
            </button>

            {/* Tab 4: AI Generation */}
            <button
              type="button"
              id="sidebarTabAi"
              onClick={() => setActiveToolTab('ai')}
              className={cn(
                "flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-bold text-xs gap-1.5 relative cursor-pointer transition-all",
                activeToolTab === 'ai'
                  ? "bg-white text-purple-600 shadow-xs border border-slate-200/80 font-black"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              )}
            >
              <span className="absolute top-1.5 left-2 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <Wand2 size={16} className="text-purple-600" />
              <span>{locale === 'tr' ? 'Yapay Zeka' : locale === 'en' ? 'AI Studio' : 'ذكاء اصطناعي'}</span>
            </button>
          </nav>

          {/* TAB 1: STICKERS & GRAPHICS VIEW */}
          {activeToolTab === 'stickers' && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Panel Header & Search */}
              <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                    <span>{locale === 'tr' ? 'Hazır Grafik ve Çıkartma Galerisi' : locale === 'en' ? 'Graphics & Sticker Library' : 'مكتبة الرسوم والملصقات الجاهزة'}</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono font-medium">
                      {filteredStickers.length}
                    </span>
                  </h2>
                  <button
                    type="button"
                    id="openGalleryModalBtn"
                    onClick={() => setIsGalleryModalOpen(true)}
                    className="text-[11px] text-[var(--color-primary)] hover:underline cursor-pointer font-bold flex items-center gap-1"
                  >
                    <Box size={12} />
                    <span>{locale === 'tr' ? 'Tüm Galeriyi Aç' : locale === 'en' ? 'Browse All' : 'تصفح المعرض الكامل'}</span>
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={stickerSearchQuery}
                    onChange={(e) => setStickerSearchQuery(e.target.value)}
                    placeholder={locale === 'tr' ? 'Grafik, hat sanatı, amblem ara...' : locale === 'en' ? 'Search graphics, calligraphy, badges...' : 'ابحث عن فنون، خطوط عربية، شارات...'}
                    className="w-full text-xs pr-9 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition outline-none"
                  />
                  {stickerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStickerSearchQuery('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Categories Filter Pills */}
                {displayCategories.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
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
                              ? "bg-slate-900 text-white font-bold shadow-xs scale-[1.02]"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                          )}
                        >
                          {getCategoryLocalizedName(cat, locale)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Upload Banner CTA (Hidden on mobile screens to maximize stickers viewing area) */}
              <div className="hidden lg:block px-4 pt-3 pb-1 shrink-0">
                <label className="p-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[var(--color-primary)]/60 bg-gradient-to-b from-orange-50/40 to-slate-50/40 text-center cursor-pointer transition block group">
                  <div className="flex items-center justify-center gap-2 text-xs font-bold text-[var(--color-primary)] group-hover:text-orange-700">
                    <Upload size={14} />
                    <span>{locale === 'tr' ? 'Tasarımınızı buraya bırakın veya yükleyin' : locale === 'en' ? 'Drop your design or browse' : 'إفلات تصميمك هنا أو استعراض جهازك'}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {locale === 'tr' ? 'PNG, SVG, AI destekli (300 DPI, 25MB)' : locale === 'en' ? 'Supports PNG, SVG, AI up to 25MB' : 'يدعم PNG, SVG, AI بدقة 300 DPI عالية حتى 25MB مع تفريغ تلقائي'}
                  </p>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={isUploading} />
                </label>
              </div>

              {/* Graphics Gallery Grid */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 pb-8 lg:pb-4 custom-scrollbar">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                    {locale === 'tr' ? 'Kendin Tasarla En Popüler Tasarımlar' : locale === 'en' ? 'Trending on Kendin Tasarla' : 'التصاميم الأكثر طلباً في Kendin Tasarla'}
                  </span>
                  {filteredStickers.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-xs text-slate-400">{t('noStickersInCategory', { fallback: 'لا توجد ملصقات في هذا القسم حالياً' })}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2.5" id="sidebarStickerGrid">
                      {filteredStickers.map((sticker) => (
                        <div
                          key={sticker.id}
                          onClick={() => {
                            if (!ensurePlacementSelected(() => addSticker(sticker.url, { id: sticker.id, name: sticker.name, price: sticker.price }))) return;
                            addSticker(sticker.url, { id: sticker.id, name: sticker.name, price: sticker.price });
                            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                              setActiveMobileTab(null);
                            }
                          }}
                          className="relative group bg-slate-50 hover:bg-white border border-slate-200 hover:border-[var(--color-primary)] rounded-xl p-2 cursor-pointer aspect-square flex items-center justify-center hover:shadow-md transition active:scale-95"
                          title={sticker.name}
                        >
                          <img
                            src={sticker.url}
                            alt={sticker.name}
                            className="w-14 h-14 object-contain drop-shadow group-hover:scale-105 transition duration-200 pointer-events-none"
                            loading="lazy"
                          />
                          {typeof sticker.price === 'number' && sticker.price > 0 && (
                            <span className="absolute top-1 right-1 text-[8px] font-black px-1.5 py-0.2 rounded-full bg-amber-500 text-white shadow-xs">
                              +{sticker.price} ₺
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick AI Inspiration Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 mt-auto">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xs">
                    <Sparkles size={14} />
                  </div>
                  <span className="text-xs text-slate-600 font-medium">
                    {locale === 'tr' ? 'Yapay zeka ile çizim üretin' : locale === 'en' ? 'Generate AI artwork' : 'توليد رسمة فنية بالذكاء الاصطناعي'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveToolTab('ai')}
                  className="px-2.5 py-1 rounded-lg bg-white border border-purple-200 hover:bg-purple-50 text-purple-700 text-xs font-bold transition cursor-pointer"
                >
                  {locale === 'tr' ? 'Şimdi Dene' : locale === 'en' ? 'Try Now' : 'جرّب الآن'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD FILE VIEW */}
          {activeToolTab === 'upload' && (
            <div className="flex flex-col flex-1 min-h-0 p-4 space-y-4 overflow-y-auto pb-8 lg:pb-4 custom-scrollbar">
              <label className="p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-[var(--color-primary)] bg-slate-50 hover:bg-orange-50/20 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[var(--color-primary)] flex items-center justify-center">
                  {isUploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-sm text-slate-800">
                    {isUploading ? (locale === 'tr' ? 'Yükleniyor...' : locale === 'en' ? 'Uploading...' : 'جاري الرفع...') : (locale === 'tr' ? 'Resim veya Logo Yükle' : locale === 'en' ? 'Upload Image or Logo' : 'رفع صورة أو شعار')}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {locale === 'tr' ? 'PNG, JPG, SVG, AI (Maks 25MB)' : locale === 'en' ? 'PNG, JPG, SVG, AI (Max 25MB)' : 'PNG, JPG, SVG, AI (حتى 25MB)'}
                  </span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={isUploading} />
              </label>

              {userUploads.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {locale === 'tr' ? 'Yüklediğim Dosyalar' : locale === 'en' ? 'My Uploads' : 'ملفاتي المرفوعة'} ({userUploads.length})
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {userUploads.map((up) => (
                      <div
                        key={up.id}
                        onClick={() => handleSelectUpload(up)}
                        className="group relative bg-slate-50 hover:bg-white border border-slate-200 hover:border-[var(--color-primary)] rounded-xl p-2 cursor-pointer aspect-square flex items-center justify-center overflow-hidden transition shadow-xs hover:shadow"
                      >
                        <img src={up.url} alt={up.name} className="w-full h-full object-contain pointer-events-none group-hover:scale-105 transition" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteUpload(up.id);
                          }}
                          className="absolute top-1 right-1 p-1 rounded-md bg-black/60 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition"
                          title={t('delete', { fallback: 'حذف' })}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEXT TOOLS VIEW */}
          {activeToolTab === 'text' && (
            <div className="flex flex-col flex-1 min-h-0 p-4 space-y-4 overflow-y-auto pb-8 lg:pb-4 custom-scrollbar">
              <button
                type="button"
                onClick={() => addText()}
                className="w-full py-3 px-4 bg-[var(--color-primary)] hover:bg-orange-600 text-white font-black text-sm rounded-2xl shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <Plus size={18} />
                <span>{locale === 'tr' ? 'Yeni Metin Ekle' : locale === 'en' ? 'Add New Text' : 'إضافة نص جديد'}</span>
              </button>

              {activeObject && (activeObject.type === 'textbox' || activeObject.type === 'i-text') ? (
                <div className="space-y-3 pt-2">
                  <TextTools canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
                  <PrecisionControls canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
                </div>
              ) : (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    {locale === 'tr' ? 'Hızlı Metin Stilleri' : locale === 'en' ? 'Quick Text Presets' : 'أنماط نصية سريعة'}
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => addText(
                        locale === 'tr' ? 'SOKAK STİLİ' : locale === 'en' ? 'STREETWEAR' : 'عنوان ستريت وير',
                        { fontWeight: 'bold', fontFamily: locale === 'ar' ? 'Cairo' : 'Changa' }
                      )}
                      className={cn(
                        "p-3 rounded-xl border border-slate-200 hover:border-slate-400 bg-slate-50 hover:bg-white font-black text-base transition flex items-center justify-between cursor-pointer",
                        locale === 'ar' ? 'text-right' : 'text-left'
                      )}
                    >
                      <span className="font-heading">
                        {locale === 'tr' ? 'Büyük Sokak Stili Başlık' : locale === 'en' ? 'Bold Streetwear Heading' : 'عنوان كبير ستريت وير'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">BOLD</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addText(
                        locale === 'tr' ? 'Klasik Zarafet' : locale === 'en' ? 'Classic Elegance' : 'عبارة كلاسيكية ناعمة',
                        { fontFamily: 'Playfair Display', fontStyle: 'italic' }
                      )}
                      className={cn(
                        "p-3 rounded-xl border border-slate-200 hover:border-slate-400 bg-slate-50 hover:bg-white font-serif text-sm transition flex items-center justify-between cursor-pointer",
                        locale === 'ar' ? 'text-right' : 'text-left'
                      )}
                    >
                      <span>
                        {locale === 'tr' ? 'Zarif Klasik Metin' : locale === 'en' ? 'Elegant Classic Script' : 'عبارة كلاسيكية ناعمة'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">SERIF</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AI STUDIO VIEW */}
          {activeToolTab === 'ai' && (
            <div className="flex flex-col flex-1 min-h-0 p-4 space-y-4 overflow-y-auto pb-8 lg:pb-4 custom-scrollbar">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200/80">
                <div className="flex items-center gap-2 text-purple-800 font-bold text-xs mb-1">
                  <Wand2 size={16} className="text-purple-600" />
                  <span>{locale === 'tr' ? 'Yapay Zeka Tasarım Asistanı' : locale === 'en' ? 'AI Design Generator' : 'مولد التصاميم بالذكاء الاصطناعي'}</span>
                </div>
                <p className="text-[11px] text-purple-700 leading-relaxed">
                  {studioProfile.getAiDescription(locale)}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  {locale === 'tr' ? 'Tasarım Açıklaması:' : locale === 'en' ? 'Design Prompt:' : 'وصف التصميم المطلوب:'}
                </label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={locale === 'tr' ? 'Örnek: Siberpunk tarzında neon kurt kafası...' : locale === 'en' ? 'e.g. Cyberpunk neon wolf with sunglasses...' : 'مثال: صقر عربي بأسلوب سايبربانك نيون مع خط كوفي حديث...'}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition outline-none resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400">
                  {locale === 'tr' ? 'İlham Veren Örnekler:' : locale === 'en' ? 'Inspiration Prompts:' : 'أفكار مقترحة:'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(locale === 'tr'
                    ? ['Siberpunk neon kurt', 'Sokak stili kuru kafa', 'Minimalist geometrik desen', 'Öfkeli kırmızı kaplan']
                    : locale === 'en'
                    ? ['Cyberpunk neon wolf', 'Streetwear neon skull', 'Minimalist typography', 'Furious red tiger']
                    : ['صقر عربي بأسلوب سايبربانك', 'جمجمة نيون ستريت وير', 'خط كوفي أصالة وفخامة', 'نمر غاضب باللون الأحمر']
                  ).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAiPrompt(p)}
                      className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-purple-100 text-[11px] text-slate-700 hover:text-purple-800 transition cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!aiPrompt.trim()) {
                    showToast(locale === 'tr' ? 'Lütfen bir prompt yazın' : locale === 'en' ? 'Please enter a prompt' : 'يرجى كتابة وصف للتصميم أولاً', 'info');
                    return;
                  }
                  if (allStickersList.length > 0) {
                    const candidateAsset = allStickersList[0];
                    if (!ensurePlacementSelected(() => {
                      addSticker(candidateAsset.url, candidateAsset);
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setActiveMobileTab(null);
                      }
                    })) {
                      return;
                    }

                    showToast(locale === 'tr' ? 'Yapay zeka çizimi hazırlanıyor...' : locale === 'en' ? 'Generating AI artwork...' : 'جاري توليد التصميم بالذكاء الاصطناعي...', 'info');
                    setTimeout(() => {
                      addSticker(candidateAsset.url, candidateAsset);
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setActiveMobileTab(null);
                      }
                      showToast(locale === 'tr' ? 'Tasarım sahneye eklendi!' : locale === 'en' ? 'Artwork added to canvas!' : 'تمت إضافة الرسمة الفنية إلى مساحة التصميم بنجاح!', 'success');
                    }, 1200);
                  }
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-heading font-bold text-xs shadow-md shadow-purple-500/25 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <Sparkles size={16} />
                <span>{locale === 'tr' ? 'Yapay Zeka ile Şimdi Oluştur' : locale === 'en' ? 'Generate Artwork Now' : 'توليد التصميم فوراً'}</span>
              </button>
            </div>
          )}
        </aside>

        {/* ------------------------------------------------------------------------- */}
        {/* COLUMN 2: CENTRAL VISUAL CANVAS STAGE                                      */}
        {/* ------------------------------------------------------------------------- */}
        <section className="flex-1 min-h-0 flex flex-col relative canvas-grid overflow-hidden bg-slate-50/50 pb-28 lg:pb-0">
          
          {/* Top Canvas Controls Bar (Undo/Redo, 3D Preview, Safe Bounds, Smart Alignment) */}
          <div className="min-h-11 border-b border-slate-200/60 bg-white/95 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0 z-10 select-none">
            {/* Quick Actions: 3D Preview + Undo / Redo */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 3D Live Preview Button */}
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewLoading}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition shadow-2xs cursor-pointer"
                title={locale === 'tr' ? '3D Önizleme' : locale === 'en' ? '3D Preview' : 'معاينة 3D'}
              >
                <Box size={13} className="text-purple-600" />
                <span className="font-extrabold text-[11px] sm:text-xs">3D</span>
                <span className="hidden sm:inline text-[11px] font-medium text-purple-600">
                  {locale === 'tr' ? 'Önizleme' : locale === 'en' ? 'Preview' : 'معاينة'}
                </span>
              </button>

              <div className="w-px h-4 bg-slate-200 mx-0.5" />

              {/* Undo */}
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-30 active:scale-90 transition cursor-pointer"
                title={locale === 'tr' ? 'Geri Al' : locale === 'en' ? 'Undo' : 'تراجع'}
              >
                <RotateCcw size={13} />
              </button>

              {/* Redo */}
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-30 active:scale-90 transition cursor-pointer"
                title={locale === 'tr' ? 'Yinele' : locale === 'en' ? 'Redo' : 'إعادة'}
              >
                <RotateCw size={13} />
              </button>
            </div>

            {/* Inline Typewriter Onboarding Hint Pill docked cleanly in empty top-bar space */}
            {showTypewriterHint && !validationWarning && guidanceTips.length > 0 && (
              <div className="hidden md:flex flex-1 min-w-0 justify-center px-2">
                <div
                  id="typewriterHintBanner"
                  onClick={() => setTypewriterIndex(prev => (prev + 1) % guidanceTips.length)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white rounded-full shadow-xs border border-amber-300/60 cursor-pointer select-none whitespace-nowrap active:scale-95 transition-all max-w-full min-w-0 animate-in fade-in duration-300"
                  title={locale === 'tr' ? 'Sonraki bilgiye geç' : locale === 'en' ? 'Click for next tip' : 'اضغط للانتقال للمعلومة التالية'}
                >
                  <span className="text-xs shrink-0 drop-shadow-xs">
                    {guidanceTips[typewriterIndex % guidanceTips.length]?.icon || '✨'}
                  </span>
                  <span className="text-[9.5px] font-black uppercase tracking-wider bg-black/25 text-amber-200 px-1.5 py-0.5 rounded-md shrink-0 hidden lg:inline-block">
                    {guidanceTips[typewriterIndex % guidanceTips.length]?.tag}
                  </span>
                  <span className="text-[11px] font-bold font-heading truncate min-w-0">
                    {guidanceTips[typewriterIndex % guidanceTips.length]?.text}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTypewriterHint(false);
                    }}
                    className="ms-1 p-0.5 rounded-full hover:bg-black/25 text-amber-100 hover:text-white transition cursor-pointer shrink-0"
                    title={t('close', { fallback: 'إغلاق' })}
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )}

            {/* Canvas Guidelines & Grid toggles */}
            <div className="flex items-center gap-2.5 sm:gap-3 text-xs text-slate-600 font-medium shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800">
                <input
                  id="toggleSafeZoneCheckbox"
                  type="checkbox"
                  checked={showSafeZone}
                  onChange={(e) => setShowSafeZone(e.target.checked)}
                  className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-xs font-semibold">{locale === 'tr' ? 'Sınırlar' : locale === 'en' ? 'Bounds' : 'الحدود'}</span>
              </label>

              <div className="w-px h-3.5 bg-slate-300" />

              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800">
                <input
                  type="checkbox"
                  checked={smartAlignmentEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSmartAlignmentEnabled(checked);
                    smartAlignmentEnabledRef.current = checked;
                    if (!checked && canvas) {
                      clearSmartGuidelinesFromCanvas(canvas);
                      canvas.requestRenderAll();
                    }
                  }}
                  className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-xs font-semibold">{locale === 'tr' ? 'Hizalama' : locale === 'en' ? 'Align' : 'محاذاة'}</span>
              </label>
            </div>
          </div>

          {/* Dedicated Placements Sub-Bar directly underneath top toolbar */}
          {(() => {
            const hasActivePlacement = isFreeMode || (allSelectedPlacements.length > 0);

            return (
              <div className="min-h-11 border-b border-slate-200/60 bg-white/95 backdrop-blur-md px-3 sm:px-6 py-1.5 flex items-center justify-between gap-2 shrink-0 z-10 select-none shadow-2xs">
                {/* Placements Pill List / Badges */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-xs font-bold text-slate-500 shrink-0 hidden md:inline">
                    {locale === 'tr' ? 'Baskı Alanı:' : locale === 'en' ? 'Print Placement:' : 'موضع الطباعة:'}
                  </span>

                  {/* Free Mode Badge */}
                  {isFreeMode && (
                    <span
                      id="activePlacementBadge"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-[var(--color-primary)] border border-orange-200 text-xs font-bold shadow-xs shrink-0 whitespace-nowrap"
                    >
                      <Crosshair size={12} />
                      <span>{locale === 'tr' ? 'Serbest Mod (Tüm Yüzey)' : locale === 'en' ? 'Free Mode (Full Face)' : 'الوضع الحر (كامل الواجهة)'}</span>
                    </span>
                  )}

                  {/* Unaligned Free Mode Elements Warning */}
                  {!isFreeMode && priceBreakdown?.breakdown.some(b => b.type === 'free_mode') && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-xs font-bold shadow-xs shrink-0 animate-in fade-in">
                      <AlertCircle size={13} className="text-amber-600 shrink-0" />
                      <span className="hidden sm:inline">
                        {locale === 'tr' ? 'Serbest mod ögeleri mevcut' : locale === 'en' ? 'Free mode items active' : 'ملصقات وضع حر'}
                      </span>
                      <button
                        type="button"
                        onClick={() => mapFreeModeObjectsToApprovedPlacements(canvas)}
                        className="ml-1 px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[10.5px] font-black cursor-pointer transition active:scale-95 flex items-center gap-1 shadow-xs"
                        title={locale === 'tr' ? 'Onaylı baskı alanına hizala' : locale === 'en' ? 'Align to approved' : 'محاذاة للمعتمد'}
                      >
                        <Target size={11} />
                        <span>{locale === 'tr' ? 'Hizala 🎯' : locale === 'en' ? 'Align 🎯' : 'محاذاة 🎯'}</span>
                      </button>
                    </div>
                  )}

                  {/* No Placement Selected Warning Badge */}
                  {!hasActivePlacement && (
                    <button
                      type="button"
                      id="activePlacementBadge"
                      onClick={() => setIsPlacementGuideModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-xs transition-all cursor-pointer bg-amber-50 text-amber-800 border border-amber-300 ring-2 ring-amber-400/40 hover:bg-amber-100 animate-pulse shrink-0 whitespace-nowrap"
                      title={locale === 'tr' ? 'Baskı alanı seçmek için tıklayın' : locale === 'en' ? 'Click to choose placement' : 'انقر لاختيار موضع الطباعة'}
                    >
                      <AlertCircle size={13} className="text-amber-600 shrink-0" />
                      <span id="activePlacementName">
                        {locale === 'tr' ? 'Henüz baskı alanı seçilmedi' : locale === 'en' ? 'No placement selected yet' : 'لم يتم اختيار موضع بعد'}
                      </span>
                    </button>
                  )}

                  {/* CURRENT FACE APPROVED PLACEMENTS: Clean, Organized Segmented Badges */}
                  {!isFreeMode && activeFaceSelectedPlacements.length > 0 && (
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      {activeFaceSelectedPlacements.map((spec) => {
                        const isActive = spec.id === activeGuidelinePlacementId;
                        const dimText = `${spec.dimensions.recommended.widthCm}×${spec.dimensions.recommended.heightCm} cm`;

                        return (
                          <button
                            key={spec.id}
                            type="button"
                            onClick={() => {
                              setFocusedPlacementId(spec.id);
                              setHoveredPlacementId(null);
                            }}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs whitespace-nowrap shrink-0",
                              isActive
                                ? "bg-[var(--color-primary)] text-white shadow-md shadow-orange-500/25 ring-2 ring-orange-400 ring-offset-1 font-black scale-[1.02]"
                                : "bg-white text-slate-700 border border-slate-200 hover:border-orange-300 hover:text-[var(--color-primary)] hover:bg-orange-50/60"
                            )}
                            title={`${spec.nameAr} (${dimText}) - ${isActive ? (locale === 'ar' ? 'الموضع النشط حالياً' : 'Active') : (locale === 'ar' ? 'انقر للتفعيل' : 'Click to activate')}`}
                          >
                            {isActive ? (
                              <Crosshair size={12} className="text-white shrink-0 animate-pulse" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-orange-400 shrink-0 transition-colors" />
                            )}
                            <span>{locale === 'tr' ? spec.nameTr : locale === 'en' ? spec.nameEn : spec.nameAr}</span>
                            <span className={cn("text-[10px] font-mono", isActive ? "text-orange-100" : "text-slate-400")}>
                              ({dimText})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* OTHER FACES QUICK SWITCH TABS (Clean summary of placements on other faces) */}
                  {!isFreeMode && otherFacesSummary.length > 0 && (
                    <>
                      <div className="w-px h-4 bg-slate-200 shrink-0 mx-0.5" />
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {otherFacesSummary.map((group) => (
                          <button
                            key={group.face}
                            type="button"
                            onClick={() => {
                              switchFace(group.face);
                              setFocusedPlacementId(group.firstPlacementId);
                              setHoveredPlacementId(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shadow-2xs transition-all cursor-pointer bg-slate-100/90 hover:bg-orange-50 text-slate-600 hover:text-[var(--color-primary)] border border-slate-200/90 hover:border-orange-300 shrink-0 whitespace-nowrap active:scale-95"
                            title={locale === 'tr' ? `${group.label} yüzeyine geç (${group.count} onaylı baskı alanı)` : locale === 'en' ? `Switch to ${group.label} (${group.count} placements)` : `الانتقال إلى واجهة ${group.label} (${group.count} مواضع معتمدة)`}
                          >
                            <RotateCw size={11} className="text-slate-400 group-hover:text-orange-500 shrink-0 transition-transform group-hover:rotate-180" />
                            <span>{group.label}</span>
                            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                              {group.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions: Toggle Details Info Banner + Add Placement Button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Eye Toggle Button for Placement Info Details Banner */}
                  {hasActivePlacement && (
                    <button
                      type="button"
                      onClick={() => setShowPlacementDetailsBar(!showPlacementDetailsBar)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer shadow-2xs whitespace-nowrap shrink-0 active:scale-95 border",
                        showPlacementDetailsBar
                          ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300/80"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300/70"
                      )}
                      title={
                        showPlacementDetailsBar
                          ? (locale === 'tr' ? 'Baskı açıklama şeridini gizle' : locale === 'en' ? 'Hide placement info banner' : 'إخفاء شريط توضيح الموضع')
                          : (locale === 'tr' ? 'Baskı açıklama şeridini göster' : locale === 'en' ? 'Show placement info banner' : 'إظهار شريط توضيح الموضع')
                      }
                    >
                      {showPlacementDetailsBar ? (
                        <Eye size={13} className="text-amber-600 shrink-0" />
                      ) : (
                        <EyeOff size={13} className="text-slate-400 shrink-0" />
                      )}
                      <span className="hidden sm:inline text-[11px]">
                        {showPlacementDetailsBar
                          ? (locale === 'tr' ? 'Açıklamayı Gizle' : locale === 'en' ? 'Hide Info' : 'إخفاء التوضيح')
                          : (locale === 'tr' ? 'Açıklamayı Göster' : locale === 'en' ? 'Show Info' : 'إظهار التوضيح')}
                      </span>
                    </button>
                  )}

                  {/* Trigger Placements Guide / Add Placement Button */}
                  <button
                    type="button"
                    id="openPlacementGuideBtn"
                    onClick={() => setIsPlacementGuideModalOpen(true)}
                    className={cn(
                      "cursor-pointer transition-all duration-300 flex items-center gap-1.5 shrink-0 whitespace-nowrap active:scale-95",
                      !hasActivePlacement
                        ? "px-3.5 py-1.5 rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white font-black text-xs shadow-md shadow-orange-500/30 ring-2 ring-orange-400/80 ring-offset-1 animate-pulse hover:scale-105"
                        : "px-3 py-1 rounded-full bg-orange-50 hover:bg-orange-100 border border-orange-200 text-xs text-[var(--color-primary)] font-bold shadow-2xs"
                    )}
                  >
                    <Sparkles size={13} className={!hasActivePlacement ? "text-amber-100 animate-spin" : "text-[var(--color-primary)]"} style={{ animationDuration: '3s' }} />
                    <span>
                      {hasActivePlacement
                        ? (locale === 'tr' ? '+ Alan Ekle' : locale === 'en' ? '+ Add Placement' : '+ إضافة موضع')
                        : (locale === 'tr' ? 'Baskı Alanı Rehberi' : locale === 'en' ? 'Placement Guide' : 'دليل المواضع المعتمدة')}
                    </span>
                    {allSelectedPlacements.length > 0 && (
                      <span className="ms-0.5 px-1.5 py-0.2 rounded-full bg-orange-200/80 text-[var(--color-primary)] text-[10px] font-black">
                        {allSelectedPlacements.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Specialized Mug Studio Controls Bar (360° Full Wrap / Single / Two-Sided + Docked Transform Bar + 3D) */}
          {studioProfile.family === 'mug' && !isFreeMode && (
            <MugStudioControlsBar
              activeMode={activeMugMode}
              activeFace={activeFace}
              mugMeta={mugMeta}
              showLive3DPanel={showLive3DPanel}
              onToggleLive3DPanel={() => setShowLive3DPanel((v) => !v)}
              onSelectMode={handleSelectMugMode}
              onDuplicateToOpposite={handleDuplicateMugFaceToOpposite}
              onOpen3DPreview={handlePreview}
              centerSlot={activeObject ? renderActiveObjectToolbar('docked') : undefined}
            />
          )}

          {/* Main Interactive Stage Container */}
          <div
            ref={canvasContainerRef}
            className={cn(
              "flex-1 min-h-0 relative flex flex-col items-center overflow-hidden select-none",
              isMugPanoramicWorkspace
                ? "justify-start pt-1 sm:pt-1.5 pb-16 md:pb-[108px] px-1 sm:px-2 lg:ps-4 xl:ps-6 lg:pe-40 xl:pe-44 2xl:pe-48"
                : "justify-start lg:justify-center pt-0 sm:pt-1 pb-10 lg:pb-6 px-1 sm:px-2"
            )}
          >
            {/* Panoramic 360° Quick Actions Strip (Mobile Horizontal Bar, Desktop Vertical Left Dock) */}
            {isMugPanoramicWorkspace && (
              <MugPanoramicQuickBar
                hasActiveObject={Boolean(activeObject)}
                mobileView={mobilePanoramaView}
                onChangeMobileView={setMobilePanoramaView}
                onFillPanorama={handleFillPanoramaWrap}
                onSnapToZone={handleSnapPanoramaZone}
              />
            )}

            {/* Mobile Inline Transform Controls when Panorama Quick Bar is shown */}
            {isMugPanoramicWorkspace && mobilePanoramaView === '2d' && activeObject && (
              <div className="lg:hidden w-full flex justify-center px-1 pb-1 shrink-0 z-30">
                {renderActiveObjectToolbar('inline')}
              </div>
            )}

            {/* Live Synchronized Cylindrical 3D Mug Panel (Desktop / Tablet Dock above 2D Unwrapped Sheet) */}
            {isMugPanoramicWorkspace && showLive3DPanel && (
              <div className="hidden lg:flex w-full justify-center mb-1 z-20 shrink-0">
                <MugLivePanoramaPanel
                  compact={true}
                  frontDesignUrl={liveMugTextureUrl}
                  mugMeta={mugMeta}
                  selectedColorHex={COLOR_MAP[(selectedColor || '').toLowerCase()] || selectedColor || '#ffffff'}
                  selectedCapacity={selectedSize}
                  externalYawRequest={liveYawRequest}
                  onExpand3DModal={handlePreview}
                  onHideLive3D={() => setShowLive3DPanel(false)}
                />
              </div>
            )}

            {/* Mobile Live Cylindrical 3D Mug Full View (keeps Fabric <canvas> alive in background) */}
            {isMugPanoramicWorkspace && mobilePanoramaView === '3d' && (
              <div className="flex lg:hidden w-full flex-1 min-h-0 justify-center items-center py-2 px-1 z-20">
                <MugLivePanoramaPanel
                  compact={false}
                  frontDesignUrl={liveMugTextureUrl}
                  mugMeta={mugMeta}
                  selectedColorHex={COLOR_MAP[(selectedColor || '').toLowerCase()] || selectedColor || '#ffffff'}
                  selectedCapacity={selectedSize}
                  externalYawRequest={liveYawRequest}
                  onExpand3DModal={handlePreview}
                />
              </div>
            )}
            {/* FLOATING USER MEDIA / "تصاميمي" DRAWER */}
            <UserMediaSidebar
              userUploads={userUploads}
              recentAssets={recentAssets}
              onSelectUpload={handleSelectUpload}
              onSelectRecentAsset={handleSelectRecentAsset}
              onUploadFile={processImageFile}
              onDeleteUpload={handleDeleteUpload}
              onDeleteRecent={handleDeleteRecent}
              isUploading={isUploading}
              locale={locale}
            />

            {/* TYPEWRITER ANIMATED ONBOARDING HINT BANNER - CENTERED OVER CANVAS */}
            {showTypewriterHint && !validationWarning && !activeObject && guidanceTips.length > 0 && (
              <div
                id="typewriterHintBanner"
                onClick={() => setTypewriterIndex(prev => (prev + 1) % guidanceTips.length)}
                className="absolute top-3 left-1/2 -translate-x-1/2 z-25 flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white rounded-full shadow-lg shadow-orange-500/25 border border-amber-300/60 cursor-pointer select-none whitespace-nowrap active:scale-95 transition-all max-w-[95%] sm:max-w-xl animate-in fade-in slide-in-from-top-2 duration-300"
                title={locale === 'tr' ? 'Sonraki bilgiye geç' : locale === 'en' ? 'Click for next tip' : 'اضغط للانتقال للمعلومة التالية'}
              >
                <span className="text-sm shrink-0 drop-shadow-xs">
                  {guidanceTips[typewriterIndex % guidanceTips.length]?.icon || '✨'}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-black/25 text-amber-200 px-1.5 py-0.5 rounded-md shrink-0 hidden sm:inline-block">
                  {guidanceTips[typewriterIndex % guidanceTips.length]?.tag}
                </span>
                <span className="text-[11.5px] sm:text-xs font-bold font-heading truncate">
                  {guidanceTips[typewriterIndex % guidanceTips.length]?.text}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTypewriterHint(false);
                  }}
                  className="ms-1.5 p-0.5 rounded-full hover:bg-black/25 text-amber-100 hover:text-white transition cursor-pointer shrink-0"
                  title={t('close', { fallback: 'إغلاق' })}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Floating Transform Controls Toolbar for Active Selected Object */}
            {activeObject && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md text-white rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-2 text-xs border border-slate-700/80 z-30 animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap">
                <button
                  type="button"
                  onClick={handleCenterHorizontal}
                  className="hover:text-amber-400 transition cursor-pointer p-1"
                  title={locale === 'tr' ? 'Yatay Ortala' : locale === 'en' ? 'Center Horizontally' : 'توسيط أفقي'}
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleCenterVertical}
                  className="hover:text-amber-400 transition cursor-pointer p-1"
                  title={locale === 'tr' ? 'Dikey Ortala' : locale === 'en' ? 'Center Vertically' : 'توسيط عمودي'}
                >
                  <ArrowUpDown size={14} />
                </button>
                <span className="w-px h-3.5 bg-slate-700" />
                <button
                  type="button"
                  onClick={handleDuplicateActive}
                  className="hover:text-amber-400 transition cursor-pointer p-1"
                  title={locale === 'tr' ? 'Çoğalt' : locale === 'en' ? 'Duplicate' : 'تكرار العنصر'}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleToggleLockActive}
                  className="hover:text-amber-400 transition cursor-pointer p-1"
                  title={locale === 'tr' ? 'Kilitle / Kilidi Aç' : locale === 'en' ? 'Lock / Unlock' : 'قفل / فك قفل'}
                >
                  {activeObject.lockMovementX ? <Lock size={14} className="text-amber-400" /> : <Unlock size={14} />}
                </button>
                <span className="w-px h-3.5 bg-slate-700" />
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="hover:text-red-400 text-red-400 transition cursor-pointer p-1"
                  title={t('delete', { fallback: 'حذف' })}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            {/* Out-of-Bounds Notification Banner */}
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

            {/* MOCKUP STAGE & EXTENDED FABRIC CANVAS */}
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
                "relative w-full max-w-[660px] md:max-w-[740px] lg:max-w-[820px] xl:max-w-[890px] 2xl:max-w-[960px] flex-1 min-h-0 items-start lg:items-center justify-center select-none",
                liveDimensions && activeObject && (liveDimensions.isScaling || isObjectDragging) ? "z-30" : "",
                isMugPanoramicWorkspace
                  ? "overflow-visible pt-1 pb-7 px-6 sm:px-7"
                  : "overflow-hidden pt-0.5 sm:pt-2 px-1 sm:px-2 pb-1 sm:pb-2",
                isMugPanoramicWorkspace && mobilePanoramaView === '3d' ? "hidden lg:flex" : "flex",
                isPanMode ? "cursor-grab active:cursor-grabbing" : ""
              )}
            >
              <div
                className="relative flex items-center justify-center transition-transform duration-75 origin-top select-none"
                style={{
                  width: stageSize ? `${stageSize.width}px` : undefined,
                  height: stageSize ? `${stageSize.height}px` : '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  aspectRatio: `${nativeWidth} / ${nativeHeight}`,
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                }}
              >
                {/* Base Stage Surface: True Unwrapped 23x9.5 Ceramic Sheet in 360° Wrap Mode, or Product Mockup Image */}
                {isMugPanoramicWorkspace ? (
                  <MugPanoramicSheetBackdrop
                    mugMeta={mugMeta}
                    selectedColorHex={COLOR_MAP[(selectedColor || '').toLowerCase()] || selectedColor || '#ffffff'}
                  />
                ) : (
                  <img
                    src={currentFaceMockupUrl}
                    alt={`${activeFace} view`}
                    crossOrigin="anonymous"
                    onLoad={(e) => {
                      const nw = e.currentTarget.naturalWidth;
                      const nh = e.currentTarget.naturalHeight;
                      if (nw > 0 && nh > 0) {
                        setMockupNaturalSize((prev) => (prev.width === nw && prev.height === nh ? prev : { width: nw, height: nh }));
                      }
                    }}
                    className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none rounded-lg drop-shadow-md"
                  />
                )}

                {/* Approved Print Placements Overlays */}
                {!isFreeMode && activeFaceSelectedPlacements.length > 0 && (
                  <div className="absolute inset-0 w-full h-full pointer-events-none z-15">
                    {activeFaceSelectedPlacements.map((spec) => {
                      // When multiple placements exist on this face, only show the actual/active zone
                      if (activeFaceSelectedPlacements.length > 1 && spec.id !== activeGuidelinePlacementId) {
                        return null;
                      }

                      const isHovered = hoveredPlacementId === spec.id;
                      const isVisible = showSafeZone || isObjectDragging || isHovered;

                      if (!isVisible) return null;

                      const pBounds = getPlacementFabricBounds(spec);
                      const leftPercent = (pBounds.fabricLeft / nativeWidth) * 100;
                      const topPercent = (pBounds.fabricTop / nativeHeight) * 100;
                      const widthPercent = (pBounds.fabricWidth / nativeWidth) * 100;
                      const heightPercent = (pBounds.fabricHeight / nativeHeight) * 100;
                      const displayWidthCm = pBounds.calibratedWidthCm ?? spec.dimensions.recommended.widthCm;
                      const displayHeightCm = pBounds.calibratedHeightCm ?? spec.dimensions.recommended.heightCm;
                      const displayOffsetCm = spec.offsetFromCollarCm;

                      return (
                        <div
                          key={spec.id}
                          className={cn(
                            "absolute border-2 border-dashed pointer-events-none transition-all duration-200 animate-in fade-in",
                            isHovered
                              ? "border-amber-400 bg-amber-400/20 ring-4 ring-amber-400/60 shadow-xl scale-[1.01] z-20"
                              : "border-[var(--color-primary)]/80 bg-[var(--color-primary)]/5 rounded-2xl z-10"
                          )}
                          style={{
                            left: `${leftPercent}%`,
                            top: `${topPercent}%`,
                            width: `${widthPercent}%`,
                            height: `${heightPercent}%`,
                          }}
                        >
                          {spec.id === 'mug_full_wrap' && showSafeZone && (
                            <MugPanoramicGuidesOverlay
                              canvasBox={{
                                leftPercent: 0,
                                topPercent: 0,
                                maxWidthPercent: 100,
                                maxHeightPercent: 100,
                              }}
                              handleMarginCm={mugMeta.handleMarginCm}
                              visible={true}
                            />
                          )}
                          {/* Badge label rendered OUTSIDE the print box so it never obscures the artwork */}
                          {showPlacementDetailsBar && spec.id !== 'mug_full_wrap' && (
                            <div
                              className={cn(
                                "absolute text-white text-[9px] sm:text-[10px] font-bold ps-3 pe-1.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 border whitespace-nowrap z-20 transition-all pointer-events-auto select-none",
                                isHovered
                                  ? "bg-amber-500 border-white text-white ring-2 ring-amber-300 animate-pulse"
                                  : "bg-slate-900/90 backdrop-blur-md border-amber-400 text-white shadow-black/40",
                                spec.id === 'back_collar'
                                  ? "-bottom-7 sm:-bottom-8 left-1/2 -translate-x-1/2"
                                  : "-top-7 sm:-top-8 left-1/2 -translate-x-1/2"
                              )}
                            >
                              <span>{isHovered ? '🎯' : '📍'}</span>
                              <span>{locale === 'tr' ? spec.nameTr : locale === 'en' ? spec.nameEn : spec.nameAr}</span>
                              {isHovered ? (
                                <span className="font-black text-amber-100">
                                  ({locale === 'tr' ? 'Bırak ve Yerleştir' : locale === 'en' ? 'Drop Here' : 'إفلات لتثبيت التصميم'})
                                </span>
                              ) : (
                                <>
                                  <span className="opacity-60">•</span>
                                  <span dir="ltr">{displayWidthCm}×{displayHeightCm} cm</span>
                                  {studioProfile.family === 'apparel' && (displayOffsetCm ?? 0) > 0 && (
                                    <>
                                      <span className="opacity-60">•</span>
                                      <span className="flex items-center gap-0.5 text-amber-200">
                                        <Ruler size={9} />
                                        {locale === 'tr' ? `${displayOffsetCm} cm` : locale === 'en' ? `${displayOffsetCm} cm` : `${displayOffsetCm} سم`}
                                      </span>
                                    </>
                                  )}
                                </>
                              )}

                              {/* Close button directly on the badge */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowPlacementDetailsBar(false);
                                }}
                                className="ms-1 p-0.5 rounded-full hover:bg-white/25 text-white/70 hover:text-white transition cursor-pointer"
                                title={locale === 'tr' ? 'Etiketi Gizle' : locale === 'en' ? 'Hide Info Banner' : 'إخفاء شريط التوضيح'}
                              >
                                <X size={11} strokeWidth={2.5} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Free Mode Full Face Active Guideline Overlay */}
                {isFreeMode && (showSafeZone || isObjectDragging) && (
                  <div className="absolute inset-0 w-full h-full pointer-events-none z-15">
                    <div
                      className={cn(
                        "absolute border-2 border-dashed pointer-events-none transition-all duration-300",
                        isObjectOutOfBounds
                          ? "border-red-500 ring-4 ring-red-400/40 bg-transparent rounded-3xl"
                          : "border-amber-500/80 bg-amber-500/5 rounded-3xl"
                      )}
                      style={{
                        left: `${(freePrintZone.left / nativeWidth) * 100}%`,
                        top: `${(freePrintZone.top / nativeHeight) * 100}%`,
                        width: `${(freePrintZone.width / nativeWidth) * 100}%`,
                        height: `${(freePrintZone.height / nativeHeight) * 100}%`,
                      }}
                    >
                      {showPlacementDetailsBar && (
                        <div className="absolute -top-7 sm:-top-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-600 to-orange-600 text-white text-[9px] sm:text-[10px] font-black ps-3 pe-1.5 py-0.5 rounded-full shadow-md flex items-center gap-1.5 border border-amber-300 z-20 whitespace-nowrap pointer-events-auto">
                          <Sparkles size={11} className="text-amber-200" />
                          <span>
                            {locale === 'tr' ? 'Serbest Mod (Tam Yüzey)' : locale === 'en' ? 'Free Mode (Full Face)' : 'الوضع الحر (كامل الواجهة)'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowPlacementDetailsBar(false);
                            }}
                            className="ms-1 p-0.5 rounded-full hover:bg-white/25 text-white/70 hover:text-white transition cursor-pointer"
                            title={locale === 'tr' ? 'Etiketi Gizle' : locale === 'en' ? 'Hide Info Banner' : 'إخفاء شريط التوضيح'}
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Extended Fabric Canvas Layer Container */}
                <div
                  className={cn(
                    "absolute inset-0 w-full h-full pointer-events-auto overflow-hidden",
                    "[&_.canvas-container]:!w-full [&_.canvas-container]:!h-full [&_canvas]:!w-full [&_canvas]:!h-full",
                    (selectedColor === 'black' || selectedColor === 'navy' || selectedColor === '#000000' || selectedColor === '#1E3A8A')
                      ? "[&_.upper-canvas]:mix-blend-normal [&_.lower-canvas]:mix-blend-normal opacity-[0.98]"
                      : "[&_.lower-canvas]:mix-blend-multiply [&_.lower-canvas]:opacity-[0.95] [&_.upper-canvas]:mix-blend-normal"
                  )}
                  style={{ width: '100%', height: '100%', top: '0%', left: '0%' }}
                >
                  <div className="w-full h-full relative origin-top-left" style={{ transform: 'scale(1)' }}>
                    <div className="w-full h-full absolute inset-0 z-20 pointer-events-auto">
                      <canvas ref={canvasRef} className="w-full h-full relative bg-transparent" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* FLOATING ZOOM DOCK (Visible and fully interactive on both Mobile & Desktop) */}
            <div className="flex absolute bottom-14 sm:bottom-6 start-2 sm:start-6 items-center bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg rounded-2xl p-0.5 sm:p-1 gap-0.5 sm:gap-1 text-slate-700 z-20 select-none">
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer active:scale-95 disabled:opacity-40"
                title={t('zoomIn')}
              >
                <Plus size={14} />
              </button>
              <span className="text-[11px] sm:text-xs font-mono font-bold px-1 sm:px-1.5 text-slate-800 min-w-[30px] sm:min-w-[36px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 1 && panOffset.x === 0 && panOffset.y === 0}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer active:scale-95 disabled:opacity-40"
                title={t('zoomOut')}
              >
                <Minus size={14} />
              </button>
              <div className="w-px h-3.5 sm:h-4 bg-slate-200" />
              <button
                type="button"
                onClick={() => setIsPanMode(!isPanMode)}
                className={cn(
                  "w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition cursor-pointer active:scale-95",
                  isPanMode ? "bg-[var(--color-primary)] text-white shadow-xs" : "hover:bg-slate-100 hover:text-slate-900"
                )}
                title={t('panTool')}
              >
                <Hand size={14} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 hover:text-slate-900 transition text-[var(--color-primary)] cursor-pointer active:scale-95"
                title={t('resetZoom')}
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {/* Subtle Size Calibration watermark label (Raised cleanly above perspective switcher) */}
            <div className={cn(
              "absolute left-1/2 -translate-x-1/2 text-[10px] sm:text-[11px] font-mono font-medium text-slate-500 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/90 shadow-xs pointer-events-none z-10 whitespace-nowrap hidden md:flex items-center gap-1.5 transition-all",
              availableFaces.length > 1 ? "bottom-[76px] sm:bottom-[82px]" : "bottom-4 sm:bottom-6"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>
                {locale === 'tr' 
                  ? `1:1 Gerçek Ölçek • ${dynamicPrintMethod} Termal Baskı` 
                  : locale === 'en' 
                  ? `1:1 Real Scale • High-Res ${dynamicPrintMethod} Print` 
                  : `مقياس حقيقي 1:1 • طباعة حرارية ${dynamicPrintMethod} أصلية متطورة`}
              </span>
            </div>

            {/* PERSPECTIVE SWITCHER (Bottom Center, sleek mobile pill) */}
            {availableFaces.length > 1 && (
              <div className="absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg shadow-slate-900/5 rounded-2xl p-1 sm:p-1.5 flex items-center gap-1 sm:gap-1.5 z-25 select-none max-w-[95%] overflow-x-auto no-scrollbar">
                {availableFaces.map((face) => {
                  const f = (face || '').trim().toLowerCase();
                  const label = f === 'front' ? (locale === 'tr' ? 'Ön Yüz' : locale === 'en' ? 'Front' : 'الواجهة الأمامية') :
                                f === 'back' ? (locale === 'tr' ? 'Arka Yüz' : locale === 'en' ? 'Back' : 'الجهة الخلفية') :
                                f === 'other' ? tMug('faceOtherLabel') :
                                f === 'right_shoulder' ? (locale === 'tr' ? 'Sağ Kol' : locale === 'en' ? 'Right Sleeve' : 'الكتف الأيمن') :
                                f === 'left_shoulder' ? (locale === 'tr' ? 'Sol Kol' : locale === 'en' ? 'Left Sleeve' : 'الكتف الأيسر') :
                                t(face, { fallback: face });
                  const isActive = activeFace === face;
                  const isLocked = isMugFaceLocked(face);
                  const isTwoSidedIncluded = studioProfile.family === 'mug'
                    && activeMugMode === 'mug_two_sided'
                    && (isFaceMatching('front', face) || isFaceMatching('back', face));
                  const lockTitle = isLocked
                    ? (activeMugMode === 'mug_full_wrap' ? tMug('faceLockedFullWrap') : tMug('faceLockedTwoSided'))
                    : undefined;

                  return (
                    <button
                      key={face}
                      type="button"
                      disabled={isLocked}
                      aria-disabled={isLocked}
                      title={lockTitle}
                      onClick={() => handleBottomFaceSelect(face)}
                      className={cn(
                        "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1 sm:py-2 rounded-xl font-bold text-xs transition whitespace-nowrap",
                        isLocked
                          ? "opacity-45 bg-slate-100/80 text-slate-400 cursor-not-allowed"
                          : isTwoSidedIncluded
                            ? isActive
                              ? "bg-blue-600 text-white shadow-xs ring-2 ring-blue-300/80 cursor-pointer active:scale-95"
                              : "bg-blue-50 text-blue-700 ring-1 ring-blue-300 hover:bg-blue-100 cursor-pointer active:scale-95"
                            : isActive
                              ? "bg-slate-900 text-white shadow-xs cursor-pointer active:scale-95"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer active:scale-95"
                      )}
                    >
                      {isLocked ? (
                        <Lock className="w-3 h-3 shrink-0 opacity-75" />
                      ) : isTwoSidedIncluded ? (
                        <span
                          className={cn(
                            "inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0",
                            isActive ? "bg-white text-blue-600" : "bg-blue-600 text-white"
                          )}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      ) : (
                        isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                      )}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Mobile Backdrop Overlay for Layers/Settings Drawer */}
        {(activeMobileTab === 'layers' || activeMobileTab === 'properties') && (
          <div 
            onClick={() => setActiveMobileTab(null)} 
            className="lg:hidden fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs transition-opacity duration-200" 
          />
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* COLUMN 3: RIGHT PRODUCT INSPECTOR & CONFIGURATION PANEL                    */}
        {/* ------------------------------------------------------------------------- */}
        <aside 
          className={cn(
            "bg-white flex flex-col z-50 transition-all duration-300",
            // Desktop: normal 3-column right sidebar
            "lg:w-80 xl:w-88 lg:border-s lg:border-slate-200 lg:shrink-0 lg:relative lg:flex lg:h-full lg:shadow-none lg:z-auto overflow-hidden",
            // Mobile: Bottom Sheet Drawer (Slides up from bottom - exact match to Image 3)
            (activeMobileTab === 'layers' || activeMobileTab === 'properties')
              ? "fixed inset-x-0 bottom-0 h-[82dvh] max-h-[82dvh] rounded-t-3xl shadow-2xl border-t border-slate-200 flex flex-col z-[100] animate-in slide-in-from-bottom duration-200 overflow-hidden bg-white"
              : "hidden lg:flex"
          )}
        >
          {/* Mobile Bottom Sheet Header Bar (Icon + Title + Subtitle + Clear Close Button) - Matching Image 3 */}
          <div className="lg:hidden flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 bg-white shrink-0 select-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-700 to-slate-900 flex items-center justify-center text-white shadow-md shadow-slate-900/20 shrink-0">
                <Settings size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-gray-900 font-heading">
                    {locale === 'tr' ? 'Katmanlar ve Renk Seçimi' : locale === 'en' ? 'Layers & Settings' : 'الطبقات والتحكم بالمنتج'}
                  </h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-300">
                    {locale === 'tr' ? 'Katmanlar' : locale === 'en' ? 'Layers' : 'الطبقات'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {locale === 'tr' ? 'Katman sıralaması, renk seçimi ve ürün detayları' : locale === 'en' ? 'Manage layers, garment color & specs' : 'التحكم بالعناصر والطبقات، تفاصيل وخيارات المنتج'}
                </p>
              </div>
            </div>

            {/* Clear Close Button matching Image 3 */}
            <button
              type="button"
              onClick={() => setActiveMobileTab(null)}
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-all cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Content Container for Desktop & Mobile */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-8 lg:pb-0">
          
          {/* Color Variations */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>{studioProfile.getColorFieldLabel(locale)}</span>
                <span className="text-slate-900 font-bold" id="selected-color-name">
                  {getLocalizedColorName(selectedColor, locale)}
                </span>
              </label>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {availableColors.map((c: string) => {
                const isSelected = isColorEqual(selectedColor, c);
                const inStock = isColorAvailable(c);
                const bgColor = c === 'white' ? '#FFFFFF' : c === 'black' ? '#111317' : c === 'navy' ? '#1e293b' : c === 'grey' ? '#4b5563' : c;
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
                      "w-8 h-8 rounded-full transition-all relative flex items-center justify-center shadow-xs cursor-pointer",
                      !inStock
                        ? "opacity-30 cursor-not-allowed border border-gray-300 ring-1 ring-red-400"
                        : isSelected
                          ? "ring-2 ring-offset-2 ring-[var(--color-primary)] scale-110 shadow-md"
                          : "border border-slate-300 hover:scale-105"
                    )}
                    style={{ backgroundColor: bgColor }}
                    title={!inStock ? `${cName} (${locale === 'tr' ? 'Tükendi' : locale === 'en' ? 'Out of Stock' : 'نفذت الكمية'})` : cName}
                  >
                    {isSelected && (
                      <Check size={12} className={cn((c === 'white' || bgColor === '#FFFFFF' || bgColor === '#fff') ? "text-slate-900" : "text-white")} />
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

            {/* Sync Across Selected Colors Toggle */}
            {uniqueSelectedColors.length > 1 && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles size={13} className={cn("shrink-0", syncAllColors ? "text-amber-500 animate-pulse" : "text-gray-400")} />
                  <span className="text-[11px] font-bold text-gray-700 truncate">
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
                    "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    syncAllColors ? "bg-amber-500" : "bg-gray-200 hover:bg-gray-300"
                  )}
                  role="switch"
                  aria-checked={syncAllColors}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out",
                      syncAllColors ? (locale === 'ar' ? "-translate-x-3.5" : "translate-x-3.5") : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Size Selection & Multi-Quantity Stepper Link */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                {locale === 'tr' ? 'İstenen Beden:' : locale === 'en' ? 'Selected Size:' : 'المقاس المطلوب:'}
              </label>
              <button
                type="button"
                id="openSizeGuideLink"
                onClick={() => setIsSizeGuideModalOpen(true)}
                className="text-xs font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Ruler size={12} />
                <span>{locale === 'tr' ? 'Beden Tablosu' : locale === 'en' ? 'Size Guide' : 'دليل القياسات الدقيقة'}</span>
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {['S', 'M', 'L', 'XL', '2XL', '3XL'].map((s: string) => {
                const isSelected = (selectedSize || '').trim().toUpperCase() === s;
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
                      "size-btn py-2 rounded-xl text-xs font-bold transition cursor-pointer",
                      !inStock
                        ? "opacity-35 line-through cursor-not-allowed bg-transparent text-gray-400 border border-slate-200"
                        : isSelected
                          ? "bg-slate-900 text-white border border-slate-900 font-black shadow-xs scale-100"
                          : "border border-slate-200 text-slate-600 hover:border-slate-400"
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            {/* Multi-Size Matrix Trigger Link */}
            <button
              type="button"
              onClick={() => setIsMatrixModalOpen(true)}
              className="w-full mt-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-[11px] rounded-xl transition flex items-center justify-center gap-1.5 border border-amber-300/80 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
            >
              <Layers size={13} className="text-amber-600 shrink-0" />
              <span>
                {variantMatrix && variantMatrix.length > 1
                  ? (locale === 'tr' ? `${totalOrderQuantity} Adet (Çoklu Beden Seçildi)` : locale === 'en' ? `${totalOrderQuantity} Pcs (Multi-Size Selected)` : `${totalOrderQuantity} قطع (مقاسات متعددة)`)
                  : (locale === 'tr' ? 'Çoklu Beden & Adet Matrisi Seç' : locale === 'en' ? 'Multi-Size & Quantity Matrix' : 'تعدد المقاسات والكميات')}
              </span>
            </button>
          </div>

          {/* Print Technology Switcher (When product supports Customer Choice) */}
          {isCustomerChoiceAllowed && (
            <div className="p-4 border-b border-slate-100 space-y-2.5 bg-gradient-to-b from-white to-slate-50/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-[var(--color-primary)]" />
                  <span>{locale === 'tr' ? 'Baskı Teknolojisi Seçimi:' : locale === 'en' ? 'Print Technology Choice:' : 'اختيار تقنية الطباعة:'}</span>
                </span>
                {isCurrentColorDark ? (
                  <span className="text-[10px] text-amber-800 bg-amber-100/80 border border-amber-200 font-bold px-2 py-0.5 rounded-full">
                    {locale === 'tr' ? 'Koyu Kumaş (DTF Zorunlu)' : locale === 'en' ? 'Dark Garment (DTF Required)' : 'قماش داكن (DTF إجباري)'}
                  </span>
                ) : (
                  <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 font-semibold px-2 py-0.5 rounded-full">
                    {locale === 'tr' ? '2 Yöntem Uygun' : locale === 'en' ? '2 Methods Available' : 'متاح الخياران'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* DTF Option */}
                <button
                  type="button"
                  onClick={() => handleSelectPrintMethod('DTF')}
                  className={cn(
                    "p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1",
                    selectedPrintMethod === 'DTF'
                      ? "bg-white border-orange-500 shadow-xs ring-1 ring-orange-200 text-orange-950 font-bold"
                      : "bg-white/60 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300 font-medium"
                  )}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <span>🔥</span>
                    <span>{locale === 'tr' ? 'DTF Termal' : locale === 'en' ? 'DTF Thermal' : 'DTF حراري'}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 leading-tight">
                    {locale === 'tr' ? 'Tüm kumaş ve renklere uygun' : locale === 'en' ? 'All fabrics & colors' : 'لكافة الأقمشة والألوان'}
                  </span>
                </button>

                {/* Sublimation Option */}
                <button
                  type="button"
                  onClick={() => handleSelectPrintMethod('Sublimation')}
                  disabled={isCurrentColorDark}
                  className={cn(
                    "p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1",
                    isCurrentColorDark
                      ? "bg-slate-100/70 border-dashed border-slate-300 text-slate-400 opacity-60 cursor-not-allowed font-normal"
                      : selectedPrintMethod === 'Sublimation'
                      ? "bg-white border-blue-500 shadow-xs ring-1 ring-blue-200 text-blue-950 cursor-pointer font-bold"
                      : "bg-white/60 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300 cursor-pointer font-medium"
                  )}
                  title={isCurrentColorDark ? (locale === 'tr' ? 'Koyu kumaşlarda süblimasyon yapılamaz' : locale === 'en' ? 'Sublimation requires light fabrics' : 'السبليميشن يتطلب ألواناً فاتحة') : undefined}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <span>☕</span>
                    <span>{locale === 'tr' ? 'Süblimasyon' : locale === 'en' ? 'Sublimation' : 'سبليميشن'}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 leading-tight">
                    {isCurrentColorDark
                      ? (locale === 'tr' ? 'Sadece açık renkler' : locale === 'en' ? 'Light fabrics only' : 'للألوان الفاتحة فقط')
                      : (locale === 'tr' ? 'Kumaşa işleyen, sıfır his' : locale === 'en' ? 'Zero-feel, breathable' : 'تغلغل كامل بدون ملمس')}
                  </span>
                </button>
              </div>

              {/* Informative Hint */}
              <div className="text-[10.5px] leading-normal px-0.5">
                {selectedPrintMethod === 'Sublimation' ? (
                  <span className="text-blue-700">
                    ℹ️ {locale === 'tr'
                      ? 'Süblimasyon baskı kumaş liflerine nüfuz eder, nefes alır ve yıkamalarda dökülme yapmaz.'
                      : locale === 'en'
                      ? 'Sublimation infuses directly into fabric fibers with zero hand feel and great breathability.'
                      : 'طباعة السبليميشن تتغلغل في مسام القماش بدون أي ملمس وذات تهوية ممتازة.'}
                  </span>
                ) : (
                  <span className="text-orange-800">
                    ℹ️ {locale === 'tr'
                      ? 'DTF termal baskı, beyaz alt tabakası sayesinde her renk kumaşta en canlı ve net sonuçları verir.'
                      : locale === 'en'
                      ? 'DTF print uses opaque white backing for maximum vibrancy on any garment color.'
                      : 'طباعة DTF الحرارية توفر أعلى درجات التشبع اللوني بفضل طبقة التأسيس البيضاء.'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Active Print Locations */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                {locale === 'tr' ? 'Baskı Alanları:' : locale === 'en' ? 'Print Locations:' : 'مواضع الطباعة المعتمدة:'}
              </span>
              <button
                type="button"
                onClick={() => setIsPlacementGuideModalOpen(true)}
                className="text-[11px] font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
              >
                {allSelectedPlacements.length > 0
                  ? (locale === 'tr' ? 'Değiştir' : locale === 'en' ? 'Change' : 'تعديل المواضع')
                  : (locale === 'tr' ? '+ Alan Ekle' : locale === 'en' ? '+ Add Placement' : '+ إضافة موضع')}
              </button>
            </div>
            <div className="space-y-2">
              {isFreeMode ? (
                <div className="p-2.5 rounded-xl border border-amber-300 bg-amber-50/70 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs font-black shrink-0">🆓</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {locale === 'tr' ? 'Serbest Mod (Tam Yüzey)' : locale === 'en' ? 'Free Mode (Full Canvas)' : 'الوضع الحر (كامل الواجهة)'}
                      </div>
                      <div className="text-[10px] text-amber-800">
                        {locale === 'tr' ? 'Serbest Yerleşim' : locale === 'en' ? 'Custom Positioning' : 'تصميم حر بدون قيود'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleFreeMode(false);
                      setIsPlacementGuideModalOpen(true);
                    }}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline shrink-0 cursor-pointer"
                  >
                    {locale === 'tr' ? 'Standart Seç' : locale === 'en' ? 'Use Standard' : 'اختيار معتمد'}
                  </button>
                </div>
              ) : allSelectedPlacements.length === 0 ? (
                <div 
                  onClick={() => setIsPlacementGuideModalOpen(true)}
                  className="group p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Target size={16} className="text-amber-600" />
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="text-xs font-bold text-slate-800 leading-tight">
                        {locale === 'tr' ? 'Henüz baskı alanı seçilmedi' : locale === 'en' ? 'No placement selected yet' : 'لم يتم تحديد أي موضع طباعة بعد'}
                      </div>
                      <div className="text-[10.5px] text-amber-700 font-medium">
                        {locale === 'tr' ? 'Standart baskı alanı seçmek için tıklayın' : locale === 'en' ? 'Click to choose approved placement' : 'انقر لاختيار موضع معتمد'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[var(--color-primary)] bg-white px-2.5 py-1 rounded-lg border border-orange-200 shrink-0 shadow-2xs group-hover:bg-[var(--color-primary)] group-hover:text-white transition-colors">
                    {locale === 'tr' ? '+ Seç' : locale === 'en' ? '+ Choose' : '+ تحديد'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="max-h-[190px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {allSelectedPlacements.map((spec, idx) => {
                      const isCurrentFace = isFaceMatching(spec.targetFace, activeFace);
                      const extraPrice = getPlacementExtraPrice(spec);

                      return (
                        <div
                          key={spec.id}
                          onClick={() => {
                            if (!isFaceMatching(spec.targetFace, activeFace)) {
                              switchFace(spec.targetFace);
                            }
                            setFocusedPlacementId(spec.id);
                          }}
                          className={cn(
                            "p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer group",
                            isCurrentFace
                              ? "border-orange-300 bg-orange-50/50 shadow-2xs ring-1 ring-orange-200/50"
                              : "border-slate-200 bg-slate-50/70 hover:bg-white hover:border-slate-300"
                          )}
                          title={locale === 'tr' ? 'Bu alana git ve düzenle' : locale === 'en' ? 'Switch to this placement' : 'الانتقال لهذا الموضع وتعديله'}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-orange-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0",
                                  isCurrentFace
                                    ? "bg-[var(--color-primary)] text-white"
                                    : "bg-slate-200 text-slate-700"
                                )}>
                                  {spec.targetFace === 'front' ? (locale === 'tr' ? 'Ön' : locale === 'en' ? 'Front' : 'الأمام') :
                                   spec.targetFace === 'back' ? (locale === 'tr' ? 'Arka' : locale === 'en' ? 'Back' : 'الخلف') :
                                   spec.targetFace === 'right' ? (locale === 'tr' ? 'Sağ Kol' : locale === 'en' ? 'Right' : 'الكتف الأيمن') :
                                   (locale === 'tr' ? 'Sol Kol' : locale === 'en' ? 'Left' : 'الكتف الأيسر')}
                                </span>
                                <span className="text-xs font-bold text-slate-800 truncate">
                                  {locale === 'tr' ? spec.nameTr : locale === 'en' ? spec.nameEn : spec.nameAr}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span dir="ltr" className="font-mono">{spec.dimensions?.recommended?.widthCm}×{spec.dimensions?.recommended?.heightCm} cm</span>
                                <span>•</span>
                                <span>{locale === 'tr' ? `Standart ${dynamicPrintMethod} Baskı` : locale === 'en' ? `Standard ${dynamicPrintMethod} Print` : `طباعة حرارية ${dynamicPrintMethod} قياسية`}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono font-bold text-slate-700">
                              {extraPrice > 0 ? `+${extraPrice} ₺` : (locale === 'tr' ? 'Dahil' : locale === 'en' ? 'Included' : 'مشمول')}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePlacement(spec);
                              }}
                              title={locale === 'tr' ? 'Bu alanı kaldır' : locale === 'en' ? 'Remove this placement' : 'إزالة هذا الموضع'}
                              className="w-5 h-5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPlacementGuideModalOpen(true)}
                    className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-300 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-orange-50/30 text-slate-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-1"
                  >
                    <Plus size={13} />
                    <span>{locale === 'tr' ? 'Yeni Baskı Alanı Ekle' : locale === 'en' ? 'Add Another Placement' : 'إضافة موضع طباعة آخر'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Layers Manager */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Layers size={14} className="text-slate-400" />
                <span>{locale === 'tr' ? 'Katman Yönetimi' : locale === 'en' ? 'Layers Manager' : 'إدارة الطبقات الحالية'}</span>
              </span>
            </div>

            {/* Smart Multi-Placement Lock Guidance Banner */}
            {activeFaceSelectedPlacements.length >= 2 && (
              <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 text-slate-800 space-y-1 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
                  <span className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center text-[10px] shrink-0">
                    <Lock size={11} />
                  </span>
                  <span>{locale === 'tr' ? 'Akıllı İpucu: Çakışmayı Önlemek İçin Kilitle' : locale === 'en' ? 'Smart Tip: Lock Layer to Prevent Snap' : 'ميزة ذكية: قفل الطبقة لمنع التجاذب'}</span>
                </div>
                <p className="text-[10.5px] text-slate-600 leading-snug">
                  {locale === 'tr'
                    ? 'Birden fazla baskı alanı (ör. Sol Göğüs ve Orta Göğüs) seçildiğinde, tamamlanan öğeyi kilitleyerek (🔒) manyetik çekimi önleyebilir ve tasarımı serbestçe yerleştirebilirsiniz.'
                    : locale === 'en'
                    ? 'When using multiple print placements (e.g. Left Chest + Center Chest), lock the finished layer (🔒) to disable magnetic attraction and position elements freely.'
                    : 'عند تفعيل أكثر من موضع متداخل (مثل الصدر الأيسر مع وسط الصدر)، يمكنك قفل الطبقة المكتملة 🔒 لتثبيتها في مكانها ومنع أي سحب أو تجاذب تلقائي.'}
                </p>
              </div>
            )}

            <LayerPanel 
              canvas={canvas} 
              activeObject={activeObject} 
              onSaveHistory={saveHistoryState}
              locale={locale}
              onLockToggleToast={(locked: boolean) => {
                showToast(
                  locked
                    ? (locale === 'tr' ? 'Katman kilitlendi 🔒 - Manyetik çekim devre dışı bırakıldı' : locale === 'en' ? 'Layer locked 🔒 - Magnetic snap disabled' : 'تم قفل الطبقة بنجاح 🔒 - تم إيقاف السحب والمحاذاة التلقائية لها')
                    : (locale === 'tr' ? 'Katman kilidi açıldı 🔓' : locale === 'en' ? 'Layer unlocked 🔓' : 'تم إلغاء قفل الطبقة 🔓'),
                  locked ? 'success' : 'info',
                  3000
                );
              }}
            />
          </div>

          {/* Pricing Summary & Final Order CTA */}
          <div className="p-4 bg-slate-50 mt-auto border-t border-slate-200 space-y-3">
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>{studioProfile.getBasePriceLabel(locale)}</span>
                <span className="font-mono font-medium">{basePrice} ₺</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <span>
                    {locale === 'tr' 
                      ? `Baskı ve Ekstra Alanlar (${dynamicPrintMethod}):` 
                      : locale === 'en' 
                      ? `Placements & ${dynamicPrintMethod} Prints:` 
                      : `إضافات الطباعة (${dynamicPrintMethod}):`}
                  </span>
                  {priceBreakdown && priceBreakdown.breakdown.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowPricePopover(prev => !prev)}
                      className="text-[10px] text-orange-600 hover:text-orange-700 underline font-bold cursor-pointer"
                    >
                      {showPricePopover
                        ? (locale === 'tr' ? '[Gizle]' : locale === 'en' ? '[Hide]' : '[إخفاء]')
                        : (locale === 'tr' ? '[Ayrıntılar]' : locale === 'en' ? '[Details]' : '[التفاصيل]')}
                    </button>
                  )}
                </span>
                <span className="font-mono font-medium">
                  {priceBreakdown && priceBreakdown.totalExtra > 0 ? `+${priceBreakdown.totalExtra} ₺` : '0 ₺'}
                </span>
              </div>

              {/* Collapsible Itemized Price Breakdown */}
              {showPricePopover && priceBreakdown && priceBreakdown.breakdown.length > 1 && (
                <div className="p-2.5 bg-white rounded-xl border border-orange-200 shadow-xs space-y-1 text-[11px] animate-in fade-in duration-150">
                  <div className="text-[10px] font-bold text-slate-400 pb-1 border-b border-slate-100 flex justify-between">
                    <span>{locale === 'tr' ? 'Baskı Kalemleri' : locale === 'en' ? 'Print Items' : 'بنود الطباعة والتخصيص'}</span>
                    <span className="font-mono text-orange-600 font-bold">+{priceBreakdown.totalExtra} ₺</span>
                  </div>
                  {priceBreakdown.breakdown.map((item, bIdx) => (
                    <div key={bIdx} className="flex justify-between items-center text-slate-700 py-0.5">
                      <span className="truncate max-w-[180px] flex items-center gap-1.5">
                        <span>{item.name}</span>
                        {!isFreeMode && item.type === 'free_mode' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              mapFreeModeObjectsToApprovedPlacements(canvas);
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold cursor-pointer transition active:scale-95"
                            title={locale === 'tr' ? 'Onaylı baskı alanına hizala' : locale === 'en' ? 'Align to approved' : 'محاذاة للمعتمد'}
                          >
                            <Target size={10} />
                            <span>{locale === 'tr' ? 'Hizala' : locale === 'en' ? 'Align' : 'محاذاة'}</span>
                          </button>
                        )}
                      </span>
                      <span className="font-mono font-bold text-slate-900 shrink-0">
                        {item.price > 0 ? `+${item.price} ₺` : (locale === 'tr' ? 'Dahil' : locale === 'en' ? 'Included' : 'مشمول')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>{locale === 'tr' ? 'İndirim Kuponu:' : locale === 'en' ? 'Discount:' : 'كوبون فوري للطباعة (خصم):'}</span>
                <span className="font-mono font-bold">- 0 ₺</span>
              </div>
              {totalOrderQuantity > 1 && (
                <div className="border-t border-dashed border-slate-200 pt-1.5 flex justify-between items-center text-slate-500 font-medium text-[11px]">
                  <span>{locale === 'tr' ? 'Birim Fiyat × Adet:' : locale === 'en' ? 'Unit Price × Qty:' : 'سعر القطعة × الكمية:'}</span>
                  <span className="font-mono font-bold text-slate-700">{totalPrice} ₺ × {totalOrderQuantity}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline text-slate-900">
                <span className="font-heading font-black text-sm">{locale === 'tr' ? 'Genel Toplam:' : locale === 'en' ? 'Grand Total:' : 'المجموع الإجمالي:'}</span>
                <div className="text-left">
                  <span id="summaryTotalPrice" className="font-heading font-black text-2xl text-[var(--color-primary)] font-mono">
                    {grandTotalPrice}
                  </span>
                  <span className="text-xs font-bold text-slate-600 mr-1">₺</span>
                  <span className="block text-[10px] text-slate-400 font-normal">
                    {locale === 'tr' ? 'KDV Dahildir' : locale === 'en' ? 'VAT Included' : 'شامل ضريبة القيمة المضافة KDV'}
                  </span>
                </div>
              </div>
            </div>

            {/* Giant Order Confirmation CTA Button */}
            <button
              type="button"
              onClick={() => handleAction('cart')}
              disabled={isSaving || isPreviewLoading}
              className="w-full py-3.5 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[#e04826] text-white font-heading font-bold text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition transform active:scale-98 cursor-pointer disabled:opacity-50"
            >
              {isPreviewLoading && pendingAction === 'cart' ? (
                <>
                  <Loader2 size={18} className="animate-spin shrink-0" />
                  <span>{locale === 'tr' ? 'Önizleme Hazırlanıyor...' : locale === 'en' ? 'Preparing Preview...' : 'جاري تجهيز المعاينة...'}</span>
                </>
              ) : (
                <>
                  <ShoppingCart size={18} className="shrink-0" />
                  <span>{locale === 'tr' ? 'Siparişi Tamamla ve Tasarımı Onayla' : locale === 'en' ? 'Complete Order & Confirm Design' : 'إتمام الطلب وتأكيد التصميم'}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-around pt-1 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Truck size={13} className="text-slate-500" />
                <span>{locale === 'tr' ? '48 Saatte Hızlı Kargo' : locale === 'en' ? '48h Fast Shipping' : 'شحن سريع 48 ساعة'}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <ShieldCheck size={13} className="text-slate-500" />
                <span>{locale === 'tr' ? '100% Renk Kalıcılığı' : locale === 'en' ? '100% Color Fastness' : 'ضمان ثبات الألوان 100%'}</span>
              </span>
            </div>
          </div>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* MOBILE BOTTOM DESIGN DOCK / MOBILE TEXT TOOLBAR (شريط الأدوات السفلي للجوال) */}
        {/* ========================================================================= */}
        {isTextActive && !activeMobileTab ? (
          <div 
            className="lg:hidden fixed bottom-14 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 shadow-2xl flex items-center select-none animate-in slide-in-from-bottom-2 duration-150"
          >
            <MobileTextToolbar
              canvas={canvas}
              activeObject={activeObject}
              onSaveHistory={saveHistoryState}
              locale={locale}
              onDeselect={() => {
                canvas?.discardActiveObject();
                canvas?.requestRenderAll();
                setActiveObject(null);
              }}
              onDelete={deleteSelected}
              onCenter={handleCenterInPlacement}
              onDuplicate={handleDuplicateActive}
              onAddNewText={addText}
            />
          </div>
        ) : (
          <nav className={cn(
            "lg:hidden fixed bottom-14 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 px-1.5 flex items-center justify-around shadow-lg select-none transition-all duration-300 ease-in-out",
            activeMobileTab ? "translate-y-28 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
          )}>
            {/* 1. Stickers / Graphics */}
            <button
              type="button"
              onClick={() => {
                setActiveToolTab('stickers');
                setActiveMobileTab(activeMobileTab === 'tools' && activeToolTab === 'stickers' ? null : 'tools');
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl transition active:scale-95 cursor-pointer",
                activeMobileTab === 'tools' && activeToolTab === 'stickers' ? "text-[var(--color-primary)] font-black" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <LayoutTemplate size={17} className="text-amber-500" />
              <span className="text-[10px] font-bold">{locale === 'tr' ? 'Grafikler' : locale === 'en' ? 'Graphics' : 'الرسومات'}</span>
            </button>

            {/* 2. Upload Design */}
            <button
              type="button"
              onClick={() => {
                setActiveToolTab('upload');
                setActiveMobileTab(activeMobileTab === 'tools' && activeToolTab === 'upload' ? null : 'tools');
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl transition active:scale-95 cursor-pointer",
                activeMobileTab === 'tools' && activeToolTab === 'upload' ? "text-[var(--color-primary)] font-black" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Upload size={17} className="text-blue-500" />
              <span className="text-[10px] font-bold">{locale === 'tr' ? 'Yükle' : locale === 'en' ? 'Upload' : 'رفع ملف'}</span>
            </button>

            {/* 3. Add Text */}
            <button
              type="button"
              onClick={() => {
                addText();
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl transition active:scale-95 cursor-pointer text-slate-600 hover:text-slate-900"
              )}
            >
              <Type size={17} className="text-purple-500" />
              <span className="text-[10px] font-bold">{locale === 'tr' ? 'Metin' : locale === 'en' ? 'Text' : 'إضافة نص'}</span>
            </button>

          {/* 4. Placements Guide */}
          <button
            type="button"
            onClick={() => {
              setActiveMobileTab(null);
              setIsPlacementGuideModalOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer"
          >
            <Target size={17} className="text-emerald-500" />
            <span className="text-[10px] font-bold">{locale === 'tr' ? 'Yerleşim' : locale === 'en' ? 'Placement' : 'المواضع'}</span>
          </button>

          {/* 5. Sizes & Quantities Matrix */}
          <button
            type="button"
            onClick={() => {
              setActiveMobileTab(null);
              setIsMatrixModalOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 transition active:scale-95 relative cursor-pointer"
          >
            {totalOrderQuantity > 1 && (
              <span className="absolute top-0.5 end-2 bg-amber-500 text-white font-mono text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">
                {totalOrderQuantity}
              </span>
            )}
            <Layers size={17} className="text-rose-500" />
            <span className="text-[10px] font-bold">{studioProfile.getMobileVariantTabLabel(locale)}</span>
          </button>

          {/* 6. Layers / Settings */}
          <button
            type="button"
            onClick={() => setActiveMobileTab(activeMobileTab === 'layers' ? null : 'layers')}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-xl transition active:scale-95 cursor-pointer",
              activeMobileTab === 'layers' ? "text-[var(--color-primary)] font-black" : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Settings size={17} className="text-slate-700" />
            <span className="text-[10px] font-bold">{locale === 'tr' ? 'Katmanlar' : locale === 'en' ? 'Layers' : 'التحكم'}</span>
          </button>
        </nav>
      )}

        {/* ========================================================================= */}
        {/* MOBILE STICKY ORDER & PRICE BAR (شريط السعر والإضافة للسلة بالأسفل) */}
        {/* ========================================================================= */}
        <div className={cn(
          "lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-slate-950 text-white px-3.5 flex items-center justify-between border-t border-slate-800 shadow-2xl select-none transition-all duration-300 ease-in-out",
          activeMobileTab ? "translate-y-28 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
        )}>
          <div 
            onClick={() => {
              setActiveMobileTab(null);
              setIsMatrixModalOpen(true);
            }}
            className="flex flex-col cursor-pointer"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9.5px] text-slate-400 font-bold uppercase">{locale === 'tr' ? 'Toplam' : locale === 'en' ? 'Total' : 'الإجمالي'}:</span>
              <span className="font-heading font-black text-amber-400 text-base">{grandTotalPrice} ₺</span>
            </div>
            <div className="flex items-center gap-1.5 text-[9.5px] text-slate-300">
              <span className="bg-slate-800 px-1.5 py-0.2 rounded font-bold">{totalOrderQuantity} {locale === 'tr' ? 'Adet' : locale === 'en' ? 'Pcs' : 'قطع'}</span>
              <span>•</span>
              <span className="text-slate-400 font-bold">
                {(studioProfile.hasApparelSizes || selectedSize !== 'Standard')
                  ? `${selectedSize} / ${getLocalizedColorName(selectedColor, locale)}`
                  : getLocalizedColorName(selectedColor, locale)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleAction('cart')}
              disabled={isSaving || isPreviewLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-orange-500 hover:from-orange-600 hover:to-orange-700 text-white font-heading font-bold text-xs shadow-md shadow-orange-500/30 transition active:scale-95 cursor-pointer"
            >
              <ShoppingCart size={14} />
              <span>{t('addToCart')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Garment Placements Guide Modal */}
      {isPlacementGuideModalOpen && (
        <GarmentPlacementGuide
          isOpen={isPlacementGuideModalOpen}
          onClose={() => {
            setIsPlacementGuideModalOpen(false);
            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
              setActiveMobileTab(null);
            }
            saveDraftImmediate();
          }}
          garmentType={studioProfile.normalizedPlacementType}
          allowedPlacements={productData?.config?.allowedPlacements}
          activeFace={activeFace}
          availableFaces={availableFaces}
          selectedColor={selectedColor}
          selectedPlacementIds={currentSelectedPlacementIds}
          syncPlacementsAcrossColors={syncPlacementsAcrossColors}
          onToggleSyncPlacements={handleToggleSyncPlacements}
          onTogglePlacement={handleTogglePlacement}
          onSelectFace={switchFace}
          onClearAll={handleClearPlacements}
          locale={locale}
          isFreeMode={isFreeMode}
          onToggleFreeMode={handleToggleFreeMode}
          allowFreeMode={productData?.config?.allowFreeMode !== false}
          getPlacementPrice={getPlacementExtraPrice}
          printMethod={dynamicPrintMethod}
          allowPrintMethodChoice={isCustomerChoiceAllowed}
          selectedPrintMethod={selectedPrintMethod}
          onSelectPrintMethod={handleSelectPrintMethod}
          isCurrentColorDark={isCurrentColorDark}
        />
      )}

      {/* Size Guide Modal (Apparel Only) */}
      {isSizeGuideModalOpen && studioProfile.hasGarmentSizeGuide && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsSizeGuideModalOpen(false)}
        >
          <div 
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg p-5 sm:p-6 h-[82dvh] max-h-[82dvh] sm:h-auto sm:max-h-none overflow-y-auto min-h-0 relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-center"
            onClick={(e) => e.stopPropagation()}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <button
              type="button"
              onClick={() => setIsSizeGuideModalOpen(false)}
              className="absolute top-4 left-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-all cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[var(--color-primary)] flex items-center justify-center mx-auto mb-3">
              <Ruler size={24} />
            </div>
            <h3 className="text-lg font-black text-gray-900 mb-1">
              {locale === 'tr' ? 'Hassas Beden Ölçü Tablosu' : locale === 'en' ? 'Detailed Garment Size Guide' : 'دليل القياسات الدقيقة'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {locale === 'tr' ? 'Tüm ölçüler santimetre (cm) cinsindendir. %100 Pamuk 240gsm Oversize kalıbı.' : locale === 'en' ? 'All measurements in centimeters (cm). 240gsm Turkish Cotton Oversize fit.' : 'جميع المقاسات بالسنتيمتر (سم). قصة أوفر سايز فاخرة 240gsm.'}
            </p>
            <div className="overflow-x-auto border border-gray-200 rounded-2xl">
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold">
                    <th className="p-2.5">{locale === 'tr' ? 'Beden' : locale === 'en' ? 'Size' : 'المقاس'}</th>
                    <th className="p-2.5">{locale === 'tr' ? 'Göğüs Genişliği (cm)' : locale === 'en' ? 'Chest Width (cm)' : 'عرض الصدر (سم)'}</th>
                    <th className="p-2.5">{locale === 'tr' ? 'Toplam Boy (cm)' : locale === 'en' ? 'Length (cm)' : 'الطول الكلي (سم)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono font-medium">
                  <tr className="hover:bg-orange-50/40">
                    <td className="p-2.5 font-bold font-sans">S</td>
                    <td className="p-2.5">54</td>
                    <td className="p-2.5">70</td>
                  </tr>
                  <tr className="hover:bg-orange-50/40">
                    <td className="p-2.5 font-bold font-sans">M</td>
                    <td className="p-2.5">57</td>
                    <td className="p-2.5">73</td>
                  </tr>
                  <tr className="hover:bg-orange-50/40">
                    <td className="p-2.5 font-bold font-sans">L</td>
                    <td className="p-2.5">60</td>
                    <td className="p-2.5">75</td>
                  </tr>
                  <tr className="hover:bg-orange-50/40 bg-orange-50/30">
                    <td className="p-2.5 font-bold font-sans text-[var(--color-primary)]">XL</td>
                    <td className="p-2.5 font-bold text-[var(--color-primary)]">63</td>
                    <td className="p-2.5 font-bold text-[var(--color-primary)]">77</td>
                  </tr>
                  <tr className="hover:bg-orange-50/40">
                    <td className="p-2.5 font-bold font-sans">2XL</td>
                    <td className="p-2.5">66</td>
                    <td className="p-2.5">79</td>
                  </tr>
                  <tr className="hover:bg-orange-50/40">
                    <td className="p-2.5 font-bold font-sans">3XL</td>
                    <td className="p-2.5">69</td>
                    <td className="p-2.5">81</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              {locale === 'tr' ? 'Ölçülerde ±1.5 cm üretim toleransı olabilir.' : locale === 'en' ? 'Production tolerance ±1.5 cm.' : 'قد يوجد هامش اختلاف تصنيعي بسيط بمقدار ±1.5 سم.'}
            </p>
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onSuccess={onAuthSuccess} />

      <Mug3DPreviewModal
        isOpen={mug3DPreviewOpen}
        onClose={closePreviewModal}
        previewIntent={previewIntent}
        frontDesignUrl={
          activeMugMode === 'mug_front'
            ? (
                isFaceMatching('back', mugSingleSideFace)
                  ? undefined
                  : (
                      mug3DSlides.find(s => s.face === mugSingleSideFace)?.designUrl
                      || mug3DSlides.find(s => s.face === 'front')?.designUrl
                      || mug3DSlides.find(s => s.face === 'other')?.designUrl
                    )
              )
            : mug3DSlides.find(s => s.face === 'front')?.designUrl
        }
        backDesignUrl={
          activeMugMode === 'mug_two_sided'
            ? mug3DSlides.find(s => s.face === 'back')?.designUrl
            : activeMugMode === 'mug_front' && isFaceMatching('back', mugSingleSideFace)
              ? mug3DSlides.find(s => s.face === 'back')?.designUrl
              : undefined
        }
        isFullWrapMode={activeMugMode === 'mug_full_wrap'}
        activeMode={activeMugMode}
        singleFaceName={mugSingleSideFace}
        mugMeta={mugMeta}
        selectedColorHex={COLOR_MAP[(selectedColor || '').toLowerCase()] || selectedColor || '#ffffff'}
        selectedColorLabel={getLocalizedColorName(selectedColor, locale)}
        selectedCapacity={selectedSize}
        totalPrice={totalPrice}
        onConfirmAddToCart={handleConfirmDesignAndAddToCart}
      />

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
            <div className="flex items-center gap-2.5 text-white">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                {previewIntent === 'cart_confirm' ? (
                  <CheckCircle2 size={20} className="text-amber-400" />
                ) : (
                  <Eye size={20} className="text-amber-400" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-black text-sm sm:text-base md:text-lg leading-tight">
                  {previewIntent === 'cart_confirm'
                    ? (tPreview('confirmTitle', { fallback: locale === 'tr' ? 'Ürün Önizleme ve Tasarım Onayı' : locale === 'en' ? 'Product Preview & Design Confirmation' : 'معاينة المنتج وتأكيد التصميم' }))
                    : tPreview('title')}
                </span>
                <span className="text-[11px] sm:text-xs text-gray-400">
                  {previewIntent === 'cart_confirm'
                    ? (tPreview('confirmSubtitle', { fallback: locale === 'tr' ? 'Sepete eklemeden önce tasarımınızın ürün üzerindeki görünümünü dikkatlice inceleyin' : locale === 'en' ? 'Review your design carefully on the product before adding to cart' : 'راجع شكل وموضع تصميمك على المنتج بدقة قبل إضافته إلى السلة' }))
                    : tPreview('zoomHint')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={closePreviewModal}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center cursor-pointer active:scale-95"
              title={tPreview('close')}
            >
              <X size={22} />
            </button>
          </div>

          {/* Floating Garment Details Pill */}
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 sm:px-4 py-1.5 rounded-full border border-white/15 text-xs text-white z-30 shadow-md my-1 select-none">
            {/* Color */}
            <div className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-xs shrink-0"
                style={{ backgroundColor: selectedColor === 'white' ? '#fff' : selectedColor === 'black' ? '#000' : selectedColor === 'navy' ? '#1E3A8A' : selectedColor }}
              />
              <span className="font-bold text-gray-200">{getLocalizedColorName(selectedColor, locale)}</span>
            </div>
            <span className="text-gray-500">•</span>
            {(studioProfile.hasApparelSizes || selectedSize !== 'Standard') && (
              <>
                <span className="font-black font-mono text-amber-300">{selectedSize}</span>
                <span className="text-gray-500">•</span>
              </>
            )}
            {/* Quantity */}
            <span className="font-semibold text-gray-300">
              {totalOrderQuantity} {locale === 'tr' ? 'adet' : locale === 'en' ? 'pcs' : 'قطع'}
            </span>
            {/* Face */}
            <span className="text-gray-500">•</span>
            <span className="text-amber-300 font-bold">
              {previewSlides[currentSlideIndex]?.label || getFaceDisplayName(activeFace)}
            </span>
            {previewSlides.length > 1 && (
              <span className="bg-amber-500/25 text-amber-300 border border-amber-400/40 text-[10px] px-2 py-0.5 rounded-full font-mono font-black">
                {locale === 'ar' 
                  ? `${currentSlideIndex + 1} من ${previewSlides.length}` 
                  : `${currentSlideIndex + 1} / ${previewSlides.length}`}
              </span>
            )}
          </div>

          {/* Centered Realistic Preview Image with GPU-Accelerated Pinch-to-Zoom & Pan */}
          <div className="flex-1 w-full h-full max-h-[66vh] sm:max-h-[70vh] flex items-center justify-center p-2 overflow-hidden relative select-none">
            {/* Prev Face Slide Button */}
            {previewSlides.length > 1 && (
              <button
                type="button"
                onClick={locale === 'ar' ? handleNextSlide : handlePrevSlide}
                className="absolute start-2 sm:start-6 top-1/2 -translate-y-1/2 p-2.5 sm:p-3.5 rounded-full bg-black/70 hover:bg-black/90 active:scale-90 text-white/90 hover:text-white border border-white/20 hover:border-amber-400/60 shadow-2xl backdrop-blur-md transition-all z-40 cursor-pointer group"
                title={tPreview('prevFace', { fallback: locale === 'tr' ? 'Önceki Yüz' : locale === 'en' ? 'Previous Side' : 'الواجهة السابقة' })}
                aria-label="Previous face"
              >
                <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform rtl:rotate-180" />
              </button>
            )}

            {/* Next Face Slide Button */}
            {previewSlides.length > 1 && (
              <button
                type="button"
                onClick={locale === 'ar' ? handlePrevSlide : handleNextSlide}
                className="absolute end-2 sm:end-6 top-1/2 -translate-y-1/2 p-2.5 sm:p-3.5 rounded-full bg-black/70 hover:bg-black/90 active:scale-90 text-white/90 hover:text-white border border-white/20 hover:border-amber-400/60 shadow-2xl backdrop-blur-md transition-all z-40 cursor-pointer group"
                title={tPreview('nextFace', { fallback: locale === 'tr' ? 'Sonraki Yüz' : locale === 'en' ? 'Next Side' : 'الواجهة التالية' })}
                aria-label="Next face"
              >
                <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform rtl:rotate-180" />
              </button>
            )}

            <TransformWrapper
              key={previewSlides[currentSlideIndex]?.face || currentSlideIndex}
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
                      className="p-1.5 text-white hover:bg-white/20 rounded-lg transition-colors active:scale-95 cursor-pointer"
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
                      className="p-1.5 text-white hover:bg-white/20 rounded-lg transition-colors active:scale-95 cursor-pointer"
                      title={t('zoomOut')}
                    >
                      <Minus size={16} />
                    </button>
                    {state.scale > 1.05 && (
                      <button
                        type="button"
                        onClick={() => resetTransform()}
                        className="px-2 py-1 text-[10px] text-amber-400 font-bold hover:bg-white/20 rounded-lg transition-colors active:scale-95 cursor-pointer"
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
                      key={previewSlides[currentSlideIndex]?.face || previewImage}
                      src={previewImage}
                      alt={previewSlides[currentSlideIndex]?.label || tPreview('title')}
                      draggable={false}
                      className="max-h-[62vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10 bg-white/5 transform-gpu will-change-transform backface-hidden select-none pointer-events-none"
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

          {/* Multi-Face Carousel Thumbnails Bar */}
          {previewSlides.length > 1 && (
            <div className="w-full max-w-2xl z-30 mb-2 px-2">
              <div className="flex items-center justify-center gap-2 sm:gap-2.5 overflow-x-auto py-1 px-1 no-scrollbar">
                {previewSlides.map((slide, idx) => {
                  const isActive = idx === currentSlideIndex;
                  return (
                    <button
                      key={slide.face}
                      type="button"
                      onClick={() => handleSelectSlide(idx)}
                      className={`group relative flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer backdrop-blur-md shrink-0 ${
                        isActive
                          ? 'bg-amber-500/25 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20 scale-105'
                          : 'bg-black/50 hover:bg-black/80 border-white/15 hover:border-white/30 text-gray-300'
                      }`}
                    >
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden bg-black/40 border border-white/10 shrink-0 flex items-center justify-center">
                        <img
                          src={slide.imageUrl}
                          alt={slide.label}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex flex-col text-start leading-none gap-0.5">
                        <span className={`text-[11px] sm:text-xs font-bold whitespace-nowrap ${isActive ? 'text-amber-300' : 'text-gray-200'}`}>
                          {slide.label}
                        </span>
                        {slide.hasDesign ? (
                          <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {locale === 'tr' ? 'Tasarım Var' : locale === 'en' ? 'Designed' : 'مصممة'}
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-400">
                            {locale === 'tr' ? 'Boş' : locale === 'en' ? 'Empty' : 'فارغة'}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modal Bottom CTA Bar */}
          <div className="w-full max-w-2xl flex flex-col sm:flex-row items-center gap-3 sm:gap-4 z-30 bg-black/80 backdrop-blur-xl p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-white/15 shadow-2xl">
            <div className="flex items-center justify-between w-full sm:w-auto sm:flex-col sm:items-start px-2">
              <span className="text-xs text-gray-400 font-medium">{t('totalPrice', { fallback: 'السعر الإجمالي' })}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-black text-xl sm:text-2xl text-amber-400 font-mono">{grandTotalPrice} ₺</span>
                {totalOrderQuantity > 1 && (
                  <span className="text-[11px] text-gray-400 font-mono">
                    ({totalPrice} ₺ × {totalOrderQuantity})
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-1 w-full gap-2.5 sm:gap-3">
              {/* 1. Return to Continue Designing Button */}
              <button
                type="button"
                onClick={closePreviewModal}
                disabled={isSaving}
                className="flex-1 py-3 sm:py-3.5 px-3 sm:px-4 bg-white/10 hover:bg-white/20 active:scale-95 text-white border border-white/20 font-bold text-xs sm:text-sm rounded-xl sm:rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                <RotateCcw size={16} className="text-gray-300 shrink-0" />
                <span>{locale === 'tr' ? 'Tasarımı Düzenlemeye Dön' : locale === 'en' ? 'Back to Editor' : 'الرجوع لاستكمال التصميم'}</span>
              </button>

              {/* 2. Confirm Design & Add to Cart Button */}
              <button
                type="button"
                onClick={handleConfirmDesignAndAddToCart}
                disabled={isSaving}
                className="flex-[1.25] py-3 sm:py-3.5 px-3 sm:px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl sm:rounded-2xl shadow-xl shadow-orange-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={18} className="animate-spin shrink-0" />
                    <span>{locale === 'tr' ? 'Sepete Ekleniyor...' : locale === 'en' ? 'Adding to Cart...' : 'جاري الإضافة للسلة...'}</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart size={18} className="shrink-0" />
                    <span>{locale === 'tr' ? 'Tasarımı Onayla ve Sepete Ekle' : locale === 'en' ? 'Confirm Design & Add to Cart' : 'تأكيد التصميم'}</span>
                  </>
                )}
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
          setIsGalleryModalOpen(false);
          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setActiveMobileTab(null);
          }
          if (!ensurePlacementSelected(() => {
            addSticker(asset.url, asset);
            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
              setActiveMobileTab(null);
            }
          })) {
            return;
          }
          addSticker(asset.url, asset);
          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setActiveMobileTab(null);
          }
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
        hasApparelSizes={studioProfile.hasApparelSizes}
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

      {/* Required Placement Selection Alert Modal */}
      {isPlacementRequiredModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => {
            setIsPlacementRequiredModalOpen(false);
            setPendingAddCallback(null);
            pendingAddCallbackRef.current = null;
            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
              setActiveMobileTab(null);
            }
          }}
        >
          <div 
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg p-5 sm:p-6 h-[82dvh] max-h-[82dvh] sm:h-auto sm:max-h-none overflow-y-auto min-h-0 relative flex flex-col gap-4 text-right animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setIsPlacementRequiredModalOpen(false);
                setPendingAddCallback(null);
                pendingAddCallbackRef.current = null;
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  setActiveMobileTab(null);
                }
              }}
              className="absolute top-4 left-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-all cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* Header with Icon */}
            <div className="flex items-start gap-3 min-w-0 pr-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
                <Shirt size={24} className="stroke-[2.2]" />
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="text-base sm:text-lg font-black text-gray-900 leading-snug">
                  {locale === 'tr'
                    ? '⚠️ Lütfen Önce Baskı Alanını Seçin'
                    : locale === 'en'
                    ? '⚠️ Please Select a Print Placement First'
                    : '⚠️ يرجى اختيار موضع الطباعة أولاً'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {locale === 'tr'
                    ? 'Tasarımınızın ürün üzerinde doğru ve ideal boyutta yerleşmesi için lütfen aşağıdaki onaylı baskı alanlarından birini seçin:'
                    : locale === 'en'
                    ? 'To ensure your design is positioned and scaled accurately on the garment, please choose an approved placement below:'
                    : 'لتثبيت تصميمك بدقة ومحاذاته بشكل احترافي على القطعة، يرجى اختيار أحد مواضع الطباعة المعتمدة التالية:'}
                </p>
              </div>
            </div>

            {/* Available Placements Interactive List */}
            <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto pr-1">
              {availablePlacementsForActiveFace.map((spec) => {
                const displayW = spec.dimensions.recommended.widthCm;
                const displayH = spec.dimensions.recommended.heightCm;
                const displayOffset = spec.offsetFromCollarCm;

                return (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => handleSelectPlacementAndProceed(spec)}
                    className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl border-2 border-gray-200/90 hover:border-amber-500 hover:bg-amber-50/50 transition-all text-right group cursor-pointer active:scale-[0.99] shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-amber-500 group-hover:text-white transition-all">
                        <Shirt size={20} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-gray-900 group-hover:text-amber-700">
                            {locale === 'tr' ? spec.nameTr : locale === 'en' ? spec.nameEn : spec.nameAr}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-100/90 px-2 py-0.2 rounded-full border border-amber-200" dir="ltr">
                            {displayW}×{displayH} cm
                          </span>
                        </div>
                        <span className="text-[10.5px] text-gray-500 truncate mt-0.5">
                          {locale === 'tr' ? spec.descriptionTr : locale === 'en' ? spec.descriptionEn : spec.descriptionAr}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {studioProfile.family === 'apparel' && displayOffset > 0 && (
                        <span className="text-[10px] text-gray-400 hidden sm:inline-flex items-center gap-1">
                          <Ruler size={11} />
                          {locale === 'tr' ? `${displayOffset} cm` : locale === 'en' ? `${displayOffset} cm` : `${displayOffset} سم`}
                        </span>
                      )}
                      <div className="w-7 h-7 rounded-full bg-gray-100 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center text-gray-400 transition-all">
                        <ChevronDown size={14} className={locale === 'ar' ? 'rotate-90' : '-rotate-90'} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Alternative: Free Mode */}
            {productData?.config?.allowFreeMode !== false && (
              <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleEnableFreeModeAndProceed}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-black text-xs shadow-md shadow-amber-500/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
                >
                  <Sparkles size={14} className="text-amber-100" />
                  <span>
                    {locale === 'tr'
                      ? 'Veya Serbest Modu Açarak Tasarımı Ekle ⚡'
                      : locale === 'en'
                      ? 'Or Enable Free Mode & Insert Design ⚡'
                      : 'أو تفعيل الوضع الحر ومتابعة الإضافة ⚡'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}