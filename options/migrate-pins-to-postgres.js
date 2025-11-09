#!/usr/bin/env node
require('dotenv').config();

const DatabaseClass = require('../function/database');
const pg = require('../config/postgres');

async function migratePinsToPostgres() {
  console.log('=== Web POS PIN Migration Tool ===\n');
  
  const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
  
  if (!usePg) {
    console.error('❌ USE_PG is not enabled in .env file');
    console.log('Please set USE_PG=true to enable PostgreSQL');
    process.exit(1);
  }
  
  try {
    // Load JSON database
    console.log('📂 Loading database from options/database.json...');
    const dbPath = './options/database.json';
    const db = new DatabaseClass(dbPath, null, 2);
    
    if (typeof db.load === 'function') {
      await db.load();
    } else if (typeof db._load === 'function') {
      db._load();
    }
    
    const userPins = db.data.userPins || {};
    const pinCount = Object.keys(userPins).length;
    
    if (pinCount === 0) {
      console.log('ℹ️  No PINs found in database.json');
      console.log('Migration complete (nothing to migrate)');
      await pg.closePool();
      process.exit(0);
    }
    
    console.log(`📊 Found ${pinCount} PINs in database.json\n`);
    console.log('Starting migration to PostgreSQL...\n');
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const [userId, pin] of Object.entries(userPins)) {
      try {
        // Check if PIN already exists in PostgreSQL
        const existing = await pg.query(
          'SELECT user_id FROM web_pos_pin WHERE user_id = $1',
          [userId]
        );
        
        if (existing.rows.length > 0) {
          console.log(`⏭️  Skipped: ${userId} (already exists)`);
          skippedCount++;
          continue;
        }
        
        // Insert PIN to PostgreSQL
        await pg.query(
          'INSERT INTO web_pos_pin (user_id, pin) VALUES ($1, $2)',
          [userId, pin]
        );
        
        console.log(`✅ Migrated: ${userId} → PIN: ${pin}`);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating ${userId}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`✅ Migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total: ${pinCount}`);
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const result = await pg.query('SELECT COUNT(*) as count FROM web_pos_pin');
    console.log(`✅ Total PINs in PostgreSQL: ${result.rows[0].count}`);
    
    await pg.closePool();
    console.log('\n✨ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await pg.closePool();
    process.exit(1);
  }
}

// Run migration
migratePinsToPostgres();

