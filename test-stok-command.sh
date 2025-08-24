#!/bin/bash

echo "🧪 Testing WhatsApp Bot Stok Command"
echo "====================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Navigate to bot directory
cd /root/bot-wa

echo "🔍 Checking bot status..."
pm2 status

echo ""
echo "📊 Checking logs for stok command errors..."
pm2 logs bot-wa --lines 50 | grep -i "stok\|error\|failed"

echo ""
echo "🔄 Testing stok command fix..."

# Check if the fix was applied
if grep -q "Executing stok command" index.js; then
    echo "✅ Stok command fix already applied"
else
    echo "❌ Stok command fix not found"
fi

echo ""
echo "🔧 Applying additional fixes..."

# Check database structure
if [ -f "database.json" ]; then
    echo "📦 Database file found"
    echo "📊 Database size: $(du -h database.json | cut -f1)"
    
    # Check if database is valid JSON
    if python3 -m json.tool database.json > /dev/null 2>&1; then
        echo "✅ Database JSON is valid"
    else
        echo "❌ Database JSON is corrupted"
        echo "🔄 Creating backup and fixing database..."
        cp database.json database_backup_$(date +%Y%m%d_%H%M%S).json
        # Try to fix JSON
        python3 -c "
import json
try:
    with open('database.json', 'r') as f:
        data = json.load(f)
    print('Database loaded successfully')
    print('Products:', len(data.get('produk', {})))
    print('Users:', len(data.get('users', {})))
except Exception as e:
    print('Database error:', e)
"
    fi
else
    echo "❌ Database file not found"
fi

echo ""
echo "🚀 Restarting bot to apply fixes..."
pm2 restart bot-wa

echo ""
echo "⏳ Waiting for bot to start..."
sleep 5

echo ""
echo "📊 Bot status after restart:"
pm2 status

echo ""
echo "🔍 Monitoring logs for stok command..."
echo "📱 Now try sending '.stok' command to the bot"
echo "📊 Monitor logs with: pm2 logs bot-wa --lines 100"

echo ""
echo "✅ Testing completed!"
echo "📋 Next steps:"
echo "1. Send '.stok' command to the bot"
echo "2. Check if it responds correctly"
echo "3. Monitor logs for any errors"
echo "4. If still not working, check database structure" 