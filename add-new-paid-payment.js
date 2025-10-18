const fs = require('fs');
const path = require('path');

// New payment data from your logs (status: PAID) - LATEST TRANSACTION
const newPaidPayment = {
  id: '68b1cbdd00ce1ba364861f8f',
  external_id: 'TRX-908546B965-1756482525221',
  user_id: '68b18117d06ae5ac92169254',
  payment_method: 'QR_CODE',
  status: 'PAID',
  merchant_name: 'iNyx Store',
  merchant_profile_picture_url: 'https://du8nwjtfkinx.cloudfront.net/xendit.png',
  amount: 3682,
  paid_amount: 3682,
  paid_at: '2025-08-29T15:48:55.395Z',
  description: 'Pembayaran produk - TRX-908546B965-1756482525221',
  expiry_date: '2025-08-30T15:48:45.448Z',
  invoice_url: 'https://checkout-staging.xendit.co/web/68b1cbdd00ce1ba364861f8f',
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
  created: '2025-08-29T15:48:45.604Z',
  updated: '2025-08-29T15:48:57.259Z',
  currency: 'IDR',
  payment_channel: 'QRIS',
  payment_id: 'qrpy_c185f53f-440e-4f59-9ba9-d65e998a0a96',
  payment_method_id: 'pm-05739c2b-5050-41d0-838e-ec78a8d0377f',
  metadata: null,
  cachedAt: new Date().toISOString()
};

const CACHE_FILE = path.join(__dirname, 'config', 'payment-cache.json');

function addNewPaidPayment() {
  console.log('🔧 Adding New PAID Payment to Cache...\n');
  
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
    
    // Add the new payment
    cache[newPaidPayment.external_id] = newPaidPayment;
    
    // Save updated cache
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`✅ Successfully added payment ${newPaidPayment.external_id} with PAID status`);
    console.log(`Cache now contains ${Object.keys(cache).length} payments`);
    console.log('');
    
    // Show what was added
    console.log('📋 New payment added:');
    console.log(`External ID: ${newPaidPayment.external_id}`);
    console.log(`Status: ${newPaidPayment.status}`);
    console.log(`Amount: ${newPaidPayment.amount}`);
    console.log(`Paid Amount: ${newPaidPayment.paid_amount}`);
    console.log(`Paid At: ${newPaidPayment.paid_at}`);
    console.log(`Payment Channel: ${newPaidPayment.payment_channel}`);
    console.log(`Payment Method: ${newPaidPayment.payment_method}`);
    
    // Show all cached payments
    console.log('\n📊 All cached payments:');
    Object.keys(cache).forEach(key => {
      const payment = cache[key];
      console.log(`• ${key}: ${payment.status} (${payment.amount})`);
    });
    
    console.log('\n💡 Now the bot should detect this payment as completed and send the account!');
    
  } catch (error) {
    console.error('❌ Error adding payment to cache:', error.message);
  }
}

addNewPaidPayment(); 