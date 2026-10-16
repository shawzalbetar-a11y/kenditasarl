/**
 * Script for Testing WhatsApp Cloud API Notification directly
 * Usage: npx tsx scripts/test-whatsapp.ts [phone_number]
 */
import * as fs from 'fs';
import * as path from 'path';
import { sendWhatsAppOrderStatusUpdate } from '../src/lib/whatsapp';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const k = trimmed.slice(0, eq).trim();
        const v = trimmed.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

loadEnvLocal();

async function runTest() {
  const targetPhone = process.argv[2] || '05059398227';
  
  console.log('----------------------------------------------------');
  console.log('🚀 بدء اختبار إرسال إشعار WhatsApp Cloud API التجريبي');
  console.log('----------------------------------------------------');
  console.log(`📱 الرقم المستهدف: ${targetPhone}`);
  console.log(`🆔 WHATSAPP_PHONE_NUMBER_ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID}`);
  console.log(`🔑 WHATSAPP_TOKEN: ${process.env.WHATSAPP_TOKEN ? 'تم العثور على التوكن ✅' : '(غير محدد في .env.local ❌)'}`);
  console.log('----------------------------------------------------');

  const result = await sendWhatsAppOrderStatusUpdate({
    phoneNumber: targetPhone,
    customerName: 'Kadir Bey',
    orderId: 'ORD-1005',
    status: 'pending'
  });

  console.log('----------------------------------------------------');
  if (result.success) {
    console.log('✅ نجح الإرسال الفعلي! وصلت الرسالة إلى تطبيق الواتساب بنجاح.');
    console.log(`📩 معرف الرسالة (Message ID): ${result.messageId}`);
  } else {
    console.error('❌ فشل الإرسال:');
    console.error(JSON.stringify(result.error || result.reason, null, 2));
  }
  console.log('----------------------------------------------------');
}

runTest();
