#!/usr/bin/env node
/**
 * Neon.tech Setup Helper
 * 
 * This script helps you configure your .env file with Neon connection details
 * Safely updates .env without exposing sensitive data
 */

const fs = require('fs');
const path = require('path');

// Parse the Neon connection string
const connectionString = 'postgresql://neondb_owner:npg_VIGT84YnfAtD@ep-falling-wind-a1u1lec7-pooler.ap-southeast-1.aws.neon.tech/bot_wa?sslmode=require&channel_binding=require';

// Extract components from connection string
const url = new URL(connectionString);

const neonConfig = {
  USE_PG: 'true',
  PG_HOST: url.hostname,
  PG_PORT: url.port || '5432',
  PG_DATABASE: url.pathname.substring(1), // remove leading /
  PG_USER: url.username,
  PG_PASSWORD: url.password,
  PG_SSL: 'true',
  
  // Optimized pool settings for Neon
  PG_POOL_MAX: '10',
  PG_IDLE_TIMEOUT_MS: '30000',
  PG_CONN_TIMEOUT_MS: '15000',
  PG_STATEMENT_TIMEOUT_MS: '60000',
  PG_KEEPALIVE: 'true',
  PG_WARMUP_CONNECTIONS: '3',
  PG_QUERY_RETRIES: '2',
  PG_SLOW_MS: '500',
  PG_UPSERT_CHUNK: '100',
};

console.log('\n🔧 Neon.tech Configuration Detected:\n');
console.log('  Region:   ap-southeast-1 (Singapore) ✅');
console.log('  Endpoint: Pooled ✅');
console.log('  Database:', neonConfig.PG_DATABASE);
console.log('  SSL:      Enabled ✅');
console.log('');

// Read existing .env if it exists
const envPath = path.join(__dirname, '.env');
let envContent = '';
const existingVars = {};

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  
  // Parse existing variables
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      existingVars[key] = value;
    }
  });
  
  console.log('📄 Existing .env file found');
  console.log('   Will update Postgres settings only (keeping other settings)\n');
} else {
  console.log('📄 No .env file found, will create new one\n');
}

// Create backup
if (fs.existsSync(envPath)) {
  const backupPath = path.join(__dirname, `.env.backup.${Date.now()}`);
  fs.copyFileSync(envPath, backupPath);
  console.log('💾 Backup created:', path.basename(backupPath), '\n');
}

// Update Postgres-related variables
Object.assign(existingVars, neonConfig);

// Generate new .env content
const newEnvLines = [];

// Add header
newEnvLines.push('# ================================');
newEnvLines.push('# NEON.TECH POSTGRESQL CONFIG');
newEnvLines.push('# ================================');
newEnvLines.push('# Auto-configured by setup-neon.js');
newEnvLines.push(`# Date: ${new Date().toISOString()}`);
newEnvLines.push('');

// Add Neon config
newEnvLines.push('# Database Connection (Neon Pooled Endpoint)');
Object.entries(neonConfig).forEach(([key, value]) => {
  newEnvLines.push(`${key}=${value}`);
});

newEnvLines.push('');
newEnvLines.push('# ================================');
newEnvLines.push('# OTHER SETTINGS');
newEnvLines.push('# ================================');
newEnvLines.push('');

// Add other existing variables (non-Postgres)
Object.entries(existingVars).forEach(([key, value]) => {
  if (!key.startsWith('PG_') && key !== 'USE_PG') {
    newEnvLines.push(`${key}=${value}`);
  }
});

// Write new .env
const newEnvContent = newEnvLines.join('\n') + '\n';
fs.writeFileSync(envPath, newEnvContent);

console.log('✅ .env file updated successfully!\n');
console.log('📋 Neon Settings Applied:');
console.log('   Host:     ', neonConfig.PG_HOST);
console.log('   Database: ', neonConfig.PG_DATABASE);
console.log('   User:     ', neonConfig.PG_USER);
console.log('   SSL:      ', neonConfig.PG_SSL);
console.log('   Pool Max: ', neonConfig.PG_POOL_MAX);
console.log('');
console.log('🚀 Next Steps:');
console.log('   1. Deploy schema:  npm run pg:schema');
console.log('   2. Test connection: npm run neon:test');
console.log('   3. Start bot:      npm start');
console.log('');
console.log('💡 Tip: You can view the full Neon connection string in your Neon dashboard');
console.log('');

