#!/bin/bash
# Quick script to get chat ID after making bot admin

echo "🔍 Fetching Telegram updates..."
echo ""

RESPONSE=$(curl -s "https://api.telegram.org/bot5150179603:AAEhyyNdaXxtmLQR8WDY1OAEYmfuctBZNuA/getUpdates?offset=-10")

echo "$RESPONSE" | python3 -c "
import sys, json

data = json.load(sys.stdin)

if not data.get('ok'):
    print('❌ Error:', data.get('description', 'Unknown error'))
    sys.exit(1)

results = data.get('result', [])

if not results:
    print('⚠️  No messages found.')
    print('')
    print('Make sure:')
    print('1. Bot is added to the group as ADMIN (or Privacy Mode is OFF)')
    print('2. You have sent a message to the group')
    print('3. Try sending another message and run this again')
    sys.exit(0)

print(f'✅ Found {len(results)} updates')
print('')

groups = {}

for update in results:
    msg = update.get('message') or update.get('my_chat_member', {}).get('chat')
    if msg and 'chat' in (update.get('message') or {}):
        chat = msg['chat']
        if chat['type'] in ['group', 'supergroup']:
            groups[chat['id']] = {
                'id': chat['id'],
                'title': chat.get('title', 'Unknown'),
                'type': chat['type']
            }

if not groups:
    print('⚠️  No group chats found')
    print('')
    print('Try:')
    print('1. Make bot admin in the group')
    print('2. Send a message to the group')
    print('3. Run this script again')
else:
    print('📱 Group Chats:')
    print('')
    for group in groups.values():
        print(f\"   Title: {group['title']}\")
        print(f\"   Chat ID: {group['id']}\")
        print(f\"   Type: {group['type']}\")
        print('')
    
    if len(groups) == 1:
        chat_id = list(groups.values())[0]['id']
        print('─' * 50)
        print('')
        print('💡 Add this to your .env:')
        print('')
        print(f'TELEGRAM_CHAT_ID={chat_id}')
        print('')
"
