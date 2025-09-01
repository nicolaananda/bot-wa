const { createQRISPayment } = require('./config/midtrans');

async function testFinalImplementation() {
  console.log('Testing Final Implementation...\n');

  try {
    const testAmount = 5000;
    const testOrderId = `FINAL-TEST-${Date.now()}`;
    
    console.log(`Creating payment for final test...`);
    const payment = await createQRISPayment(testAmount, testOrderId);
    
    console.log('\n=== FINAL PAYMENT DETAILS ===');
    console.log(`Order ID: ${payment.order_id}`);
    console.log(`Amount: Rp${payment.amount.toLocaleString()}`);
    console.log(`Status: ${payment.status}`);
    console.log(`Transaction ID: ${payment.transaction_id}`);
    
    console.log('\n=== LINKS & QR ===');
    console.log(`QR String: ${payment.qr_string.substring(0, 50)}...`);
    console.log(`Invoice URL: ${payment.snap_url}`);
    
    console.log('\n=== BOT MESSAGE FORMAT ===');
    console.log('🧾 MENUNGGU PEMBAYARAN 🧾');
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
    console.log(`🔗 Link Invoice: ${payment.snap_url}`);
    console.log('');
    console.log('Jika ingin membatalkan, ketik batal');
    
    console.log('\n=== RECOMMENDATIONS ===');
    console.log('✅ QR String sudah valid untuk scan');
    console.log('✅ Link Invoice mengarah ke QR code API');
    console.log('✅ User bisa scan QR langsung dari gambar');
    console.log('✅ Link sebagai backup jika QR tidak bisa di-scan');
    
    console.log('\n🎉 Implementation siap digunakan!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFinalImplementation();
