import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

export async function GET() {
  if (!db) {
    return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
  }

  try {
    const batch = writeBatch(db);

    // 1. Categories
    const categoriesRef = collection(db, 'categories');
    
    const catTshirts = doc(categoriesRef, 'tshirts');
    batch.set(catTshirts, {
      id: 'tshirts',
      slug: 'tshirts',
      name_tr: 'Tişörtler',
      name_ar: 'تيشيرتات',
      name_en: 'T-Shirts'
    });

    const catHats = doc(categoriesRef, 'hats');
    batch.set(catHats, {
      id: 'hats',
      slug: 'hats',
      name_tr: 'Şapkalar',
      name_ar: 'قبعات',
      name_en: 'Hats'
    });

    const catMugs = doc(categoriesRef, 'mugs');
    batch.set(catMugs, {
      id: 'mugs',
      slug: 'mugs',
      name_tr: 'Kupalar',
      name_ar: 'فناجين',
      name_en: 'Mugs'
    });

    // 2. Products
    const products = [
      // T-Shirts
      {
        id: 'tshirt-001',
        category_id: 'tshirts',
        slug: 'basic-cotton-tshirt',
        sku: 'TS-001',
        name_tr: 'Temel Pamuklu Tişört',
        name_ar: 'تيشيرت قطني أساسي',
        name_en: 'Basic Cotton T-Shirt',
        description_tr: 'Günlük kullanım için %100 pamuklu tişört.',
        description_ar: 'تيشيرت قطني 100% للاستخدام اليومي.',
        description_en: '100% cotton t-shirt for daily use.',
        fabric_type: '100% Cotton',
        quality_notes: 'Premium print quality',
        base_price: 250,
        is_active: true,
        badge: 'YENI',
        created_at: serverTimestamp(),
        variants: [
          { size: 'S', color: 'white', stock: 10, price_adjustment: 0 },
          { size: 'M', color: 'black', stock: 15, price_adjustment: 0 }
        ],
        media: {
          front: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?ixlib=rb-4.0.3&auto=format&fit=crop&q=80&w=800',
          back: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?ixlib=rb-4.0.3&auto=format&fit=crop&q=80&w=800',
          left: '',
          right: ''
        }
      },
      {
        id: 'tshirt-002',
        category_id: 'tshirts',
        slug: 'oversize-streetwear',
        sku: 'TS-002',
        name_tr: 'Oversize Sokak Giyimi Tişört',
        name_ar: 'تيشيرت واسع شبابي',
        name_en: 'Oversize Streetwear T-Shirt',
        description_tr: 'Sokak modasına uygun rahat oversize kesim.',
        description_ar: 'قصة واسعة مريحة مناسبة لنمط الشارع.',
        description_en: 'Comfortable oversize fit for street fashion.',
        fabric_type: '90% Cotton, 10% Elastane',
        quality_notes: 'Durable stretch fabric',
        base_price: 320,
        is_active: true,
        badge: 'ÇOK SATAN',
        created_at: serverTimestamp(),
        variants: [
          { size: 'L', color: 'gray', stock: 5, price_adjustment: 0 },
          { size: 'XL', color: 'navy', stock: 8, price_adjustment: 0 }
        ],
        media: {
          front: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?ixlib=rb-4.0.3&auto=format&fit=crop&q=80&w=800',
          back: '',
          left: '',
          right: ''
        }
      },
      // Hats
      {
        id: 'hat-001',
        category_id: 'hats',
        slug: 'classic-cap',
        sku: 'HT-001',
        name_tr: 'Klasik Şapka',
        name_ar: 'قبعة كلاسيكية',
        name_en: 'Classic Cap',
        description_tr: 'Güneşten korunmak için şık bir seçenek.',
        description_ar: 'خيار أنيق للحماية من الشمس.',
        description_en: 'A stylish option for sun protection.',
        fabric_type: 'Polyester Blend',
        quality_notes: 'Adjustable strap',
        base_price: 150,
        is_active: true,
        badge: '',
        created_at: serverTimestamp(),
        variants: [
          { size: 'One Size', color: 'black', stock: 20, price_adjustment: 0 },
          { size: 'One Size', color: 'white', stock: 12, price_adjustment: 0 }
        ],
        media: {
          front: 'https://images.unsplash.com/photo-1556306535-0f09a536f01f?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
          back: '',
          left: '',
          right: ''
        }
      },
      // Mugs
      {
        id: 'mug-001',
        category_id: 'mugs',
        slug: 'ceramic-coffee-mug',
        sku: 'MG-001',
        name_tr: 'Seramik Kahve Kupası',
        name_ar: 'كوب قهوة سيراميك',
        name_en: 'Ceramic Coffee Mug',
        description_tr: 'Güne kahve ile başlamak için ideal.',
        description_ar: 'مثالي لبدء اليوم بقهوة.',
        description_en: 'Ideal for starting the day with coffee.',
        fabric_type: 'Ceramic',
        quality_notes: 'Microwave safe',
        base_price: 120,
        is_active: true,
        badge: 'İNDİRİM',
        created_at: serverTimestamp(),
        variants: [
          { size: 'Standard', color: 'white', stock: 30, price_adjustment: 0 }
        ],
        media: {
          front: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
          back: '',
          left: '',
          right: ''
        }
      }
    ];

    for (const prod of products) {
      const prodRef = doc(collection(db, 'products'), prod.id);
      batch.set(prodRef, {
        category_id: prod.category_id,
        slug: prod.slug,
        sku: prod.sku,
        name_tr: prod.name_tr,
        name_ar: prod.name_ar,
        name_en: prod.name_en,
        description_tr: prod.description_tr,
        description_ar: prod.description_ar,
        description_en: prod.description_en,
        fabric_type: prod.fabric_type,
        quality_notes: prod.quality_notes,
        base_price: prod.base_price,
        is_active: prod.is_active,
        badge: prod.badge,
        created_at: prod.created_at
      });

      // Subcollections
      for (const variant of prod.variants) {
        const variantRef = doc(collection(prodRef, 'variants'));
        batch.set(variantRef, variant);
      }

      const mediaRef = doc(collection(prodRef, 'media'), 'default');
      batch.set(mediaRef, prod.media);
    }

    // 3. Design Assets
    const assetsRef = collection(db, 'design_assets');
    const assets = [
      {
        id: 'asset-1',
        type: 'sticker',
        url: 'https://cdn-icons-png.flaticon.com/512/1077/1077063.png',
        name: 'Cool Cat Sticker',
        is_premium: false,
        extra_price: 0
      },
      {
        id: 'asset-2',
        type: 'sticker',
        url: 'https://cdn-icons-png.flaticon.com/512/1077/1077114.png',
        name: 'Happy Dog Sticker',
        is_premium: false,
        extra_price: 0
      },
      {
        id: 'asset-3',
        type: 'template',
        url: 'https://cdn-icons-png.flaticon.com/512/1255/1255132.png',
        name: 'Retro Template',
        is_premium: true,
        extra_price: 15
      }
    ];

    for (const asset of assets) {
      const aRef = doc(assetsRef, asset.id);
      batch.set(aRef, {
        type: asset.type,
        url: asset.url,
        name: asset.name,
        is_premium: asset.is_premium,
        extra_price: asset.extra_price
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true, message: 'Database seeded successfully!' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
