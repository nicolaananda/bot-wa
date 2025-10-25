#!/bin/bash

# Setup Upstash Redis untuk VPS Production
# Jalankan script ini di VPS setelah git pull

echo "🚀 Setting up Upstash Redis for VPS..."

# 1. Test network connectivity
echo "📡 Testing network connectivity to Upstash..."
nslookup saved-starfish-11254.upstash.io

# 2. Test port connectivity
echo "🔌 Testing port 6380 (TLS)..."
timeout 10 nc -zv saved-starfish-11254.upstash.io 6380

# 3. Update .env with Upstash URL
echo "⚙️ Updating .env with Upstash Redis URL..."
if grep -q "REDIS_URL" .env; then
    sed -i 's|REDIS_URL=.*|REDIS_URL=redis://default:ASv2AAIncDIwMGU4OWExOGYyMjE0YzhiOTk1OTgzMzQyZDdmYzZjYnAyMTEyNTQ@saved-starfish-11254.upstash.io:6379|' .env
else
    echo "REDIS_URL=redis://default:ASv2AAIncDIwMGU4OWExOGYyMjE0YzhiOTk1OTgzMzQyZDdmYzZjYnAyMTEyNTQ@saved-starfish-11254.upstash.io:6379" >> .env
fi

# 4. Test Redis connection
echo "🧪 Testing Redis connection..."
redis-cli -u "rediss://default:ASv2AAIncDIwMGU4OWExOGYyMjE0YzhiOTk1OTgzMzQyZDdmYzZjYnAyMTEyNTQ@saved-starfish-11254.upstash.io:6380" ping

# 5. Restart bot
echo "🔄 Restarting bot..."
pm2 restart bot-wa

echo "✅ Setup complete! Check logs with: pm2 logs bot-wa"
