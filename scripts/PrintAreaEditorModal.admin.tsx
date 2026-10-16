"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  calculateDisplayBounds,
  moveRectWithClamp,
  resizeRectWithHandle,
  clampRectToNativeBounds,
  Rect,
  DisplayBounds,
  ResizeHandle,
} from "@/lib/coordinateMapping";
import {
  X,
  RotateCcw,
  MoveHorizontal,
  MoveVertical,
  Target,
  Loader2,
  Lock,
  Unlock,
  Ruler,
  ShieldCheck,
  Printer,
  Sparkles,
  Grid,
  Layers,
  LayoutGrid,
  Crop,
  Shirt,
  Sliders,
  Check,
  CheckCheck,
  Bookmark,
} from "lucide-react";
import { ProductImageItem } from "@/lib/customizationConfig";

export interface PrintAreaResult {
  x: number;
  y: number;
  width: number;
  height: number;
  nativeWidth: number;
  nativeHeight: number;
  physicalWidthCm?: number;
  physicalHeightCm?: number;
  targetDPI?: number;
  printMethod?: string;
  bleed?: number;
}

export type PrintAreaEditorModalProps = {
  open: boolean;
  imageUrl?: string;
  productType?: string;
  faceId?: string;
  initialPrintArea?: Partial<PrintAreaResult>;
  images?: ProductImageItem[];
  variants?: Array<{
    id: string;
    colorName_ar: string;
    colorName_tr: string;
    colorName_en: string;
    hex: string;
  }>;
  activeImageIndex?: number | null;
  onSave: (printArea: PrintAreaResult) => void;
  onSaveAll?: (updatedImages: ProductImageItem[], updatedFaceConfig?: any) => void;
  onClose: () => void;
};

const RESIZE_HANDLES: Array<{
  handle: ResizeHandle;
  cursor: string;
  className: string;
}> = [
  { handle: "nw", cursor: "nwse-resize", className: "-top-2 -left-2" },
  { handle: "n", cursor: "ns-resize", className: "-top-2 left-1/2 -translate-x-1/2" },
  { handle: "ne", cursor: "nesw-resize", className: "-top-2 -right-2" },
  { handle: "e", cursor: "ew-resize", className: "top-1/2 -right-2 -translate-y-1/2" },
  { handle: "se", cursor: "nwse-resize", className: "-bottom-2 -right-2" },
  { handle: "s", cursor: "ns-resize", className: "-bottom-2 left-1/2 -translate-x-1/2" },
  { handle: "sw", cursor: "nesw-resize", className: "-bottom-2 -left-2" },
  { handle: "w", cursor: "ew-resize", className: "top-1/2 -left-2 -translate-y-1/2" },
];

const SUPPORTED_FACES: Array<{
  id: "front" | "back" | "right_shoulder" | "left_shoulder" | "collar" | "other" | "right" | "left";
  label: string;
  icon: string;
}> = [
  { id: "front", label: "الواجهة الأمامية (Front)", icon: "👕" },
  { id: "back", label: "الواجهة الخلفية (Back)", icon: "🔄" },
  { id: "right_shoulder", label: "الكتف الأيمن (Right)", icon: "👉" },
  { id: "left_shoulder", label: "الكتف الأيسر (Left)", icon: "👈" },
  { id: "collar", label: "الياقة (Collar)", icon: "🏷️" },
  { id: "other", label: "أخرى (Other)", icon: "✨" },
];

interface SmartPreset {
  id: string;
  name: string;
  widthCm: number;
  heightCm: number;
  icon: string;
}

const FACE_SMART_PRESETS: Record<string, SmartPreset[]> = {
  front: [
    { id: "front_a3", name: "صدر كامل A3 (30 × 40 سم)", widthCm: 30, heightCm: 40, icon: "🏆" },
    { id: "front_a4", name: "منتصف الصدر A4 (21 × 29.7 سم)", widthCm: 21, heightCm: 29.7, icon: "📄" },
    { id: "front_pocket", name: "جيب الصدر الأيسر (10 × 10 سم)", widthCm: 10, heightCm: 10, icon: "👕" },
    { id: "front_oversized", name: "أوفر سايز كبير (35 × 48 سم)", widthCm: 35, heightCm: 48, icon: "⚡" },
  ],
  back: [
    { id: "back_a3", name: "ظهر كامل A3 (30 × 42 سم)", widthCm: 30, heightCm: 42, icon: "🏆" },
    { id: "back_a4", name: "أعلى الظهر A4 (21 × 29.7 سم)", widthCm: 21, heightCm: 29.7, icon: "📄" },
    { id: "back_neck", name: "شعار أعلى الرقبة (10 × 5 سم)", widthCm: 10, heightCm: 5, icon: "🏷️" },
  ],
  right_shoulder: [
    { id: "sleeve_patch", name: "شارة الكتف (10 × 10 سم)", widthCm: 10, heightCm: 10, icon: "🏷️" },
    { id: "sleeve_long", name: "طباعة طولية للكم (8 × 22 سم)", widthCm: 8, heightCm: 22, icon: "📜" },
    { id: "sleeve_small", name: "لوجو دائري صغير (6 × 6 سم)", widthCm: 6, heightCm: 6, icon: "🔹" },
  ],
  left_shoulder: [
    { id: "sleeve_patch_l", name: "شارة الكتف (10 × 10 سم)", widthCm: 10, heightCm: 10, icon: "🏷️" },
    { id: "sleeve_long_l", name: "طباعة طولية للكم (8 × 22 سم)", widthCm: 8, heightCm: 22, icon: "📜" },
    { id: "sleeve_small_l", name: "لوجو دائري صغير (6 × 6 سم)", widthCm: 6, heightCm: 6, icon: "🔹" },
  ],
  right: [
    { id: "sleeve_patch_r2", name: "شارة الكتف (10 × 10 سم)", widthCm: 10, heightCm: 10, icon: "🏷️" },
    { id: "sleeve_long_r2", name: "طباعة طولية للكم (8 × 22 سم)", widthCm: 8, heightCm: 22, icon: "📜" },
  ],
  left: [
    { id: "sleeve_patch_l2", name: "شارة الكتف (10 × 10 سم)", widthCm: 10, heightCm: 10, icon: "🏷️" },
    { id: "sleeve_long_l2", name: "طباعة طولية للكم (8 × 22 سم)", widthCm: 8, heightCm: 22, icon: "📜" },
  ],
  collar: [
    { id: "collar_tag", name: "بطاقة الياقة الداخلية (8 × 4 سم)", widthCm: 8, heightCm: 4, icon: "🏷️" },
    { id: "collar_outer", name: "لوجو الياقة الخارجية (5 × 3 سم)", widthCm: 5, heightCm: 3, icon: "✨" },
  ],
  other: [
    { id: "other_std", name: "منطقة قياسية (20 × 20 سم)", widthCm: 20, heightCm: 20, icon: "✨" },
    { id: "other_rect", name: "مستطيل أفقي (25 × 15 سم)", widthCm: 25, heightCm: 15, icon: "📐" },
  ],
};

