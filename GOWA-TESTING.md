# Migrasi Baileys → Gowa: Testing Guide

## Prerequisites

1. **Gowa Service Running**
   - URL: https://gowa2.nicola.id
   - API Key: apiku
   - Ensure WhatsApp is authenticated in Gowa

2. **Environment Variables**
   ```bash
   # Add to .env file:
   GOWA_API_URL=https://gowa2.nicola.id
   GOWA_API_KEY=apiku
   GOWA_DEVICE_ID=default
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

## Testing Steps

### 1. Test Gowa Connection

```bash
# Start the bot
npm start
```

**Expected Output:**
```
[GOWA] Connecting to WhatsApp service...
[GOWA] Connected successfully!
[GOWA] Bot Number: 628xxx
[GOWA] Bot Name: Your Bot Name
CONNECTION OPEN ( +628xxx || Your Bot Name )
```

### 2. Test Webhook Endpoint

```bash
# In another terminal, test webhook accessibility
curl http://localhost:3002/webhook/gowa/test
```

**Expected Response:**
```json
{
  "success": true,
  "status": "ok",
  "message": "Gowa webhook endpoint is accessible",
  "timestamp": "2026-01-04T...",
  "url": "/webhook/gowa",
  "adapterReady": true
}
```

### 3. Configure Gowa Webhook

Set Gowa webhook URL to: `https://logs.nicola.id/webhook/gowa`

### 4. Test Basic Commands

Send these messages to your bot:

1. **Ping Test**
   - Send: `.ping`
   - Expected: Bot responds with latency

2. **Menu Test**
   - Send: `.menu`
   - Expected: Bot displays menu

3. **Product List**
   - Send: `.stok`
   - Expected: Bot shows available products

### 5. Test Purchase Flow

1. **Check Balance**
   - Send: `.saldo`
   - Expected: Shows your balance

2. **Test Purchase**
   - Send: `.buy <product_code> 1`
   - Expected: Purchase confirmation or QRIS payment

### 6. Test Media Handling

1. **Send Image**
   - Send an image to bot
   - Expected: Bot processes image (if applicable)

2. **Sticker Creation**
   - Send image with caption `.sticker`
   - Expected: Bot creates sticker

### 7. Test Group Features

1. **Add bot to test group**
2. **Test commands:**
   - `.tagall` - Tag all members
   - `.hidetag <message>` - Hidden tag
   - `.linkgc` - Get group link

## Troubleshooting

### Connection Issues

**Problem:** `[GOWA] Failed to connect`

**Solutions:**
1. Check if Gowa service is running: `curl https://gowa2.nicola.id/app/devices`
2. Verify API key is correct
3. Check network connectivity

### Webhook Not Receiving Messages

**Problem:** Bot doesn't respond to messages

**Solutions:**
1. Check webhook configuration in Gowa
2. Test webhook endpoint: `curl http://localhost:3002/webhook/gowa/test`
3. Check logs: `tail -f logs/bot.log`
4. Verify dashboard-api is running on port 3002

### Media Download Errors

**Problem:** `[DOWNLOAD] Error downloading image`

**Solutions:**
1. Check Gowa API media endpoint
2. Verify message ID format
3. Check network connectivity to Gowa service

## Rollback Plan

If migration fails:

```bash
# 1. Stop the bot
# Ctrl+C or kill process

# 2. Restore Baileys
git checkout main.js index.js package.json function/myfunc.js src/utils/command-context.js

# 3. Reinstall dependencies
npm install

# 4. Restart bot
npm start
```

## Success Criteria

✅ Bot connects to Gowa successfully
✅ Webhook receives incoming messages
✅ Basic commands work (.ping, .menu, .stok)
✅ Purchase flow works (saldo/QRIS)
✅ Media handling works (images, stickers)
✅ Group commands work
✅ Payment integration works (Midtrans)

## Notes

- All existing features should work identically
- Session files from Baileys cannot be reused
- Bot needs to re-authenticate with WhatsApp via Gowa
- Webhook URL must be accessible from Gowa service
- Dashboard API must be running on port 3002
