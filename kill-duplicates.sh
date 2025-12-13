#!/bin/bash

# Script untuk membunuh proses Node.js duplikat
# Hanya menyisakan 1 proses main.js yang berjalan

echo "🔍 Checking for duplicate Node.js processes..."

# Hitung jumlah proses main.js yang berjalan
PROCESS_COUNT=$(ps aux | grep "[n]ode.*main.js" | wc -l | tr -d ' ')

if [ "$PROCESS_COUNT" -eq 0 ]; then
    echo "✅ No main.js process running"
    exit 0
fi

if [ "$PROCESS_COUNT" -eq 1 ]; then
    echo "✅ Only 1 process running (normal)"
    exit 0
fi

echo "⚠️  Found $PROCESS_COUNT duplicate processes!"
echo ""
echo "📋 Current processes:"
ps aux | grep "[n]ode.*main.js" | awk '{printf "  PID: %s | MEM: %s | CPU: %s\n", $2, $4, $3}'

echo ""
read -p "❓ Kill all duplicate processes? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Kill semua proses kecuali yang paling baru
    ps aux | grep "[n]ode.*main.js" | awk '{print $2}' | head -n -1 | xargs kill -9
    echo "✅ Killed duplicate processes"
    echo ""
    echo "Remaining process:"
    ps aux | grep "[n]ode.*main.js" || echo "  No process running"
else
    echo "❌ Cancelled"
fi



