const { isPaymentCompleted } = require('./config/xendit');

async function testAllPaymentsFinal() {
  console.log('🧪 Final Test - All Cached Payments...\n');
  
  const paymentIds = [
    'TRX-EA0FAC617D-1756481682518',
    'TRX-23827CFB24-1756482103392', 
    'TRX-6CFA5EC007-1756482335856',
    'TRX-908546B965-1756482525221'
  ];
  
  console.log('📊 Final Payment Status Summary:');
  console.log('================================');
  
  let readyCount = 0;
  let totalCount = paymentIds.length;
  
  for (const externalId of paymentIds) {
    try {
      const isCompleted = await isPaymentCompleted(externalId);
      if (isCompleted) {
        readyCount++;
        console.log(`✅ ${externalId}: PAID & READY`);
      } else {
        console.log(`❌ ${externalId}: NOT READY`);
      }
    } catch (error) {
      console.log(`❌ ${externalId}: ERROR - ${error.message}`);
    }
  }
  
  console.log('\n📈 Summary:');
  console.log(`Total Payments: ${totalCount}`);
  console.log(`Ready for Delivery: ${readyCount}`);
  console.log(`Success Rate: ${((readyCount/totalCount)*100).toFixed(1)}%`);
  
  if (readyCount === totalCount) {
    console.log('\n🎉 ALL PAYMENTS ARE READY FOR ACCOUNT DELIVERY!');
    console.log('🚀 Bot should process all payments automatically!');
  } else {
    console.log('\n⚠️ Some payments are not ready yet.');
    console.log('💡 Check logs for any errors.');
  }
  
  console.log('\n💡 Bot Status: READY TO PROCESS PAYMENTS');
  console.log('🔄 Restart bot to load latest changes and start processing!');
}

testAllPaymentsFinal(); 