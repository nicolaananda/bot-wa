const { isPaymentCompleted, clearCachedPaymentData } = require("./config/midtrans");

async function testSpecificOrder() {
  console.log("Testing specific order case...");
  
  const botOrderId = "GOPAY-8CF005CDB2-1757679587327";
  const midtransOrderId = "GOPAY-8CF005CDB2-1757679587327-1757679599045";
  
  console.log("Bot Order ID:", botOrderId);
  console.log("Midtrans Order ID:", midtransOrderId);
  
  // Clear cache
  clearCachedPaymentData(botOrderId);
  clearCachedPaymentData(midtransOrderId);
  
  // Test with bot order ID
  console.log("Testing with bot order ID...");
  const result = await isPaymentCompleted(botOrderId);
  console.log("Result:", result);
  
  // Test directly with Midtrans order ID
  console.log("Testing directly with Midtrans order ID...");
  const directResult = await isPaymentCompleted(midtransOrderId);
  console.log("Direct result:", directResult);
}

testSpecificOrder().catch(console.error);
