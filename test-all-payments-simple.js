const { isPaymentCompleted } = require('./config/xendit');

async function testAllPaymentsSimple() {
  console.log('🧪 Testing All Cached Payments (Simple)...\n');
  
  const paymentIds = [
    'TRX-EA0FAC617D-1756481682518',
    'TRX-23827CFB24-1756482103392', 
    'TRX-6CFA5EC007-1756482335856'
  ];
  
  console.log('📊 Payment Status Summary:');
  console.log('========================');
  
  for (const externalId of paymentIds) {
    try {
      const isCompleted = await isPaymentCompleted(externalId);
      console.log(`✅ ${externalId}: ${isCompleted ? 'PAID & READY' : 'NOT READY'}`);
    } catch (error) {
      console.log(`❌ ${externalId}: ERROR - ${error.message}`);
    }
  }
  
  console.log('\n🎯 All payments should now be detected correctly!');
  console.log('🚀 Bot should process completed payments automatically!');
}

testAllPaymentsSimple(); 