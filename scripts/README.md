# Scripts Directory

Organized scripts for testing, migrations, and utilities.

## Structure

### 📁 tests/
Test scripts for various components:
- `test-db.js` - Database connection test
- `test-group-whitelist.js` - Group whitelist functionality test
- `test-midtrans-tracking.js` - Midtrans payment tracking test
- `test-telegram-notification.js` - Telegram notification test
- `test-telegram.js` - Telegram bot test

**Usage:**
```bash
node scripts/tests/test-db.js
node scripts/tests/test-telegram.js
```

### 📁 migrations/
One-time migration scripts (already executed):
- `migrate-remote-to-neon.js` - Database migration to Neon
- `setup-neon.js` - Neon database setup
- `cleanup-old-webhooks.js` - Webhook cleanup script

**Usage:**
```bash
npm run neon:migrate
npm run neon:setup
```

### 📁 utilities/
Configuration and utility files:
- `nginx-dashboard.conf` - Nginx configuration for dashboard

**Usage:**
```bash
sudo cp scripts/utilities/nginx-dashboard.conf /etc/nginx/sites-available/
```

## Notes

- Test scripts are standalone and can be run independently
- Migration scripts should only be run once
- Keep this folder organized by moving new scripts to appropriate subdirectories
