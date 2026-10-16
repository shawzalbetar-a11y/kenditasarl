/**
 * WhatsApp Cloud API Service for Order Status Notifications
 * Template: order_status_update_ (Language: tr)
 * Parameters:
 *   {{1}}: Customer Name (Müşteri Adı)
 *   {{2}}: Order Number / ID (Sipariş Numarası)
 *   {{3}}: Descriptive Order Status Sentence in Turkish (Detaylı Türkçe Durum Açıklaması)
 */

export type OrderStatus =
  | 'pending'
  | 'ready'
  | 'processing'
  | 'printing'
  | 'quality_check'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | string;

export interface WhatsAppOrderUpdateParams {
  phoneNumber: string;
  customerName: string;
  orderId: string;
  status: OrderStatus;
  customMessage?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  skipped?: boolean;
  reason?: string;
  error?: string | Record<string, unknown>;
}

/**
 * Detailed Turkish Status Sentences Tailored for Print-on-Demand (POD)
 */
export const STATUS_DETAILED_SENTENCE_TR: Record<string, string> = {
  pending: "Siparişiniz başarıyla alındı ve onaylandı. En kısa sürede üretime alınacaktır.",
  new: "Siparişiniz başarıyla alındı ve onaylandı. En kısa sürede üretime alınacaktır.",
  ready: "Ürünleriniz onaylandı ve baskı/üretim sırasına alındı.",
  processing: "Siparişiniz işleme alındı, üretim hazırlıkları yapılıyor.",
  printing: "Ürünleriniz şu an yüksek kaliteli baskı ve üretim aşamasındadır.",
  quality_check: "Ürünlerinizin baskısı tamamlandı ve kalite kontrol aşamasından geçiyor.",
  packed: "Ürünleriniz kalite kontrolünden başarıyla geçti ve özenle paketlendi.",
  shipped: "Siparişiniz kargoya / kuryeye teslim edildi ve yola çıktı.",
  delivered: "Siparişiniz başarıyla teslim edilmiştir. Bizi tercih ettiğiniz için teşekkür ederiz!",
  completed: "Siparişiniz başarıyla tamamlandı ve teslim edildi. İyi günlerde kullanın!",
  cancelled: "Siparişiniz iptal edilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.",
};

/**
 * Short Turkish labels for quick display
 */
export const STATUS_DISPLAY_NAME_TR: Record<string, string> = {
  pending: "Onaylandı",
  new: "Onaylandı",
  ready: "Üretime Hazır",
  processing: "İşleniyor",
  printing: "Baskıda",
  quality_check: "Kalite Kontrol",
  packed: "Paketlendi",
  shipped: "Kargoya Verildi",
  delivered: "Teslim Edildi",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
};

/**
 * Resolves a detailed Turkish status description sentence for {{3}}
 */
export function getOrderStatusDetailedTextTr(status: OrderStatus, customMessage?: string): string {
  if (customMessage && customMessage.trim().length > 0) {
    return customMessage.trim();
  }
  const normalized = (status || '').toLowerCase().trim();
  return STATUS_DETAILED_SENTENCE_TR[normalized] || `Siparişinizin durumu güncellendi: ${status}`;
}

/**
 * Resolves short label
 */
export function getOrderStatusTextTr(status: OrderStatus): string {
  const normalized = (status || '').toLowerCase().trim();
  return STATUS_DISPLAY_NAME_TR[normalized] || status;
}

/**
 * Sanitizes and standardizes Turkish & international phone numbers for WhatsApp API (E.164 without '+')
 */
export function sanitizeTurkishPhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;

  let digits = phone.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith('05')) {
    return `90${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith('5')) {
    return `90${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('905')) {
    return digits;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return null;
}

/**
 * Builds the Meta WhatsApp Cloud API Template Payload using the approved order_status_update_ template
 */
export function buildWhatsAppTemplatePayload(
  toPhoneNumber: string,
  customerName: string,
  orderId: string,
  statusSentenceTr: string,
  templateName: string = 'order_status_update_'
) {
  const safeCustomerName = customerName && customerName.trim() ? customerName.trim() : 'Değerli Müşterimiz';
  const safeOrderId = orderId && orderId.trim() ? orderId.trim() : 'ORD';

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhoneNumber,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: 'tr'
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: safeCustomerName
            },
            {
              type: 'text',
              text: safeOrderId
            },
            {
              type: 'text',
              text: statusSentenceTr
            }
          ]
        }
      ]
    }
  };
}

/**
 * Sends a WhatsApp order status notification via Meta Cloud API.
 * Non-blocking safe design: handles environment validation and errors gracefully.
 */
export async function sendWhatsAppOrderStatusUpdate({
  phoneNumber,
  customerName,
  orderId,
  status,
  customMessage
}: WhatsAppOrderUpdateParams): Promise<WhatsAppSendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    console.warn('[WhatsApp] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN is missing. Notification skipped.');
    return {
      success: false,
      skipped: true,
      reason: 'Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN environment variables.'
    };
  }

  const sanitizedPhone = sanitizeTurkishPhoneNumber(phoneNumber);
  if (!sanitizedPhone) {
    console.warn(`[WhatsApp] Invalid phone number provided: "${phoneNumber}". Notification skipped.`);
    return {
      success: false,
      skipped: true,
      reason: `Invalid or unsupported phone number: ${phoneNumber}`
    };
  }

  const senderPhone = process.env.WHATSAPP_BUSINESS_NUMBER 
    ? sanitizeTurkishPhoneNumber(process.env.WHATSAPP_BUSINESS_NUMBER) 
    : null;

  // WhatsApp Cloud API does not permit sending messages from a number to itself
  if (senderPhone && sanitizedPhone === senderPhone) {
    console.warn(`[WhatsApp] Cannot send notification to the sender's own business number (${sanitizedPhone}).`);
    return {
      success: false,
      skipped: true,
      reason: 'Recipient phone number is the same as the sender business number.'
    };
  }

  const statusSentenceTr = getOrderStatusDetailedTextTr(status, customMessage);
  const payload = buildWhatsAppTemplatePayload(sanitizedPhone, customerName, orderId, statusSentenceTr, 'order_status_update_');

  try {
    const endpoint = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = await response.json();

    // Fallback attempt if order_status_update_ has any issue
    if (!response.ok && data?.error?.code === 100) {
      console.warn('[WhatsApp] Primary template failed, trying fallback template order_update_v1...');
      const fallbackPayload = buildWhatsAppTemplatePayload(sanitizedPhone, customerName, orderId, `Onaylandı (${new Date().toLocaleDateString('tr-TR')})`, 'order_update_v1');
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fallbackPayload)
      });
      data = await response.json();
    }

    if (!response.ok) {
      console.error('[WhatsApp API Error Response]:', JSON.stringify(data));
      return {
        success: false,
        error: data
      };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`[WhatsApp Success] Notification sent for order ${orderId} (${status}) to ${sanitizedPhone}. Message ID: ${messageId}`);

    return {
      success: true,
      messageId
    };
  } catch (error: any) {
    console.error('[WhatsApp Network/Execution Error]:', error);
    return {
      success: false,
      error: error?.message || 'Unknown network error'
    };
  }
}
