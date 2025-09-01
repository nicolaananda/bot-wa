const { createQRISPayment } = require('./config/midtrans');

async function testPaymentLinkFormat() {
  console.log('Testing Payment Link Format...\n');

  try {
    const testAmount = 5000;
    const testOrderId = `1756744632593-${Date.now()}`;
    
    console.log(`Creating payment with Payment Link format...`);
    console.log(`Order ID: ${testOrderId}`);
    
    const payment = await createQRISPayment(testAmount, testOrderId);
    
    console.log('\n=== PAYMENT DETAILS ===');
    console.log(`Order ID: ${payment.order_id}`);
    console.log(`Amount: Rp${payment.amount.toLocaleString()}`);
    console.log(`Status: ${payment.status}`);
    console.log(`Transaction ID: ${payment.transaction_id}`);
    
    console.log('\n=== CURRENT URL FORMAT ===');
    console.log(`Current Invoice URL: ${payment.snap_url}`);
    
    // Buat URL format Payment Link seperti yang diinginkan
    const paymentLinkUrl = `https://app.sandbox.midtrans.com/payment-links/${payment.order_id}`;
    
    console.log('\n=== NEW PAYMENT LINK FORMAT ===');
    console.log(`Payment Link URL: ${paymentLinkUrl}`);
    
    console.log('\n=== BOT MESSAGE FORMAT ===');
    console.log('🧾 MENUNGGU PEMBAYARAN ��');
    console.log('');
    console.log('Produk ID: TEST001');
    console.log('Nama Produk: Test Product');
    console.log(`Harga: Rp${payment.amount.toLocaleString()}`);
    console.log('Jumlah: 1');
    console.log('Biaya Admin: Rp10');
    console.log(`Total: Rp${(payment.amount + 10).toLocaleString()}`);
    console.log('Waktu: 10 menit');
    console.log('');
    console.log('Silakan scan QRIS di atas untuk melakukan pembayaran.');
    console.log('');
    console.log(`🔗 Link Invoice: ${paymentLinkUrl}`);
    console.log('');
    console.log('Jika ingin membatalkan, ketik batal');
    
    console.log('\n=== COMPARISON ===');
    console.log('❌ Old Format: https://api.sandbox.midtrans.com/v2/qris/[transaction_id]/qr-code');
    console.log('✅ New Format: https://app.sandbox.midtrans.com/payment-links/[order_id]');
    
    console.log('\n🎉 Payment Link format siap digunakan!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPaymentLinkFormat();