export const PrintAreaEditorModal: React.FC<PrintAreaEditorModalProps> = ({
  open,
  imageUrl,
  productType = "tshirts",
  faceId = "front",
  initialPrintArea,
  images = [],
  variants = [],
  activeImageIndex: initialActiveImageIndex = null,
  onSave,
  onSaveAll,
  onClose,
}) => {
  // Master image list state
  const [imagesState, setImagesState] = useState<ProductImageItem[]>([]);
  const [activeFace, setActiveFace] = useState<string>(faceId || "front");
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"canvas" | "grid">("canvas");

  // Single canvas editor state
  const [nativeDims, setNativeDims] = useState<{ width: number; height: number } | null>(null);
  const [nativeRect, setNativeRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [displayBounds, setDisplayBounds] = useState<DisplayBounds | null>(null);
  const [isAspectLocked, setIsAspectLocked] = useState(false);
  const [lockRatio, setLockRatio] = useState<number>(1);
  const [showBleed, setShowBleed] = useState(true);
  const [showGridLines, setShowGridLines] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Physical & Print settings
  const [physicalWidthCm, setPhysicalWidthCm] = useState<number>(28);
  const [physicalHeightCm, setPhysicalHeightCm] = useState<number>(38);
  const [targetDPI, setTargetDPI] = useState<number>(300);
  const [printMethod, setPrintMethod] = useState<string>("DTF");
  const [bleedMm, setBleedMm] = useState<number>(3);

  // Helper to get base physical dimensions for current face
  const getBasePhysicalDimensions = useCallback(() => {
    const isSleeve = activeFace === "right_shoulder" || activeFace === "left_shoulder" || activeFace === "right" || activeFace === "left";
    const isCollar = activeFace === "collar";
    const baseW = isSleeve ? 25 : isCollar ? 20 : (productType === "hoodie" ? 60 : 55);
    const baseH = isSleeve ? 40 : isCollar ? 15 : (productType === "hoodie" ? 80 : 75);
    return { baseW, baseH };
  }, [activeFace, productType]);

  // Interaction tracking refs
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef<ResizeHandle | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startRectRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const imgElementRef = useRef<HTMLImageElement>(null);

  // Initialize images from props
  useEffect(() => {
    if (!open) return;

    let initImages: ProductImageItem[] = [];
    if (images && images.length > 0) {
      // Filter strictly to ONLY blank mockup images (type === "blank" or untyped blank mockups)
      // Never display "ready" finished product images in the calibrator studio!
      const blankOnly = images.filter((img) => img.type === "blank" || (!img.type && img.url));
      const sourceList = blankOnly.length > 0 ? blankOnly : images.filter((img) => img.type !== "ready");

      initImages = sourceList.map((img) => ({
        ...img,
        printArea: img.printArea ? { ...img.printArea } : undefined,
      }));
    } else if (imageUrl) {
      initImages = [
        {
          id: "default-single-image",
          url: imageUrl,
          type: "blank",
          face: (faceId as any) || "front",
          colorHex: "#3B82F6",
          printArea: initialPrintArea
            ? {
                x: initialPrintArea.x || 0,
                y: initialPrintArea.y || 0,
                width: initialPrintArea.width || 0,
                height: initialPrintArea.height || 0,
                nativeWidth: initialPrintArea.nativeWidth || 1000,
                nativeHeight: initialPrintArea.nativeHeight || 1000,
                physicalWidthCm: initialPrintArea.physicalWidthCm,
                physicalHeightCm: initialPrintArea.physicalHeightCm,
                targetDPI: initialPrintArea.targetDPI,
                printMethod: initialPrintArea.printMethod,
                bleed: initialPrintArea.bleed,
              }
            : undefined,
        },
      ];
    }
    setImagesState(initImages);

    // Map initial active image index to the filtered blank list
    const targetImageFromProp = (images && initialActiveImageIndex !== null && initialActiveImageIndex !== undefined && images[initialActiveImageIndex])
      ? images[initialActiveImageIndex]
      : null;

    let initialIdx = 0;
    if (targetImageFromProp) {
      const matchIdx = initImages.findIndex(img => img.id === targetImageFromProp.id || (img.colorHex === targetImageFromProp.colorHex && img.face === targetImageFromProp.face));
      if (matchIdx !== -1) {
        initialIdx = matchIdx;
      }
    } else if (initialActiveImageIndex !== null && initialActiveImageIndex !== undefined && initialActiveImageIndex >= 0) {
      initialIdx = Math.min(initialActiveImageIndex, Math.max(0, initImages.length - 1));
    }
    
    setCurrentImageIndex(initialIdx);

    const selectedFace = initImages[initialIdx]?.face || faceId || "front";
    setActiveFace(selectedFace);

    // Initial physical dimensions based on face
    if (initialPrintArea?.physicalWidthCm) {
      setPhysicalWidthCm(initialPrintArea.physicalWidthCm);
    } else if (selectedFace === "right_shoulder" || selectedFace === "left_shoulder" || selectedFace === "right" || selectedFace === "left") {
      setPhysicalWidthCm(10);
    } else if (selectedFace === "collar") {
      setPhysicalWidthCm(8);
    } else {
      setPhysicalWidthCm(28);
    }

    if (initialPrintArea?.physicalHeightCm) {
      setPhysicalHeightCm(initialPrintArea.physicalHeightCm);
    } else if (selectedFace === "right_shoulder" || selectedFace === "left_shoulder" || selectedFace === "right" || selectedFace === "left") {
      setPhysicalHeightCm(12);
    } else if (selectedFace === "collar") {
      setPhysicalHeightCm(4);
    } else {
      setPhysicalHeightCm(38);
    }

    if (initialPrintArea?.targetDPI) setTargetDPI(initialPrintArea.targetDPI);
    if (initialPrintArea?.printMethod) setPrintMethod(initialPrintArea.printMethod);
    if (initialPrintArea?.bleed !== undefined) setBleedMm(initialPrintArea.bleed);
  }, [open, images, imageUrl, faceId, initialPrintArea, initialActiveImageIndex]);

  // Active image item for single canvas view
  const currentImage = useMemo(() => {
    if (!imagesState || imagesState.length === 0) return null;
    return imagesState[currentImageIndex] || imagesState[0];
  }, [imagesState, currentImageIndex]);

  // Images grouped by active face
  const faceImages = useMemo(() => {
    return imagesState.filter((img) => (img.face || "front") === activeFace);
  }, [imagesState, activeFace]);

  // Color lookup helper
  const getColorInfo = useCallback(
    (img?: ProductImageItem | null) => {
      if (!img) return { name: "اللون الافتراضي (الرئيسي)", hex: "#4B5563" };
      const colorKey = (img as any).color || img.colorHex;
      if (!colorKey || colorKey === "default") {
        return { name: "اللون الافتراضي (الرئيسي)", hex: "#4B5563" };
      }
      const v = variants.find((item) => item.id === colorKey || item.colorName_en === colorKey || item.hex === colorKey);
      if (v) {
        return { name: v.colorName_ar || v.colorName_tr || v.colorName_en, hex: v.hex || "#3B82F6" };
      }
      return { name: colorKey.startsWith("#") ? "لون مخصص" : colorKey, hex: colorKey.startsWith("#") ? colorKey : "#6B7280" };
    },
    [variants]
  );

  // Load image dimensions & initialize print rect for current active image
  useEffect(() => {
    if (!open || !currentImage?.url) return;

    setImageLoading(true);
    setImageError(false);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = currentImage.url;

    img.onload = () => {
      const nw = img.naturalWidth || 1000;
      const nh = img.naturalHeight || 1000;
      setNativeDims({ width: nw, height: nh });
      setImageLoading(false);

      const { baseW, baseH } = getBasePhysicalDimensions();

      // Check if image already has printArea
      const pa = currentImage.printArea || initialPrintArea;
      if (pa && pa.width && pa.height) {
        let rx = pa.x || 0;
        let ry = pa.y || 0;
        let rw = pa.width;
        let rh = pa.height;

        // If defined on a different native resolution, rescale proportionally
        if (pa.nativeWidth && pa.nativeHeight && (pa.nativeWidth !== nw || pa.nativeHeight !== nh)) {
          const scaleX = nw / pa.nativeWidth;
          const scaleY = nh / pa.nativeHeight;
          rx = Math.round(rx * scaleX);
          ry = Math.round(ry * scaleY);
          rw = Math.round(rw * scaleX);
          rh = Math.round(rh * scaleY);
        }

        const clamped = clampRectToNativeBounds({ x: rx, y: ry, width: rw, height: rh }, nw, nh);
        setNativeRect(clamped);
        setLockRatio(clamped.width / (clamped.height || 1));

        // Sync CM from saved values or compute from pixels
        if (pa.physicalWidthCm) {
          setPhysicalWidthCm(pa.physicalWidthCm);
        } else {
          setPhysicalWidthCm(Math.round((clamped.width / nw) * baseW * 10) / 10);
        }
        if (pa.physicalHeightCm) {
          setPhysicalHeightCm(pa.physicalHeightCm);
        } else {
          setPhysicalHeightCm(Math.round((clamped.height / nh) * baseH * 10) / 10);
        }
      } else {
        // Face-aware default sizing and placement
        const f = currentImage.face || activeFace || "front";
        let defaultW = Math.round(nw * 0.45);
        let defaultH = Math.round(nh * 0.55);
        let defaultX = Math.round((nw - defaultW) / 2);
        let defaultY = Math.round(nh * 0.22);

        if (f === "right_shoulder" || f === "left_shoulder" || f === "right" || f === "left") {
          defaultW = Math.round(nw * 0.35);
          defaultH = Math.round(nh * 0.40);
          defaultX = Math.round((nw - defaultW) / 2);
          defaultY = Math.round(nh * 0.28);
        } else if (f === "collar") {
          defaultW = Math.round(nw * 0.28);
          defaultH = Math.round(nh * 0.16);
          defaultX = Math.round((nw - defaultW) / 2);
          defaultY = Math.round(nh * 0.15);
        } else if (f === "back") {
          defaultW = Math.round(nw * 0.45);
          defaultH = Math.round(nh * 0.55);
          defaultX = Math.round((nw - defaultW) / 2);
          defaultY = Math.round(nh * 0.20);
        }

        const initialR = {
          x: defaultX,
          y: defaultY,
          width: defaultW,
          height: defaultH,
        };
        setNativeRect(initialR);
        setLockRatio(defaultW / defaultH);

        const calculatedCmW = Math.round((defaultW / nw) * baseW * 10) / 10;
        const calculatedCmH = Math.round((defaultH / nh) * baseH * 10) / 10;
        setPhysicalWidthCm(calculatedCmW);
        setPhysicalHeightCm(calculatedCmH);
      }
    };

    img.onerror = () => {
      setImageLoading(false);
      setImageError(true);
    };
  }, [open, currentImage?.url, currentImage?.face, activeFace, getBasePhysicalDimensions]);

  // Recalculate display bounds when window resizes or image loads
  const updateDisplayBounds = useCallback(() => {
    if (!containerRef.current || !nativeDims) return;
    const container = containerRef.current.getBoundingClientRect();
    if (container.width === 0 || container.height === 0) return;

    const bounds = calculateDisplayBounds(
      container.width,
      container.height,
      nativeDims.width,
      nativeDims.height
    );
    setDisplayBounds(bounds);
  }, [nativeDims]);

  useEffect(() => {
    updateDisplayBounds();
    window.addEventListener("resize", updateDisplayBounds);
    return () => window.removeEventListener("resize", updateDisplayBounds);
  }, [updateDisplayBounds]);

  // Update current active image's printArea in master imagesState
  const syncCurrentRectToState = useCallback(
    (newRect: Rect, customCmW?: number, customCmH?: number) => {
      if (!nativeDims || currentImageIndex < 0 || !imagesState[currentImageIndex]) return;

      const { baseW, baseH } = getBasePhysicalDimensions();
      const actualCmW = customCmW ?? Math.round((newRect.width / nativeDims.width) * baseW * 10) / 10;
      const actualCmH = customCmH ?? Math.round((newRect.height / nativeDims.height) * baseH * 10) / 10;

      setImagesState((prev) => {
        const updated = [...prev];
        updated[currentImageIndex] = {
          ...updated[currentImageIndex],
          printArea: {
            x: newRect.x,
            y: newRect.y,
            width: newRect.width,
            height: newRect.height,
            nativeWidth: nativeDims.width,
            nativeHeight: nativeDims.height,
            physicalWidthCm: actualCmW,
            physicalHeightCm: actualCmH,
            targetDPI,
            printMethod,
            bleed: bleedMm,
          },
        };
        return updated;
      });
    },
    [nativeDims, currentImageIndex, imagesState, getBasePhysicalDimensions, targetDPI, printMethod, bleedMm]
  );

  // Apply Smart Preset
  const handleApplyPreset = (preset: SmartPreset) => {
    if (!nativeDims) return;
    setPhysicalWidthCm(preset.widthCm);
    setPhysicalHeightCm(preset.heightCm);

    const { baseW, baseH } = getBasePhysicalDimensions();

    const targetW = Math.min(nativeDims.width, Math.max(50, Math.round((preset.widthCm / baseW) * nativeDims.width)));
    const targetH = Math.min(nativeDims.height, Math.max(50, Math.round((preset.heightCm / baseH) * nativeDims.height)));

    let targetX = Math.round((nativeDims.width - targetW) / 2);
    let targetY = Math.round(nativeDims.height * 0.22);

    const isSleeve = activeFace === "right_shoulder" || activeFace === "left_shoulder" || activeFace === "right" || activeFace === "left";
    if (preset.id.includes("pocket")) {
      // Left chest pocket (viewer's right on front)
      targetX = Math.round(nativeDims.width * 0.58);
      targetY = Math.round(nativeDims.height * 0.24);
    } else if (preset.id.includes("neck") || preset.id.includes("collar")) {
      targetY = Math.round(nativeDims.height * 0.15);
    } else if (isSleeve) {
      targetY = Math.round(nativeDims.height * 0.28);
    }

    const clamped = clampRectToNativeBounds(
      { x: targetX, y: targetY, width: targetW, height: targetH },
      nativeDims.width,
      nativeDims.height
    );

    setNativeRect(clamped);
    setLockRatio(clamped.width / (clamped.height || 1));
    syncCurrentRectToState(clamped, preset.widthCm, preset.heightCm);
  };

  // Sync print area of current image across ALL images of the same face (Smart Proportion Sync)
  const handleSyncToAllColorsOfFace = useCallback(() => {
    if (!nativeDims || nativeRect.width === 0) return;

    // Relative ratios on active image
    const normX = nativeRect.x / nativeDims.width;
    const normY = nativeRect.y / nativeDims.height;
    const normW = nativeRect.width / nativeDims.width;
    const normH = nativeRect.height / nativeDims.height;

    setImagesState((prev) =>
      prev.map((img) => {
        if ((img.face || "front") !== activeFace) return img;

        const imgNw = img.printArea?.nativeWidth || nativeDims.width;
        const imgNh = img.printArea?.nativeHeight || nativeDims.height;

        const scaledRect = {
          x: Math.round(normX * imgNw),
          y: Math.round(normY * imgNh),
          width: Math.round(normW * imgNw),
          height: Math.round(normH * imgNh),
          nativeWidth: imgNw,
          nativeHeight: imgNh,
          physicalWidthCm,
          physicalHeightCm,
          targetDPI,
          printMethod,
          bleed: bleedMm,
        };

        return {
          ...img,
          printArea: scaledRect,
        };
      })
    );
  }, [nativeDims, nativeRect, activeFace, physicalWidthCm, physicalHeightCm, targetDPI, printMethod, bleedMm]);

  // Center Horizontally
  const handleCenterHorizontal = () => {
    if (!nativeDims) return;
    const newX = Math.round((nativeDims.width - nativeRect.width) / 2);
    const updated = { ...nativeRect, x: newX };
    setNativeRect(updated);
    syncCurrentRectToState(updated, physicalWidthCm, physicalHeightCm);
  };

  // Center Vertically
  const handleCenterVertical = () => {
    if (!nativeDims) return;
    const newY = Math.round((nativeDims.height - nativeRect.height) / 2);
    const updated = { ...nativeRect, y: newY };
    setNativeRect(updated);
    syncCurrentRectToState(updated, physicalWidthCm, physicalHeightCm);
  };

  // Center Both
  const handleCenterBoth = () => {
    if (!nativeDims) return;
    const newX = Math.round((nativeDims.width - nativeRect.width) / 2);
    const newY = Math.round((nativeDims.height - nativeRect.height) / 2);
    const updated = { ...nativeRect, x: newX, y: newY };
    setNativeRect(updated);
    syncCurrentRectToState(updated, physicalWidthCm, physicalHeightCm);
  };

  // Reset to default
  const handleReset = () => {
    if (!nativeDims) return;
    const f = activeFace || "front";
    let defaultW = Math.round(nativeDims.width * 0.45);
    let defaultH = Math.round(nativeDims.height * 0.55);
    let defaultX = Math.round((nativeDims.width - defaultW) / 2);
    let defaultY = Math.round(nativeDims.height * 0.22);

    if (f === "right_shoulder" || f === "left_shoulder" || f === "right" || f === "left") {
      defaultW = Math.round(nativeDims.width * 0.35);
      defaultH = Math.round(nativeDims.height * 0.40);
      defaultX = Math.round((nativeDims.width - defaultW) / 2);
      defaultY = Math.round(nativeDims.height * 0.28);
    }

    const { baseW, baseH } = getBasePhysicalDimensions();
    const updated = { x: defaultX, y: defaultY, width: defaultW, height: defaultH };
    const cmW = Math.round((defaultW / nativeDims.width) * baseW * 10) / 10;
    const cmH = Math.round((defaultH / nativeDims.height) * baseH * 10) / 10;

    setNativeRect(updated);
    setLockRatio(defaultW / defaultH);
    setPhysicalWidthCm(cmW);
    setPhysicalHeightCm(cmH);
    syncCurrentRectToState(updated, cmW, cmH);
  };

  // Mouse / Touch interaction handlers
  const handleMouseDownMove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    startRectRef.current = { ...nativeRect };
  };

  const handleMouseDownResize = (handle: ResizeHandle, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = handle;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    startRectRef.current = { ...nativeRect };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!displayBounds || !nativeDims || displayBounds.scale <= 0) return;

      const deltaXScreen = e.clientX - dragStartPosRef.current.x;
      const deltaYScreen = e.clientY - dragStartPosRef.current.y;
      const deltaXNative = deltaXScreen / displayBounds.scale;
      const deltaYNative = deltaYScreen / displayBounds.scale;

      if (isDraggingRef.current) {
        const moved = moveRectWithClamp(
          startRectRef.current,
          deltaXNative,
          deltaYNative,
          nativeDims.width,
          nativeDims.height
        );
        setNativeRect(moved);
      } else if (isResizingRef.current) {
        let resized = resizeRectWithHandle(
          startRectRef.current,
          isResizingRef.current,
          deltaXNative,
          deltaYNative,
          nativeDims.width,
          nativeDims.height
        );

        if (isAspectLocked && lockRatio > 0) {
          const targetH = resized.width / lockRatio;
          if (resized.y + targetH <= nativeDims.height) {
            resized = { ...resized, height: targetH };
          }
        }
        setNativeRect(resized);

        // LIVE REAL-TIME CM CALCULATION DURING RESIZE!
        const { baseW, baseH } = getBasePhysicalDimensions();
        const liveCmW = Math.round((resized.width / nativeDims.width) * baseW * 10) / 10;
        const liveCmH = Math.round((resized.height / nativeDims.height) * baseH * 10) / 10;
        setPhysicalWidthCm(liveCmW);
        setPhysicalHeightCm(liveCmH);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current || isResizingRef.current) {
        const wasResizing = Boolean(isResizingRef.current);
        isDraggingRef.current = false;
        isResizingRef.current = null;
        setNativeRect((current) => {
          if (nativeDims && wasResizing) {
            const { baseW, baseH } = getBasePhysicalDimensions();
            const finalCmW = Math.round((current.width / nativeDims.width) * baseW * 10) / 10;
            const finalCmH = Math.round((current.height / nativeDims.height) * baseH * 10) / 10;
            setPhysicalWidthCm(finalCmW);
            setPhysicalHeightCm(finalCmH);
            syncCurrentRectToState(current, finalCmW, finalCmH);
          } else {
            syncCurrentRectToState(current, physicalWidthCm, physicalHeightCm);
          }
          return current;
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [displayBounds, nativeDims, isAspectLocked, lockRatio, syncCurrentRectToState, getBasePhysicalDimensions, physicalWidthCm, physicalHeightCm]);

  // Master Save Handler
  const handleMasterSave = () => {
    if (!nativeDims) return;

    // 1. Current image result
    const currentResult: PrintAreaResult = {
      x: nativeRect.x,
      y: nativeRect.y,
      width: nativeRect.width,
      height: nativeRect.height,
      nativeWidth: nativeDims.width,
      nativeHeight: nativeDims.height,
      physicalWidthCm,
      physicalHeightCm,
      targetDPI,
      printMethod,
      bleed: bleedMm,
    };

    // 2. Build updated images array
    const updatedImages = imagesState.map((img, idx) => {
      if (idx === currentImageIndex) {
        return { ...img, printArea: currentResult };
      }
      return img;
    });

    // 3. Build face configuration map for backend
    const faceConfigMap: Record<string, any> = {};
    SUPPORTED_FACES.forEach((f) => {
      const faceImg = updatedImages.find((img) => (img.face || "front") === f.id && img.printArea);
      if (faceImg && faceImg.printArea) {
        faceConfigMap[f.id] = {
          name: f.label.split(" (")[0],
          enabled: true,
          printArea: {
            id: `print_area_${f.id}`,
            name: f.label.split(" (")[0],
            width: faceImg.printArea.width,
            height: faceImg.printArea.height,
            left: faceImg.printArea.x,
            top: faceImg.printArea.y,
            nativeWidth: faceImg.printArea.nativeWidth,
            nativeHeight: faceImg.printArea.nativeHeight,
            physicalWidthCm: faceImg.printArea.physicalWidthCm || physicalWidthCm,
            physicalHeightCm: faceImg.printArea.physicalHeightCm || physicalHeightCm,
            targetDPI: faceImg.printArea.targetDPI || targetDPI,
            printMethod: faceImg.printArea.printMethod || printMethod,
            bleed: faceImg.printArea.bleed ?? bleedMm,
          },
        };
      }
    });

    if (onSaveAll) {
      onSaveAll(updatedImages, faceConfigMap);
    } else {
      onSave(currentResult);
    }
    onClose();
  };

  if (!open) return null;

  // Local display rectangle relative to the scaled image container (0, 0 origin)
  const localDisplayRect =
    displayBounds && nativeDims
      ? {
          x: nativeRect.x * displayBounds.scale,
          y: nativeRect.y * displayBounds.scale,
          width: nativeRect.width * displayBounds.scale,
          height: nativeRect.height * displayBounds.scale,
        }
      : null;

  // Current image color details
  const activeColorInfo = getColorInfo(currentImage);
  const smartPresets = FACE_SMART_PRESETS[activeFace] || FACE_SMART_PRESETS.front;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-7xl h-[92vh] max-h-[950px] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                استوديو معايرة منطقة الطباعة الموحد لجميع الألوان
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  All-in-One Multi-Color Calibrator
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                قم بضبط وتوحيد إحداثيات ومقاس منطقة الطباعة بالسنتيمتر لجميع ألوان وزوايا المنتج في شاشة واحدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode("canvas")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === "canvas"
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                المعايرة التفاعلية
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === "grid"
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                شبكة مقارنة الألوان ({faceImages.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Face Selector & Color Swatches Bar */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 shrink-0">
          {/* Face Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="text-xs text-slate-400 font-medium ml-1">الواجهة:</span>
            {SUPPORTED_FACES.map((face) => {
              const count = imagesState.filter((img) => (img.face || "front") === face.id).length;
              const isActive = activeFace === face.id;
              return (
                <button
                  key={face.id}
                  type="button"
                  onClick={() => {
                    setActiveFace(face.id);
                    // Find first image of this face
                    const idx = imagesState.findIndex((img) => (img.face || "front") === face.id);
                    if (idx !== -1) setCurrentImageIndex(idx);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                    isActive
                      ? "bg-slate-800 text-amber-400 border-amber-500/50 shadow-sm"
                      : "bg-slate-900/50 text-slate-400 border-slate-800 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  <span>{face.icon}</span>
                  <span>{face.label.split(" (")[0]}</span>
                  {count > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Color Switcher Dots for Active Face */}
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <span className="text-xs text-slate-400 font-medium ml-1">ألوان هذه الواجهة:</span>
            {faceImages.length === 0 ? (
              <span className="text-xs text-slate-500 italic">لا توجد صور لهذه الواجهة</span>
            ) : (
              faceImages.map((img) => {
                const globalIndex = imagesState.indexOf(img);
                const isSelected = globalIndex === currentImageIndex;
                const cInfo = getColorInfo(img);
                return (
                  <button
                    key={img.id || img.url + globalIndex}
                    type="button"
                    onClick={() => setCurrentImageIndex(globalIndex)}
                    className={`group relative flex items-center gap-2 px-2.5 py-1 rounded-xl border text-xs transition-all ${
                      isSelected
                        ? "bg-amber-500/15 border-amber-500 text-amber-300 shadow-md ring-1 ring-amber-500/40"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                    title={cInfo.name}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-inner shrink-0"
                      style={{ backgroundColor: cInfo.hex }}
                    />
                    <span className="font-semibold max-w-[90px] truncate">{cInfo.name}</span>
                    {img.printArea && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="تمت المعايرة" />
                    )}
                  </button>
                );
              })
            )}

            {/* Quick Sync Button */}
            {faceImages.length > 1 && (
              <button
                type="button"
                onClick={handleSyncToAllColorsOfFace}
                className="px-2.5 py-1 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 transition-all mr-2"
                title="نسخ أبعاد منطقة الطباعة الحالية وتطبيقها على جميع ألوان هذه الواجهة بنسب متطابقة"
              >
                <Sparkles className="w-3.5 h-3.5" />
                توحيد على كل الألوان
              </button>
            )}
          </div>
        </div>

        {/* Main Body: Canvas View OR Grid Comparison View */}
        {viewMode === "grid" ? (
          /* Multi-Color Grid Comparison Mode */
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950/40">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-amber-400" />
                    مقارنة موضع الطباعة لجميع ألوان {SUPPORTED_FACES.find((f) => f.id === activeFace)?.label}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    تأكد من أن المربع يقع في نفس المكان تماماً على الصدر/الظهر لكل الألوان وتفادي أي انحراف
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncToAllColorsOfFace}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  مزامنة المقاس الحالي لجميع الألوان ({faceImages.length})
                </button>
              </div>

              {faceImages.length === 0 ? (
                <div className="py-20 text-center text-slate-500">
                  <Shirt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>لا توجد صور مرفوعة لهذه الواجهة بعد</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {faceImages.map((img) => {
                    const globalIdx = imagesState.indexOf(img);
                    const cInfo = getColorInfo(img);
                    const isSelected = globalIdx === currentImageIndex;
                    const pa = img.printArea || (isSelected ? nativeRect : null);
                    const imgNw = (pa as any)?.nativeWidth || nativeDims?.width || 1000;
                    const imgNh = (pa as any)?.nativeHeight || nativeDims?.height || 1000;

                    const leftPct = pa ? (pa.x / imgNw) * 100 : 25;
                    const topPct = pa ? (pa.y / imgNh) * 100 : 20;
                    const widthPct = pa ? (pa.width / imgNw) * 100 : 50;
                    const heightPct = pa ? (pa.height / imgNh) * 100 : 55;

                    return (
                      <div
                        key={img.id || img.url + globalIdx}
                        className={`relative rounded-2xl border bg-slate-900/90 overflow-hidden flex flex-col transition-all group ${
                          isSelected
                            ? "border-amber-500 shadow-xl ring-2 ring-amber-500/30"
                            : "border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {/* Header Badge */}
                        <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                              style={{ backgroundColor: cInfo.hex }}
                            />
                            <span className="font-bold text-slate-200 truncate">{cInfo.name}</span>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              النشط حالياً
                            </span>
                          )}
                        </div>

                        {/* Image Preview with Print Box Overlay */}
                        <div className="relative aspect-square w-full bg-slate-950/60 p-2 flex items-center justify-center overflow-hidden">
                          <img
                            src={img.url}
                            alt={cInfo.name}
                            className="w-full h-full object-contain pointer-events-none select-none"
                          />

                          {/* Print Area Overlay */}
                          <div
                            className="absolute border-2 border-dashed border-amber-400 bg-amber-500/20 pointer-events-none transition-all flex items-center justify-center"
                            style={{
                              left: `${leftPct}%`,
                              top: `${topPct}%`,
                              width: `${widthPct}%`,
                              height: `${heightPct}%`,
                            }}
                          >
                            <span className="text-[10px] font-mono font-bold bg-black/70 px-1 rounded text-amber-300" dir="ltr">
                              {(pa as any)?.physicalWidthCm || physicalWidthCm}×{(pa as any)?.physicalHeightCm || physicalHeightCm} cm
                            </span>
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-2.5 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-slate-400">
                            {pa ? `${Math.round(widthPct)}% x ${Math.round(heightPct)}%` : "غير محدد"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentImageIndex(globalIdx);
                              setViewMode("canvas");
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs font-bold transition-all flex items-center gap-1"
                          >
                            <Crop className="w-3 h-3" />
                            تعديل
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Interactive Single Canvas Calibrator View */
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Left/Center: Visual Calibration Stage */}
            <div className="flex-1 relative bg-slate-950 flex items-center justify-center p-4 select-none overflow-hidden">
              {imageLoading && (
                <div className="flex flex-col items-center gap-3 text-amber-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs font-semibold">جاري تحميل صورة المنتج ودقة البكسلات...</span>
                </div>
              )}

              {imageError && (
                <div className="text-center text-red-400 p-6 bg-red-950/30 rounded-2xl border border-red-800/50 max-w-md">
                  <p className="font-bold text-sm">تعذر تحميل صورة المنتج</p>
                  <p className="text-xs text-red-300/80 mt-1">تأكد من صحة الرابط أو قم بإعادة رفع الصورة</p>
                </div>
              )}

              {!imageLoading && !imageError && currentImage?.url && (
                <div
                  ref={containerRef}
                  className="relative w-full h-full max-w-full max-h-full flex items-center justify-center"
                >
                  {displayBounds && (
                    <div
                      className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-slate-900/40"
                      style={{
                        width: displayBounds.displayWidth,
                        height: displayBounds.displayHeight,
                      }}
                    >
                      {/* Product Base Image */}
                      <img
                        ref={imgElementRef}
                        src={currentImage.url}
                        alt="Product Face"
                        className="w-full h-full object-contain pointer-events-none select-none block"
                        draggable={false}
                      />

                      {/* Rule / Grid lines Overlay */}
                      {showGridLines && (
                        <div className="absolute inset-0 pointer-events-none opacity-20">
                          <div className="w-full h-full grid grid-cols-4 grid-rows-4 divide-x divide-y divide-slate-400" />
                        </div>
                      )}

                      {/* Resizable / Movable Interactive Print Box */}
                      {localDisplayRect && (
                        <div
                          className="absolute border-2 border-dashed border-amber-400 bg-amber-500/15 cursor-move transition-shadow hover:border-amber-300 hover:bg-amber-500/20 group z-20 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                          style={{
                            left: `${localDisplayRect.x}px`,
                            top: `${localDisplayRect.y}px`,
                            width: `${localDisplayRect.width}px`,
                            height: `${localDisplayRect.height}px`,
                          }}
                          onMouseDown={handleMouseDownMove}
                        >
                          {/* Bleed Guide Margin Lines */}
                          {showBleed && (
                            <div className="absolute inset-1.5 border border-dashed border-red-400/60 pointer-events-none" />
                          )}

                          {/* Dimensions & Centering Tooltip (ltr formatted) */}
                          <div
                            className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-md bg-slate-900/95 border border-amber-500/40 text-[11px] font-mono font-bold text-amber-300 shadow-md whitespace-nowrap flex items-center gap-1.5 pointer-events-none"
                            dir="ltr"
                          >
                            <span className="text-amber-300 font-extrabold">
                              {physicalWidthCm} × {physicalHeightCm} cm
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="text-slate-400">
                              {Math.round(nativeRect.width)}×{Math.round(nativeRect.height)}px
                            </span>
                          </div>

                          {/* Center Alignment Crosshairs */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity">
                            <Target className="w-6 h-6 text-amber-400 stroke-[1.5]" />
                          </div>

                          {/* 8 Resize Handles */}
                          {RESIZE_HANDLES.map(({ handle, cursor, className }) => (
                            <div
                              key={handle}
                              className={`absolute w-3.5 h-3.5 bg-slate-950 border-2 border-amber-400 rounded-sm shadow-md transition-transform hover:scale-125 hover:bg-amber-400 ${className}`}
                              style={{ cursor }}
                              onMouseDown={(e) => handleMouseDownResize(handle, e)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Canvas View Toggles Bar (Bottom Overlay) */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 border border-slate-800/90 px-3 py-1.5 rounded-2xl shadow-xl backdrop-blur-md text-xs z-30">
                <button
                  type="button"
                  onClick={() => setShowGridLines(!showGridLines)}
                  className={`px-3 py-1 rounded-xl flex items-center gap-1.5 transition-all ${
                    showGridLines
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="إظهار/إخفاء خطوط الشبكة الهندسية"
                >
                  <Grid className="w-3.5 h-3.5" />
                  خطوط الشبكة
                </button>

                <button
                  type="button"
                  onClick={() => setShowBleed(!showBleed)}
                  className={`px-3 py-1 rounded-xl flex items-center gap-1.5 transition-all ${
                    showBleed
                      ? "bg-red-500/20 text-red-300 border border-red-500/30 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="إظهار/إخفاء هامش الأمان للطباعة (Bleed Margin)"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  هامش الأمان
                </button>

                <button
                  type="button"
                  onClick={handleCenterBoth}
                  className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 flex items-center gap-1.5 transition-all border border-slate-700"
                  title="توسيط منطقة الطباعة في منتصف الصورة فوراً"
                >
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  توسيط سريع
                </button>
              </div>
            </div>

            {/* Right: Controls & Physical Calibration Panel */}
            <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-r border-slate-800 bg-slate-900/95 p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
              {/* Active Mockup Info Banner */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-4 h-4 rounded-full border border-white/20 shadow shrink-0"
                    style={{ backgroundColor: activeColorInfo.hex }}
                  />
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{activeColorInfo.name}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {nativeDims ? `${nativeDims.width} × ${nativeDims.height} بكسل` : "جاري القراءة..."}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {SUPPORTED_FACES.find((f) => f.id === activeFace)?.label.split(" (")[0]}
                </span>
              </div>

              {/* Smart Category & Face Presets (المقاسات الجاهزة الذكية) */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                  مقاسات جاهزة مخصصة لـ ({SUPPORTED_FACES.find((f) => f.id === activeFace)?.label.split(" (")[0]})
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {smartPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-amber-500/15 text-slate-300 hover:text-amber-300 text-xs font-bold flex items-center justify-between transition-all border border-slate-800 hover:border-amber-500/40 text-right"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{preset.icon}</span>
                        <span>{preset.name}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-500" dir="ltr">
                        {preset.widthCm}×{preset.heightCm} cm
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Centering & Quick Align Actions */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  أدوات المحاذاة والتوسيط السريع
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleCenterHorizontal}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 transition-all border border-slate-700/60"
                  >
                    <MoveHorizontal className="w-3.5 h-3.5 text-amber-400" />
                    توسيط أفقي
                  </button>
                  <button
                    type="button"
                    onClick={handleCenterVertical}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 transition-all border border-slate-700/60"
                  >
                    <MoveVertical className="w-3.5 h-3.5 text-amber-400" />
                    توسيط رأسي
                  </button>
                  <button
                    type="button"
                    onClick={handleCenterBoth}
                    className="px-2.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold flex items-center justify-center gap-1 transition-all border border-amber-500/30"
                  >
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    توسيط كلي
                  </button>
                </div>
              </div>

              {/* Physical Dimensions in CM (Bi-Directional Live Sync) */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Ruler className="w-4 h-4 text-emerald-400" />
                    الأبعاد الحقيقية للطباعة (سم - CM)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAspectLocked(!isAspectLocked);
                      if (!isAspectLocked && nativeRect.height > 0) {
                        setLockRatio(nativeRect.width / nativeRect.height);
                      }
                    }}
                    className={`p-1.5 rounded-lg border text-xs transition-all ${
                      isAspectLocked
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-400 font-bold"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                    title={isAspectLocked ? "إلغاء قفل نسبة العرض للارتفاع" : "قفل نسبة العرض للارتفاع"}
                  >
                    {isAspectLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">العرض (سم)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="200"
                      value={physicalWidthCm}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setPhysicalWidthCm(val);
                        if (nativeDims && val > 0) {
                          const { baseW } = getBasePhysicalDimensions();
                          const newW = Math.min(nativeDims.width, Math.max(20, Math.round((val / baseW) * nativeDims.width)));
                          const updated = clampRectToNativeBounds({ ...nativeRect, width: newW }, nativeDims.width, nativeDims.height);
                          setNativeRect(updated);
                          syncCurrentRectToState(updated, val, physicalHeightCm);
                        }
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono font-bold focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">الارتفاع (سم)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="200"
                      value={physicalHeightCm}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setPhysicalHeightCm(val);
                        if (nativeDims && val > 0) {
                          const { baseH } = getBasePhysicalDimensions();
                          const newH = Math.min(nativeDims.height, Math.max(20, Math.round((val / baseH) * nativeDims.height)));
                          const updated = clampRectToNativeBounds({ ...nativeRect, height: newH }, nativeDims.width, nativeDims.height);
                          setNativeRect(updated);
                          syncCurrentRectToState(updated, physicalWidthCm, val);
                        }
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono font-bold focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  <span>المساحة الفعلية:</span>
                  <span className="font-mono font-bold text-emerald-400" dir="ltr">
                    {Math.round(physicalWidthCm * physicalHeightCm * 10) / 10} cm² ({physicalWidthCm} × {physicalHeightCm} cm)
                  </span>
                </div>
              </div>

              {/* Print Technical Specs */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-indigo-400" />
                  المواصفات الفنية للطباعة وتصدير الـ DPI
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">دقة الإخراج (DPI)</span>
                    <select
                      value={targetDPI}
                      onChange={(e) => setTargetDPI(parseInt(e.target.value) || 300)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-bold focus:border-amber-400 focus:outline-none"
                    >
                      <option value={150}>150 DPI (معاينة سريعة)</option>
                      <option value={300}>300 DPI (طباعة قياسية فائقة)</option>
                      <option value={600}>600 DPI (طباعة ألترا HD)</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">تقنية الطباعة</span>
                    <select
                      value={printMethod}
                      onChange={(e) => setPrintMethod(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-bold focus:border-amber-400 focus:outline-none"
                    >
                      <option value="DTF">DTF Direct to Film</option>
                      <option value="DTG">DTG Direct to Garment</option>
                      <option value="UV">UV Printing</option>
                      <option value="Sublimation">Sublimation حراري</option>
                      <option value="Embroidery">تطريز Embroidery</option>
                    </select>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">هامش الأمان (Bleed - ملم)</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="20"
                    value={bleedMm}
                    onChange={(e) => setBleedMm(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono font-bold focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Exact Pixel Coordinates (Inspection) */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>إحداثيات الموضع:</span>
                  <span className="text-slate-200">
                    X: {Math.round(nativeRect.x)}px | Y: {Math.round(nativeRect.y)}px
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>أبعاد البكسل:</span>
                  <span className="text-amber-400 font-bold">
                    W: {Math.round(nativeRect.width)}px | H: {Math.round(nativeRect.height)}px
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>النسبة من الصورة:</span>
                  <span className="text-emerald-400 font-bold">
                    {nativeDims ? Math.round((nativeRect.width / nativeDims.width) * 100) : 0}% ×{" "}
                    {nativeDims ? Math.round((nativeRect.height / nativeDims.height) * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* Reset Button */}
              <button
                type="button"
                onClick={handleReset}
                className="mt-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                استعادة الضبط الافتراضي للصورة
              </button>
            </div>
          </div>
        )}

        {/* Footer Actions Bar */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {faceImages.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  handleSyncToAllColorsOfFace();
                  setSyncSuccess(true);
                  setTimeout(() => setSyncSuccess(false), 2500);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  syncSuccess
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30"
                }`}
              >
                {syncSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>تم توحيد الأبعاد على كافة ألوان ({SUPPORTED_FACES.find((f) => f.id === activeFace)?.label.split(" (")[0]}) بنجاح</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span>تطبيق هذه الأبعاد على جميع ألوان واجهة ({SUPPORTED_FACES.find((f) => f.id === activeFace)?.label.split(" (")[0]})</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all border border-slate-700"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleMasterSave}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <CheckCheck className="w-4 h-4 stroke-[2.5]" />
              حفظ التعديلات
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintAreaEditorModal;
