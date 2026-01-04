# 🚀 PM2 Setup Guide - Process Management & Memory Optimization

## 📋 Apa itu PM2?

PM2 adalah production process manager untuk Node.js yang:
- ✅ Auto-restart jika crash
- ✅ Memory limit & auto-restart
- ✅ Logging otomatis
- ✅ Monitoring real-time
- ✅ Prevent duplicate instances

---

## 🔧 Installation

### 1. Install PM2 Globally
```bash
npm install -g pm2
```

### 2. Verify Installation
```bash
pm2 --version
```

---

## 🚀 Quick Start

### Start Bot dengan PM2
```bash
# Option 1: Simple start
pm2 start main.js --name bot-wa --max-memory-restart 1G

# Option 2: Using config file (RECOMMENDED)
pm2 start pm2-config.json

# Option 3: Start all services
pm2 start pm2-config.json --only bot-wa
pm2 start pm2-config.json --only dashboard-api
pm2 start pm2-config.json --only web-pos
```

### Stop Bot
```bash
# Stop specific app
pm2 stop bot-wa

# Stop all apps
pm2 stop all
```

### Restart Bot
```bash
# Restart specific app
pm2 restart bot-wa

# Restart all apps
pm2 restart all
```

### Delete dari PM2
```bash
# Delete specific app
pm2 delete bot-wa

# Delete all apps
pm2 delete all
```

---

## 📊 Monitoring

### View All Running Processes
```bash
pm2 list
# atau
pm2 ls
```

### Real-time Monitoring
```bash
pm2 monit
```

### View Logs
```bash
# View all logs
pm2 logs

# View specific app logs
pm2 logs bot-wa

# View last 100 lines
pm2 logs --lines 100

# Clear logs
pm2 flush
```

### Memory & CPU Usage
```bash
pm2 show bot-wa
```

---

## 🔄 Auto-Restart on Server Reboot

### Save PM2 Process List
```bash
pm2 save
```

### Setup Startup Script
```bash
# Generate startup script
pm2 startup

# Copy & paste the command it gives you (sudo required)
# Example output:
# [PM2] You have to run this command as root. Execute the following command:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username

# After running the sudo command, save again
pm2 save
```

### Test Auto-Restart
```bash
# Reboot server
sudo reboot

# After reboot, check if bot is running
pm2 list
```

---

## ⚙️ PM2 Config Explained

File: `pm2-config.json`

```json
{
  "apps": [{
    "name": "bot-wa",                    // App name
    "script": "main.js",                 // Entry file
    "instances": 1,                       // Number of instances
    "max_memory_restart": "1G",          // Auto-restart if RAM > 1GB
    "node_args": "--max-old-space-size=1024",  // Node.js memory limit
    "autorestart": true,                 // Auto-restart on crash
    "watch": false,                      // Don't watch file changes
    "max_restarts": 10,                  // Max restarts per min
    "min_uptime": "10s",                 // Min uptime before restart
    "restart_delay": 4000                // Delay between restarts
  }]
}
```

---

## 🎯 Use Cases

### 1. Auto-Restart when RAM > 1GB
```bash
pm2 start main.js --name bot-wa --max-memory-restart 1G
```

### 2. Restart Every 6 Hours (Prevent Memory Leaks)
```bash
pm2 start main.js --name bot-wa --cron-restart="0 */6 * * *"
```

### 3. Restart on File Change (Development)
```bash
pm2 start main.js --name bot-wa --watch
```

### 4. Run Multiple Instances (Load Balancing)
```bash
pm2 start main.js --name bot-wa -i 2  # 2 instances
pm2 start main.js --name bot-wa -i max  # Max CPU cores
```

---

## 📝 Common Commands Cheatsheet

| Command | Description |
|---------|-------------|
| `pm2 start app.js` | Start app |
| `pm2 stop app_name` | Stop app |
| `pm2 restart app_name` | Restart app |
| `pm2 delete app_name` | Remove from PM2 |
| `pm2 list` | List all apps |
| `pm2 logs` | View logs |
| `pm2 monit` | Real-time monitoring |
| `pm2 show app_name` | App details |
| `pm2 flush` | Clear logs |
| `pm2 save` | Save process list |
| `pm2 startup` | Setup auto-start |
| `pm2 unstartup` | Remove auto-start |
| `pm2 update` | Update PM2 |

---

## 🆘 Troubleshooting

### Bot Not Starting?
```bash
# Check logs
pm2 logs bot-wa --err

# Check if port is used
lsof -i :3002

# Try manual start first
node main.js
```

### Memory Still High?
```bash
# Check current memory
pm2 show bot-wa

# Restart bot
pm2 restart bot-wa

# Lower memory limit
pm2 delete bot-wa
pm2 start main.js --name bot-wa --max-memory-restart 800M
```

### Duplicate Processes?
```bash
# Kill all Node processes
pkill -f node

# Check PM2 list
pm2 list

# Delete all from PM2
pm2 delete all

# Restart clean
pm2 start pm2-config.json
pm2 save
```

### PM2 Not Starting on Reboot?
```bash
# Re-setup startup
pm2 unstartup
pm2 startup
# Copy & run the sudo command
pm2 save

# Test
sudo systemctl status pm2-<username>
```

---

## 📊 Expected Results

### Before PM2
- ❌ Manual restart jika crash
- ❌ Multiple duplicate instances
- ❌ No memory limit
- ❌ Hard to monitor
- ❌ No auto-restart on reboot

### After PM2
- ✅ Auto-restart on crash
- ✅ Single instance enforced
- ✅ Memory limit: 1GB
- ✅ Easy monitoring: `pm2 monit`
- ✅ Auto-start on reboot
- ✅ Logs saved: `./logs/`

---

## 🔗 Integration with Other Scripts

### Use with kill-duplicates.sh
```bash
# Before starting PM2, kill duplicates
./kill-duplicates.sh

# Then start with PM2
pm2 start pm2-config.json
pm2 save
```

### Use with npm scripts
```bash
# package.json already configured with memory limits
npm start  # Uses --max-old-space-size=1024

# Or use PM2 directly
pm2 start pm2-config.json
```

---

## 📈 Memory Usage Comparison

| Setup | RAM Usage | Instances |
|-------|-----------|-----------|
| Manual (before) | 1.5-2GB × 10 = 15-20GB | 10+ duplicates |
| Manual (optimized) | 800MB-1GB × 10 = 8-10GB | 10+ duplicates |
| **PM2 (recommended)** | **800MB-1GB × 1 = 800MB-1GB** | **1 instance** |

**Savings: ~90% RAM reduction!** 🎉

---

## 📞 Next Steps

1. ✅ Install PM2: `npm install -g pm2`
2. ✅ Kill duplicates: `./kill-duplicates.sh`
3. ✅ Start with PM2: `pm2 start pm2-config.json`
4. ✅ Save config: `pm2 save`
5. ✅ Setup auto-start: `pm2 startup`
6. ✅ Monitor: `pm2 monit`

---

## 🔗 Related Docs

- `MEMORY-OPTIMIZATION.md` - Memory optimization guide
- `kill-duplicates.sh` - Script to kill duplicate processes
- `REDIS-QUICK-START.md` - Redis cache setup
- `NEON-MIGRATION.md` - Postgres database migration

**Created:** 2025-12-13
**Last Updated:** 2025-12-13




