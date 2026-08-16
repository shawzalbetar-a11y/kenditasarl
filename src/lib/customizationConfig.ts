/**
 * Product Customization Configuration Abstraction
 * 
 * This file defines the types and utilities for determining the 
 * print areas and constraints for different product categories.
 */

export type PrintAreaShape = 'rectangle' | 'circle' | 'custom_path';

export interface PrintArea {
  id: string; // e.g. 'front', 'back', 'left_sleeve', 'right_sleeve', 'wrap'
  name: string; // Localized or generic name
  
  // Editor Canvas bounds
  width: number; // width in pixels relative to the base canvas / native image
  height: number;
  top: number; // Y offset from top of canvas / native image
  left: number; // X offset from left of canvas / native image
  // Optional native image dimensions reference
  nativeWidth?: number;
  nativeHeight?: number;
  
  shape?: PrintAreaShape;
  clipPath?: string; // SVG path string if shape is 'custom_path'
  bleed?: number; // Bleed area in pixels (safe zone indicator)
  
  safeArea?: {
    width: number;
    height: number;
    top: number;
    left: number;
    shape?: 'rect' | 'circle';
  };

  // Production specifications
  physicalWidthCm?: number;
  physicalHeightCm?: number;
  targetDPI?: number;
  printMethod?: string;
}

export interface FaceConfig {
  name: string; // 'Front', 'Back', 'Wrap', etc.
  enabled?: boolean;
  printArea: PrintArea;
}

/**
 * Image-Specific Geometry Model
 * Represents independent PrintArea calibration tied directly to an uploaded image/mockup.
 */
export interface ImageSpecificGeometry {
  imageId: string;
  imageUrl?: string;
  faceId?: string;
  angle?: string; // e.g. 'straight', '3/4', 'perspective', 'close-up', 'angled'

  nativeWidth: number;
  nativeHeight: number;

  printArea: PrintArea;
}

export interface CustomizationConfig {
  version?: number;
  enabled: boolean;
  
  allowCustomerUpload?: boolean;
  allowText?: boolean;
  allowStickers?: boolean;
  allowFreeMode?: boolean;

  productType?: string; // The normalized product category (e.g. 't-shirt', 'mug', 'hat')
  
  // Legacy / fallback face configurations
  faces: {
    [faceId: string]: FaceConfig;
  };

  // Image-driven geometry registry
  image_geometries?: {
    [imageKey: string]: ImageSpecificGeometry;
  };
}

export interface ProductionSnapshot {
  snapshotVersion: number;
  editorVersion: number;
  
  customization_config: CustomizationConfig;
  
  // Flattened for easy access by Production Renderer
  printAreas: {
    [faceId: string]: PrintArea;
  };
}

/**
 * Normalizes a category ID from Firebase to a standard product type
 */
export function normalizeProductCategory(categoryId: string | undefined): string {
  if (!categoryId) return 'generic';
  
  const lowerCat = categoryId.toLowerCase();
  
  if (lowerCat.includes('tshirt') || lowerCat.includes('t-shirt') || lowerCat === 'تيشيرت') {
    return 't-shirt';
  }
  if (lowerCat.includes('hoodie') || lowerCat === 'هودي') {
    return 'hoodie';
  }
  if (lowerCat.includes('mug') || lowerCat === 'كوب' || lowerCat === 'kupa') {
    return 'mug';
  }
  if (lowerCat.includes('hat') || lowerCat === 'cap' || lowerCat === 'قبعة' || lowerCat === 'şapka') {
    return 'hat';
  }
  
  return 'generic';
}

/**
 * Returns the customization configuration based on the normalized product category
 * This uses data-driven defaults that can be overridden by a product's specific `customization_config`
 */
export function getCustomizationConfig(categoryId: string | undefined): CustomizationConfig {
  const type = normalizeProductCategory(categoryId);
  
  // Default config base
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: false,
    productType: type,
    faces: {}
  };

  switch (type) {
    case 't-shirt':
    case 'hoodie':
      config.faces = {
        front: {
          name: 'Front',
          enabled: true,
          printArea: { id: 'front', name: 'Front Chest', width: 200, height: 280, top: 120, left: 100, bleed: 10, printMethod: 'DTF' }
        },
        back: {
          name: 'Back',
          enabled: true,
          printArea: { id: 'back', name: 'Back', width: 200, height: 280, top: 120, left: 100, bleed: 10, printMethod: 'DTF' }
        },
        left: {
          name: 'Left Sleeve',
          enabled: true,
          printArea: { id: 'left', name: 'Left Sleeve', width: 80, height: 100, top: 150, left: 260, bleed: 5, printMethod: 'DTF' }
        },
        right: {
          name: 'Right Sleeve',
          enabled: true,
          printArea: { id: 'right', name: 'Right Sleeve', width: 80, height: 100, top: 150, left: 60, bleed: 5, printMethod: 'DTF' }
        }
      };
      break;

    case 'mug':
      config.faces = {
        wrap: {
          name: 'Full Wrap',
          enabled: true,
          // A wide bounding box centered on the canvas to represent the wrap area
          printArea: { id: 'wrap', name: 'Panoramic Wrap', width: 340, height: 160, top: 170, left: 30, bleed: 5, printMethod: 'Sublimation' }
        }
      };
      break;

    case 'hat':
      config.faces = {
        front: {
          name: 'Front',
          enabled: true,
          // A small constrained area for embroidery
          printArea: { id: 'front', name: 'Front Embroidery', width: 140, height: 70, top: 220, left: 130, bleed: 5, printMethod: 'Embroidery' }
        }
      };
      break;

    default:
      // Generic bounding box for unknown products
      config.faces = {
        front: {
          name: 'Front',
          enabled: true,
          printArea: { id: 'front', name: 'Front', width: 300, height: 400, top: 50, left: 50, bleed: 0, printMethod: 'DTF' }
        }
      };
      break;
  }

  return config;
}
