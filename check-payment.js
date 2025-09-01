const { getPaymentStatus, isPaymentCompleted } = require('./config/midtrans');

async function checkPaymentStatus() {
  console.log('Checking Payment Status...\n');

  try {
    const orderId = '1756744632593-1756745337397';
    
    console.log(`Order ID: ${orderId}`);
    console.log('Checking payment status...\n');
    
    // Get detailed payment status
    const status = await getPaymentStatus(orderId);
    
    console.log('=== PAYMENT STATUS DETAILS ===');
    console.log(`Order ID: ${status.order_id}`);
    console.log(`Transaction Status: ${status.transaction_status}`);
    console.log(`Payment Type: ${status.payment_type}`);
    console.log(`Gross Amount: Rp${status.gross_amount?.toLocaleString() || 'N/A'}`);
    console.log(`Transaction Time: ${status.transaction_time}`);
    console.log(`Settlement Time: ${status.settlement_time || 'Not settled yet'}`);
    console.log(`Fraud Status: ${status.fraud_status}`);
    console.log(`Status Code: ${status.status_code}`);
    console.log(`Status Message: ${status.status_message}`);
    
    // Check if payment is completed
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
      console.log('✅ Produk bisa dikirim ke customer');
    } else if (completion.status === 'PENDING') {
      console.log('\n⏳ PAYMENT PENDING');
      console.log('⏳ Menunggu pembayaran dari customer');
      console.log('⏳ Transaksi masih aktif');
    } else {
      console.log('\n❌ PAYMENT ERROR');
      console.log('❌ Ada masalah dengan transaksi');
    }
    
  } catch (error) {
    console.error('❌ Error checking payment status:', error.message);
    console.log('\nPossible reasons:');
    console.log('- Order ID tidak ditemukan');
    console.log('- Transaksi sudah expired');
    console.log('- API key tidak valid');
    console.log('- Network error');
  }
}

checkPaymentStatus();
