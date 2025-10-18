const fs = require('fs');
const path = require('path');

// Payment data from your logs
const paidPayment = {
  id: '68b1c89200ce1ba364861b49',
  external_id: 'TRX-EA0FAC617D-1756481682518',
  user_id: '68b18117d06ae5ac92169254',
  payment_method: 'QR_CODE',
  status: 'PAID',
  merchant_name: 'iNyx Store',
  merchant_profile_picture_url: 'https://du8nwjtfkinx.cloudfront.net/xendit.png',
  amount: 3664,
  paid_amount: 3664,
  paid_at: '2025-08-29T15:36:03.502Z',
  description: 'Pembayaran produk - TRX-EA0FAC617D-1756481682518',
  expiry_date: '2025-08-30T15:34:43.004Z',
  invoice_url: 'https://checkout-staging.xendit.co/web/68b1c89200ce1ba364861b49',
  available_banks: [],
  available_retail_outlets: [],
  available_ewallets: [],
  available_qr_codes: [],
  available_direct_debits: [],
  available_paylaters: [],
  should_exclude_credit_card: true,
  should_send_email: false,
  success_redirect_url: 'https://example.com/success',
  failure_redirect_url: 'https://example.com/failure',
  created: '2025-08-29T15:34:43.109Z',
  updated: '2025-08-29T15:36:05.159Z',
  currency: 'IDR',
  payment_channel: 'QRIS',
  payment_id: 'qrpy_7a1e61f4-8df8-4bb2-ad54-309358a89ae6',
  payment_method_id: 'pm-d2fe748f-ff05-4ad8-b95e-65e99c43789f',
  metadata: null,
  cachedAt: new Date().toISOString()
};

const CACHE_FILE = path.join(__dirname, 'config', 'payment-cache.json');

function addPaidPayment() {
  console.log('🔧 Adding paid payment to cache...\n');
  
  try {
    // Load existing cache or create new one
    let cache = {};
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(data);
      console.log(`Loaded existing cache with ${Object.keys(cache).length} payments`);
    } else {
      console.log('No existing cache found, creating new one');
    }
    
    // Add the paid payment
    cache[paidPayment.external_id] = paidPayment;
    
    // Save cache
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`✅ Successfully added payment ${paidPayment.external_id} to cache`);
    console.log(`Cache now contains ${Object.keys(cache).length} payments`);
    console.log('');
    
    // Show what was added
    console.log('📋 Payment details added:');
    console.log(`External ID: ${paidPayment.external_id}`);
    console.log(`Status: ${paidPayment.status}`);
    console.log(`Amount: ${paidPayment.amount}`);
    console.log(`Paid Amount: ${paidPayment.paid_amount}`);
    console.log(`Paid At: ${paidPayment.paid_at}`);
    console.log(`Payment Channel: ${paidPayment.payment_channel}`);
    
    console.log('\n💡 Now the bot should be able to detect this payment as completed!');
    
  } catch (error) {
    console.error('❌ Error adding payment to cache:', error.message);
  }
}

addPaidPayment(); 