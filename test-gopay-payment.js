const { createGopayPayment, isPaymentCompleted } = require('./config/midtrans');

async function testGopayPayment() {
  console.log('🧪 Testing Gopay Payment Integration...\n');
  
  try {
    // Test 1: Create Gopay Payment
    console.log('1️⃣ Testing Gopay Payment Creation...');
    
    const testAmount = 50000; // 50k
    const testOrderId = `TEST-GOPAY-${Date.now()}`;
    const testCustomerDetails = {
      first_name: 'Test Customer',
      phone: '08123456789',
      product_id: 'vid3u',
      product_name: 'VIDIO SHARING 3USER',
      unit_price: 49000,
      quantity: 1
    };
    
    console.log(`Order ID: ${testOrderId}`);
    console.log(`Amount: Rp${testAmount.toLocaleString('id-ID')}`);
    console.log(`Customer: ${testCustomerDetails.first_name}`);
    console.log('');
    
    const paymentData = await createGopayPayment(testAmount, testOrderId, testCustomerDetails);
    
    console.log('✅ Gopay Payment Created Successfully!');
    console.log('Payment Details:');
    console.log(`- Transaction ID: ${paymentData.transaction_id}`);
    console.log(`- Order ID: ${paymentData.order_id}`);
    console.log(`- Amount: Rp${paymentData.amount.toLocaleString('id-ID')}`);
    console.log(`- Status: ${paymentData.status}`);
    console.log(`- Payment Type: ${paymentData.payment_type}`);
    
    if (paymentData.deeplink) {
      console.log(`- Deeplink: ${paymentData.deeplink}`);
      console.log('  📱 Click this link to open Gopay app');
    }
    
    if (paymentData.qr_string) {
      console.log(`- QR Code URL: ${paymentData.qr_string}`);
      console.log('  📱 Use this QR code for manual scanning');
    }
    
    console.log('');
    
    // Test 2: Check Payment Status
    console.log('2️⃣ Testing Payment Status Check...');
    
    const statusResult = await isPaymentCompleted(testOrderId);
    
    console.log('Payment Status Check Result:');
    console.log(`- Status: ${statusResult.status}`);
    console.log(`- Paid Amount: Rp${statusResult.paid_amount.toLocaleString('id-ID')}`);
    console.log(`- Transaction Status: ${statusResult.transaction_status}`);
    console.log(`- Payment Type: ${statusResult.payment_type}`);
    
    if (statusResult.status === 'PAID') {
      console.log('🎉 Payment is already completed!');
    } else {
      console.log('⏳ Payment is still pending...');
      console.log('💡 Complete the payment using the deeplink or QR code above');
    }
    
    console.log('');
    
    // Test 3: Simulate Payment Monitoring
    console.log('3️⃣ Testing Payment Monitoring (5 checks)...');
    
    for (let i = 1; i <= 5; i++) {
      console.log(`Check ${i}/5: Monitoring payment status...`);
      
      const currentStatus = await isPaymentCompleted(testOrderId);
      console.log(`- Status: ${currentStatus.status}`);
      
      if (currentStatus.status === 'PAID') {
        console.log('🎉 Payment completed during monitoring!');
        break;
      }
      
      if (i < 5) {
        console.log('⏳ Waiting 10 seconds for next check...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    console.log('');
    console.log('🏁 Gopay Payment Test Completed!');
    console.log('');
    console.log('📋 Test Summary:');
    console.log('✅ Payment creation: SUCCESS');
    console.log('✅ Status checking: SUCCESS');
    console.log('✅ Payment monitoring: SUCCESS');
    console.log('');
    console.log('💡 Next Steps:');
    console.log('1. Test the payment using the deeplink or QR code');
    console.log('2. Monitor the logs for payment completion');
    console.log('3. Verify that the payment status changes to PAID');
    console.log('4. Test the complete flow in WhatsApp bot');
    
  } catch (error) {
    console.error('❌ Gopay Payment Test Failed:', error.message);
    console.error('❌ Full Error:', error);
    
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check Midtrans configuration in .env file');
    console.log('2. Verify MIDTRANS_SERVER_KEY is correct');
    console.log('3. Ensure network connection is stable');
    console.log('4. Check if Midtrans sandbox is accessible');
  }
}

// Helper function to format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

// Run test if called directly
if (require.main === module) {
  testGopayPayment();
}

module.exports = testGopayPayment; 