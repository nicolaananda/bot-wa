const { getQRISStatus, isPaymentCompleted, getServiceStatus } = require('./config/xendit');

async function checkNewPayment() {
  console.log('🔍 Checking New Payment Status...\n');
  
  const externalId = 'TRX-908546B965-1756482525221';
  
  try {
    // Test 1: Check service status
    console.log('1️⃣ Checking service status...');
    const serviceStatus = getServiceStatus();
    console.log('Service Status:', JSON.stringify(serviceStatus, null, 2));
    console.log('');
    
    // Test 2: Get current payment status
    console.log('2️⃣ Checking current payment status...');
    try {
      const status = await getQRISStatus(externalId);
      console.log('✅ Status retrieved successfully');
      console.log('Payment Status:', status.status);
      console.log('Payment ID:', status.id);
      console.log('Amount:', status.amount);
      console.log('Paid Amount:', status.paid_amount || 'Not paid yet');
      console.log('Paid At:', status.paid_at || 'Not paid yet');
      console.log('Source:', status.cachedAt ? 'Cache' : 'API');
      
      if (status.status === 'PAID') {
        console.log('🎉 Payment is already PAID!');
      } else {
        console.log('⏳ Payment is still PENDING, waiting for payment...');
      }
      
    } catch (error) {
      console.log('❌ getQRISStatus failed:', error.message);
    }
    console.log('');
    
    // Test 3: Check if payment is completed
    console.log('3️⃣ Testing isPaymentCompleted...');
    try {
      const isCompleted = await isPaymentCompleted(externalId);
      console.log('✅ isPaymentCompleted result:', isCompleted);
      if (isCompleted) {
        console.log('🎉 Payment is detected as completed!');
        console.log('🚀 Bot should now send the account to the user!');
      } else {
        console.log('⏳ Payment is NOT completed yet (still PENDING)');
        console.log('💡 This is normal for new payments, wait for user to pay');
      }
    } catch (error) {
      console.log('❌ isPaymentCompleted failed:', error.message);
    }
    
    console.log('\n💡 If payment is still PENDING, this is normal for new transactions.');
    console.log('🚀 Once user pays, status will change to PAID and bot will detect it automatically!');
    
  } catch (error) {
    console.error('❌ Check failed with error:', error.message);
  }
}

checkNewPayment(); 