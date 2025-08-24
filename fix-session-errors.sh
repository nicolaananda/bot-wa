#!/bin/bash

echo "🔧 WhatsApp Bot Session Error Fix Script"
echo "========================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Stop the bot service
echo "🛑 Stopping WhatsApp bot service..."
pm2 stop bot-wa 2>/dev/null || true
pm2 delete bot-wa 2>/dev/null || true

# Kill any remaining processes
echo "🔪 Killing remaining bot processes..."
pkill -f "bot-wa" 2>/dev/null || true
pkill -f "node.*whatsapp" 2>/dev/null || true

# Wait a moment
sleep 2

# Navigate to bot directory
cd /root/bot-wa

# Backup current sessions (optional)
echo "💾 Backing up current sessions..."
if [ -d "sessions" ]; then
    mv sessions sessions_backup_$(date +%Y%m%d_%H%M%S)
fi

if [ -d "store" ]; then
    mv store store_backup_$(date +%Y%m%d_%H%M%S)
fi

# Clear npm cache
echo "🧹 Clearing npm cache..."
npm cache clean --force

# Reinstall dependencies
echo "📦 Reinstalling dependencies..."
rm -rf node_modules package-lock.json
npm install

# Start the bot service
echo "🚀 Starting WhatsApp bot service..."
pm2 start ecosystem.config.js || pm2 start index.js --name bot-wa

# Check status
echo "📊 Checking service status..."
pm2 status

echo ""
echo "✅ Session fix completed!"
echo "📱 Please scan the QR code again when the bot starts"
echo "🔍 Monitor logs with: pm2 logs bot-wa" 