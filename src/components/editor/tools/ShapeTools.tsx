import React from 'react';
import { fabric } from 'fabric';
import { Square, Circle as CircleIcon, Minus, Triangle as TriangleIcon, Star, Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ShapeToolsProps {
  canvas: fabric.Canvas | null;
  onSaveHistory: () => void;
}

export default function ShapeTools({ canvas, onSaveHistory }: ShapeToolsProps) {
  const t = useTranslations('Editor');

  const addRect = () => {
    if (!canvas) return;
    const rect = new fabric.Rect({ left: 50, top: 50, fill: '#000000', width: 100, height: 100 });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    onSaveHistory();
  };

  const addCircle = () => {
    if (!canvas) return;
    const circle = new fabric.Circle({ left: 50, top: 50, fill: '#000000', radius: 50 });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    onSaveHistory();
  };

  const addTriangle = () => {
    if (!canvas) return;
    const triangle = new fabric.Triangle({ left: 50, top: 50, fill: '#000000', width: 100, height: 100 });
    canvas.add(triangle);
    canvas.setActiveObject(triangle);
    onSaveHistory();
  };

  const addLine = () => {
    if (!canvas) return;
    const line = new fabric.Line([50, 50, 200, 50], { fill: '#000000', stroke: '#000000', strokeWidth: 5 });
    canvas.add(line);
    canvas.setActiveObject(line);
    onSaveHistory();
  };

  const addStar = () => {
    if (!canvas) return;
    const path = "M 50,0 L 61,35 L 98,35 L 68,57 L 79,91 L 50,70 L 21,91 L 32,57 L 2,35 L 39,35 z";
    const star = new fabric.Path(path, { left: 50, top: 50, fill: '#000000' });
    canvas.add(star);
    canvas.setActiveObject(star);
    onSaveHistory();
  };

  const addHeart = () => {
    if (!canvas) return;
    const path = "M 272.7,238.7 C 206.4,238.7 152.7,292.4 152.7,358.7 C 152.7,493.4 288.6,528.8 381.2,662.0 C 468.8,529.6 609.8,489.1 609.8,358.7 C 609.8,292.4 556.0,238.7 489.8,238.7 C 441.7,238.7 400.4,266.9 381.2,309.1 C 362.1,266.9 320.7,238.7 272.7,238.7 z";
    const heart = new fabric.Path(path, { left: 50, top: 50, fill: '#000000' });
    heart.scaleToWidth(100);
    canvas.add(heart);
    canvas.setActiveObject(heart);
    onSaveHistory();
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <h4 className="text-sm font-bold text-gray-500">{t('shapes', { fallback: 'Shapes' })}</h4>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={addRect} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 flex justify-center"><Square size={20} /></button>
        <button onClick={addCircle} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 flex justify-center"><CircleIcon size={20} /></button>
        <button onClick={addTriangle} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 flex justify-center"><TriangleIcon size={20} /></button>
        <button onClick={addLine} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 flex justify-center"><Minus size={20} /></button>
        <button onClick={addStar} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 flex justify-center"><Star size={20} /></button>
        <button onClick={addHeart} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 flex justify-center"><Heart size={20} /></button>
      </div>
    </div>
  );
}
