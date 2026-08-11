"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { Type, Upload, Sticker, Undo, Redo, AlignCenter, AlignLeft, AlignRight, Save, ShoppingCart, Trash2, LayoutTemplate } from 'lucide-react';
import AuthModal from '@/components/auth/AuthModal';
import { auth, db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface FabricCanvasProps {
  productId: string;
  basePrice: number;
  productFaces: { front: string; back: string; left: string; right: string };
}

const PRICING = {
  text: 10,
  image: 20,
  sticker: 5,
};

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

export default function FabricCanvas({ productId, basePrice, productFaces }: FabricCanvasProps) {
  const t = useTranslations('Editor');
  const searchParams = useSearchParams();
  const designIdFromUrl = searchParams.get('designId');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeFace, setActiveFace] = useState<'front' | 'back' | 'right' | 'left'>('front');
  const [totalPrice, setTotalPrice] = useState(basePrice);
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'cart' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedColor, setSelectedColor] = useState('white');
  
  const [designAssets, setDesignAssets] = useState<any[]>([]);
  const currentDesignIdRef = useRef<string | null>(null);
  const facesData = useRef<{ front: string | null; back: string | null; right: string | null; left: string | null }>({ front: null, back: null, right: null, left: null });

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
            currentDesignIdRef.current = designIdFromUrl;
            // The canvas will load the data when setBackground finishes
          }
        }
      } catch (err) {
        console.error("Failed to load design", err);
      }
    }
    fetchDesign();
  }, [designIdFromUrl]);

  // Initialize Canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const initCanvas = new fabric.Canvas(canvasRef.current, {
      width: 400,
      height: 500,
      preserveObjectStacking: true,
    });
    setCanvas(initCanvas);
    return () => {
      initCanvas.dispose();
    };
  }, []);

  // Setup Background Image & History & Autosave
  useEffect(() => {
    if (!canvas) return;

    const setBackground = () => {
      fabric.Image.fromURL(productFaces[activeFace], (img) => {
        const scale = Math.min(400 / (img.width || 400), 500 / (img.height || 500));
        img.set({
          originX: 'center',
          originY: 'center',
          left: 200,
          top: 250,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false
        });
        canvas.setBackgroundImage(img, () => {
          if (facesData.current[activeFace]) {
            canvas.loadFromJSON(facesData.current[activeFace], () => {
              canvas.renderAll();
              saveHistoryState();
              updatePrice();
            });
          } else {
            canvas.renderAll();
            saveHistoryState();
          }
        });
      }, { crossOrigin: 'anonymous' });
    };

    setBackground();

    const updatePrice = () => {
      const objects = canvas.getObjects();
      let extra = 0;
      objects.forEach(obj => {
        if (obj.type === 'i-text') extra += PRICING.text;
        else if (obj.type === 'image' && obj.name === 'sticker') extra += PRICING.sticker;
        else if (obj.type === 'image') extra += PRICING.image;
      });
      setTotalPrice(basePrice + extra);
    };

    canvas.on('object:added', () => { updatePrice(); saveHistoryState(); });
    canvas.on('object:removed', () => { updatePrice(); saveHistoryState(); });
    canvas.on('object:modified', () => { saveHistoryState(); });

    // Auto-save logic
    const interval = setInterval(async () => {
      // Always save to localStorage as backup
      facesData.current[activeFace] = JSON.stringify(canvas.toJSON());
      localStorage.setItem(`draft_${productId}`, JSON.stringify(facesData.current));
      
      // If logged in, sync to Firestore
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

    const handleForceSave = () => {
      if (canvas) {
        facesData.current[activeFace] = JSON.stringify(canvas.toJSON());
        localStorage.setItem(`draft_${productId}`, JSON.stringify(facesData.current));
      }
    };
    window.addEventListener('force-save-design', handleForceSave);

    return () => {
      canvas.off('object:added');
      canvas.off('object:removed');
      canvas.off('object:modified');
      clearInterval(interval);
      window.removeEventListener('force-save-design', handleForceSave);
    };
  }, [canvas, activeFace, basePrice, productFaces, productId, selectedSize, selectedColor, totalPrice]);

  const saveHistoryState = () => {
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    setHistory(prev => {
      const newHistory = prev.slice(0, historyStep + 1);
      newHistory.push(json);
      setHistoryStep(newHistory.length - 1);
      return newHistory;
    });
  };

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

  const switchFace = (face: 'front' | 'back' | 'right' | 'left') => {
    if (!canvas || face === activeFace) return;
    // Save current face
    facesData.current[activeFace] = JSON.stringify(canvas.toJSON());
    // Clear canvas
    canvas.clear();
    setHistory([]);
    setHistoryStep(-1);
    setActiveFace(face);
    // Load new face if exists
    if (facesData.current[face]) {
      canvas.loadFromJSON(facesData.current[face], () => {
        canvas.renderAll();
        saveHistoryState();
      });
    }
  };

  const addText = () => {
    if (!canvas) return;
    const text = new fabric.IText(t('newText'), {
      left: 150,
      top: 150,
      fontFamily: 'Arial',
      fill: '#000000',
      fontSize: 32,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
  };

  const addSticker = (url: string) => {
    if (!canvas) return;
    fabric.Image.fromURL(url, (img) => {
      img.set({
        left: 150,
        top: 150,
        name: 'sticker'
      });
      img.scaleToWidth(100);
      canvas.add(img);
      canvas.setActiveObject(img);
    }, { crossOrigin: 'anonymous' });
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !canvas) return;
    const file = e.target.files[0];
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      
      if (data.url) {
        fabric.Image.fromURL(data.url, (img) => {
          img.set({ left: 100, top: 100 });
          img.scaleToWidth(150);
          canvas.add(img);
          canvas.setActiveObject(img);
        }, { crossOrigin: 'anonymous' });
      }
    } catch (error) {
      alert(t('uploadError'));
    } finally {
      setIsUploading(false);
    }
  };

  const loadTemplate = () => {
    if (!canvas) return;
    addText();
    addSticker('https://cdn-icons-png.flaticon.com/512/1077/1077063.png');
  };

  const deleteSelected = () => {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
      canvas.discardActiveObject();
      activeObjects.forEach(obj => canvas.remove(obj));
    }
  };

  const alignText = (align: 'left' | 'center' | 'right') => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (obj && obj.type === 'i-text') {
      (obj as fabric.IText).set('textAlign', align);
      canvas.renderAll();
      saveHistoryState();
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
  const handleAction = (action: 'save' | 'cart') => {
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
    
    // Save current face to memory first
    facesData.current[activeFace] = JSON.stringify(canvas.toJSON());
    
    // High-quality preview via Cloudinary
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
      console.warn("Failed to upload preview to Cloudinary", err);
    }

    try {
      if (!db) throw new Error("Firestore not initialized");
      
      const docData = {
        user_id: auth.currentUser?.uid,
        product_id: productId,
        size: selectedSize,
        color: selectedColor,
        canvas_json: facesData.current,
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

      if (action === 'save') {
        alert(t('saveSuccess'));
      } else if (action === 'cart') {
        await addDoc(collection(db, 'cart_items'), {
          user_id: auth.currentUser?.uid,
          product_id: productId,
          variant_id: `${selectedColor}_${selectedSize}`,
          design_id: currentDesignIdRef.current,
          quantity: 1,
          unit_price: totalPrice,
          created_at: new Date().toISOString()
        });
        alert(t('cartSuccess'));
      }
    } catch (err) {
      console.error(err);
      alert(t('saveError'));
    }
    
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full mx-auto">
      {/* Sidebar Toolbar */}
      <div className="w-full md:w-80 bg-white rounded-3xl p-6 shadow-sm border border-border/50 flex flex-col gap-6">
        
        {/* Product Options */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center bg-gray-50 p-2 rounded-xl">
             <span className="text-sm font-semibold pr-2">{t('size')}</span>
             <select value={selectedSize} onChange={(e)=>setSelectedSize(e.target.value)} className="bg-transparent font-bold outline-none cursor-pointer">
               <option value="S">S</option>
               <option value="M">M</option>
               <option value="L">L</option>
               <option value="XL">XL</option>
             </select>
          </div>
          
          <div className="flex justify-between items-center bg-gray-50 p-2 rounded-xl">
             <span className="text-sm font-semibold pr-2">{t('color')}</span>
             <div className="flex gap-2 pr-2">
               {['white', 'black', 'navy', 'gray'].map(color => (
                 <button 
                   key={color}
                   onClick={() => setSelectedColor(color)}
                   className={cn("w-6 h-6 rounded-full border-2", selectedColor === color ? "border-[var(--color-primary)] shadow-sm" : "border-transparent", color === 'white' ? "bg-white border-gray-300" : `bg-${color === 'navy' ? '[#000080]' : color === 'black' ? 'black' : 'gray-400'}`)}
                 />
               ))}
             </div>
          </div>
        </div>

        {/* Faces Switch */}
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button 
            onClick={() => switchFace('front')}
            className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-colors", activeFace === 'front' ? "bg-white shadow-sm text-[var(--color-primary)]" : "text-gray-500 hover:text-gray-700")}
          >
            {t('front')}
          </button>
          <button 
            onClick={() => switchFace('back')}
            className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-colors", activeFace === 'back' ? "bg-white shadow-sm text-[var(--color-primary)]" : "text-gray-500 hover:text-gray-700")}
          >
            {t('back')}
          </button>
          <button 
            onClick={() => switchFace('right')}
            className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-colors", activeFace === 'right' ? "bg-white shadow-sm text-[var(--color-primary)]" : "text-gray-500 hover:text-gray-700")}
          >
            {t('right')}
          </button>
          <button 
            onClick={() => switchFace('left')}
            className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-colors", activeFace === 'left' ? "bg-white shadow-sm text-[var(--color-primary)]" : "text-gray-500 hover:text-gray-700")}
          >
            {t('left')}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button onClick={addText} className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-[var(--color-secondary)]">
            <Type size={20} className="text-[var(--color-primary)]" />
            <span className="text-xs font-bold">{t('addText')}</span>
          </button>
          <label className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer text-center text-[var(--color-secondary)]">
            <Upload size={20} className="text-[var(--color-primary)]" />
            <span className="text-xs font-bold">{isUploading ? '...' : t('addImage')}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={isUploading} />
          </label>
          <div className="relative group">
            <button className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-center text-[var(--color-secondary)]">
              <LayoutTemplate size={20} className="text-[var(--color-primary)]" />
              <span className="text-xs font-bold">{t('addTemplate')}</span>
            </button>
            <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 p-2">
              <div className="grid grid-cols-2 gap-2">
                {designAssets.filter(a => a.type === 'template').map(template => (
                  <button key={template.id} onClick={() => addSticker(template.url)} className="border rounded hover:ring-2 ring-[var(--color-primary)] relative">
                    <img src={template.url} alt={template.name} className="w-full h-auto" />
                    {template.is_premium && <span className="absolute top-0 right-0 bg-yellow-400 text-[10px] px-1 rounded-bl">PRO</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stickers Library */}
        <div>
          <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><Sticker size={16}/> {t('stickers')}</h4>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {designAssets.filter(a => a.type === 'sticker').map(sticker => (
              <button 
                key={sticker.id}
                onClick={() => addSticker(sticker.url)} 
                className="flex-shrink-0 w-12 h-12 bg-white rounded-lg p-1 hover:ring-2 ring-[var(--color-primary)] border relative"
              >
                <img src={sticker.url} alt={sticker.name} className="w-full h-full object-contain" />
                {sticker.is_premium && <span className="absolute top-0 right-0 bg-yellow-400 text-[8px] px-1 rounded-bl">PRO</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Alignment & History Tools */}
        <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-auto">
          <div className="flex gap-1">
            <button onClick={undo} disabled={historyStep <= 0} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50"><Undo size={18}/></button>
            <button onClick={redo} disabled={historyStep >= history.length - 1} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50"><Redo size={18}/></button>
          </div>
          <div className="flex gap-1">
            <button onClick={() => alignText('right')} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"><AlignRight size={18}/></button>
            <button onClick={() => alignText('center')} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"><AlignCenter size={18}/></button>
            <button onClick={() => alignText('left')} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"><AlignLeft size={18}/></button>
          </div>
          <button onClick={deleteSelected} className="p-2 bg-red-50 hover:bg-red-100 text-[var(--color-action)] rounded-lg transition-colors"><Trash2 size={18}/></button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-border/50 flex items-center justify-center p-4 min-h-[600px] relative">
          <div className="border-2 border-dashed border-gray-200 relative bg-[#FAFAFA]" style={{ width: 400, height: 500 }}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        
        {/* Bottom Actions */}
        <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-border/50">
          <div className="flex flex-col">
            <span className="text-sm text-[var(--color-text-secondary)] font-medium">{t('totalPrice')}</span>
            <span className="text-2xl font-black text-[var(--color-primary)]">{totalPrice} ₺</span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => handleAction('save')}
              disabled={isSaving}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-[var(--color-secondary)] py-3 px-6 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              <Save size={20} />
              {isSaving ? t('savingDraft') : t('saveDraft')}
            </button>
            <button 
              onClick={() => handleAction('cart')}
              disabled={isSaving}
              className="flex items-center gap-2 bg-[var(--color-primary)] hover:opacity-90 text-white py-3 px-6 rounded-xl font-bold transition-all shadow-md shadow-[var(--color-primary)]/20 disabled:opacity-50"
            >
              <ShoppingCart size={20} />
              {t('addToCart')}
            </button>
          </div>
        </div>
      </div>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={onAuthSuccess} 
      />
    </div>
  );
}
