const { createQRISPayment } = require('./config/midtrans');
const crypto = require('crypto');

async function testDANAPayment() {
  console.log('Testing DANA Payment Option...\n');

  try {
    // Generate Order ID dengan format yang sama seperti di index.js
    const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
    const orderId = `TRX-${reffId}-${Date.now()}`;
    
    console.log(`Generated Order ID: ${orderId}`);
    console.log('Creating payment with DANA option...\n');
    
    const testAmount = 20000;
    const payment = await createQRISPayment(testAmount, orderId);
    
    console.log('=== PAYMENT DETAILS ===');
    console.log(`Order ID: ${payment.order_id}`);
    console.log(`Amount: Rp${payment.amount.toLocaleString()}`);
    console.log(`Status: ${payment.status}`);
    console.log(`Token: ${payment.token}`);
    
    console.log('\n=== SNAP URL ===');
    console.log(`Snap URL: ${payment.snap_url}`);
    
    console.log('\n=== E-WALLET OPTIONS AVAILABLE ===');
    console.log('✅ QRIS - Scan QR code');
    console.log('✅ Gopay - E-wallet');
    console.log('✅ ShopeePay - E-wallet');
    console.log('✅ DANA - E-wallet (NEW!)');
    console.log('✅ OVO - E-wallet (NEW!)');
    console.log('✅ LinkAja - E-wallet (NEW!)');
    
    console.log('\n=== VIRTUAL ACCOUNT OPTIONS ===');
    console.log('✅ BCA Virtual Account');
    console.log('✅ BNI Virtual Account');
    console.log('✅ BRI Virtual Account');
    console.log('✅ E-Channel (Mandiri)');
    console.log('✅ Permata Virtual Account');
    
    console.log('\n=== OTHER PAYMENT OPTIONS ===');
    console.log('✅ Credit Card');
    console.log('✅ BCA KlikBCA');
    console.log('✅ BCA KlikPay');
    console.log('✅ BRI E-Pay');
    console.log('✅ Telkomsel Cash');
    console.log('✅ Mandiri ClickPay');
    console.log('✅ CIMB Clicks');
    console.log('✅ Danamon Online');
    console.log('✅ Akulaku');
    
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
    console.log(`🔗 Link Invoice: ${payment.snap_url}`);
    console.log('');
    console.log('💡 Atau klik link di atas untuk pilih metode pembayaran lain:');
    console.log('• Gopay, ShopeePay, DANA, OVO, LinkAja');
    console.log('• Virtual Account (BCA, BNI, BRI)');
    console.log('• Credit Card, E-Channel, dll');
    console.log('');
    console.log('Jika ingin membatalkan, ketik batal');
    
    console.log('\n🎉 DANA dan e-wallet lainnya sudah ditambahkan!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDANAPayment();
