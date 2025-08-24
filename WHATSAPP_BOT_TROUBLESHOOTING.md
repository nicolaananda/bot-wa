# WhatsApp Bot Troubleshooting Guide

## 🚨 Session Encryption Errors

### Common Error Messages
- `Failed to decrypt message with any known session`
- `Bad MAC Error: Bad MAC`
- `Session error: Error: Bad MAC`
- `Closing open session in favor of incoming prekey bundle`

## 🔧 Quick Fix Solutions

### 1. **Immediate Fix (Recommended)**
```bash
# Run the automated fix script
chmod +x fix-session-errors.sh
sudo ./fix-session-errors.sh
```

### 2. **Manual Fix Steps**
```bash
# Stop the bot
pm2 stop bot-wa

# Clear corrupted sessions
rm -rf sessions/ store/ .wwebjs_auth/ .wwebjs_cache/

# Restart
pm2 start bot-wa
```

### 3. **Complete Reset (Nuclear Option)**
```bash
# Stop and remove from PM2
pm2 stop bot-wa && pm2 delete bot-wa

# Kill all processes
pkill -f "bot-wa"

# Clear everything
rm -rf sessions/ store/ .wwebjs_auth/ .wwebjs_cache/ node_modules/ package-lock.json

# Reinstall and restart
npm install
pm2 start index.js --name bot-wa
```

## 📱 Re-authentication Required

After clearing sessions, you'll need to:
1. **Scan QR code again** when the bot starts
2. **Keep phone connected** to internet
3. **Ensure WhatsApp Web** is active on phone

## 🔍 Root Causes & Prevention

### **Primary Causes**
1. **Session Corruption** - Corrupted encryption keys
2. **Library Updates** - Incompatible versions
3. **Multiple Instances** - Process conflicts
4. **Network Issues** - Interrupted connections
5. **WhatsApp Updates** - Protocol changes

### **Prevention Strategies**
1. **Regular Restarts** - Restart bot daily/weekly
2. **Session Backups** - Backup working sessions
3. **Version Control** - Pin dependency versions
4. **Monitoring** - Watch for error patterns
5. **Single Instance** - Avoid multiple bot processes

## 🛠️ Advanced Troubleshooting

### **Check Process Status**
```bash
# View all processes
ps aux | grep node

# Check PM2 status
pm2 status
pm2 logs bot-wa

# Check system resources
htop
df -h
```

### **Verify Dependencies**
```bash
# Check package versions
npm list whatsapp-web.js
npm list libsignal

# Update specific packages
npm update whatsapp-web.js
npm update libsignal
```

### **Network Diagnostics**
```bash
# Check connectivity
ping 8.8.8.8
nslookup web.whatsapp.com

# Check firewall
ufw status
iptables -L
```

## 📊 Monitoring & Logs

### **Enable Verbose Logging**
```javascript
// In your bot configuration
const client = new Client({
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    // Enable detailed logging
    logger: {
        level: 'debug'
    }
});
```

### **Log Analysis Commands**
```bash
# Real-time logs
pm2 logs bot-wa --lines 100

# Search for specific errors
pm2 logs bot-wa | grep "Bad MAC"
pm2 logs bot-wa | grep "Failed to decrypt"

# Export logs to file
pm2 logs bot-wa --out > bot-logs.txt
```

## 🔄 Integration with Error Handler

### **Add to Your Bot**
```javascript
const SessionErrorHandler = require('./session-error-handler');

// After creating WhatsApp client
const errorHandler = new SessionErrorHandler(client, {
    maxRetries: 3,
    retryDelay: 5000,
    autoReconnect: true,
    clearSessionsOnError: true
});

// Handle reconnection events
client.on('reconnect_required', async () => {
    console.log('🔄 Reconnection required, restarting client...');
    // Implement your reconnection logic
});
```

## 📋 Maintenance Checklist

### **Daily**
- [ ] Check bot status: `pm2 status`
- [ ] Monitor logs: `pm2 logs bot-wa --lines 50`
- [ ] Verify WhatsApp Web connection

### **Weekly**
- [ ] Restart bot: `pm2 restart bot-wa`
- [ ] Check system resources
- [ ] Review error logs

### **Monthly**
- [ ] Update dependencies: `npm update`
- [ ] Backup working sessions
- [ ] Review and optimize configuration

## 🚀 Performance Optimization

### **Puppeteer Settings**
```javascript
const client = new Client({
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});
```

### **Memory Management**
```javascript
// Add to your bot
setInterval(() => {
    if (global.gc) {
        global.gc();
        console.log('🧹 Garbage collection performed');
    }
}, 300000); // Every 5 minutes
```

## 📞 Support & Resources

### **Useful Commands**
```bash
# Quick status check
pm2 status && echo "---" && pm2 logs bot-wa --lines 10

# Emergency restart
pm2 restart bot-wa

# View system info
uname -a && node --version && npm --version
```

### **Common Issues & Solutions**

| Issue | Solution |
|-------|----------|
| Bad MAC Error | Clear sessions, restart bot |
| Connection timeout | Check network, restart bot |
| QR not showing | Clear sessions, check logs |
| Memory leaks | Restart daily, optimize code |
| Multiple instances | Kill all processes, start fresh |

## ⚠️ Important Notes

1. **Never run multiple bot instances** simultaneously
2. **Always backup sessions** before major changes
3. **Monitor system resources** regularly
4. **Keep dependencies updated** but test thoroughly
5. **Use PM2 for process management** in production

## 🔗 Related Files

- `fix-session-errors.sh` - Automated fix script
- `session-error-handler.js` - Error handling module
- `ecosystem.config.js` - PM2 configuration
- `package.json` - Dependencies

---

**Last Updated:** $(date)
**Version:** 1.0.0
**Maintainer:** System Administrator 