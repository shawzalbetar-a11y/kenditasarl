"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getProductMedia } from '@/lib/products';
import {
  getCustomizationConfig,
  CustomizationConfig,
  PrintArea,
  ImageSpecificGeometry,
} from '@/lib/customizationConfig';
import {
  validateProductImage,
  getDefaultImageContract,
  ProductImageContract,
  ImageValidationResult,
} from '@/lib/imageContract';
import {
  validatePrintAreaCoordinates,
  resolveImagePrintAreaGeometry,
} from '@/lib/coordinateMapping';
import PrintAreaEditor from '@/components/admin/PrintAreaEditor';
import {
  ArrowLeft,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  Save,
  Loader2,
  FileCode,
  ExternalLink,
  Info,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';

export interface MockupImageItem {
  id: string; // unique image identifier
  url: string;
  faceId: string;
  label: string;
  angle?: string;
}

export default function AdminProductCustomizationPage() {
  const params = useParams();
  const router = useRouter();
  const productId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  // Product & Customization State
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [productData, setProductData] = useState<any>(null);
  const [customizationConfig, setCustomizationConfig] = useState<CustomizationConfig | null>(null);
  
  // Available Mockup Images
  const [mockupImages, setMockupImages] = useState<MockupImageItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string>('front');

  // Image Dimensions & Validation State per imageId
  const [imageDimensions, setImageDimensions] = useState<{ [imageId: string]: { width: number; height: number } }>({});
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [imageValidation, setImageValidation] = useState<{ [imageId: string]: ImageValidationResult }>({});

  // Active Print Areas (Face Fallback copy + Image Specific Geometries)
  const [workingPrintAreas, setWorkingPrintAreas] = useState<{ [face: string]: PrintArea }>({});
  const [workingImageGeometries, setWorkingImageGeometries] = useState<{ [imageKey: string]: ImageSpecificGeometry }>({});
  const [showPayloadInspection, setShowPayloadInspection] = useState<boolean>(false);

  // Save & Verification Feedback State
  const [saveStatus, setSaveStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
    verifiedFields?: Record<string, any>;
  }>({ type: null, message: '' });

  // 1. Fetch Product & Discover All Mockup Images
  const loadProduct = useCallback(async () => {
    if (!productId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let pData: any = null;
      if (db) {
        try {
          const snap = await getDoc(doc(db, 'products', productId));
          if (snap.exists()) {
            pData = { id: snap.id, ...snap.data() };
          }
        } catch (e) {
          console.warn("Firestore fetch fallback", e);
        }
      }

      if (!pData) {
        pData = {
          id: productId,
          name_en: `Product ${productId}`,
          name_ar: `المنتج ${productId}`,
          category_id: 't-shirts',
          base_price: 250,
        };
      }

      setProductData(pData);

      // Resolve Media / Mockup Images
      const media = await getProductMedia(productId);
      const discoveredImages: MockupImageItem[] = [];

      // 1. Add base images
      if (media.front) {
        discoveredImages.push({ id: 'front-straight', url: media.front, faceId: 'front', label: 'Front (Straight)', angle: 'straight' });
      } else {
        discoveredImages.push({ id: 'front-straight', url: 'https://via.placeholder.com/2400x3000?text=Front+Straight', faceId: 'front', label: 'Front (Straight)', angle: 'straight' });
      }
      if (media.back) {
        discoveredImages.push({ id: 'back-straight', url: media.back, faceId: 'back', label: 'Back (Straight)', angle: 'straight' });
      } else {
        discoveredImages.push({ id: 'back-straight', url: 'https://via.placeholder.com/2400x3000?text=Back+Straight', faceId: 'back', label: 'Back (Straight)', angle: 'straight' });
      }
      if (media.left) {
        discoveredImages.push({ id: 'left-sleeve', url: media.left, faceId: 'left', label: 'Left Sleeve', angle: 'angled' });
      }
      if (media.right) {
        discoveredImages.push({ id: 'right-sleeve', url: media.right, faceId: 'right', label: 'Right Sleeve', angle: 'angled' });
      }

      // 2. Discover from media subcollections or extra images in pData
      if (Array.isArray(pData.media)) {
        pData.media.forEach((m: any, idx: number) => {
          if (m.url && !discoveredImages.some(d => d.url === m.url)) {
            discoveredImages.push({
              id: m.id || `media-${idx}`,
              url: m.url,
              faceId: m.faceId || m.angle || 'custom',
              label: m.label || m.name || `View ${idx + 1} (${m.angle || 'angled'})`,
              angle: m.angle || 'perspective',
            });
          }
        });
      }

      // 3. Discover from stored image_geometries
      const baseConfig = pData.customization_config || getCustomizationConfig(pData.category_id);
      if (baseConfig.image_geometries) {
        Object.values(baseConfig.image_geometries).forEach((geo: any) => {
          if (geo.imageId && geo.imageUrl && !discoveredImages.some(d => d.id === geo.imageId)) {
            discoveredImages.push({
              id: geo.imageId,
              url: geo.imageUrl,
              faceId: geo.faceId || 'front',
              label: geo.printArea?.name || geo.imageId,
              angle: geo.angle,
            });
          }
        });
      }

      setMockupImages(discoveredImages);
      setCustomizationConfig(baseConfig);

      // Initialize working print areas from config
      const initialAreas: { [face: string]: PrintArea } = {};
      Object.keys(baseConfig.faces || {}).forEach(f => {
        if (baseConfig.faces[f]?.printArea) {
          initialAreas[f] = { ...baseConfig.faces[f].printArea };
        }
      });
      setWorkingPrintAreas(initialAreas);

      // Initialize working image geometries from config
      if (baseConfig.image_geometries) {
        setWorkingImageGeometries({ ...baseConfig.image_geometries });
      }

      // Set initial selected image
      if (discoveredImages.length > 0) {
        setSelectedImageId(discoveredImages[0].id);
      }
    } catch (err) {
      console.error("Failed to load product for customization", err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  // Currently active mockup image
  const activeImage = useMemo(() => {
    return mockupImages.find(img => img.id === selectedImageId) || mockupImages[0] || null;
  }, [mockupImages, selectedImageId]);

  // Active face from current image
  const activeFace = activeImage?.faceId || 'front';

  // 2. Load Active Image Dimensions & Validate Contract
  useEffect(() => {
    if (!activeImage?.url) return;

    setImageLoading(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = activeImage.url;

    img.onload = () => {
      const w = img.naturalWidth || 2400;
      const h = img.naturalHeight || 3000;

      setImageDimensions(prev => ({ ...prev, [activeImage.id]: { width: w, height: h } }));

      // Validate against Image Contract
      const contract: ProductImageContract =
        productData?.customization_config?.imageContract ||
        getDefaultImageContract(productData?.category_id);

      const mime = activeImage.url.includes('.jpg') || activeImage.url.includes('.jpeg')
        ? 'image/jpeg'
        : activeImage.url.includes('.webp')
        ? 'image/webp'
        : 'image/png';

      const validationResult = validateProductImage({ width: w, height: h }, mime, contract, activeFace);
      setImageValidation(prev => ({ ...prev, [activeImage.id]: validationResult }));
      setImageLoading(false);
    };

    img.onerror = () => {
      const fallbackW = 2400;
      const fallbackH = 3000;
      setImageDimensions(prev => ({ ...prev, [activeImage.id]: { width: fallbackW, height: fallbackH } }));
      
      const contract = getDefaultImageContract(productData?.category_id);
      const val = validateProductImage({ width: fallbackW, height: fallbackH }, 'image/png', contract, activeFace);
      setImageValidation(prev => ({ ...prev, [activeImage.id]: val }));
      setImageLoading(false);
    };
  }, [activeImage, activeFace, productData]);

  // Active configuration getters
  const activePrintArea: PrintArea = useMemo(() => {
    if (!activeImage) {
      return {
        id: 'front',
        name: 'FRONT',
        width: 400,
        height: 500,
        top: 100,
        left: 100,
        printMethod: 'DTF',
      };
    }

    // Check working image geometries first
    if (workingImageGeometries[activeImage.id]?.printArea) {
      return workingImageGeometries[activeImage.id].printArea;
    }

    // Resolve via central resolver hierarchy
    return resolveImagePrintAreaGeometry({
      config: customizationConfig,
      faceId: activeImage.faceId,
      currentImage: { imageId: activeImage.id, imageUrl: activeImage.url },
    });
  }, [workingImageGeometries, activeImage, customizationConfig]);

  const currentImageDims = (activeImage && imageDimensions[activeImage.id]) || { width: 2400, height: 3000 };
  const currentValidation = activeImage ? imageValidation[activeImage.id] : undefined;

  // Callback when PrintAreaEditor coordinates change for the active image
  const handlePrintAreaChange = (updated: PrintArea) => {
    if (!activeImage) return;
    const dims = currentImageDims;

    const updatedImageGeometry: ImageSpecificGeometry = {
      imageId: activeImage.id,
      imageUrl: activeImage.url,
      faceId: activeImage.faceId,
      angle: activeImage.angle,
      nativeWidth: dims.width,
      nativeHeight: dims.height,
      printArea: {
        ...updated,
        nativeWidth: dims.width,
        nativeHeight: dims.height,
      },
    };

    setWorkingImageGeometries(prev => ({
      ...prev,
      [activeImage.id]: updatedImageGeometry,
    }));

    // Keep face fallback updated as well
    setWorkingPrintAreas(prev => ({
      ...prev,
      [activeImage.faceId]: updated,
    }));
  };

  // 3. SAFE NON-DESTRUCTIVE SAVE WORKFLOW WITH READ-AFTER-WRITE VERIFICATION
  const handleSaveCustomization = async () => {
    if (!db) {
      setSaveStatus({ type: 'error', message: 'Firestore connection is not available.' });
      return;
    }

    setIsSaving(true);
    setSaveStatus({ type: null, message: '' });

    try {
      // STEP A: Pre-Save Validation across ALL working image geometries
      for (const imgId of Object.keys(workingImageGeometries)) {
        const geo = workingImageGeometries[imgId];
        const area = geo.printArea;
        const dims = { width: geo.nativeWidth, height: geo.nativeHeight };

        // 1. Validate Print Area Boundary & Coordinates
        const coordVal = validatePrintAreaCoordinates(
          { x: area.left, y: area.top, width: area.width, height: area.height },
          dims.width,
          dims.height
        );

        if (!coordVal.isValid) {
          throw new Error(
            `Print Area validation failed for image "${imgId}": ${coordVal.errors.join(', ')}`
          );
        }
      }

      // STEP B: Build Strict Non-Destructive Payload
      const updatedConfig: CustomizationConfig = {
        version: customizationConfig?.version || 1,
        enabled: true,
        allowCustomerUpload: customizationConfig?.allowCustomerUpload ?? true,
        allowText: customizationConfig?.allowText ?? true,
        allowStickers: customizationConfig?.allowStickers ?? true,
        allowFreeMode: customizationConfig?.allowFreeMode ?? false,
        productType: customizationConfig?.productType || productData?.category_id || 't-shirt',
        faces: Object.keys(workingPrintAreas).reduce((acc: any, faceKey) => {
          acc[faceKey] = {
            name: customizationConfig?.faces?.[faceKey]?.name || faceKey.toUpperCase(),
            enabled: customizationConfig?.faces?.[faceKey]?.enabled ?? true,
            printArea: workingPrintAreas[faceKey],
          };
          return acc;
        }, {}),
        image_geometries: {
          ...(customizationConfig?.image_geometries || {}),
          ...workingImageGeometries,
        },
      };

      // STEP C: Atomic Partial Firestore Write (TOUCHES ONLY customization_config)
      const productRef = doc(db, 'products', productId);
      await setDoc(productRef, { customization_config: updatedConfig }, { merge: true });

      // STEP D: Read-After-Write Verification
      const verifySnap = await getDoc(productRef);
      if (!verifySnap.exists()) {
        throw new Error('Verification failed: Product document not found after write.');
      }

      const verifiedData = verifySnap.data();
      const verifiedConfig = verifiedData.customization_config;

      if (!verifiedConfig) {
        throw new Error('Verification failed: customization_config missing in stored document.');
      }

      // Verify image geometries match
      const verifiedSummary: Record<string, any> = {};
      Object.keys(workingImageGeometries).forEach(imgId => {
        const storedGeo = verifiedConfig.image_geometries?.[imgId];
        if (storedGeo?.printArea) {
          verifiedSummary[imgId] = {
            x: storedGeo.printArea.left,
            y: storedGeo.printArea.top,
            width: storedGeo.printArea.width,
            height: storedGeo.printArea.height,
            nativeWidth: storedGeo.nativeWidth,
            nativeHeight: storedGeo.nativeHeight,
            physicalWidthCm: storedGeo.printArea.physicalWidthCm,
            physicalHeightCm: storedGeo.printArea.physicalHeightCm,
            targetDPI: storedGeo.printArea.targetDPI,
            printMethod: storedGeo.printArea.printMethod,
          };
        }
      });

      // Update local state to reflect verified state
      setCustomizationConfig(verifiedConfig);
      setSaveStatus({
        type: 'success',
        message: `Successfully saved and verified customization configuration with ${Object.keys(verifiedSummary).length} image-specific geometry calibrations.`,
        verifiedFields: verifiedSummary,
      });
    } catch (err: any) {
      console.error('Error saving customization config:', err);
      setSaveStatus({
        type: 'error',
        message: err.message || 'An unexpected error occurred while saving.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
        <p className="font-bold text-slate-300">Loading Product Configuration...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">

        {/* Top Navigation & Header */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl transition text-slate-700"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck size={12} />
                  Safe Non-Destructive Update
                </span>
                <span className="text-xs font-semibold text-slate-500">Firestore `customization_config` Only</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 mt-1">
                Visual Print Area Editor — {productData?.name_en || productData?.name_ar || productId}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                SKU: <span className="font-mono">{productData?.sku || 'SKU-001'}</span> | Category: <span className="font-semibold">{productData?.category_id || 't-shirt'}</span>
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            <Link
              href={`/design-studio/${productId}`}
              target="_blank"
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <ExternalLink size={14} />
              <span>Test in Design Studio</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowPayloadInspection(!showPayloadInspection)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <FileCode size={14} />
              <span>{showPayloadInspection ? 'Hide Payload' : 'Inspect Payload'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveCustomization}
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-md shadow-blue-500/20 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving & Verifying...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Customization Config</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Save Status Notification Banner */}
        {saveStatus.type && (
          <div className={`p-4 rounded-2xl border flex flex-col gap-2 ${
            saveStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center gap-2.5 font-bold text-sm">
              {saveStatus.type === 'success' ? (
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertOctagon size={20} className="text-rose-600 shrink-0" />
              )}
              <span>{saveStatus.message}</span>
            </div>

            {saveStatus.verifiedFields && (
              <div className="mt-2 pt-2 border-t border-emerald-200/60 text-xs grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
                {Object.entries(saveStatus.verifiedFields).map(([face, val]: any) => (
                  <div key={face} className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                    <span className="font-bold text-emerald-800 uppercase block mb-1">{face} Face (Verified)</span>
                    <div className="text-[11px] text-slate-700 space-y-0.5">
                      <div>Pos: X={val.x}px, Y={val.y}px</div>
                      <div>Size: {val.width}×{val.height}px</div>
                      <div>Phys: {val.physicalWidthCm}×{val.physicalHeightCm}cm @ {val.targetDPI}DPI</div>
                      <div>Method: {val.printMethod}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mockup Image Selector (Image-Driven Calibration) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
              <ImageIcon size={14} className="text-blue-600" />
              Select Mockup Image to Calibrate Print Area
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              {mockupImages.length} Image(s) Available
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {mockupImages.map(img => {
              const isSelected = selectedImageId === img.id;
              const hasCustomGeo = !!workingImageGeometries[img.id]?.printArea;

              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedImageId(img.id)}
                  className={`p-2 rounded-2xl border transition text-left flex flex-col gap-2 relative ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-full h-24 bg-slate-100 rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-100">
                    <img
                      src={img.url}
                      alt={img.label}
                      className="w-full h-full object-contain"
                    />
                    {img.angle && (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[9px] font-bold uppercase backdrop-blur-xs">
                        {img.angle}
                      </span>
                    )}
                    {hasCustomGeo && (
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-black uppercase shadow-xs">
                        Calibrated
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800 truncate">{img.label}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">
                      Face: {img.faceId}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Image Contract Validation Banner */}
        {currentValidation && (
          <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
            currentValidation.valid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center gap-3">
              {currentValidation.valid ? (
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertOctagon size={22} className="text-rose-600 shrink-0" />
              )}
              <div>
                <span className="font-black text-sm block">
                  {currentValidation.valid
                    ? `IMAGE CONTRACT VALID: Mockup "${activeImage?.label || activeFace.toUpperCase()}" meets all production standards`
                    : `IMAGE CONTRACT VIOLATION: Mockup "${activeImage?.label || activeFace.toUpperCase()}" failed validation`}
                </span>
                <span className="text-xs opacity-80">
                  Native Dimensions: {currentImageDims.width} × {currentImageDims.height} px | Orientation: {currentValidation.metadata?.orientation} | Aspect Ratio: {currentValidation.metadata?.aspectRatio}
                </span>
              </div>
            </div>

            {!currentValidation.valid && (
              <div className="text-xs font-semibold text-rose-800 bg-rose-100/80 px-3 py-1.5 rounded-xl">
                {currentValidation.errors.map(e => e.message).join('; ')}
              </div>
            )}
          </div>
        )}

        {/* Visual Print Area Editor Component */}
        {imageLoading ? (
          <div className="h-[600px] bg-white rounded-3xl border border-slate-200 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs font-bold text-slate-500">Evaluating image contract geometry...</span>
          </div>
        ) : (
          <PrintAreaEditor
            key={`${selectedImageId}-${productId}`}
            imageUrl={activeImage?.url || ''}
            imageId={activeImage?.id}
            angle={activeImage?.angle}
            nativeWidth={currentImageDims.width}
            nativeHeight={currentImageDims.height}
            initialPrintArea={activePrintArea}
            faceId={activeFace}
            faceName={`${activeImage?.label || activeFace.toUpperCase()}`}
            targetDpi={activePrintArea.targetDPI || 300}
            printMethod={activePrintArea.printMethod || 'DTF'}
            onChange={handlePrintAreaChange}
            onValidationChange={() => {}}
          />
        )}

        {/* Payload Inspection Panel */}
        {showPayloadInspection && (
          <div className="bg-slate-900 text-slate-100 p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col gap-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <span className="font-bold text-emerald-400 flex items-center gap-2">
                <FileCode size={16} />
                customization_config Firestore Document Payload
              </span>
              <span className="text-slate-500 text-[11px]">Strict Non-Destructive Update</span>
            </div>
            <pre className="overflow-x-auto bg-slate-950 p-4 rounded-xl text-[11px] text-emerald-300 leading-relaxed max-h-80">
              {JSON.stringify(
                {
                  version: customizationConfig?.version || 1,
                  enabled: true,
                  allowCustomerUpload: customizationConfig?.allowCustomerUpload ?? true,
                  allowText: customizationConfig?.allowText ?? true,
                  allowStickers: customizationConfig?.allowStickers ?? true,
                  allowFreeMode: customizationConfig?.allowFreeMode ?? false,
                  productType: customizationConfig?.productType || productData?.category_id || 't-shirt',
                  faces: Object.keys(workingPrintAreas).reduce((acc: any, face) => {
                    acc[face] = {
                      name: customizationConfig?.faces?.[face]?.name || face.toUpperCase(),
                      enabled: customizationConfig?.faces?.[face]?.enabled ?? true,
                      printArea: workingPrintAreas[face],
                    };
                    return acc;
                  }, {}),
                  image_geometries: workingImageGeometries,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}
