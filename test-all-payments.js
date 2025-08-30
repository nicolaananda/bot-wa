const { getQRISStatus, isPaymentCompleted, getPaymentDetails, getServiceStatus } = require('./config/xendit');

async function testAllPayments() {
  console.log('🧪 Testing All Cached Payments...\n');
  
  // All payment IDs from cache
  const paymentIds = [
    'TRX-EA0FAC617D-1756481682518',
    'TRX-23827CFB24-1756482103392', 
    'TRX-6CFA5EC007-1756482335856'
  ];
  
  try {
    // Test 1: Check service status
    console.log('1️⃣ Checking service status...');
    const serviceStatus = getServiceStatus();
    console.log('Service Status:', JSON.stringify(serviceStatus, null, 2));
    console.log('');
    
    // Test 2: Test each payment
    for (let i = 0; i < paymentIds.length; i++) {
      const externalId = paymentIds[i];
      console.log(`2️⃣ Testing Payment ${i + 1}/${paymentIds.length}: ${externalId}`);
      
      try {
        // Get payment status
        const status = await getQRISStatus(externalId);
        console.log(`   ✅ Status: ${status.status}`);
        console.log(`   💰 Amount: ${status.amount}`);
        console.log(`   💳 Paid Amount: ${status.paid_amount}`);
        console.log(`   ⏰ Paid At: ${status.paid_at}`);
        
        // Check if completed
        const isCompleted = await isPaymentCompleted(externalId);
        console.log(`   🎯 Completed: ${isCompleted ? 'YES' : 'NO'}`);
        
        if (isCompleted) {
          console.log(`   🎉 Payment ${externalId} is ready for account delivery!`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
      
      console.log('');
    }
    
    // Test 3: Summary
    console.log('3️⃣ Summary of All Payments:');
    for (const externalId of paymentIds) {
      try {
        const isCompleted = await isPaymentCompleted(externalId);
        const status = await getQRISStatus(externalId);
        console.log(`   • ${externalId}: ${status.status} (${isCompleted ? '✅ Ready' : '❌ Not Ready'})`);
      } catch (error) {
        console.log(`   • ${externalId}: ERROR (${error.message})`);
      }
    }
    
    console.log('\n💡 All payments should now be detected correctly!');
    console.log('🚀 Bot should process completed payments automatically!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

testAllPayments(); 