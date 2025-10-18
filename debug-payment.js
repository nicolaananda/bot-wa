const { getQRISStatus, getPaymentByInvoiceId, getPaymentDetails, isPaymentCompleted } = require('./config/xendit');

async function debugPayment() {
  console.log('🔍 Debugging Payment Issue...\n');
  
  // Use the external_id from your logs
  const externalId = 'TRX-EA0FAC617D-1756481682518';
  const invoiceId = '68b1c89200ce1ba364861b49';
  
  console.log(`External ID: ${externalId}`);
  console.log(`Invoice ID: ${invoiceId}`);
  console.log('');
  
  try {
    // Test 1: Get payment by external_id
    console.log('1️⃣ Testing getQRISStatus with external_id...');
    try {
      const status = await getQRISStatus(externalId);
      console.log('✅ Status retrieved successfully');
      console.log('Payment Status:', status.status);
      console.log('Payment ID:', status.id);
      console.log('Amount:', status.amount);
      console.log('Paid Amount:', status.paid_amount);
    } catch (error) {
      console.log('❌ getQRISStatus failed:', error.message);
    }
    console.log('');
    
    // Test 2: Get payment by invoice ID
    console.log('2️⃣ Testing getPaymentByInvoiceId...');
    try {
      const payment = await getPaymentByInvoiceId(invoiceId);
      console.log('✅ Payment by invoice ID retrieved successfully');
      console.log('Payment Status:', payment.status);
      console.log('External ID:', payment.external_id);
      console.log('Amount:', payment.amount);
      console.log('Paid Amount:', payment.paid_amount);
      console.log('Payment Channel:', payment.payment_channel);
      console.log('Payment Method:', payment.payment_method);
    } catch (error) {
      console.log('❌ getPaymentByInvoiceId failed:', error.message);
    }
    console.log('');
    
    // Test 3: Check if payment is completed
    console.log('3️⃣ Testing isPaymentCompleted...');
    try {
      const isCompleted = await isPaymentCompleted(externalId);
      console.log('✅ isPaymentCompleted result:', isCompleted);
    } catch (error) {
      console.log('❌ isPaymentCompleted failed:', error.message);
    }
    console.log('');
    
    // Test 4: Get payment details
    console.log('4️⃣ Testing getPaymentDetails...');
    try {
      const details = await getPaymentDetails(externalId);
      if (details) {
        console.log('✅ Payment details retrieved successfully');
        console.log('Details:', JSON.stringify(details, null, 2));
      } else {
        console.log('❌ No payment details found');
      }
    } catch (error) {
      console.log('❌ getPaymentDetails failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Debug failed with error:', error.message);
  }
}

debugPayment(); 