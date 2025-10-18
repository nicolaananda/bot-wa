const { getPaymentStatus, isPaymentCompleted } = require('./config/midtrans');

async function checkRealPaymentStatus() {
  console.log('Checking Real Payment Status...\n');

  try {
    const orderId = 'TRX-4002FB3E78-1756746421452';
    
    console.log(`Order ID: ${orderId}`);
    console.log('Checking real-time payment status from Midtrans API...\n');
    
    // Force check from API, not cache
    console.log('1. Getting payment status from API (bypass cache)...');
    const status = await getPaymentStatus(orderId);
    
    console.log('\n=== REAL-TIME PAYMENT STATUS ===');
    console.log(`Order ID: ${status.order_id}`);
    console.log(`Transaction Status: ${status.transaction_status}`);
    console.log(`Payment Type: ${status.payment_type}`);
    console.log(`Gross Amount: Rp${status.gross_amount?.toLocaleString() || 'N/A'}`);
    console.log(`Transaction Time: ${status.transaction_time}`);
    console.log(`Settlement Time: ${status.settlement_time || 'Not settled yet'}`);
    console.log(`Fraud Status: ${status.fraud_status}`);
    console.log(`Status Code: ${status.status_code}`);
    console.log(`Status Message: ${status.status_message}`);
    
    // Check completion status
    console.log('\n2. Checking payment completion...');
    const completion = await isPaymentCompleted(orderId);
    
    console.log('\n=== PAYMENT COMPLETION STATUS ===');
    console.log(`Status: ${completion.status}`);
    console.log(`Paid Amount: Rp${completion.paid_amount?.toLocaleString() || '0'}`);
    console.log(`Transaction Status: ${completion.transaction_status}`);
    console.log(`Payment Type: ${completion.payment_type}`);
    console.log(`Settlement Time: ${completion.settlement_time || 'Not settled yet'}`);
    
    if (completion.status === 'PAID') {
      console.log('\n🎉 PAYMENT SUCCESSFUL!');
      console.log('✅ Transaksi sudah berhasil dibayar');
      console.log('✅ Produk seharusnya sudah dikirim ke customer');
      console.log('✅ Jika belum dikirim, ada masalah di sistem delivery');
    } else if (completion.status === 'PENDING') {
      console.log('\n⏳ PAYMENT PENDING');
      console.log('⏳ Menunggu pembayaran dari customer');
      console.log('⏳ Transaksi masih aktif');
    } else {
      console.log('\n❌ PAYMENT ERROR');
      console.log('❌ Ada masalah dengan transaksi');
    }
    
    console.log('\n=== DEBUGGING INFO ===');
    console.log('Possible issues:');
    console.log('1. Cache data is outdated');
    console.log('2. API response format changed');
    console.log('3. Payment status not properly parsed');
    console.log('4. Bot logic not detecting settlement status');
    
  } catch (error) {
    console.error('❌ Error checking payment status:', error.message);
    console.log('\nPossible reasons:');
    console.log('- Order ID tidak ditemukan');
    console.log('- Transaksi sudah expired');
    console.log('- API key tidak valid');
    console.log('- Network error');
  }
}

checkRealPaymentStatus();
