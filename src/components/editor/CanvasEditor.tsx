"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { fabric } from 'fabric';
import { Save, ShoppingCart, Loader2 } from 'lucide-react';

import EditorToolbar from './EditorToolbar';
import AssetLibrary from './AssetLibrary';
import AuthModal from '../auth/AuthModal';
import { saveDesign } from '@/lib/designService';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// Mock pricing rules
const BASE_PRICE = 150;
const TEXT_PRICE = 10;
const STICKER_PRICE = 15;
const IMAGE_PRICE = 20;

// Mock background images for faces (white t-shirt)
const PRODUCT_BACKGROUNDS = {
  front: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
  back: 'https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
  left: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', // mockup
  right: 'https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', // mockup
};

const PRODUCT_COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
  { name: 'Navy', value: '#1B1F3B' },
  { name: 'Red', value: '#FF3D68' },
];

export default function CanvasEditor() {
  const t = useTranslations('Editor');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  
  const [activeFace, setActiveFace] = useState<'front' | 'back' | 'left' | 'right'>('front');
  const [activeColor, setActiveColor] = useState(PRODUCT_COLORS[0].value);
  
  // State for 4 faces
  const facesData = useRef<Record<string, any>>({
    front: null,
    back: null,
    left: null,
    right: null,
  });

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [hasSelection, setHasSelection] = useState(false);
  
  const [totalPrice, setTotalPrice] = useState(BASE_PRICE);
  
  const [user, setUser] = useState<any>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'cart' | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [designId, setDesignId] = useState<string | undefined>();
  
  // Initialize user
  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth is not initialized. Check .env variables.");
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && pendingAction) {
        if (pendingAction === 'save') handleSave();
        if (pendingAction === 'cart') handleAddToCart();
        setPendingAction(null);
      }
    });
    return () => unsubscribe();
  }, [pendingAction]);

  // Initialize Fabric Canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: 500,
      height: 600,
      preserveObjectStacking: true,
      backgroundColor: activeColor, // T-shirt color simulation
    });

    setCanvas(fabricCanvas);

    fabricCanvas.on('selection:created', () => setHasSelection(true));
    fabricCanvas.on('selection:updated', () => setHasSelection(true));
    fabricCanvas.on('selection:cleared', () => setHasSelection(false));
    
    fabricCanvas.on('object:added', () => { saveHistory(fabricCanvas); calculatePrice(fabricCanvas); });
    fabricCanvas.on('object:modified', () => { saveHistory(fabricCanvas); });
    fabricCanvas.on('object:removed', () => { saveHistory(fabricCanvas); calculatePrice(fabricCanvas); });

    // Load initial background
    setBackground(fabricCanvas, activeFace);

    return () => {
      fabricCanvas.dispose();
    };
  }, []); // Run once

  // Update Background Image based on Face
  const setBackground = (c: fabric.Canvas, face: string) => {
    fabric.Image.fromURL(PRODUCT_BACKGROUNDS[face as keyof typeof PRODUCT_BACKGROUNDS], (img) => {
      // Create a clipping mask effect (simplified for mockup)
      img.scaleToWidth(500);
      img.scaleToHeight(600);
      
      c.setBackgroundImage(img, c.renderAll.bind(c), {
        opacity: 0.8 // So we can see color behind it
      });
      c.renderAll();
    }, { crossOrigin: 'anonymous' });
  };

  // Change Face
  const handleFaceChange = (face: 'front' | 'back' | 'left' | 'right') => {
    if (!canvas) return;
    
    // Save current face data
    facesData.current[activeFace] = canvas.toJSON();
    
    // Switch face
    setActiveFace(face);
    
    // Load new face data
    canvas.clear();
    const newData = facesData.current[face];
    if (newData) {
      canvas.loadFromJSON(newData, () => {
        setBackground(canvas, face);
        canvas.renderAll();
      });
    } else {
      setBackground(canvas, face);
    }
  };

  // Change Color
  const handleColorChange = (color: string) => {
    setActiveColor(color);
    if (canvas) {
      canvas.backgroundColor = color;
      canvas.renderAll();
    }
  };

  // History & Undo/Redo
  const saveHistory = (c: fabric.Canvas) => {
    const json = JSON.stringify(c.toJSON());
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(json);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  };

  const handleUndo = () => {
    if (historyIndex > 0 && canvas) {
      setHistoryIndex(prev => prev - 1);
      canvas.loadFromJSON(history[historyIndex - 1], canvas.renderAll.bind(canvas));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && canvas) {
      setHistoryIndex(prev => prev + 1);
      canvas.loadFromJSON(history[historyIndex + 1], canvas.renderAll.bind(canvas));
    }
  };

  // Add Elements
  const handleAddText = () => {
    if (!canvas) return;
    const text = new fabric.IText('Your Text', {
      left: 150,
      top: 200,
      fontFamily: 'Arial',
      fill: '#000000',
      fontSize: 40,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
  };

  const handleAddImage = (file: File) => {
    if (!canvas) return;
    const reader = new FileReader();
    reader.onload = (f) => {
      const data = f.target?.result;
      fabric.Image.fromURL(data as string, (img) => {
        img.scaleToWidth(200);
        img.set({ left: 150, top: 150 });
        canvas.add(img);
        canvas.setActiveObject(img);
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAddSticker = (url: string) => {
    if (!canvas) return;
    fabric.Image.fromURL(url, (img) => {
      img.scaleToWidth(100);
      img.set({ left: 200, top: 200 });
      canvas.add(img);
      canvas.setActiveObject(img);
    }, { crossOrigin: 'anonymous' });
  };

  // Actions
  const handleDelete = () => {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
      canvas.discardActiveObject();
      activeObjects.forEach(obj => canvas.remove(obj));
    }
  };

  const handleAlign = (alignment: 'left' | 'center' | 'right') => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    
    if (alignment === 'center') {
      obj.centerH();
    } else if (alignment === 'left') {
      obj.set({ left: 50 }); // Simplified
    } else {
      obj.set({ left: 450 - (obj.getScaledWidth() || 0) }); // Simplified
    }
    obj.setCoords();
    canvas.renderAll();
  };

  const calculatePrice = (c: fabric.Canvas) => {
    let elementsCount = 0;
    // Count all objects in all faces
    const currentData = facesData.current;
    currentData[activeFace] = c.toJSON(); // update current
    
    Object.values(currentData).forEach((faceData: any) => {
      if (faceData && faceData.objects) {
        elementsCount += faceData.objects.length;
      }
    });

    // Mock pricing: Base + (elements * 15)
    setTotalPrice(BASE_PRICE + (elementsCount * 15));
  };

  // Auth & Save
  const handleSave = async () => {
    if (!user) {
      setPendingAction('save');
      setShowLoginModal(true);
      return;
    }
    
    if (!canvas) return;
    setIsSaving(true);
    
    try {
      // Save current face before exporting
      facesData.current[activeFace] = canvas.toJSON();
      
      const designData = {
        user_id: user.uid,
        product_id: 'product-1', // Mock product id
        canvas_json: JSON.stringify(facesData.current),
        status: 'draft' as const,
        price: totalPrice
      };
      
      const id = await saveDesign(designData, designId);
      setDesignId(id);
      
      // Auto-hide saving state
      setTimeout(() => setIsSaving(false), 1000);
    } catch (err) {
      console.error(err);
      setIsSaving(false);
    }
  };

  const handleAddToCart = async () => {
    if (!user) {
      setPendingAction('cart');
      setShowLoginModal(true);
      return;
    }
    alert(t('addToCart') + " - Phase 3");
  };

  return (
    <div className="max-w-[95rem] mx-auto py-12 px-4 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 xl:[zoom:1.1]">
      
      {/* Left Asset Library */}
      <div className="lg:col-span-3">
        <AssetLibrary 
          onAddText={handleAddText}
          onAddImage={handleAddImage}
          onAddSticker={handleAddSticker}
          onAddTemplate={(id) => alert('Template logic ' + id)}
        />
      </div>

      {/* Center Canvas */}
      <div className="lg:col-span-6 flex flex-col items-center">
        <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-inner border border-gray-200 relative">
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Right Toolbar & Pricing */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        <EditorToolbar 
          activeFace={activeFace}
          onFaceChange={handleFaceChange}
          productColors={PRODUCT_COLORS}
          activeColor={activeColor}
          onColorChange={handleColorChange}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
          hasSelection={hasSelection}
          onAlign={handleAlign}
          onDelete={handleDelete}
        />

        {/* Pricing Card */}
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-500 font-medium">{t('totalPrice')}</span>
            <span className="text-2xl font-bold text-primary">{totalPrice} ₺</span>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 bg-secondary text-white font-bold rounded-lg hover:bg-opacity-90 transition-colors flex justify-center items-center gap-2"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              {isSaving ? t('saving') : (designId ? t('saved') : t('save'))}
            </button>
            <button 
              onClick={handleAddToCart}
              className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-opacity-90 transition-colors flex justify-center items-center gap-2"
            >
              <ShoppingCart size={20} /> {t('addToCart')}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AuthModal 
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          setPendingAction(null);
        }}
        onSuccess={() => {
          setShowLoginModal(false);
          if (pendingAction === 'save') handleSave();
          if (pendingAction === 'cart') handleAddToCart();
          setPendingAction(null);
        }}
      />
    </div>
  );
}
