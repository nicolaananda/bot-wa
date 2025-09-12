const { storePaymentData, updateOrderIdFromWebhook, getCachedPaymentData } = require('./config/midtrans');

async function simulateWebhookNotification() {
  console.log('🧪 Simulating Webhook Notification...\n');
  
  // Simulate the case from your logs
  const originalOrderId = 'GOPAY-8CF005CDB2-1757679587327';
  const webhookOrderId = 'GOPAY-8CF005CDB2-1757679587327-1757679599045';
  
  console.log('Test Case:');
  console.log(`- Original Order ID: ${originalOrderId}`);
  console.log(`- Webhook Order ID: ${webhookOrderId}`);
  console.log('');
  
  // Step 1: Create initial payment data (as bot would)
  console.log('1️⃣ Creating initial payment data...');
  const initialPaymentData = {
    transaction_id: originalOrderId,
    order_id: originalOrderId,
    midtrans_order_id: originalOrderId, // Initially incomplete
    amount: 2072,
    status: 'pending',
    payment_url: 'https://app.midtrans.com/payment-links/...',
    payment_type: 'gopay',
    created: new Date().toISOString()
  };
  
  storePaymentData(originalOrderId, initialPaymentData);
  console.log('✅ Initial payment data stored');
  console.log('');
  
  // Step 2: Simulate webhook notification
  console.log('2️⃣ Simulating webhook notification...');
  const webhookData = {
    order_id: webhookOrderId,
    transaction_status: 'settlement',
    payment_type: 'gopay',
    gross_amount: '2072.00',
    transaction_time: '2025-09-12 19:20:00',
    settlement_time: '2025-09-12 19:20:03',
    fraud_status: 'accept',
    status_code: '200',
    status_message: 'Success, transaction is found',
    webhook_updated: new Date().toISOString()
  };
  
  // Store webhook data
  storePaymentData(webhookOrderId, webhookData);
  console.log('✅ Webhook data stored with settlement status');
  
  // Update order ID mapping
  const updateResult = updateOrderIdFromWebhook(originalOrderId, webhookOrderId);
  console.log(`Order ID mapping update: ${updateResult ? '✅ Success' : '❌ Failed'}`);
  console.log('');
  
  // Step 3: Verify the mapping
  console.log('3️⃣ Verifying order ID mapping...');
  const originalData = getCachedPaymentData(originalOrderId);
  const webhookData2 = getCachedPaymentData(webhookOrderId);
  
  console.log('Original Order ID data:', {
    midtrans_order_id: originalData?.midtrans_order_id,
    transaction_status: originalData?.transaction_status,
    webhook_updated: originalData?.webhook_updated
  });
  
  console.log('Webhook Order ID data:', {
    order_id: webhookData2?.order_id,
    transaction_status: webhookData2?.transaction_status,
    payment_type: webhookData2?.payment_type
  });
  
  console.log('');
  console.log('🎯 Result:');
  if (originalData?.midtrans_order_id === webhookOrderId) {
    console.log('✅ SUCCESS: Order ID mapping updated correctly!');
    console.log('✅ Bot can now use the correct Midtrans order ID for status checking');
  } else {
    console.log('❌ FAILED: Order ID mapping not updated');
  }
}

// Run test
simulateWebhookNotification().catch(console.error); 