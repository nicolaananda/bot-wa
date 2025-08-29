const { getQRISStatus, isPaymentCompleted, getPaymentDetails, getServiceStatus } = require('./config/xendit');

async function testCachedPayment() {
  console.log('🧪 Testing Cached Payment Detection...\n');
  
  const externalId = 'TRX-EA0FAC617D-1756481682518';
  
  try {
    // Test 1: Check service status
    console.log('1️⃣ Checking service status...');
    const serviceStatus = getServiceStatus();
    console.log('Service Status:', JSON.stringify(serviceStatus, null, 2));
    console.log('');
    
    // Test 2: Get payment status (should use cache)
    console.log('2️⃣ Testing getQRISStatus with cached payment...');
    try {
      const status = await getQRISStatus(externalId);
      console.log('✅ Status retrieved successfully');
      console.log('Payment Status:', status.status);
      console.log('Payment ID:', status.id);
      console.log('Amount:', status.amount);
      console.log('Paid Amount:', status.paid_amount);
      console.log('Source:', status.cachedAt ? 'Cache' : 'API');
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
      } else {
        console.log('❌ Payment is NOT detected as completed');
      }
    } catch (error) {
      console.log('❌ isPaymentCompleted failed:', error.message);
    }
    console.log('');
    
    // Test 4: Get payment details
    console.log('4️⃣ Testing getPaymentDetails...');
    try {
      const details = await getPaymentDetails(externalId);
      if (details) {
        console.log('✅ Payment details retrieved successfully');
        console.log('Details:', JSON.stringify(details, null, 2));
      } else {
        console.log('❌ No payment details found');
      }
    } catch (error) {
      console.log('❌ getPaymentDetails failed:', error.message);
    }
    
    console.log('\n💡 If payment is detected as completed, the bot should now be able to process it!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

testCachedPayment(); 