const { isPaymentCompleted, clearCachedPaymentData } = require('./config/midtrans');

async function clearAndTestPayment() {
  console.log('🧹 Clearing Payment Cache and Testing Status...\n');
  
  // Order ID from your logs
  const botOrderId = 'GOPAY-9A9BC06975-1757678722026';
  const midtransOrderId = 'GOPAY-9A9BC06975-1757678722026-1757678814401';
  
  console.log('Order IDs:');
  console.log(`- Bot Order ID: ${botOrderId}`);
  console.log(`- Midtrans Order ID: ${midtransOrderId}`);
  console.log('');
  
  try {
    // Clear cache for both order IDs
    console.log('1️⃣ Clearing cached payment data...');
    clearCachedPaymentData(botOrderId);
    clearCachedPaymentData(midtransOrderId);
    console.log('✅ Cache cleared for both order IDs\n');
    
    // Test payment status with bot order ID
    console.log('2️⃣ Testing payment status with Bot Order ID...');
    try {
      const status1 = await isPaymentCompleted(botOrderId);
      console.log('Bot Order ID Status:', status1);
    } catch (error) {
      console.log('❌ Bot Order ID failed:', error.message);
    }
    console.log('');
    
    // Test payment status with Midtrans order ID
    console.log('3️⃣ Testing payment status with Midtrans Order ID...');
    try {
      const status2 = await isPaymentCompleted(midtransOrderId);
      console.log('Midtrans Order ID Status:', status2);
    } catch (error) {
      console.log('❌ Midtrans Order ID failed:', error.message);
    }
    console.log('');
    
    console.log('🏁 Test completed!');
    console.log('');
    console.log('💡 Expected results:');
    console.log('- Bot Order ID should return ERROR (transaction not found)');
    console.log('- Midtrans Order ID should return PAID (settlement status)');
    console.log('');
    console.log('🔧 If Midtrans Order ID returns PAID, the issue is fixed!');
    console.log('   Bot should now detect payment completion correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run test if called directly
if (require.main === module) {
  clearAndTestPayment();
}

module.exports = clearAndTestPayment; 