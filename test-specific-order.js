const { isPaymentCompleted, getPaymentStatus, clearCachedPaymentData } = require('./config/midtrans');

async function testSpecificOrder() {
  console.log('🧪 Testing Specific Order ID Case...\n');
  
  const botOrderId = 'GOPAY-8CF005CDB2-1757679587327';
  const midtransOrderId = 'GOPAY-8CF005CDB2-1757679587327-1757679599045';
  
  console.log('Order IDs from your case:');
  console.log(`- Bot Order ID: ${botOrderId}`);
  console.log(`- Midtrans Order ID: ${midtransOrderId}`);
  console.log('');
  
  // Clear cache first
  console.log('1️⃣ Clearing cache...');
  clearCachedPaymentData(botOrderId);
  clearCachedPaymentData(midtransOrderId);
  console.log('✅ Cache cleared\n');
  
  // Test 1: Bot Order ID (should fail)
  console.log('2️⃣ Testing Bot Order ID (expected to fail)...');
  try {
    const status1 = await getPaymentStatus(botOrderId);
    console.log('❌ Unexpected success:', status1);
  } catch (error) {
    console.log('✅ Expected failure:', error.message);
  }
  console.log('');
  
  // Test 2: Midtrans Order ID (should succeed)
  console.log('3️⃣ Testing Midtrans Order ID (should succeed)...');
  try {
    const status2 = await getPaymentStatus(midtransOrderId);
    console.log('✅ SUCCESS! Payment found:');
    console.log('Status Details:', {
      transaction_status: status2.transaction_status,
      payment_type: status2.payment_type,
      gross_amount: status2.gross_amount,
      order_id: status2.order_id
    });
    
    const completion = await isPaymentCompleted(midtransOrderId);
    console.log('Completion Status:', completion.status);
    
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }
  console.log('');
  
  // Test 3: Smart fallback system
  console.log('4️⃣ Testing Smart Fallback System...');
  try {
    const smartResult = await isPaymentCompleted(botOrderId);
    console.log('Smart Fallback Result:', smartResult);
    
    if (smartResult.working_order_id) {
      console.log('✅ Working Order ID found:', smartResult.working_order_id);
    }
    
  } catch (error) {
    console.log('❌ Smart fallback failed:', error.message);
  }
  console.log('');
  
  console.log('🏁 Test completed!');
  console.log('');
  
  // Analysis
  console.log('📊 Analysis:');
  console.log('- Bot creates: GOPAY-XXXXX-timestamp1 (creation time)');
  console.log('- Midtrans uses: GOPAY-XXXXX-timestamp1-timestamp2 (settlement time)');
  console.log('- Timestamp2 is added when payment is processed/settled');
  console.log('');
  
  // Calculate timestamp difference
  const timestamp1 = 1757679587327;
  const timestamp2 = 1757679599045;
  const difference = timestamp2 - timestamp1;
  
  console.log('🕐 Timestamp Analysis:');
  console.log(`- Creation time: ${timestamp1} (${new Date(timestamp1).toISOString()})`);
  console.log(`- Settlement time: ${timestamp2} (${new Date(timestamp2).toISOString()})`);
  console.log(`- Difference: ${difference}ms (${Math.round(difference/1000)} seconds)`);
  console.log('');
  
  console.log('💡 Solution:');
  console.log('The smart fallback system should now try order IDs with');
  console.log('timestamps around the creation time + 0-5 minutes offset');
}

// Run test if called directly
if (require.main === module) {
  testSpecificOrder();
}

module.exports = testSpecificOrder; 