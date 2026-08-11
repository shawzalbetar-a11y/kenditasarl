import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, customerName, customerPhone, deliveryAddress, orderNumber, total, deliveryMethod, items, locale } = body;

    if (!email || !orderNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY is not configured. Email will not be sent.');
      return NextResponse.json({ success: false, message: 'Resend API key missing' });
    }

    // Since we're using a free/test Resend account, the from address must be onboarding@resend.dev
    // or a verified domain.
    const fromAddress = 'Kenditasarl <onboarding@resend.dev>';

    // Fallback to 'tr' just in case, but rely heavily on locale
    const lang = (locale === 'en' || locale === 'ar' || locale === 'tr') ? locale : 'tr';
    const isRtl = lang === 'ar';
    const dir = isRtl ? 'rtl' : 'ltr';
    const align = isRtl ? 'right' : 'left';
    const oppAlign = isRtl ? 'left' : 'right';
    const comma = isRtl ? '،' : ',';

    const t = {
      ar: {
        title: 'تم تأكيد الطلب! 🎉',
        subtitle: 'شكراً لتسوقك معنا',
        hello: 'مرحباً',
        dear: 'عميلنا العزيز',
        intro: 'نقوم الآن بتجهيز طلبك للشحن. إليك تفاصيل الطلب الخاص بك:',
        orderNo: 'رقم الطلب:',
        emailTitle: 'البريد الإلكتروني:',
        phoneTitle: 'رقم الهاتف:',
        addressTitle: 'عنوان التوصيل:',
        deliveryTitle: 'طريقة التوصيل:',
        express: 'توصيل سريع',
        standard: 'شحن عادي',
        paymentTitle: 'طريقة الدفع:',
        cod: 'الدفع عند الاستلام',
        itemsTitle: 'المنتجات المطلوبة',
        color: 'اللون',
        size: 'القياس',
        customText: 'نص مخصص',
        quantity: 'الكمية',
        total: 'الإجمالي المشتريات',
        footer: 'إذا كانت لديك أي أسئلة، فلا تتردد في التواصل معنا عبر الموقع.'
      },
      en: {
        title: 'Order Confirmed! 🎉',
        subtitle: 'Thank you for shopping with us',
        hello: 'Hello',
        dear: 'Dear Customer',
        intro: 'We are now preparing your order for shipment. Here are your order details:',
        orderNo: 'Order Number:',
        emailTitle: 'Email:',
        phoneTitle: 'Phone Number:',
        addressTitle: 'Delivery Address:',
        deliveryTitle: 'Delivery Method:',
        express: 'Express Delivery',
        standard: 'Standard Shipping',
        paymentTitle: 'Payment Method:',
        cod: 'Cash on Delivery',
        itemsTitle: 'Order Items',
        color: 'Color',
        size: 'Size',
        customText: 'Custom Text',
        quantity: 'Qty',
        total: 'Total',
        footer: 'If you have any questions, feel free to contact us.'
      },
      tr: {
        title: 'Siparişiniz Onaylandı! 🎉',
        subtitle: 'Bizi tercih ettiğiniz için teşekkürler',
        hello: 'Merhaba',
        dear: 'Değerli Müşterimiz',
        intro: 'Siparişinizi kargoya hazırlıyoruz. İşte sipariş detaylarınız:',
        orderNo: 'Sipariş Numarası:',
        emailTitle: 'E-posta:',
        phoneTitle: 'Telefon Numarası:',
        addressTitle: 'Teslimat Adresi:',
        deliveryTitle: 'Teslimat Yöntemi:',
        express: 'Hızlı Teslimat',
        standard: 'Standart Teslimat',
        paymentTitle: 'Ödeme Yöntemi:',
        cod: 'Kapıda Ödeme',
        itemsTitle: 'Sipariş Edilen Ürünler',
        color: 'Renk',
        size: 'Beden',
        customText: 'Özel Metin',
        quantity: 'Adet',
        total: 'Toplam Tutar',
        footer: 'Herhangi bir sorunuz varsa, bizimle iletişime geçmekten çekinmeyin.'
      }
    };
    
    // Explicitly select the correct language object
    let tl = t.tr;
    if (lang === 'en') tl = t.en;
    if (lang === 'ar') tl = t.ar;

    let itemsHtml = (items || []).map((item: any) => `
      <tr>
        <td style="padding: 15px 12px; border-bottom: 1px solid #eee;">
          <strong style="font-size: 16px; color: #111;">${item.name}</strong><br/>
          <div style="font-size: 13px; color: #666; margin-top: 4px;">
            ${item.color ? `<span>${tl.color}: ${item.color}</span><br/>` : ''}
            ${item.size ? `<span>${tl.size}: ${item.size}</span><br/>` : ''}
            ${item.customText ? `<span>${tl.customText}: "${item.customText}"</span><br/>` : ''}
            <span>${tl.quantity}: ${item.quantity}</span>
          </div>
        </td>
        <td style="padding: 15px 12px; border-bottom: 1px solid #eee; text-align: ${oppAlign}; vertical-align: top; font-weight: bold; color: #333;">
          ${item.price * item.quantity} ₺
        </td>
      </tr>
    `).join('');

    const htmlContent = `
      <div dir="${dir}" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; color: #333; background-color: #ffffff; text-align: ${align};">
        <div style="background-color: #f75d34; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">${tl.title}</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${tl.subtitle}</p>
        </div>
        
        <div style="padding: 30px; border: 1px solid #eee; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 18px; margin-top: 0;">${tl.hello} <strong>${customerName || tl.dear}</strong>${comma}</p>
          <p style="font-size: 16px; color: #555; line-height: 1.5;">${tl.intro}</p>
          
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; border: 1px solid #f1f3f5;">
            <table style="width: 100%; border-collapse: collapse; font-size: 15px; text-align: ${align};">
              <tr>
                <td style="padding: 8px 0; color: #777; width: 40%;">${tl.orderNo}</td>
                <td style="padding: 8px 0; font-weight: bold; color: #222;">${orderNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #777;">${tl.emailTitle}</td>
                <td style="padding: 8px 0; font-weight: bold; color: #222;">${email}</td>
              </tr>
              ${customerPhone ? `
              <tr>
                <td style="padding: 8px 0; color: #777;">${tl.phoneTitle}</td>
                <td style="padding: 8px 0; font-weight: bold; color: #222;">${customerPhone}</td>
              </tr>
              ` : ''}
              ${deliveryAddress ? `
              <tr>
                <td style="padding: 8px 0; color: #777; vertical-align: top;">${tl.addressTitle}</td>
                <td style="padding: 8px 0; font-weight: bold; color: #222;">${deliveryAddress}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0; color: #777;">${tl.deliveryTitle}</td>
                <td style="padding: 8px 0; font-weight: bold; color: #222;">${deliveryMethod === 'express' ? tl.express : tl.standard}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #777;">${tl.paymentTitle}</td>
                <td style="padding: 8px 0; font-weight: bold; color: #222;">${tl.cod}</td>
              </tr>
            </table>
          </div>

          <h3 style="margin: 30px 0 15px 0; font-size: 20px; color: #111; border-bottom: 2px solid #f75d34; padding-bottom: 10px; display: inline-block;">${tl.itemsTitle}</h3>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: ${align};">
            ${itemsHtml}
            <tr>
              <td style="padding: 20px 12px; font-weight: bold; font-size: 20px; color: #111;">${tl.total}</td>
              <td style="padding: 20px 12px; font-weight: bold; font-size: 22px; text-align: ${oppAlign}; color: #f75d34;">
                ${total} ₺
              </td>
            </tr>
          </table>

          <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 14px; margin: 0;">${tl.footer}</p>
          </div>
        </div>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: email,
        subject: `Order Confirmation - ${orderNumber}`,
        html: htmlContent
      })
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error('Resend API Error:', errorData);
      return NextResponse.json({ success: false, error: errorData }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error('Email sending error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
