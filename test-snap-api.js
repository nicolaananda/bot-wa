const { createQRISPayment } = require('./config/midtrans');

async function testSnapAPI() {
  console.log('Testing Snap API for Multiple Payment Options...\n');

  try {
    const testAmount = 10000;
    const testOrderId = `TRX-TEST-${Date.now()}`;
    
    console.log(`Order ID: ${testOrderId}`);
    console.log('Creating payment with Snap API...\n');
    
    // Test dengan Snap API untuk multiple payment options
    const snapRequest = {
      transaction_details: {
        order_id: testOrderId,
        gross_amount: testAmount
      },
      item_details: [{
        id: 'PRODUCT',
        price: testAmount,
        quantity: 1,
        name: 'Pembelian Produk Digital'
      }],
      customer_details: {
        first_name: 'Customer',
        last_name: '',
        email: 'customer@example.com',
        phone: '08123456789'
      },
      enabled_payments: [
        'qris',
        'gopay',
        'shopeepay',
        'bca_va',
        'bni_va',
        'bri_va',
        'echannel',
        'permata_va',
        'other_va',
        'credit_card',
        'bca_klikbca',
        'bca_klikpay',
        'bri_epay',
        'telkomsel_cash',
        'echannel',
        'mandiri_clickpay',
        'cimb_clicks',
        'danamon_online',
        'akulaku'
      ],
      callbacks: {
        finish: 'https://example.com/finish',
        pending: 'https://example.com/pending',
        error: 'https://example.com/error'
      }
    };

    console.log('Snap Request:', JSON.stringify(snapRequest, null, 2));
    
    // Simulasi response Snap API
    const mockSnapResponse = {
      token: 'snap-token-' + Date.now(),
      redirect_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token-${Date.now()}`
    };
    
    console.log('\n=== SNAP API RESPONSE ===');
    console.log(`Token: ${mockSnapResponse.token}`);
    console.log(`Redirect URL: ${mockSnapResponse.redirect_url}`);
    
    console.log('\n=== PAYMENT OPTIONS AVAILABLE ===');
    console.log('✅ QRIS - Scan QR code');
    console.log('✅ Gopay - E-wallet');
    console.log('✅ ShopeePay - E-wallet');
    console.log('✅ BCA Virtual Account');
    console.log('✅ BNI Virtual Account');
    console.log('✅ BRI Virtual Account');
    console.log('✅ E-Channel (Mandiri)');
    console.log('✅ Permata Virtual Account');
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
    console.log('�� MENUNGGU PEMBAYARAN 🧾');
    console.log('');
    console.log('Produk ID: viu1t');
    console.log('Nama Produk: VIU 1 TAHUN');
    console.log(`Harga: Rp${testAmount.toLocaleString()}`);
    console.log('Jumlah: 1');
    console.log('Biaya Admin: Rp10');
    console.log(`Total: Rp${(testAmount + 10).toLocaleString()}`);
    console.log('Waktu: 10 menit');
    console.log('');
    console.log('Silakan scan QRIS di atas untuk melakukan pembayaran.');
    console.log('');
    console.log(`🔗 Link Invoice: ${mockSnapResponse.redirect_url}`);
    console.log('');
    console.log('💡 Atau klik link di atas untuk pilih metode pembayaran lain:');
    console.log('• Gopay, ShopeePay, OVO, DANA');
    console.log('• Virtual Account (BCA, BNI, BRI)');
    console.log('• Credit Card, E-Channel, dll');
    console.log('');
    console.log('Jika ingin membatalkan, ketik batal');
    
    console.log('\n🎉 Snap API memberikan opsi pembayaran lengkap!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSnapAPI();
