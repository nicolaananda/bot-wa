const { createQRISPayment } = require('./config/midtrans');
const crypto = require('crypto');

async function testTRXFormat() {
  console.log('Testing TRX Format Order ID...\n');

  try {
    // Generate Order ID dengan format yang sama seperti di index.js
    const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
    const orderId = `TRX-${reffId}-${Date.now()}`;
    
    console.log(`Generated Order ID: ${orderId}`);
    console.log('Creating payment with TRX format...\n');
    
    const testAmount = 10000;
    const payment = await createQRISPayment(testAmount, orderId);
    
    console.log('=== PAYMENT DETAILS ===');
    console.log(`Order ID: ${payment.order_id}`);
    console.log(`Amount: Rp${payment.amount.toLocaleString()}`);
    console.log(`Status: ${payment.status}`);
    console.log(`Transaction ID: ${payment.transaction_id}`);
    
    console.log('\n=== URL FORMAT ===');
    console.log(`Payment Link URL: ${payment.snap_url}`);
    
    console.log('\n=== BOT MESSAGE FORMAT ===');
    console.log('🧾 MENUNGGU PEMBAYARAN 🧾');
    console.log('');
    console.log('Produk ID: viu1t');
    console.log('Nama Produk: VIU 1 TAHUN');
    console.log(`Harga: Rp${payment.amount.toLocaleString()}`);
    console.log('Jumlah: 1');
    console.log('Biaya Admin: Rp10');
    console.log(`Total: Rp${(payment.amount + 10).toLocaleString()}`);
    console.log('Waktu: 10 menit');
    console.log('');
    console.log('Silakan scan QRIS di atas untuk melakukan pembayaran.');
    console.log('');
    console.log(`�� Link Invoice: ${payment.snap_url}`);
    console.log('');
    console.log('Jika ingin membatalkan, ketik batal');
    
    console.log('\n=== FORMAT COMPARISON ===');
    console.log('✅ Order ID Format: TRX-[HEX]-[TIMESTAMP]');
    console.log('✅ URL Format: https://app.sandbox.midtrans.com/payment-links/[ORDER_ID]');
    console.log('✅ Short & Clean: Mudah dibaca dan diingat');
    
    console.log('\n🎉 TRX format siap digunakan!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTRXFormat();
