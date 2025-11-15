/**
 * Cloudflare R2 Storage Helper
 * 
 * R2 adalah object storage dari Cloudflare yang kompatibel dengan S3 API
 * Gunakan untuk menyimpan file receipt dan file lainnya
 */

require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const path = require('path');

// Konfigurasi R2 dari environment variables
const R2_ENABLED = String(process.env.R2_ENABLED || 'false').toLowerCase() === 'true';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'bot-wa-receipts';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''; // Optional: Custom domain untuk public access
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Fallback ke local storage jika R2 tidak dikonfigurasi
const FALLBACK_TO_LOCAL = String(process.env.R2_FALLBACK_TO_LOCAL || 'true').toLowerCase() === 'true';
const LOCAL_RECEIPTS_DIR = path.join(__dirname, '..', 'options', 'receipts');

// Initialize S3 client untuk R2
let s3Client = null;
if (R2_ENABLED && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
  try {
    s3Client = new S3Client({
      region: 'auto', // R2 menggunakan 'auto' untuk region
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    console.log('[R2] ✅ Cloudflare R2 client initialized');
  } catch (error) {
    console.error('[R2] ❌ Failed to initialize R2 client:', error.message);
    s3Client = null;
  }
} else {
  console.log('[R2] ⚠️  R2 not enabled or missing credentials. Using local storage.');
}

/**
 * Ensure local receipts directory exists
 */
async function ensureLocalDir() {
  try {
    await fs.mkdir(LOCAL_RECEIPTS_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists, ignore
  }
}

/**
 * Save receipt to R2 (or local if R2 not available)
 * @param {string} reffId - Reference ID untuk receipt
 * @param {string} content - Content receipt (text)
 * @returns {Promise<{success: boolean, url?: string, path?: string, error?: string}>}
 */
async function saveReceipt(reffId, content) {
  const fileName = `${reffId}.txt`;
  const key = `receipts/${fileName}`;

  // Try R2 first if enabled
  if (R2_ENABLED && s3Client) {
    try {
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: content,
        ContentType: 'text/plain; charset=utf-8',
        Metadata: {
          reffId: reffId,
          savedAt: new Date().toISOString(),
        },
      });

      await s3Client.send(command);
      
      // Generate public URL
      const publicUrl = R2_PUBLIC_URL 
        ? `${R2_PUBLIC_URL}/${key}`
        : `https://pub-${R2_ACCOUNT_ID}.r2.dev/${key}`;

      console.log(`[R2] ✅ Receipt saved to R2: ${key}`);
      
      // Also save to local as backup if enabled
      if (FALLBACK_TO_LOCAL) {
        await saveReceiptLocal(reffId, content);
      }

      return {
        success: true,
        url: publicUrl,
        storage: 'r2',
      };
    } catch (error) {
      console.error('[R2] ❌ Error saving to R2:', error.message);
      
      // Fallback to local if enabled
      if (FALLBACK_TO_LOCAL) {
        console.log('[R2] ⚠️  Falling back to local storage');
        return await saveReceiptLocal(reffId, content);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Fallback to local storage
  return await saveReceiptLocal(reffId, content);
}

/**
 * Save receipt to local filesystem
 */
async function saveReceiptLocal(reffId, content) {
  try {
    await ensureLocalDir();
    const filePath = path.join(LOCAL_RECEIPTS_DIR, `${reffId}.txt`);
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`[R2] ✅ Receipt saved locally: ${filePath}`);
    return {
      success: true,
      path: filePath,
      storage: 'local',
    };
  } catch (error) {
    console.error('[R2] ❌ Error saving locally:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get receipt content from R2 (or local)
 * @param {string} reffId - Reference ID untuk receipt
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function getReceipt(reffId) {
  const fileName = `${reffId}.txt`;
  const key = `receipts/${fileName}`;

  // Try R2 first if enabled
  if (R2_ENABLED && s3Client) {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });

      const response = await s3Client.send(command);
      const content = await response.Body.transformToString();
      
      console.log(`[R2] ✅ Receipt retrieved from R2: ${key}`);
      return {
        success: true,
        content: content,
        storage: 'r2',
      };
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        // File not found in R2, try local
        console.log(`[R2] ⚠️  Receipt not found in R2, trying local: ${reffId}`);
      } else {
        console.error('[R2] ❌ Error getting from R2:', error.message);
      }
      
      // Fallback to local
      return await getReceiptLocal(reffId);
    }
  }

  // Fallback to local
  return await getReceiptLocal(reffId);
}

/**
 * Get receipt from local filesystem
 */
async function getReceiptLocal(reffId) {
  try {
    const filePath = path.join(LOCAL_RECEIPTS_DIR, `${reffId}.txt`);
    const content = await fs.readFile(filePath, 'utf8');
    console.log(`[R2] ✅ Receipt retrieved locally: ${filePath}`);
    return {
      success: true,
      content: content,
      storage: 'local',
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        success: false,
        error: 'Receipt not found',
      };
    }
    console.error('[R2] ❌ Error getting locally:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if receipt exists
 * @param {string} reffId - Reference ID untuk receipt
 * @returns {Promise<{exists: boolean, storage?: string}>}
 */
async function receiptExists(reffId) {
  const fileName = `${reffId}.txt`;
  const key = `receipts/${fileName}`;

  // Check R2 first if enabled
  if (R2_ENABLED && s3Client) {
    try {
      const command = new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      return {
        exists: true,
        storage: 'r2',
      };
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Not in R2, check local
      } else {
        console.error('[R2] ❌ Error checking R2:', error.message);
      }
    }
  }

  // Check local
  try {
    const filePath = path.join(LOCAL_RECEIPTS_DIR, `${reffId}.txt`);
    await fs.access(filePath);
    return {
      exists: true,
      storage: 'local',
    };
  } catch (error) {
    return {
      exists: false,
    };
  }
}

/**
 * Delete receipt from R2 (and local if exists)
 * @param {string} reffId - Reference ID untuk receipt
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteReceipt(reffId) {
  const fileName = `${reffId}.txt`;
  const key = `receipts/${fileName}`;
  let deleted = false;

  // Delete from R2 if enabled
  if (R2_ENABLED && s3Client) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      console.log(`[R2] ✅ Receipt deleted from R2: ${key}`);
      deleted = true;
    } catch (error) {
      console.error('[R2] ❌ Error deleting from R2:', error.message);
    }
  }

  // Delete from local
  try {
    const filePath = path.join(LOCAL_RECEIPTS_DIR, `${reffId}.txt`);
    await fs.unlink(filePath);
    console.log(`[R2] ✅ Receipt deleted locally: ${filePath}`);
    deleted = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[R2] ❌ Error deleting locally:', error.message);
    }
  }

  return {
    success: deleted,
  };
}

/**
 * Get public URL untuk receipt (jika ada)
 * @param {string} reffId - Reference ID untuk receipt
 * @returns {string|null}
 */
function getReceiptUrl(reffId) {
  if (!R2_ENABLED || !R2_ACCOUNT_ID) {
    return null;
  }

  const key = `receipts/${reffId}.txt`;
  return R2_PUBLIC_URL 
    ? `${R2_PUBLIC_URL}/${key}`
    : `https://pub-${R2_ACCOUNT_ID}.r2.dev/${key}`;
}

module.exports = {
  saveReceipt,
  getReceipt,
  receiptExists,
  deleteReceipt,
  getReceiptUrl,
  isR2Enabled: () => R2_ENABLED && s3Client !== null,
};

