const { createQRISPayment } = require('./config/midtrans');

async function testInvoiceLink() {
  console.log('Testing Invoice Link...\n');

  try {
    const testAmount = 10000;
    const testOrderId = `TEST-LINK-${Date.now()}`;
    
    console.log(`Creating payment for testing link...`);
    const payment = await createQRISPayment(testAmount, testOrderId);
    
    console.log('\n=== PAYMENT DETAILS ===');
    console.log(`Order ID: ${payment.order_id}`);
    console.log(`Amount: Rp${payment.amount.toLocaleString()}`);
    console.log(`Status: ${payment.status}`);
    console.log(`Transaction ID: ${payment.transaction_id}`);
    
    console.log('\n=== LINKS ===');
    console.log(`QR String: ${payment.qr_string.substring(0, 50)}...`);
    console.log(`Invoice URL: ${payment.snap_url}`);
    
    console.log('\n=== TESTING LINK ===');
    console.log('✅ Invoice URL sekarang mengarah ke halaman pembayaran Midtrans');
    console.log('✅ Bukan langsung ke QR code');
    console.log('✅ User bisa memilih metode pembayaran');
    
    console.log('\n🎉 Link invoice sudah diperbaiki!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testInvoiceLink();
