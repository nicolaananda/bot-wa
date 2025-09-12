const { isPaymentCompleted, getPaymentStatus } = require('./config/midtrans');

async function debugPaymentIds() {
  console.log('🔍 Debugging Payment ID Formats...\n');
  
  // Test different order ID formats from your examples
  const testIds = [
    'GOPAY-496AB0B845-1757679293703',                    // Bot format
    'GOPAY-496AB0B845-1757679293703-1757679303910',      // Midtrans format (from dashboard)
    '3ed69447-e652-4331-8d8f-cec9d03b121f',             // Transaction ID (from dashboard)
    'GOPAY-9A9BC06975-1757678722026',                    // Previous bot format
    'GOPAY-9A9BC06975-1757678722026-1757678814401'       // Previous Midtrans format
  ];
  
  console.log('Testing Order ID formats:');
  testIds.forEach((id, index) => {
    console.log(`${index + 1}. ${id}`);
  });
  console.log('');
  
  for (let i = 0; i < testIds.length; i++) {
    const orderId = testIds[i];
    console.log(`🧪 Testing ID ${i + 1}: ${orderId}`);
    
    try {
      const status = await getPaymentStatus(orderId);
      console.log('✅ SUCCESS - Payment found!');
      console.log('Status Details:', {
        transaction_status: status.transaction_status,
        payment_type: status.payment_type,
        gross_amount: status.gross_amount,
        order_id: status.order_id
      });
      
      const completion = await isPaymentCompleted(orderId);
      console.log('Completion Status:', completion.status);
      
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    
    console.log('');
  }
  
  console.log('🏁 Debug completed!');
  console.log('');
  console.log('💡 Analysis:');
  console.log('- If any ID returns SUCCESS with settlement status, use that format');
  console.log('- The working ID format should be used for payment monitoring');
  console.log('- Check which ID format matches the Midtrans dashboard order ID');
  
  // Additional test: try to find pattern
  console.log('🔍 Pattern Analysis:');
  console.log('From your examples:');
  console.log('- Bot creates: GOPAY-XXXXX-timestamp1');
  console.log('- Midtrans uses: GOPAY-XXXXX-timestamp1-timestamp2');
  console.log('- The second timestamp appears to be when payment is processed');
  console.log('');
  console.log('💡 Possible solutions:');
  console.log('1. Use webhook to get correct order ID when payment completes');
  console.log('2. Extract order ID from payment URL');
  console.log('3. Use transaction ID instead of order ID');
  console.log('4. Poll with both formats until one succeeds');
}

// Run test if called directly
if (require.main === module) {
  debugPaymentIds();
}

module.exports = debugPaymentIds; 