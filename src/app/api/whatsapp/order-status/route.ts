import { NextResponse } from 'next/server';
import { sendWhatsAppOrderStatusUpdate, OrderStatus } from '@/lib/whatsapp';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { phoneNumber, customerName, orderId, status } = body;

    if (!orderId || !status) {
      return NextResponse.json(
        { error: 'Missing required parameters: orderId and status are mandatory.' },
        { status: 400 }
      );
    }

    // If phoneNumber or customerName is missing, attempt to enrich from Firestore
    if ((!phoneNumber || !customerName) && db) {
      try {
        let orderData: any = null;
        let foundDocId = orderId;

        // Try direct doc ID
        const directSnap = await getDoc(doc(db, 'orders', orderId));
        if (directSnap.exists()) {
          orderData = directSnap.data();
          foundDocId = directSnap.id;
        } else {
          // Query by order_number
          const q = query(collection(db, 'orders'), where('order_number', '==', orderId));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            orderData = qSnap.docs[0].data();
            foundDocId = qSnap.docs[0].id;
          }
        }

        if (orderData) {
          const orderNumber = orderData.order_number || foundDocId;
          orderId = orderNumber; // Ensure user-facing order number is used

          // Fetch Address info if available
          if (orderData.address_id) {
            const addrSnap = await getDoc(doc(db, 'addresses', orderData.address_id));
            if (addrSnap.exists()) {
              const addrData = addrSnap.data();
              if (!phoneNumber) phoneNumber = addrData.phone || addrData.phoneNumber;
              if (!customerName) customerName = addrData.full_name || addrData.name;
            }
          }

          // Fetch User info if available
          if (orderData.user_id && (!phoneNumber || !customerName)) {
            const userSnap = await getDoc(doc(db, 'users', orderData.user_id));
            if (userSnap.exists()) {
              const userData = userSnap.data();
              if (!phoneNumber) phoneNumber = userData.phone || userData.phoneNumber;
              if (!customerName) customerName = userData.full_name || userData.displayName || userData.name;
            }
          }
        }
      } catch (dbErr) {
        console.warn('[WhatsApp Route] Could not enrich order details from Firestore:', dbErr);
      }
    }

    if (!phoneNumber) {
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason: `No phone number found for order ${orderId}. Notification skipped.`
        },
        { status: 200 }
      );
    }

    const result = await sendWhatsAppOrderStatusUpdate({
      phoneNumber,
      customerName: customerName || 'Değerli Müşterimiz',
      orderId,
      status: status as OrderStatus
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[WhatsApp API Route Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error while processing WhatsApp message' },
      { status: 500 }
    );
  }
}
