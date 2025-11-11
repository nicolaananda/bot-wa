#!/usr/bin/env node
/**
 * Migrate from Remote PostgreSQL (nicola.id) to Neon
 * 
 * This script migrates data from your remote PostgreSQL server to Neon.tech
 */

require('dotenv').config();
const { Pool } = require('pg');

// REMOTE PostgreSQL (nicola.id) - CHANGE THESE IF NEEDED
const REMOTE_CONFIG = {
  host: 'nicola.id',
  port: 5432,
  database: 'bot_wa',
  user: 'bot_wa', // Change if different
  password: 'bot_wa', // Change to your actual password
};

// NEON PostgreSQL (from .env)
const NEON_CONFIG = {
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

console.log('🚀 PostgreSQL to Neon Migration Tool\n');
console.log('Source: nicola.id:5432/bot_wa');
console.log('Target: Neon.tech (ap-southeast-1)\n');

async function checkConnection(config, name) {
  const pool = new Pool(config);
  try {
    await pool.query('SELECT 1');
    console.log(`✅ ${name}: Connected`);
    await pool.end();
    return true;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    await pool.end();
    return false;
  }
}

async function getTableStats(pool, name) {
  console.log(`\n📊 ${name} Statistics:`);
  
  const tables = ['users', 'transaksi', 'produk', 'settings', 'web_pos_pin', 'kv_store'];
  const stats = {};
  
  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      stats[table] = parseInt(result.rows[0].count);
      console.log(`  ${table}: ${stats[table]}`);
    } catch (err) {
      stats[table] = 0;
      console.log(`  ${table}: not found or error`);
    }
  }
  
  // Total saldo
  try {
    const result = await pool.query('SELECT COALESCE(SUM(saldo), 0) as total FROM users');
    stats.totalSaldo = Number(result.rows[0].total || 0);
    console.log(`\n  💰 Total Saldo: Rp ${stats.totalSaldo.toLocaleString('id-ID')}`);
  } catch (err) {
    stats.totalSaldo = 0;
  }
  
  return stats;
}

async function migrateTable(remotePool, neonPool, tableName, batchSize = 100) {
  console.log(`\n📦 Migrating ${tableName}...`);
  
  try {
    // Get all data from remote
    const result = await remotePool.query(`SELECT * FROM ${tableName}`);
    const rows = result.rows;
    
    if (rows.length === 0) {
      console.log(`  ℹ️  No data in ${tableName}`);
      return { success: true, count: 0 };
    }
    
    console.log(`  Found ${rows.length} rows`);
    
    // Migrate based on table structure
    if (tableName === 'users') {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        for (const row of batch) {
          await neonPool.query(
            'INSERT INTO users(user_id, saldo, role, data) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET saldo=EXCLUDED.saldo, role=EXCLUDED.role, data=EXCLUDED.data',
            [row.user_id, row.saldo, row.role, row.data]
          );
        }
        console.log(`  Migrated ${Math.min(i + batchSize, rows.length)}/${rows.length} users`);
      }
    } else if (tableName === 'transaksi') {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        for (const row of batch) {
          await neonPool.query(
            'INSERT INTO transaksi(ref_id, user_id, amount, status, meta, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
            [row.ref_id, row.user_id, row.amount, row.status, row.meta, row.created_at]
          );
        }
        console.log(`  Migrated ${Math.min(i + batchSize, rows.length)}/${rows.length} transaksi`);
      }
    } else if (tableName === 'produk') {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        for (const row of batch) {
          await neonPool.query(
            'INSERT INTO produk(id, name, price, stock, data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, stock=EXCLUDED.stock, data=EXCLUDED.data',
            [row.id, row.name, row.price, row.stock, row.data]
          );
        }
        console.log(`  Migrated ${Math.min(i + batchSize, rows.length)}/${rows.length} produk`);
      }
    } else if (tableName === 'settings') {
      for (const row of rows) {
        await neonPool.query(
          'INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
          [row.key, row.value]
        );
      }
      console.log(`  Migrated ${rows.length} settings`);
    } else if (tableName === 'web_pos_pin') {
      for (const row of rows) {
        await neonPool.query(
          'INSERT INTO web_pos_pin(user_id, pin) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET pin=EXCLUDED.pin',
          [row.user_id, row.pin]
        );
      }
      console.log(`  Migrated ${rows.length} PINs`);
    } else if (tableName === 'kv_store') {
      for (const row of rows) {
        await neonPool.query(
          'INSERT INTO kv_store(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
          [row.key, row.value]
        );
      }
      console.log(`  Migrated ${rows.length} kv entries`);
    }
    
    console.log(`  ✅ ${tableName} migrated successfully!`);
    return { success: true, count: rows.length };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('Step 1: Checking connections...\n');
  
  const remoteOk = await checkConnection(REMOTE_CONFIG, 'Remote (nicola.id)');
  const neonOk = await checkConnection(NEON_CONFIG, 'Neon');
  
  if (!remoteOk) {
    console.log('\n❌ Cannot connect to remote PostgreSQL at nicola.id');
    console.log('Please check:');
    console.log('  1. Server is accessible');
    console.log('  2. Firewall allows port 5432');
    console.log('  3. Credentials in this script are correct (line 15-20)');
    process.exit(1);
  }
  
  if (!neonOk) {
    console.log('\n❌ Cannot connect to Neon');
    console.log('Check your .env file');
    process.exit(1);
  }
  
  const remotePool = new Pool(REMOTE_CONFIG);
  const neonPool = new Pool(NEON_CONFIG);
  
  console.log('\n' + '='.repeat(60));
  
  // Get stats
  const remoteStats = await getTableStats(remotePool, 'REMOTE (nicola.id)');
  const neonStatsBefore = await getTableStats(neonPool, 'NEON (before)');
  
  console.log('\n' + '='.repeat(60));
  console.log('\n⚠️  Starting migration in 3 seconds...');
  console.log('Press Ctrl+C to cancel\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Migrate tables
  const tables = ['users', 'produk', 'settings', 'web_pos_pin', 'kv_store', 'transaksi'];
  const results = {};
  
  for (const table of tables) {
    results[table] = await migrateTable(remotePool, neonPool, table);
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Final stats
  const neonStatsAfter = await getTableStats(neonPool, 'NEON (after)');
  
  console.log('\n' + '='.repeat(60));
  console.log('📈 Migration Summary:');
  console.log('='.repeat(60));
  
  for (const [table, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${table}: ${result.count || 0} rows`);
  }
  
  console.log('\n🎉 Migration completed!');
  console.log('\nNext steps:');
  console.log('  1. Verify data in Neon dashboard');
  console.log('  2. Update your app to use Neon (already done!)');
  console.log('  3. Test the bot: npm start');
  console.log('  4. Keep nicola.id as backup (or shut down to save cost)');
  
  await remotePool.end();
  await neonPool.end();
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});

