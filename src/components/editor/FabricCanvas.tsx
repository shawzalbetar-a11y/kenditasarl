"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { Type, Upload, Sticker, Undo, Redo, AlignCenter, AlignLeft, AlignRight, Save, ShoppingCart, Trash2, LayoutTemplate, X, Layers, Settings } from 'lucide-react';
import AuthModal from '@/components/auth/AuthModal';
import { auth, db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { CustomizationConfig, PrintArea } from '@/lib/customizationConfig';
import TextTools from './tools/TextTools';
import ImageTools from './tools/ImageTools';
import ShapeTools from './tools/ShapeTools';
import LayerPanel from './tools/LayerPanel';
import ValidationModal from './ValidationModal';

interface FabricCanvasProps {
  productId: string;
  basePrice: number;
  productFaces: { front: string; back: string; left: string; right: string };
  productData?: any; 
}

const PRICING = {
  text: 10,
  image: 20,
  sticker: 5,
};

export default function FabricCanvas({ productId, basePrice, productFaces, productData }: FabricCanvasProps) {
  const t = useTranslations('Editor');
  const searchParams = useSearchParams();
  const designIdFromUrl = searchParams.get('designId');
  const mode = searchParams.get('mode');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null);
  
  // The faces we support depending on the product
  const configFaces = productData?.config?.faces || { front: { printArea: { width: 200, height: 280, top: 120, left: 100 } } };
  const availableFaces = Object.keys(configFaces);
  
  const [activeFace, setActiveFace] = useState<string>(availableFaces[0] || 'front');
  const [totalPrice, setTotalPrice] = useState(basePrice);
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'cart' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [imageQualityReport, setImageQualityReport] = useState<{ status: string, message: string, color: string } | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationIssues, setValidationIssues] = useState<{ type: 'error' | 'warning', message: string }[]>([]);
  const [customizationMode, setCustomizationMode] = useState<'SAFE' | 'FREE'>('SAFE');
  const [activeMobileTab, setActiveMobileTab] = useState<string | null>(null);
  
  const [selectedSize, setSelectedSize] = useState(productData?.selectedSize || 'M');
  const [selectedColor, setSelectedColor] = useState(productData?.selectedColor || 'white');
  
  const [designAssets, setDesignAssets] = useState<any[]>([]);
  const currentDesignIdRef = useRef<string | null>(null);
  const facesData = useRef<Record<string, string | null>>({});

  // Fetch Assets
  useEffect(() => {
    async function fetchAssets() {
      if (!db) return;
      try {
        const snap = await getDocs(collection(db, 'design_assets'));
        setDesignAssets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Failed to fetch assets", err);
      }
    }
    fetchAssets();
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
            facesData.current = data.canvas_json;
            if (data.size) setSelectedSize(data.size);
            if (data.color) setSelectedColor(data.color);
            
            if (mode === 'remix') {
              // We loaded the design, but we act as if it's a new unsaved canvas
              currentDesignIdRef.current = null;
            } else {
              currentDesignIdRef.current = designIdFromUrl;
            }
            
            // Reload canvas if already initialized
            if (canvas && facesData.current[activeFace]) {
              canvas.loadFromJSON(facesData.current[activeFace], () => {
                canvas.renderAll();
                saveHistoryState();
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to load design", err);
      }
    }
    fetchDesign();
  }, [designIdFromUrl]);

  // Current Print Area
  const currentPrintArea: PrintArea = configFaces[activeFace]?.printArea || { width: 200, height: 200, top: 150, left: 100 };

  // Initialize Canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    
    

    const initCanvas = new fabric.Canvas(canvasRef.current, {
      width: currentPrintArea.width,
      height: currentPrintArea.height,
      preserveObjectStacking: true,
    });
    
    // Setup interactions
    const updatePrice = () => {
      const objects = initCanvas.getObjects();
      let extra = 0;
      objects.forEach(obj => {
        if (obj.type === 'i-text') extra += PRICING.text;
        else if (obj.type === 'image' && obj.name === 'sticker') extra += PRICING.sticker;
        else if (obj.type === 'image') extra += PRICING.image;
      });
      setTotalPrice(basePrice + extra);
    };

    initCanvas.on('object:added', () => { updatePrice(); saveHistoryStateCanvas(initCanvas); });
    initCanvas.on('object:removed', () => { updatePrice(); saveHistoryStateCanvas(initCanvas); });
    initCanvas.on('object:modified', () => { saveHistoryStateCanvas(initCanvas); });

    const updateActiveObj = () => setActiveObject(initCanvas.getActiveObject() || null);
    initCanvas.on('selection:created', updateActiveObj);
    initCanvas.on('selection:updated', updateActiveObj);
    initCanvas.on('selection:cleared', updateActiveObj);

    // Snapping & Validation
    const validateAndSnap = () => {
      const activeObj = initCanvas.getActiveObject();
      if (!activeObj) {
        setValidationWarning(null);
        return;
      }

      // Snapping to center
      const centerX = currentPrintArea.width / 2;
      const centerY = currentPrintArea.height / 2;
      const SNAP_ZONE = 10;
      let snapped = false;

      // Note: activeObj.aCoords provides exact bounding corners regardless of rotation/origin
      const objCenterX = activeObj.left || 0;
      const objCenterY = activeObj.top || 0;
      
      // We only snap if the origin is center, but standard fabric uses top/left.
      // We can use getCenterPoint()
      const centerPt = activeObj.getCenterPoint();

      if (Math.abs(centerPt.x - centerX) < SNAP_ZONE) {
        activeObj.set({ left: activeObj.left! + (centerX - centerPt.x) });
        snapped = true;
      }
      if (Math.abs(centerPt.y - centerY) < SNAP_ZONE) {
        activeObj.set({ top: activeObj.top! + (centerY - centerPt.y) });
        snapped = true;
      }

      // Safe Area Validation (Basic check: does bounding rect exceed safe area?)
      if (currentPrintArea.safeArea) {
        const br = activeObj.getBoundingRect();
        const safeAreaObj = currentPrintArea.safeArea;
        
        const isOutsideSafeX = br.left < safeAreaObj.left || (br.left + br.width) > (safeAreaObj.left + safeAreaObj.width);
        const isOutsideSafeY = br.top < safeAreaObj.top || (br.top + br.height) > (safeAreaObj.top + safeAreaObj.height);
        
        if (isOutsideSafeX || isOutsideSafeY) {
          setValidationWarning(t('outOfSafeArea', { fallback: 'Warning: Element is outside the safe print area.' }));
        } else {
          setValidationWarning(null);
        }
      }
    };

    initCanvas.on('object:moving', validateAndSnap);
    initCanvas.on('object:scaling', validateAndSnap);
    initCanvas.on('object:modified', validateAndSnap);

    // Load data for current face if exists
    if (facesData.current[activeFace]) {
      initCanvas.loadFromJSON(facesData.current[activeFace], () => {
        initCanvas.renderAll();
        saveHistoryStateCanvas(initCanvas);
        updatePrice();
      });
    }

    setCanvas(initCanvas);

    return () => {
      initCanvas.dispose();
    };
  }, [activeFace, currentPrintArea.width, currentPrintArea.height]); // Re-initialize when print area changes

  // Autosave logic
  useEffect(() => {
    if (!canvas) return;
    const interval = setInterval(async () => {
      facesData.current[activeFace] = JSON.stringify(canvas.toJSON(['name', 'originalAssetId']));
      localStorage.setItem(`draft_${productId}`, JSON.stringify(facesData.current));
      
      if (auth?.currentUser && db) {
        try {
          const docData = {
            user_id: auth.currentUser.uid,
            product_id: productId,
            size: selectedSize,
            color: selectedColor,
            canvas_json: facesData.current,
            totalPrice,
            status: 'draft',
            updated_at: new Date().toISOString()
          };
          if (currentDesignIdRef.current) {
            await updateDoc(doc(db, 'designs', currentDesignIdRef.current), docData);
          } else {
            const newDoc = await addDoc(collection(db, 'designs'), { ...docData, created_at: new Date().toISOString() });
            currentDesignIdRef.current = newDoc.id;
          }
        } catch (err) {
          console.error("Autosave failed", err);
        }
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [canvas, activeFace, productId, selectedSize, selectedColor, totalPrice]);

  const saveHistoryStateCanvas = (c: fabric.Canvas) => {
    if (!c) return;
    const json = JSON.stringify(c.toJSON(['name', 'originalAssetId']));
    setHistory(prev => {
      const newHistory = prev.slice(0, historyStep + 1);
      newHistory.push(json);
      setHistoryStep(newHistory.length - 1);
      return newHistory;
    });
  };

  const saveHistoryState = () => {
    if (canvas) saveHistoryStateCanvas(canvas);
  }

  const undo = () => {
    if (!canvas || historyStep <= 0) return;
    const prevStep = historyStep - 1;
    canvas.loadFromJSON(history[prevStep], () => {
      canvas.renderAll();
      setHistoryStep(prevStep);
    });
  };

  const redo = () => {
    if (!canvas || historyStep >= history.length - 1) return;
    const nextStep = historyStep + 1;
    canvas.loadFromJSON(history[nextStep], () => {
      canvas.renderAll();
      setHistoryStep(nextStep);
    });
  };

  const switchFace = (face: string) => {
    if (!canvas || face === activeFace) return;
    facesData.current[activeFace] = JSON.stringify(canvas.toJSON(['name', 'originalAssetId']));
    setHistory([]);
    setHistoryStep(-1);
    setActiveFace(face);
  };

  const addText = () => {
    if (!canvas) return;
    const txt = t('newText', { fallback: 'New Text' });
    const isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(txt);
    const text = new fabric.Textbox(txt, {
      left: currentPrintArea.width / 2,
      top: currentPrintArea.height / 2,
      originX: 'center',
      originY: 'center',
      width: Math.min(200, currentPrintArea.width - 20),
      fontFamily: 'Arial',
      fill: '#000000',
      fontSize: 24,
      direction: isRtl ? 'rtl' : 'ltr',
      textAlign: isRtl ? 'right' : 'left',
    });
    canvas.add(text);
    canvas.setActiveObject(text);
  };

  const addSticker = (url: string) => {
    if (!canvas) return;
    fabric.Image.fromURL(url, (img) => {
      (img as any).set({
        left: 10,
        top: 10,
        name: 'sticker',
        originalAssetId: url
      });
      img.scaleToWidth(currentPrintArea.width / 2);
      canvas.add(img);
      canvas.setActiveObject(img);
    }, { crossOrigin: 'anonymous' });
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !canvas) return;
    const file = e.target.files[0];
    
    // 1. Check MIME Type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      alert(t('invalidFileType', { fallback: 'Invalid file type. Please upload PNG, JPG, WEBP, or SVG.' }));
      return;
    }

    // 2. Client-side Image Analysis before upload
    const reader = new FileReader();
    reader.onload = (event) => {
      const imgObj = new Image();
      imgObj.onload = async () => {
        const width = imgObj.width;
        const height = imgObj.height;
        const maxDim = Math.max(width, height);
        
        // Quality Engine Logic
        let status = '🔴 غير مناسبة';
        let message = 'جودة الصورة منخفضة جداً وستظهر مشوشة عند الطباعة.';
        let color = 'bg-red-50 border-red-200 text-red-700';

        if (maxDim > 2000) {
          status = '🟢 ممتازة';
          message = 'دقة عالية جداً. ستكون الطباعة واضحة ونقية.';
          color = 'bg-green-50 border-green-200 text-green-700';
        } else if (maxDim > 1000) {
          status = '🟡 جيدة';
          message = 'دقة جيدة. مناسبة لمعظم أحجام الطباعة.';
          color = 'bg-yellow-50 border-yellow-200 text-yellow-700';
        } else if (maxDim > 500) {
          status = '🟠 منخفضة';
          message = 'جودة منخفضة. قد تظهر بعض البكسلة إذا تم تكبيرها كثيراً.';
          color = 'bg-orange-50 border-orange-200 text-orange-700';
        }

        // Format specific advice
        if (file.type === 'image/png') {
          message += ' خلفية شفافة — مناسب للتصاميم والملصقات.';
        } else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          message += ' (تنبيه: تأكد من أن الخلفية البيضاء أو الملونة في الصورة لن تشوه تصميمك).';
        }

        setImageQualityReport({ status, message, color });
        
        // Auto dismiss after 10 seconds
        setTimeout(() => setImageQualityReport(null), 10000);

        // 3. Proceed with upload
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await fetch('/api/upload', { method: 'POST', body: formData });
          const data = await response.json();
          
          if (data.url) {
            fabric.Image.fromURL(data.url, (img) => {
              (img as any).set({ left: 10, top: 10, name: 'user_upload', originalAssetId: data.url });
              img.scaleToWidth(currentPrintArea.width / 2);
              canvas.add(img);
              canvas.setActiveObject(img);
              saveHistoryState();
            }, { crossOrigin: 'anonymous' });
          }
        } catch (error) {
          alert(t('uploadError'));
        } finally {
          setIsUploading(false);
        }
      };
      imgObj.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const deleteSelected = () => {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
      canvas.discardActiveObject();
      activeObjects.forEach(obj => canvas.remove(obj));
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
      const br = obj.getBoundingRect();
      const safeArea = currentPrintArea.safeArea;
      if (safeArea) {
        if (br.left < safeArea.left || (br.left + br.width) > (safeArea.left + safeArea.width) ||
            br.top < safeArea.top || (br.top + br.height) > (safeArea.top + safeArea.height)) {
          hasOutofBounds = true;
        }
      } else {
        if (br.left < 0 || (br.left + br.width) > currentPrintArea.width ||
            br.top < 0 || (br.top + br.height) > currentPrintArea.height) {
          hasOutofBounds = true;
        }
      }

      if (obj.type === 'textbox' || obj.type === 'i-text') {
        const textObj = obj as fabric.Textbox;
        if (textObj.text === t('newText', { fallback: 'New Text' })) {
          hasDefaultText = true;
        }
      }
    });

    if (hasOutofBounds) issues.push({ type: 'warning', message: t('outOfBoundsWarn', { fallback: 'Some elements are outside the safe print area and may be cropped.' }) });
    if (hasDefaultText) issues.push({ type: 'warning', message: t('defaultTextWarn', { fallback: 'You left some default text without modifying it.' }) });

    if (issues.length > 0) {
      setValidationIssues(issues);
      setIsValidationModalOpen(true);
    } else {
      setCustomizationMode('SAFE');
      if (!auth?.currentUser) {
        setPendingAction('cart');
        setIsAuthModalOpen(true);
      } else {
        executeAction('cart');
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
      setPendingAction('cart');
      setIsAuthModalOpen(true);
    } else {
      executeAction('cart');
    }
  };

  const handleFreeMode = () => {
    setIsValidationModalOpen(false);
    setCustomizationMode('FREE');
    if (!auth?.currentUser) {
      setPendingAction('cart');
      setIsAuthModalOpen(true);
    } else {
      executeAction('cart');
    }
  };

  const handleAction = (action: 'save' | 'cart') => {
    if (action === 'cart') {
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


  const onAuthSuccess = () => {
    if (pendingAction) {
      executeAction(pendingAction);
      setPendingAction(null);
    }
  };

  const executeAction = async (action: 'save' | 'cart') => {
    if (!canvas) return;
    setIsSaving(true);
    
    // Save current face
    facesData.current[activeFace] = JSON.stringify(canvas.toJSON(['name', 'originalAssetId']));
    
    // Extract a preview (this is just the canvas content now, we'll need to composite it later on server/client for real preview)
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    const blob = dataURLtoBlob(dataUrl);
    const formData = new FormData();
    formData.append('file', blob, 'preview.png');
    
    let previewUrl = '';
    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      previewUrl = data.url;
    } catch (err) {
      console.warn("Failed to upload preview", err);
    }

    try {
      if (!db) throw new Error("Firestore not initialized");
      
      const docData = {
        user_id: auth.currentUser?.uid,
        product_id: productId,
        variant_id: `${selectedColor}_${selectedSize}`,
        size: selectedSize,
        color: selectedColor,
        design_type: 'custom',
        customization_mode: customizationMode,
        print_area_config: currentPrintArea,
        production_snapshot: {
          snapshotVersion: 1,
          editorVersion: 1,
          customization_config: productData?.config || { faces: {} },
          printAreas: Object.keys(configFaces).reduce((acc: any, face: string) => {
            acc[face] = configFaces[face].printArea;
            return acc;
          }, {})
        },
        quality_metadata: imageQualityReport ? {
          status: imageQualityReport.status,
          message: imageQualityReport.message
        } : null,
        canvas_json: facesData.current, // Contains objects, text, fonts, colors, positions, scale, rotation, opacity
        preview_image_url: previewUrl,
        totalPrice,
        status: action === 'save' ? 'saved' : 'draft',
        updated_at: new Date().toISOString()
      };
      
      if (currentDesignIdRef.current) {
        await updateDoc(doc(db, 'designs', currentDesignIdRef.current), docData);
      } else {
        const newDoc = await addDoc(collection(db, 'designs'), { ...docData, created_at: new Date().toISOString() });
        currentDesignIdRef.current = newDoc.id;
      }

      if (action === 'save') alert(t('saveSuccess'));
      else if (action === 'cart') {
        const response = await fetch('/api/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            size: selectedSize,
            color: selectedColor,
            designId: currentDesignIdRef.current,
            quantity: 1,
            userId: auth.currentUser?.uid
          })
        });
        const resData = await response.json();
        if (resData.success) {
          alert(t('cartSuccess'));
        } else {
          throw new Error(resData.error || 'Server pricing validation failed');
        }
      }
    } catch (err) {
      console.error(err);
      alert(t('saveError'));
    }
    
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-[calc(100dvh-180px)] md:h-[calc(100vh-140px)] w-full">
      {/* Canvas Area */}
      <div className="flex-1 flex flex-col gap-2 md:gap-4 bg-gray-50/50 rounded-3xl overflow-hidden relative border border-border/50 shadow-inner">
        
        {/* Face Selector & Validation Banner */}
        <div className="absolute top-4 left-0 right-0 flex flex-col items-center gap-2 z-30 pointer-events-none">
           <div className="flex bg-white/90 backdrop-blur shadow-sm rounded-full p-1 border border-border/50 pointer-events-auto">
              {availableFaces.map(face => (
                <button
                  key={face}
                  onClick={() => setActiveFace(face)}
                  className={cn(
                    "px-4 md:px-6 py-2 rounded-full text-xs md:text-sm font-bold transition-all capitalize",
                    activeFace === face 
                      ? "bg-[var(--color-primary)] text-white shadow-md" 
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)] hover:bg-gray-100"
                  )}
                >
                  {t(face, { fallback: face })}
                </button>
              ))}
           </div>
           
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

        {/* Quality Banner */}
        {imageQualityReport && (
          <div className="absolute bottom-4 left-4 right-4 z-30 pointer-events-none flex justify-center">
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

        {/* Mockup Display */}
        <div className="w-full h-full relative flex items-center justify-center p-4">
           {/* Base Product Image */}
           <img 
             src={productFaces[activeFace as keyof typeof productFaces]} 
             alt={`${activeFace} view`}
             className="w-full h-full object-contain pointer-events-none"
             style={{ 
               mixBlendMode: 'multiply',
               opacity: 0.95 
             }}
           />
           
           {/* Fabric Canvas Overlay positioned exactly on Print Area */}
           <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div 
                className="relative pointer-events-auto overflow-visible ring-1 ring-black/5"
                style={{ 
                  width: `${(currentPrintArea.width / 400) * 100}%`, 
                  height: `${(currentPrintArea.height / 500) * 100}%`,
                  top: `${(currentPrintArea.top / 500) * 100}%`,
                  left: `${(currentPrintArea.left / 400) * 100}%`,
                  borderRadius: currentPrintArea.shape === 'circle' ? '50%' : '0px',
                  boxShadow: '0 0 0 9999px rgba(255,255,255,0.2)'
                }}
              >
                <div className="w-full h-full relative origin-top-left" style={{ transform: `scale(1)` }}>
                    {currentPrintArea.safeArea && (
                      <div 
                        className="absolute border border-dashed border-red-400/60 pointer-events-none z-10"
                        style={{
                          left: `${(currentPrintArea.safeArea.left / currentPrintArea.width) * 100}%`,
                          top: `${(currentPrintArea.safeArea.top / currentPrintArea.height) * 100}%`,
                          width: `${(currentPrintArea.safeArea.width / currentPrintArea.width) * 100}%`,
                          height: `${(currentPrintArea.safeArea.height / currentPrintArea.height) * 100}%`,
                          borderRadius: currentPrintArea.safeArea.shape === 'circle' ? '50%' : '0px'
                        }}
                      />
                    )}
                    <canvas ref={canvasRef} className="w-full h-full relative z-20" />
                </div>
              </div>
           </div>
        </div>
      </div>

      {/* Desktop Sidebar / Mobile Bottom Sheet Overlay */}
      {activeMobileTab && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setActiveMobileTab(null)}
        />
      )}

      {/* Sidebar Toolbar (Desktop right/left side, Mobile Bottom Sheet) */}
      <div className={cn(
        "w-full md:w-80 flex flex-col gap-4 pb-20 md:pb-4",
        "fixed md:static inset-x-0 bottom-0 bg-white md:bg-transparent z-50 md:z-auto",
        "rounded-t-3xl md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-none p-5 md:p-0",
        "transition-transform duration-300 max-h-[85vh] md:max-h-none overflow-y-auto",
        activeMobileTab ? "translate-y-0" : "translate-y-full md:translate-y-0"
      )}>
        
        {/* Mobile Sheet Header */}
        <div className="md:hidden flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
          <span className="font-bold text-gray-800 text-lg capitalize">{activeMobileTab === 'all' ? t('tools') : activeMobileTab}</span>
          <button onClick={() => setActiveMobileTab(null)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600">
            <X size={20}/>
          </button>
        </div>

        {/* Properties Panel */}
        <div className={cn("bg-white md:rounded-3xl md:p-5 md:shadow-sm md:border border-border/50", (!activeMobileTab || activeMobileTab === 'properties') ? "block" : "hidden md:block")}>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
               <span className="text-sm font-semibold">{t('size')}</span>
               <select value={selectedSize} onChange={(e)=>setSelectedSize(e.target.value)} className="bg-transparent font-bold outline-none cursor-pointer">
                 {['S', 'M', 'L', 'XL', 'XXL'].map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
               <span className="text-sm font-semibold">{t('color')}</span>
               <div className="w-6 h-6 rounded-full border border-gray-300 shadow-sm" style={{ backgroundColor: selectedColor === 'white' ? '#fff' : selectedColor === 'black' ? '#000' : selectedColor }} />
            </div>
          </div>
        </div>

        {/* Tools Panel */}
        <div className={cn("bg-white md:rounded-3xl md:p-5 md:shadow-sm md:border border-border/50 flex-1 flex-col gap-5", (!activeMobileTab || activeMobileTab === 'all' || activeMobileTab === 'elements') ? "flex" : "hidden md:flex")}>
          <h4 className="font-bold text-[var(--color-secondary)] hidden md:block">{t('addElements', { fallback: 'Add Elements' })}</h4>
          
          <div className={cn("grid grid-cols-2 gap-3", (activeMobileTab === 'elements' || !activeMobileTab || activeMobileTab === 'all') ? "grid" : "hidden md:grid")}>
            <button onClick={addText} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors text-[var(--color-secondary)] border border-transparent hover:border-gray-200">
              <Type size={24} className="text-[var(--color-primary)]" />
              <span className="text-sm font-bold">{t('addText')}</span>
            </button>
            <label className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors cursor-pointer text-center text-[var(--color-secondary)] border border-transparent hover:border-gray-200">
              <Upload size={24} className="text-[var(--color-primary)]" />
              <span className="text-sm font-bold">{isUploading ? '...' : t('addImage')}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={isUploading} />
            </label>
          </div>

          <div className={cn("flex flex-col gap-2", (activeMobileTab === 'elements' || !activeMobileTab || activeMobileTab === 'all') ? "flex" : "hidden md:flex")}>
            <h4 className="text-sm font-bold text-gray-500 mt-2">{t('stickers')}</h4>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {designAssets.filter(a => a.type === 'sticker').map(sticker => (
                <button key={sticker.id} onClick={() => addSticker(sticker.url)} className="flex-shrink-0 w-16 h-16 bg-gray-50 rounded-xl p-2 hover:ring-2 ring-[var(--color-primary)] border relative transition-all">
                  <img src={sticker.url} alt={sticker.name} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>

          <div className={activeMobileTab === 'shapes' || !activeMobileTab || activeMobileTab === 'all' ? "block" : "hidden md:block"}>
            <ShapeTools canvas={canvas} onSaveHistory={saveHistoryState} />
          </div>
          
          <div className={activeMobileTab === 'text' || !activeMobileTab || activeMobileTab === 'all' ? "block" : "hidden md:block"}>
             <TextTools canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
          </div>
          
          <div className={activeMobileTab === 'image' || !activeMobileTab || activeMobileTab === 'all' ? "block" : "hidden md:block"}>
             <ImageTools canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} printArea={currentPrintArea} />
          </div>
          
          <div className={activeMobileTab === 'layers' || !activeMobileTab || activeMobileTab === 'all' ? "block" : "hidden md:block"}>
             <LayerPanel canvas={canvas} activeObject={activeObject} onSaveHistory={saveHistoryState} />
          </div>

          {/* Global Actions (Undo/Redo/Delete) */}
          <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={undo} disabled={historyStep <= 0} className="p-3 md:p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50" title={t('undo', { fallback: 'Undo' })}><Undo size={20}/></button>
              <button onClick={redo} disabled={historyStep >= history.length - 1} className="p-3 md:p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50" title={t('redo', { fallback: 'Redo' })}><Redo size={20}/></button>
            </div>
            <button onClick={deleteSelected} disabled={!activeObject} className="p-3 md:p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors disabled:opacity-50"><Trash2 size={20}/></button>
          </div>
        </div>

        {/* Bottom Actions (Desktop Only - Mobile handles this in fixed bar) */}
        <div className="hidden md:flex bg-white rounded-3xl p-5 shadow-sm border border-border/50 flex-col gap-4">
          <div className="flex justify-between items-end">
            <span className="text-sm text-gray-500 font-medium">{t('totalPrice')}</span>
            <span className="text-3xl font-black text-[var(--color-primary)]">{totalPrice} ₺</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleAction('save')} disabled={isSaving} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-xl font-bold transition-colors disabled:opacity-50">
              <Save size={20} />
            </button>
            <button onClick={() => handleAction('cart')} disabled={isSaving} className="flex-[3] flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:opacity-90 text-white py-3 rounded-xl font-bold transition-all shadow-md disabled:opacity-50">
              <ShoppingCart size={20} /> {t('addToCart')}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
         <div className="flex items-center justify-between px-2 py-2">
            
            {/* Quick Tools */}
            <div className="flex flex-1 justify-around">
               <button onClick={() => setActiveMobileTab('elements')} className={cn("flex flex-col items-center p-2 rounded-xl transition", activeMobileTab === 'elements' ? "text-[var(--color-primary)] bg-blue-50" : "text-gray-500")}>
                  <LayoutTemplate size={22}/>
                  <span className="text-[10px] font-bold mt-1">{t('elements', {fallback: 'عناصر'})}</span>
               </button>
               <button onClick={() => setActiveMobileTab('text')} className={cn("flex flex-col items-center p-2 rounded-xl transition", activeMobileTab === 'text' ? "text-[var(--color-primary)] bg-blue-50" : "text-gray-500")}>
                  <Type size={22}/>
                  <span className="text-[10px] font-bold mt-1">{t('text', {fallback: 'نص'})}</span>
               </button>
               <button onClick={() => setActiveMobileTab('layers')} className={cn("flex flex-col items-center p-2 rounded-xl transition", activeMobileTab === 'layers' ? "text-[var(--color-primary)] bg-blue-50" : "text-gray-500")}>
                  <LayoutTemplate size={22}/>
                  <span className="text-[10px] font-bold mt-1">{t('layers', {fallback: 'طبقات'})}</span>
               </button>
            </div>
            
            {/* Action Group */}
            <div className="flex gap-2 pl-2 border-l border-gray-100">
               <div className="flex flex-col items-center justify-center px-2">
                 <span className="text-xs text-gray-400 font-medium">الإجمالي</span>
                 <span className="text-sm font-black text-[var(--color-primary)]">{totalPrice}₺</span>
               </div>
               <button onClick={() => handleAction('cart')} disabled={isSaving} className="bg-[var(--color-primary)] text-white p-3 rounded-full shadow-lg disabled:opacity-50">
                 <ShoppingCart size={22}/>
               </button>
            </div>
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
    </div>
  );
}