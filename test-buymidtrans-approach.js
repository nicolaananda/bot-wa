const { createQRISCore, isPaymentCompleted } = require('./config/midtrans');

async function testBuymidtrans() {
  console.log('Testing buymidtrans QRIS approach...');
  
  const testAmount = 5000;
  const testOrderId = `TRX-TEST-${Date.now()}`;
  const testCustomerDetails = {
    first_name: 'Test User',
    phone: '6287887842985',
    product_id: 'test',
    product_name: 'Test Product'
  };
  
  try {
    console.log('Creating QRIS payment...');
    const paymentData = await createQRISCore(testAmount, testOrderId, testCustomerDetails);
    
    console.log('QRIS Payment Result:', {
      transaction_id: paymentData.transaction_id,
      order_id: paymentData.order_id,
      status: paymentData.status,
      qr_image_url: paymentData.qr_image_url ? 'Available' : 'Not available'
    });
    
    if (paymentData.transaction_id) {
      console.log('SUCCESS: buymidtrans approach working!');
    } else {
      console.log('FAILED: buymidtrans approach not working');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testBuymidtrans().catch(console.error);
