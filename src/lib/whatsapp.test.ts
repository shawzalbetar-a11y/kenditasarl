import {
  sanitizeTurkishPhoneNumber,
  getOrderStatusTextTr,
  buildWhatsAppTemplatePayload,
} from './whatsapp';

console.log('--- Running WhatsApp Service Unit Tests ---');

function assertEqual(actual: any, expected: any, testName: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`[FAIL] ${testName}: Expected ${expectedStr}, got ${actualStr}`);
  }
  console.log(`✓ [PASS] ${testName}`);
}

// 1. Phone Sanitization Tests
assertEqual(sanitizeTurkishPhoneNumber('05059398227'), '905059398227', '05xxxxxxxxx format');
assertEqual(sanitizeTurkishPhoneNumber('05321234567'), '905321234567', '0532xxxxxxx format');
assertEqual(sanitizeTurkishPhoneNumber('5059398227'), '905059398227', '5xxxxxxxxx format');
assertEqual(sanitizeTurkishPhoneNumber('+90 (505) 939-8227'), '905059398227', '+90 (505) format');
assertEqual(sanitizeTurkishPhoneNumber('+90 532 123 45 67'), '905321234567', '+90 532 space separated');
assertEqual(sanitizeTurkishPhoneNumber('0 (544) 999 88 77'), '905449998877', '0 (5xx) formatted');
assertEqual(sanitizeTurkishPhoneNumber('+90-505-939-82-27'), '905059398227', 'Hyphen separated');
assertEqual(sanitizeTurkishPhoneNumber('905059398227'), '905059398227', 'Already 905xxxxxxxxx');
assertEqual(sanitizeTurkishPhoneNumber('00905059398227'), '905059398227', 'Leading 00 prefix');
assertEqual(sanitizeTurkishPhoneNumber('+966501234567'), '966501234567', 'Saudi international number');
assertEqual(sanitizeTurkishPhoneNumber('+971501234567'), '971501234567', 'UAE international number');
assertEqual(sanitizeTurkishPhoneNumber(''), null, 'Empty string returns null');
assertEqual(sanitizeTurkishPhoneNumber('12345'), null, 'Short number returns null');

// 2. Status Mapping Tests
assertEqual(getOrderStatusTextTr('pending'), 'Siparişiniz Alındı ve Onaylandı', 'Status: pending');
assertEqual(getOrderStatusTextTr('new'), 'Siparişiniz Alındı ve Onaylandı', 'Status: new');
assertEqual(getOrderStatusTextTr('ready'), 'Ürünleriniz Baskıya / Üretime Hazırlandı', 'Status: ready');
assertEqual(getOrderStatusTextTr('processing'), 'Ürünleriniz Baskıya / Üretime Hazırlandı', 'Status: processing');
assertEqual(getOrderStatusTextTr('printing'), 'Ürünleriniz Baskıya / Üretime Hazırlandı', 'Status: printing');
assertEqual(getOrderStatusTextTr('quality_check'), 'Ürünleriniz Baskıya / Üretime Hazırlandı', 'Status: quality_check');
assertEqual(getOrderStatusTextTr('packed'), 'Kuryeye / Kargoya Teslim Edildi', 'Status: packed');
assertEqual(getOrderStatusTextTr('shipped'), 'Kuryeye / Kargoya Teslim Edildi', 'Status: shipped');
assertEqual(getOrderStatusTextTr('delivered'), 'Siparişiniz Başarıyla Teslim Edildi', 'Status: delivered');
assertEqual(getOrderStatusTextTr('completed'), 'Siparişiniz Başarıyla Teslim Edildi', 'Status: completed');
assertEqual(getOrderStatusTextTr('cancelled'), 'Siparişiniz İptal Edildi', 'Status: cancelled');

// 3. Payload Structure Test
const payload = buildWhatsAppTemplatePayload(
  '905059398227',
  'Mehmet Yılmaz',
  'ORD-1002',
  'Kuryeye / Kargoya Teslim Edildi'
);

assertEqual(payload, {
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: '905059398227',
  type: 'template',
  template: {
    name: 'order_update_v1',
    language: {
      code: 'tr'
    },
    components: [
      {
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: 'Mehmet Yılmaz'
          },
          {
            type: 'text',
            text: 'ORD-1002'
          },
          {
            type: 'text',
            text: 'Kuryeye / Kargoya Teslim Edildi'
          }
        ]
      }
    ]
  }
}, 'Meta order_update_v1 Template Payload match');

console.log('--- All WhatsApp Unit Tests Passed Successfully! 🎉 ---');
