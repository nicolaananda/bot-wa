const fs = require('fs');
const path = require('path');

// Latest payment data from your logs (status: PAID)
const updatedPayment = {
  id: '68b1ca3700ce1ba364861d90',
  external_id: 'TRX-23827CFB24-1756482103392',
  user_id: '68b18117d06ae5ac92169254',
  payment_method: 'QR_CODE',
  status: 'PAID',
  merchant_name: 'iNyx Store',
  merchant_profile_picture_url: 'https://du8nwjtfkinx.cloudfront.net/xendit.png',
  amount: 3630,
  paid_amount: 3630,
  paid_at: '2025-08-29T15:42:13.528Z',
  description: 'Pembayaran produk - TRX-23827CFB24-1756482103392',
  expiry_date: '2025-08-30T15:41:43.729Z',
  invoice_url: 'https://checkout-staging.xendit.co/web/68b1ca3700ce1ba364861d90',
  available_banks: [],
  available_retail_outlets: [],
  available_ewallets: [],
  available_qr_codes: [
    {
      qr_code_type: 'QRIS'
    }
  ],
  available_direct_debits: [],
  available_paylaters: [],
  should_exclude_credit_card: true,
  should_send_email: false,
  success_redirect_url: 'https://example.com/success',
  failure_redirect_url: 'https://example.com/failure',
  created: '2025-08-29T15:41:44.023Z',
  updated: '2025-08-29T15:42:15.215Z',
  currency: 'IDR',
  payment_channel: 'QRIS',
  payment_id: 'qrpy_082b9b8a-6de3-42ac-8cc0-04ba3c660a06',
  payment_method_id: 'pm-610e6de1-f4a5-4261-b1fd-6caedad194d6',
  metadata: null,
  cachedAt: new Date().toISOString()
};

const CACHE_FILE = path.join(__dirname, 'config', 'payment-cache.json');

function updatePaymentCache() {
  console.log('🔧 Updating Payment Cache with PAID status...\n');
  
  try {
    // Load existing cache
    let cache = {};
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(data);
      console.log(`Loaded existing cache with ${Object.keys(cache).length} payments`);
    } else {
      console.log('No existing cache found, creating new one');
    }
    
    // Update the payment with latest data
    cache[updatedPayment.external_id] = updatedPayment;
    
    // Save updated cache
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`✅ Successfully updated payment ${updatedPayment.external_id} to PAID status`);
    console.log(`Cache now contains ${Object.keys(cache).length} payments`);
    console.log('');
    
    // Show what was updated
    console.log('📋 Payment details updated:');
    console.log(`External ID: ${updatedPayment.external_id}`);
    console.log(`Status: ${updatedPayment.status} (was PENDING, now PAID)`);
    console.log(`Amount: ${updatedPayment.amount}`);
    console.log(`Paid Amount: ${updatedPayment.paid_amount}`);
    console.log(`Paid At: ${updatedPayment.paid_at}`);
    console.log(`Payment Channel: ${updatedPayment.payment_channel}`);
    console.log(`Payment Method: ${updatedPayment.payment_method}`);
    
    console.log('\n💡 Now the bot should detect this payment as completed and send the account!');
    
  } catch (error) {
    console.error('❌ Error updating payment cache:', error.message);
  }
}

updatePaymentCache(); 