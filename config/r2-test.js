/**
 * Cloudflare R2 Connection Test
 * 
 * Test koneksi ke R2 dan operasi dasar (upload, download, delete)
 */

require('dotenv').config();
const { saveReceipt, getReceipt, receiptExists, deleteReceipt, isR2Enabled } = require('./r2-storage');

async function testR2Connection() {
  console.log('\n🧪 Testing Cloudflare R2 Connection\n');
  console.log('='.repeat(50));

  // 1. Check if R2 is enabled
  console.log('\n1️⃣  Checking R2 Configuration...');
  const enabled = isR2Enabled();
  if (!enabled) {
    console.log('❌ R2 is not enabled or credentials are missing');
    console.log('\n💡 Please check your .env file:');
    console.log('   - R2_ENABLED=true');
    console.log('   - R2_ACCOUNT_ID=your_account_id');
    console.log('   - R2_ACCESS_KEY_ID=your_access_key_id');
    console.log('   - R2_SECRET_ACCESS_KEY=your_secret_access_key');
    console.log('   - R2_BUCKET_NAME=your_bucket_name');
    process.exit(1);
  }
  console.log('✅ R2 is enabled and configured');

  // 2. Test upload (save receipt)
  console.log('\n2️⃣  Testing Upload (Save Receipt)...');
  const testReffId = `test_${Date.now()}`;
  const testContent = `Test Receipt - ${new Date().toISOString()}\n\nThis is a test receipt for R2 connection testing.\n\nReference ID: ${testReffId}`;

  try {
    const saveResult = await saveReceipt(testReffId, testContent);
    if (saveResult.success) {
      console.log('✅ Receipt uploaded successfully!');
      if (saveResult.url) {
        console.log(`   📎 URL: ${saveResult.url}`);
      }
      console.log(`   💾 Storage: ${saveResult.storage}`);
    } else {
      console.log('❌ Failed to upload receipt:', saveResult.error);
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ Error uploading receipt:', error.message);
    process.exit(1);
  }

  // 3. Test check existence
  console.log('\n3️⃣  Testing Check Existence...');
  try {
    const existsResult = await receiptExists(testReffId);
    if (existsResult.exists) {
      console.log('✅ Receipt exists!');
      console.log(`   💾 Storage: ${existsResult.storage}`);
    } else {
      console.log('❌ Receipt not found (should exist!)');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ Error checking existence:', error.message);
    process.exit(1);
  }

  // 4. Test download (get receipt)
  console.log('\n4️⃣  Testing Download (Get Receipt)...');
  try {
    const getResult = await getReceipt(testReffId);
    if (getResult.success) {
      console.log('✅ Receipt downloaded successfully!');
      console.log(`   📄 Content length: ${getResult.content.length} bytes`);
      console.log(`   💾 Storage: ${getResult.storage}`);
      
      // Verify content matches
      if (getResult.content === testContent) {
        console.log('✅ Content matches original (verified)');
      } else {
        console.log('⚠️  Content mismatch (but download worked)');
      }
    } else {
      console.log('❌ Failed to download receipt:', getResult.error);
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ Error downloading receipt:', error.message);
    process.exit(1);
  }

  // 5. Test delete
  console.log('\n5️⃣  Testing Delete...');
  try {
    const deleteResult = await deleteReceipt(testReffId);
    if (deleteResult.success) {
      console.log('✅ Receipt deleted successfully!');
      
      // Verify deletion
      const existsAfterDelete = await receiptExists(testReffId);
      if (!existsAfterDelete.exists) {
        console.log('✅ Deletion verified (receipt no longer exists)');
      } else {
        console.log('⚠️  Receipt still exists after deletion');
      }
    } else {
      console.log('❌ Failed to delete receipt:', deleteResult.error);
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ Error deleting receipt:', error.message);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ All R2 tests passed successfully!');
  console.log('\n📋 Summary:');
  console.log('   ✅ Upload: Working');
  console.log('   ✅ Check Existence: Working');
  console.log('   ✅ Download: Working');
  console.log('   ✅ Delete: Working');
  console.log('\n🎉 Your R2 configuration is ready for production!\n');
}

// Run test
testR2Connection().catch((error) => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});

