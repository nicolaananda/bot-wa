const { createQRISPayment, isPaymentCompleted, getServiceStatus } = require('./config/midtrans');

async function testMidtrans() {
  console.log('Testing Midtrans integration...\n');

  try {
    // Test service status
    console.log('1. Testing service status...');
    const serviceStatus = await getServiceStatus();
    console.log('Service status:', serviceStatus);

    // Test QRIS payment creation
    console.log('\n2. Testing QRIS payment creation...');
    const testAmount = 50000;
    const testOrderId = `TEST-MIDTRANS-${Date.now()}`;
    
    console.log(`Amount: ${testAmount}`);
    console.log(`Order ID: ${testOrderId}`);

    const qrisPayment = await createQRISPayment(testAmount, testOrderId);
    console.log('\nQRIS Payment created successfully!');
    console.log('Payment data:', JSON.stringify(qrisPayment, null, 2));

    // Test payment status check
    console.log('\n3. Testing payment status check...');
    const paymentStatus = await isPaymentCompleted(testOrderId);
    console.log('Payment status:', paymentStatus);

    console.log('\nAll Midtrans tests completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testMidtrans();
