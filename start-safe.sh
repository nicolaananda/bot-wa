#!/bin/bash

# Safe Startup Script - WhatsApp Bot
# Script ini akan backup database otomatis sebelum start aplikasi

echo "🚀 Starting WhatsApp Bot with Safe Database Backup..."

# Check if database exists
if [ ! -f "options/database.json" ]; then
    echo "❌ Database file not found: options/database.json"
    echo "📥 Creating backup directory..."
    mkdir -p backups
    
    # Check if we have any backups
    if [ -d "backups" ] && [ "$(ls -A backups)" ]; then
        echo "📥 Found backups, restoring from latest..."
        node auto-backup.js restore
    else
        echo "⚠️  No backups found, starting with empty database"
    fi
else
    echo "✅ Database file found"
    
    # Check database size
    DB_SIZE=$(stat -c%s "options/database.json" 2>/dev/null || stat -f%z "options/database.json" 2>/dev/null || echo "0")
    
    if [ "$DB_SIZE" -eq 0 ]; then
        echo "⚠️  Database file is empty, checking for backups..."
        if [ -d "backups" ] && [ "$(ls -A backups)" ]; then
            echo "📥 Restoring from backup..."
            node auto-backup.js restore
        fi
    else
        echo "📊 Database size: $((DB_SIZE / 1024)) KB"
        
        # Create backup before starting
        echo "💾 Creating backup before startup..."
        node auto-backup.js backup
        
        if [ $? -eq 0 ]; then
            echo "✅ Backup created successfully"
        else
            echo "⚠️  Backup failed, but continuing..."
        fi
    fi
fi

# Check if we need to install dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the application
echo "🚀 Starting WhatsApp Bot..."
npm run start

# If the application crashes, show backup options
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Application crashed or stopped"
    echo ""
    echo "🔧 Recovery options:"
    echo "  1. Check database health: npm run backup-health"
    echo "  2. List available backups: npm run backup-list"
    echo "  3. Restore from backup: npm run restore"
    echo "  4. Start with safe mode: npm run start-safe"
    echo ""
fi 