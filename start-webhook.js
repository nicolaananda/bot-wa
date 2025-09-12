const { app } = require("./webhook-midtrans");

const PORT = process.env.WEBHOOK_PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Midtrans Webhook server running on port ${PORT}`);
  console.log(`📡 Webhook URL: http://your-domain.com:${PORT}/webhook/midtrans`);
  console.log(`🔍 Health check: http://localhost:${PORT}/webhook/health`);
  console.log(`💡 Make sure to configure this URL in Midtrans dashboard!`);
});

// Listen for payment completion events
process.on("payment-completed", (data) => {
  console.log("🎉 PAYMENT COMPLETED EVENT RECEIVED:", data);
  // This is where we could trigger immediate order processing
});
