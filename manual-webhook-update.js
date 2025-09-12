const { updateOrderIdFromWebhook, storePaymentData, getCachedPaymentData } = require('./config/midtrans');

async function manualWebhookUpdate() {
  console.log('🔧 Manual Webhook Update for Specific Order...\n');
  
  // Your specific case
  const originalOrderId = 'GOPAY-3FAB55D017-1757682507006';
  const midtransOrderId = 'GOPAY-3FAB55D017-1757682507006-1757682517318';
  
  console.log('Case Details:');
  console.log(`- Bot Order ID: ${originalOrderId}`);
  console.log(`- Midtrans Order ID: ${midtransOrderId}`);
  console.log(`- Status: Settlement (from dashboard)`);
  console.log(`- Amount: Rp2.043`);
  console.log('');
  
  // Step 1: Store webhook data manually
  console.log('1️⃣ Creating webhook data manually...');
  const webhookData = {
    order_id: midtransOrderId,
    transaction_status: 'settlement',
    payment_type: 'gopay',
    gross_amount: '2043.00',
    transaction_time: '2025-09-12 20:08:00',
    settlement_time: '2025-09-12 20:08:00',
    fraud_status: 'accept',
    status_code: '200',
    status_message: 'Success, transaction is found',
    webhook_updated: new Date().toISOString(),
    manual_update: true
  };
  
  storePaymentData(midtransOrderId, webhookData);
  console.log('✅ Webhook data stored manually');
  
  // Step 2: Update order ID mapping
  console.log('2️⃣ Updating order ID mapping...');
  const updateResult = updateOrderIdFromWebhook(originalOrderId, midtransOrderId);
  console.log(`Order ID mapping: ${updateResult ? '✅ Success' : '❌ Failed'}`);
  
  // Step 3: Verify the update
  console.log('3️⃣ Verifying update...');
  const originalData = getCachedPaymentData(originalOrderId);
  
  console.log('Updated bot data:', {
    original_order_id: originalData?.order_id,
    midtrans_order_id: originalData?.midtrans_order_id,
    transaction_status: originalData?.transaction_status,
    gross_amount: originalData?.gross_amount,
    webhook_updated: originalData?.webhook_updated
  });
  
  console.log('');
  if (originalData?.transaction_status === 'settlement') {
    console.log('🎉 SUCCESS! Bot should now detect payment as PAID');
    console.log('💡 The bot will use the updated Midtrans order ID for status checking');
  } else {
    console.log('❌ Update failed - payment status not updated');
  }
  
  console.log('');
  console.log('🚀 Next steps:');
  console.log('1. Bot will now use the correct Midtrans order ID');
  console.log('2. Payment status should change from PENDING to PAID');
  console.log('3. Order processing should continue automatically');
}

// Run the manual update
manualWebhookUpdate().catch(console.error); 