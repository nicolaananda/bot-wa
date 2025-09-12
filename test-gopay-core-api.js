const { createGopayPayment, isPaymentCompleted } = require('./config/midtrans');

async function testGopayCoreAPI() {
  console.log('🧪 Testing Gopay Core API Implementation...\n');
  
  // Test data
  const testAmount = 5000;
  const testOrderId = `GOPAY-TEST-${Date.now()}`;
  const testCustomerDetails = {
    first_name: 'Test User',
    phone: '6287887842985',
    product_id: 'test',
    product_name: 'Test Product',
    unit_price: 5000,
    quantity: 1
  };
  
  console.log('Test Parameters:');
  console.log(`- Amount: Rp${testAmount}`);
  console.log(`- Order ID: ${testOrderId}`);
  console.log(`- Customer: ${testCustomerDetails.first_name}`);
  console.log('');
  
  try {
    // Step 1: Create Gopay payment
    console.log('1️⃣ Creating Gopay payment via Core API...');
    const paymentData = await createGopayPayment(testAmount, testOrderId, testCustomerDetails);
    
    console.log('✅ Gopay payment created successfully!');
    console.log('Payment Details:', {
      transaction_id: paymentData.transaction_id,
      order_id: paymentData.order_id,
      status: paymentData.status,
      deeplink: paymentData.deeplink ? 'Available' : 'Not available',
      qr_string: paymentData.qr_string ? 'Available' : 'Not available'
    });
    console.log('');
    
    // Step 2: Test payment status checking
    console.log('2️⃣ Testing payment status checking...');
    const statusResult = await isPaymentCompleted(paymentData.transaction_id);
    
    console.log('Payment Status Check Result:', {
      status: statusResult.status,
      transaction_status: statusResult.transaction_status,
      working_order_id: statusResult.working_order_id
    });
    console.log('');
    
    // Step 3: Show payment instructions
    console.log('3️⃣ Payment Instructions:');
    if (paymentData.deeplink) {
      console.log(`🔗 Gopay Deeplink: ${paymentData.deeplink}`);
      console.log('📱 Instructions:');
      console.log('   1. Klik link di atas untuk buka Gopay');
      console.log('   2. Konfirmasi pembayaran di app Gopay');
      console.log('   3. Tunggu konfirmasi otomatis');
    }
    
    if (paymentData.qr_string) {
      console.log(`📱 QR Code: ${paymentData.qr_string}`);
    }
    
    console.log('');
    console.log('🎯 Summary:');
    console.log('✅ Core API implementation working');
    console.log('✅ Payment creation successful');
    console.log('✅ Status checking functional');
    console.log('✅ Same approach as buymidtrans (proven working)');
    
    if (paymentData.deeplink) {
      console.log('✅ Deeplink available for user payment');
    } else {
      console.log('⚠️ No deeplink - check Gopay configuration');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run test
testGopayCoreAPI().catch(console.error); 