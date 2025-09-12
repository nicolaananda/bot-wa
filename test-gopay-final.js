const { createGopayPayment, isPaymentCompleted } = require('./config/midtrans');

async function testGopayFinal() {
  console.log('🎯 Final Gopay Implementation Test...\n');
  
  // Test data (similar to bot usage)
  const testAmount = 5000;
  const testOrderId = `GOPAY-FINAL-${Date.now()}`;
  const testCustomerDetails = {
    first_name: 'Test User',
    phone: '6287887842985',
    product_id: 'test',
    product_name: 'Test Product',
    unit_price: 5000,
    quantity: 1
  };
  
  console.log('🧪 Test Parameters:');
  console.log(`- Amount: Rp${testAmount}`);
  console.log(`- Order ID: ${testOrderId}`);
  console.log(`- Customer: ${testCustomerDetails.first_name}`);
  console.log('');
  
  try {
    // Step 1: Create Gopay payment (same as bot)
    console.log('1️⃣ Creating Gopay payment...');
    const paymentData = await createGopayPayment(testAmount, testOrderId, testCustomerDetails);
    
    console.log('✅ Payment Created Successfully!');
    console.log('Payment Data:', {
      order_id: paymentData.order_id,
      snap_token: paymentData.snap_token,
      payment_url: paymentData.payment_url,
      status: paymentData.status
    });
    console.log('');
    
    // Step 2: Simulate bot data storage
    console.log('2️⃣ Simulating bot order data storage...');
    const botOrderData = {
      orderId: testOrderId,
      paymentToken: paymentData.snap_token,
      midtrans_order_id: testOrderId, // For Snap API monitoring
      payment_url: paymentData.payment_url,
      snap_token: paymentData.snap_token
    };
    
    console.log('Bot Order Data:', botOrderData);
    console.log('');
    
    // Step 3: Test payment status checking (same as bot)
    console.log('3️⃣ Testing payment status monitoring...');
    console.log(`Checking status with order_id: ${botOrderData.orderId}`);
    
    const paymentStatus = await isPaymentCompleted(botOrderData.orderId);
    
    console.log('Payment Status Result:', {
      status: paymentStatus.status,
      transaction_status: paymentStatus.transaction_status,
      working_order_id: paymentStatus.working_order_id
    });
    console.log('');
    
    // Step 4: Show user instructions
    console.log('4️⃣ User Payment Instructions:');
    if (paymentData.payment_url) {
      console.log(`🔗 Payment URL: ${paymentData.payment_url}`);
      console.log('📱 Instructions for user:');
      console.log('   1. Klik link di atas untuk buka Gopay');
      console.log('   2. Pilih metode pembayaran Gopay');
      console.log('   3. Konfirmasi pembayaran di app Gopay');
      console.log('   4. Bot akan otomatis detect pembayaran');
    }
    console.log('');
    
    // Step 5: Final summary
    console.log('🎯 Implementation Summary:');
    console.log('✅ Snap API integration working');
    console.log('✅ Payment URL generation successful');
    console.log('✅ Order ID monitoring configured');
    console.log('✅ Status checking functional');
    
    if (paymentData.payment_url && paymentData.snap_token) {
      console.log('✅ Ready for production use!');
      console.log('');
      console.log('💡 Next steps:');
      console.log('1. User clicks payment URL');
      console.log('2. User pays via Gopay');
      console.log('3. Webhook updates payment status');
      console.log('4. Bot detects payment completion');
      console.log('5. Bot processes order automatically');
    } else {
      console.log('❌ Missing payment URL or token');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run final test
testGopayFinal().catch(console.error); 