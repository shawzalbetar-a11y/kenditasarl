import { db } from './firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';

export interface DesignData {
  user_id: string;
  product_id: string;
  canvas_json: string; // Serialized JSON string of the canvas
  preview_image_url?: string;
  status: 'draft' | 'completed';
  price: number;
}

export const saveDesign = async (designData: DesignData, existingDesignId?: string) => {
  try {
    if (existingDesignId) {
      // Update existing design
      const docRef = doc(db, 'designs', existingDesignId);
      await updateDoc(docRef, {
        ...designData,
        updated_at: serverTimestamp()
      });
      return existingDesignId;
    } else {
      // Create new design
      const docRef = await addDoc(collection(db, 'designs'), {
        ...designData,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      return docRef.id;
    }
  } catch (error) {
    console.error('Error saving design:', error);
    throw error;
  }
};
