/**
 * Migrate Local Receipts to Cloudflare R2
 * 
 * Script untuk migrasi semua file receipt dari local storage ke R2
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { saveReceipt, receiptExists } = require('./r2-storage');

const RECEIPTS_DIR = path.join(__dirname, '..', 'options', 'receipts');

async function migrateReceiptsToR2() {
  console.log('\n🚀 Migrating Local Receipts to Cloudflare R2\n');
  console.log('='.repeat(60));

  try {
    // Check if receipts directory exists
    try {
      await fs.access(RECEIPTS_DIR);
    } catch (error) {
      console.log('❌ Receipts directory not found:', RECEIPTS_DIR);
      process.exit(1);
    }

    // Get all .txt files
    const files = await fs.readdir(RECEIPTS_DIR);
    const receiptFiles = files.filter(f => f.endsWith('.txt'));

    if (receiptFiles.length === 0) {
      console.log('ℹ️  No receipt files found to migrate');
      process.exit(0);
    }

    console.log(`\n📋 Found ${receiptFiles.length} receipt files to migrate\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each file
    for (let i = 0; i < receiptFiles.length; i++) {
      const filename = receiptFiles[i];
      const reffId = filename.replace('.txt', '');
      const filePath = path.join(RECEIPTS_DIR, filename);

      try {
        // Check if already exists in R2
        const existsResult = await receiptExists(reffId);
        if (existsResult.exists && existsResult.storage === 'r2') {
          console.log(`⏭️  [${i + 1}/${receiptFiles.length}] ${reffId} - Already in R2, skipping`);
          skipCount++;
          continue;
        }

        // Read file content
        const content = await fs.readFile(filePath, 'utf8');

        // Upload to R2
        const result = await saveReceipt(reffId, content);
        
        if (result.success) {
          console.log(`✅ [${i + 1}/${receiptFiles.length}] ${reffId} - Migrated to R2`);
          successCount++;
        } else {
          console.log(`❌ [${i + 1}/${receiptFiles.length}] ${reffId} - Failed: ${result.error}`);
          errorCount++;
          errors.push({ reffId, error: result.error });
        }

        // Small delay to avoid rate limiting
        if (i < receiptFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.log(`❌ [${i + 1}/${receiptFiles.length}] ${reffId} - Error: ${error.message}`);
        errorCount++;
        errors.push({ reffId, error: error.message });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Migration Summary:\n');
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ⏭️  Already in R2 (skipped): ${skipCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📁 Total files: ${receiptFiles.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.slice(0, 10).forEach(({ reffId, error }) => {
        console.log(`   - ${reffId}: ${error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }

    if (successCount > 0 || skipCount > 0) {
      console.log('\n✅ Migration completed!');
      console.log('\n💡 Note: Local files are kept as backup.');
      console.log('   You can delete them manually if you want to save disk space.\n');
    } else if (errorCount > 0) {
      console.log('\n⚠️  Migration completed with errors.');
      console.log('   Please check the errors above and try again.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateReceiptsToR2();

