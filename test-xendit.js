const { createQRISPayment, getQRISStatus, isPaymentCompleted, getPaymentDetails } = require('./config/xendit');

async function testXendit() {
  console.log('🧪 Testing Xendit QRIS Implementation...\n');
  
  try {
    // Test 1: Create QRIS Payment
    console.log('1️⃣ Testing QRIS Payment Creation...');
    const testAmount = 50000; // Rp 50.000
    const testExternalId = `TEST-${Date.now()}`;
    
    console.log(`Amount: Rp${testAmount.toLocaleString('id-ID')}`);
    console.log(`External ID: ${testExternalId}`);
    
    const qrisPayment = await createQRISPayment(testAmount, testExternalId);
    console.log('✅ QRIS Payment created successfully!');
    console.log('QR String:', qrisPayment.qr_string ? 'Available' : 'Not available');
    console.log('Status:', qrisPayment.status);
    console.log('');
    
    // Test 2: Get Payment Status
    console.log('2️⃣ Testing Payment Status Check...');
    const status = await getQRISStatus(testExternalId);
    console.log('✅ Status retrieved successfully!');
    console.log('Current Status:', status.status);
    console.log('Amount:', status.amount);
    console.log('');
    
    // Test 3: Check Payment Completion
    console.log('3️⃣ Testing Payment Completion Check...');
    const isCompleted = await isPaymentCompleted(testExternalId);
    console.log('✅ Completion check successful!');
    console.log('Is Completed:', isCompleted);
    console.log('');
    
    // Test 4: Get Payment Details
    console.log('4️⃣ Testing Payment Details Retrieval...');
    const details = await getPaymentDetails(testExternalId);
    console.log('✅ Details retrieved successfully!');
    console.log('Payment Details:', JSON.stringify(details, null, 2));
    console.log('');
    
    console.log('🎉 All tests passed successfully!');
    console.log('\n📱 You can now scan the QR code to test the payment flow.');
    console.log('⏰ The QR code will expire in 5 minutes.');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Error details:', error);
  }
}

// Run the test
testXendit(); 