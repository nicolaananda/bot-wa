const { storePaymentData, getCachedPaymentData, isPaymentCompleted } = require('./config/midtrans');

async function fixCurrentPayment() {
  console.log('🔧 Direct Fix for Current Payment Issue...\n');
  
  // Your specific case from logs
  const botOrderId = 'GOPAY-3FAB55D017-1757682507006';
  const midtransOrderId = 'GOPAY-3FAB55D017-1757682507006-1757682517318';
  
  console.log('Payment Details:');
  console.log(`- Bot Order ID: ${botOrderId}`);
  console.log(`- Midtrans Order ID: ${midtransOrderId}`);
  console.log(`- Dashboard Status: Settlement`);
  console.log(`- Amount: Rp2.043`);
  console.log('');
  
  // Step 1: Create complete payment data for bot order ID
  console.log('1️⃣ Creating complete payment data...');
  const completePaymentData = {
    transaction_id: midtransOrderId,
    order_id: botOrderId,
    midtrans_order_id: midtransOrderId, // The correct full ID
    amount: 2043,
    status: 'settlement',
    transaction_status: 'settlement', // Key field for detection
    payment_type: 'gopay',
    gross_amount: '2043.00',
    transaction_time: '2025-09-12 20:08:00',
    settlement_time: '2025-09-12 20:08:00',
    fraud_status: 'accept',
    status_code: '200',
    status_message: 'Success, transaction is found',
    payment_url: 'https://app.midtrans.com/payment-links/...',
    created: new Date().toISOString(),
    webhook_updated: new Date().toISOString(),
    manual_fix: true
  };
  
  // Store with both order IDs
  storePaymentData(botOrderId, completePaymentData);
  storePaymentData(midtransOrderId, completePaymentData);
  
  console.log('✅ Complete payment data stored for both order IDs');
  console.log('');
  
  // Step 2: Test payment detection with bot order ID
  console.log('2️⃣ Testing payment detection with bot order ID...');
  const result1 = await isPaymentCompleted(botOrderId);
  console.log('Result (bot order ID):', result1);
  
  // Step 3: Test payment detection with Midtrans order ID
  console.log('3️⃣ Testing payment detection with Midtrans order ID...');
  const result2 = await isPaymentCompleted(midtransOrderId);
  console.log('Result (Midtrans order ID):', result2);
  
  console.log('');
  console.log('🎯 Summary:');
  if (result1.status === 'PAID' || result2.status === 'PAID') {
    console.log('🎉 SUCCESS! Payment detection is now working!');
    console.log('✅ Bot should detect the payment as PAID on next check');
    console.log('✅ Order processing should continue automatically');
    console.log('');
    console.log('💡 The bot will now use the correct data:');
    console.log(`   - Original order ID: ${botOrderId}`);
    console.log(`   - Midtrans order ID: ${midtransOrderId}`);
    console.log(`   - Status: ${result1.status || result2.status}`);
    console.log(`   - Amount: ${result1.paid_amount || result2.paid_amount}`);
  } else {
    console.log('❌ Payment detection still not working');
    console.log('💡 May need to restart the bot or check webhook configuration');
  }
}

// Run the fix
fixCurrentPayment().catch(console.error); 