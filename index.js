require("./setting.js")
// Removed: downloadContentFromMessage - now using ronzz.downloadMedia() from Gowa adapter
const fs = require("fs");
const speed = require("performance-now");
const moment = require("moment-timezone");
const fetch = require('node-fetch');
const toMs = require('ms');
const ms = require('parse-ms');
const os = require('os');
const { sizeFormatter } = require('human-readable');
const path = require('path');
const { exec, execSync } = require("child_process");
const util = require('util');
const crypto = require("crypto");
const axios = require('axios')
const jimp_1 = require('jimp');
const cron = require("node-cron");
const { createCanvas, loadImage } = require("canvas");


const { OrderKuota } = require("./function/orderkuota")
const { getGroupAdmins, runtime, sleep } = require("./function/myfunc");
const { color } = require('./function/console');
const { addResponList, delResponList, isAlreadyResponList, isAlreadyResponListGroup, sendResponList, updateResponList, getDataResponList } = require('./function/respon-list');
const { addResponTesti, delResponTesti, isAlreadyResponTesti, updateResponTesti, getDataResponTesti } = require('./function/respon-testi');
const { expiredCheck, getAllSewa } = require("./function/sewa");
const { TelegraPh } = require('./function/uploader');
const { getUsernameMl, getUsernameFf, getUsernameCod, getUsernameGi, getUsernameHok, getUsernameSus, getUsernamePubg, getUsernameAg, getUsernameHsr, getUsernameHi, getUsernamePb, getUsernameSm, getUsernameValo, getUsernamePgr, getUsernameZzz, getUsernameAov } = require("./function/stalker");
const { qrisDinamis, qrisStatis, qrisStatisMidtrans } = require("./function/dinamis");
const { createPaymentLink, getPaymentLinkStatus, isPaymentCompleted, createQRISCore, createQRISPayment, getTransactionStatusByOrderId, getTransactionStatusByTransactionId, checkStaticQRISPayment } = require('./config/midtrans');
const { acquireLock, releaseLock, checkRateLimit, getCache, setCache, invalidateCachePattern, cacheAside } = require('./function/redis-helper');
const { saveReceipt } = require('./config/r2-storage');
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true'
let pg; if (usePg) { pg = require('./config/postgres'); }
const { core, isProduction } = require('./config/midtrans');
const USE_POLLING = true; // true = pakai polling status Midtrans; false = andalkan webhook saja

// Centralized, minimal send throttling + retry to avoid bursty spam patterns
const SEND_MIN_INTERVAL_MS = Number(process.env.WA_SEND_MIN_INTERVAL_MS || 800);
const SEND_MAX_RETRIES = Number(process.env.WA_SEND_RETRIES || 3);
let __sendQueue = Promise.resolve();
let __lastSendAt = 0;

function __delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function __wrapSendMessageOnce(ronzz) {
  try {
    if (ronzz.__sendWrapped) return;
    const originalSend = ronzz.sendMessage.bind(ronzz);
    ronzz.sendMessage = async function (jid, content, options) {
      __sendQueue = __sendQueue.then(async () => {
        const now = Date.now();
        const wait = Math.max(0, SEND_MIN_INTERVAL_MS - (now - __lastSendAt));
        if (wait > 0) await __delay(wait);

        let attempt = 0;
        // Retry on transient/rate-limit-like errors with exponential backoff
        while (true) {
          try {
            const res = await originalSend(jid, content, options);
            __lastSendAt = Date.now();
            return res;
          } catch (e) {
            attempt += 1;
            const msg = String(e && e.message ? e.message : "");
            const code = e && (e.status || e.statusCode || e.code);
            const transient =
              code === 429 ||
              /rate|too many|retry|temporarily unavailable|timeout|timed out|flood/i.test(msg);
            if (!transient || attempt > SEND_MAX_RETRIES) throw e;
            const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
            try { console.warn('[WA] send retry', { attempt, backoff, code, message: msg }); } catch { }
            await __delay(backoff);
          }
        }
      });
      return __sendQueue;
    };
    Object.defineProperty(ronzz, '__sendWrapped', { value: true, enumerable: false, configurable: false });
  } catch { }
}

// Performance optimization: Cache for user saldo
const saldoCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Invalidate saldo cache when database file is reloaded externally
try {
  process.on('database:reloaded', () => {
    saldoCache.clear();
  });
} catch { }

// Timeout tracking system for memory leak prevention
const activeTimeouts = new Map();
const autoDeleteState = {
  initialized: false,
  ronzz: null
};

function getDatabaseInstance() {
  if (typeof db !== 'undefined' && db?.data) return db;
  if (global?.db?.data) return global.db;
  return null;
}

function ensureAutoDeleteQueue() {
  const database = getDatabaseInstance();
  if (!database) return null;
  if (!database.data.autoDeleteQueue) {
    database.data.autoDeleteQueue = [];
  }
  return database.data.autoDeleteQueue;
}

function persistAutoDeleteQueue() {
  try {
    if (typeof global.scheduleSave === 'function') {
      global.scheduleSave();
    } else {
      const database = getDatabaseInstance();
      if (database && typeof database.save === 'function') {
        database.save();
      }
    }
  } catch (error) {
    console.error('[Timeout] Failed to persist auto delete queue:', error.message);
  }
}

function requestPendingOrderSave() {
  try {
    if (typeof global.scheduleSave === 'function') {
      global.scheduleSave();
    } else if (global?.db && typeof global.db.save === 'function') {
      global.db.save().catch((error) => {
        try { console.error('[DB] Failed to persist pending orders:', error.message); } catch { }
      });
    }
  } catch (error) {
    try { console.error('[DB] Failed to schedule pending order save:', error.message); } catch { }
  }
}

function removeAutoDeleteEntry(entryId) {
  const queue = ensureAutoDeleteQueue();
  if (!queue) return;
  const idx = queue.findIndex(item => item.id === entryId);
  if (idx !== -1) {
    queue.splice(idx, 1);
    persistAutoDeleteQueue();
  }
  activeTimeouts.delete(entryId);
}

async function performAutoDelete(entry) {
  const ronzz = autoDeleteState.ronzz;
  if (!ronzz) return;
  const deleteKey = {
    remoteJid: entry.remoteJid,
    id: entry.id,
    participant: entry.participant || undefined,
    fromMe: typeof entry.fromMe === 'boolean' ? entry.fromMe : true
  };

  try {
    await ronzz.sendMessage(entry.remoteJid, { delete: deleteKey });
    console.log(`🗑️ Auto-deleted ${entry.description} after delay`);
  } catch (error) {
    console.error(`[Timeout] Failed to auto-delete ${entry.description}:`, error.message);
  } finally {
    removeAutoDeleteEntry(entry.id);
  }
}

function scheduleAutoDeleteEntry(entry) {
  if (!autoDeleteState.ronzz) return;
  if (!entry || !entry.id) return;
  if (activeTimeouts.has(entry.id)) return;

  const delay = Math.max(0, entry.deleteAt - Date.now());
  const timeoutId = setTimeout(() => performAutoDelete(entry), delay);
  activeTimeouts.set(entry.id, {
    timeoutId,
    chatId: entry.remoteJid,
    scheduledAt: Date.now(),
    expiresAt: entry.deleteAt,
    description: entry.description
  });
}

/**
 * Schedule auto-delete for a message with proper cleanup tracking (persisted)
 * @param {Object} messageKey - Message key object from sendMessage response
 * @param {String} chatId - Chat ID (jid)
 * @param {Number} delayMs - Delay in milliseconds (default: 5 minutes)
 * @param {String} description - Optional description for logging
 * @returns {Object|null} Scheduled entry
 */
function scheduleAutoDelete(messageKey, chatId, delayMs = 300000, description = 'message') {
  if (!messageKey || !chatId) {
    console.warn('[Timeout] Invalid parameters for scheduleAutoDelete');
    return null;
  }

  const keyId = messageKey.id || messageKey.key?.id;
  const remoteJid = messageKey.remoteJid || chatId;
  if (!keyId || !remoteJid) {
    console.warn('[Timeout] Missing message key info for scheduleAutoDelete');
    return null;
  }

  const entry = {
    id: keyId,
    remoteJid,
    participant: messageKey.participant || messageKey.key?.participant || null,
    fromMe: messageKey.fromMe ?? true,
    description,
    deleteAt: Date.now() + delayMs
  };

  const queue = ensureAutoDeleteQueue();
  if (!queue) return null;
  queue.push(entry);
  persistAutoDeleteQueue();

  if (autoDeleteState.initialized) {
    scheduleAutoDeleteEntry(entry);
  }

  return entry;
}

function initializeAutoDeleteManager(ronzz) {
  if (!ronzz) return;
  autoDeleteState.ronzz = ronzz;
  if (autoDeleteState.initialized) return;
  autoDeleteState.initialized = true;

  const queue = ensureAutoDeleteQueue();
  if (!queue) return;

  for (const entry of queue.slice()) {
    if (entry.deleteAt <= Date.now()) {
      performAutoDelete(entry);
    } else {
      scheduleAutoDeleteEntry(entry);
    }
  }
}

/**
 * Cancel a scheduled auto-delete
 * @param {Object|String} messageKey - Message key or key ID
 */
function cancelAutoDelete(messageKey) {
  const key = typeof messageKey === 'string' ? messageKey : (messageKey.id || JSON.stringify(messageKey));
  const timeout = activeTimeouts.get(key);
  if (timeout) {
    clearTimeout(timeout.timeoutId);
    activeTimeouts.delete(key);
    return true;
  }
  return false;
}

/**
 * Cleanup all active timeouts (for shutdown)
 */
function cleanupAllTimeouts() {
  let cleaned = 0;
  activeTimeouts.forEach((timeout, key) => {
    clearTimeout(timeout.timeoutId);
    activeTimeouts.delete(key);
    cleaned++;
  });
  return cleaned;
}

// Cleanup on shutdown
process.on('SIGINT', () => {
  const cleaned = cleanupAllTimeouts();
  if (cleaned > 0) {
    console.log(`[Timeout] Cleaned up ${cleaned} active timeouts on shutdown`);
  }
});

process.on('SIGTERM', () => {
  const cleaned = cleanupAllTimeouts();
  if (cleaned > 0) {
    console.log(`[Timeout] Cleaned up ${cleaned} active timeouts on shutdown`);
  }
});

// Export for use in other modules if needed
global.scheduleAutoDelete = scheduleAutoDelete;
global.cancelAutoDelete = cancelAutoDelete;
global.cleanupAllTimeouts = cleanupAllTimeouts;

// Filesystem database mode removed; external reload watcher not required

// Cache management functions
function getCachedSaldo(userId) {
  const cached = saldoCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    return cached.saldo;
  }
  return null;
}

function setCachedSaldo(userId, saldo) {
  saldoCache.set(userId, {
    saldo: saldo,
    timestamp: Date.now()
  });
}

function clearExpiredCache() {
  const now = Date.now();
  for (const [userId, data] of saldoCache.entries()) {
    if (now - data.timestamp > CACHE_EXPIRY) {
      saldoCache.delete(userId);
    }
  }
}

// Clear expired cache every 10 minutes
setInterval(clearExpiredCache, 10 * 60 * 1000);

global.prefa = ['', '.']

moment.tz.setDefault("Asia/Jakarta").locale("id");
// Removed static tanggal - now using moment.tz('Asia/Jakarta').format('DD MMMM YYYY') directly when needed

// Global listener untuk webhook Midtrans (harus di luar module.exports agar bisa akses global)
let globalRonzz = null;

// Setup global payment-completed listener untuk Midtrans webhook
if (!global.midtransWebhookListenerSetup) {
  global.midtransWebhookListenerSetup = true;

  process.on('payment-completed', async (webhookData) => {
    try {
      const { orderId: webhookOrderId, transactionStatus, gross_amount } = webhookData;
      const webhookAmount = Number(gross_amount || webhookData.gross_amount || 0);
      const isStatusPaid = /(settlement|capture)/i.test(String(transactionStatus));

      if (!isStatusPaid || !webhookAmount) return;

      // Akses global.db langsung
      const db = global.db;
      if (!db || !db.data) {
        console.log(`⚠️ [MID-GLOBAL] Database not available yet`);
        return;
      }

      console.log(`🔔 [MID-GLOBAL] Webhook received: Amount Rp${webhookAmount}, Status: ${transactionStatus}, OrderID: ${webhookOrderId}`);

      // Cari order yang match dengan amount
      const orders = db.data.order || {};
      let matchedOrder = null;
      let matchedSender = null;

      console.log(`🔍 [MID-GLOBAL] Searching ${Object.keys(orders).length} pending orders...`);

      for (const [sender, order] of Object.entries(orders)) {
        if (!order) continue;

        // Cek metode MIDTRANS
        const orderMetode = order.metode || '';
        if (orderMetode !== 'MIDTRANS') {
          console.log(`  - Skipping order ${order.orderId || 'N/A'}: metode=${orderMetode} (not MIDTRANS)`);
          continue;
        }

        const orderAmount = Number(order.totalAmount || 0);
        const amountDiff = Math.abs(webhookAmount - orderAmount);

        console.log(`  - Checking order ${order.orderId || 'N/A'}: Amount Rp${orderAmount}, Diff: Rp${amountDiff.toFixed(2)}`);

        // Match dengan tolerance kecil (untuk handle decimal)
        if (amountDiff < 1) {
          matchedOrder = order;
          matchedSender = sender;
          console.log(`✅ [MID-GLOBAL] Found matching order: ${order.orderId}, Amount: Rp${orderAmount}, Sender: ${sender}`);
          break;
        }
      }

      if (!matchedOrder || !matchedSender) {
        console.log(`⚠️ [MID-GLOBAL] No matching order found for amount Rp${webhookAmount}`);
        if (Object.keys(orders).length > 0) {
          console.log(`   Available orders:`, Object.keys(orders).map(s => {
            const o = orders[s];
            return `${s}: ${o?.metode || 'N/A'} - Rp${o?.totalAmount || 0}`;
          }).join(', '));
        } else {
          console.log(`   No pending orders found`);
        }

        // Simpan webhook ke database untuk polling nanti (jika order belum dibuat)
        try {
          if (!db.data.midtransWebhooks) db.data.midtransWebhooks = [];
          const oneHourAgo = Date.now() - (60 * 60 * 1000);
          db.data.midtransWebhooks = db.data.midtransWebhooks.filter(w => w.timestamp > oneHourAgo);

          // Cek apakah webhook sudah ada
          const existingWebhook = db.data.midtransWebhooks.find(w =>
            w.orderId === webhookOrderId ||
            (Math.abs(Number(w.gross_amount) - webhookAmount) < 1 && w.timestamp > Date.now() - 60000)
          );

          if (!existingWebhook) {
            db.data.midtransWebhooks.push({
              orderId: webhookOrderId,
              transactionStatus: transactionStatus,
              paymentType: webhookData.paymentType,
              settlementTime: webhookData.settlementTime,
              gross_amount: webhookAmount,
              timestamp: Date.now(),
              processed: false
            });

            if (typeof db.save === 'function') {
              await db.save();
            }
            console.log(`💾 [MID-GLOBAL] Saved webhook to database for later processing`);
          }
        } catch (saveError) {
          console.error(`❌ [MID-GLOBAL] Error saving webhook:`, saveError.message);
        }

        return;
      }

      // Process payment
      const order = matchedOrder;
      const sender = matchedSender;
      const { id: productId, jumlah, from, key: messageKey, orderId, reffId, totalAmount } = order;

      if (!db.data.produk[productId]) {
        console.error(`❌ [MID-GLOBAL] Product ${productId} not found`);
        return;
      }

      console.log(`✅ [MID-GLOBAL] Processing payment for order: ${orderId}, RefId: ${reffId}`);

      // Delete message
      if (globalRonzz && messageKey) {
        try {
          await globalRonzz.sendMessage(from, { delete: messageKey });
        } catch (e) {
          console.error(`⚠️ [MID-GLOBAL] Error deleting message:`, e.message);
        }
      }

      // Process purchase
      db.data.produk[productId].terjual += jumlah;
      let dataStok = [];
      for (let i = 0; i < jumlah; i++) {
        if (db.data.produk[productId].stok.length > 0) {
          dataStok.push(db.data.produk[productId].stok.shift());
        }
      }

      if (dataStok.length === 0) {
        console.error(`❌ [MID-GLOBAL] No stock available for product ${productId}`);
        return;
      }

      // Important: Delete old stock property to force recalculation from stok.length
      delete db.data.produk[productId].stock;

      const moment = require('moment-timezone');
      const tanggal = moment.tz("Asia/Jakarta").format("DD/MM/YYYY");
      const jamwib = moment.tz("Asia/Jakarta").format("HH:mm:ss");

      const detailParts = [
        `*📦 Produk:* ${db.data.produk[productId].name}`,
        `*📅 Tanggal:* ${tanggal}`,
        `*⏰ Jam:* ${jamwib} WIB`,
        `*Refid:* ${reffId}`,
        ''
      ];

      dataStok.forEach((i) => {
        const dataAkun = i.split("|");
        detailParts.push(
          `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
          `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}`,
          `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}`,
          `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}`,
          `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}`,
          ''
        );
      });

      if (db.data.produk[productId].snk) {
        detailParts.push(
          `*╭────「 SYARAT & KETENTUAN 」────╮*`,
          '',
          `*📋 SNK PRODUK: ${db.data.produk[productId].name}*`,
          '',
          db.data.produk[productId].snk,
          '',
          `*⚠️ PENTING:*`,
          `• Baca dan pahami SNK sebelum menggunakan akun`,
          `• Akun yang sudah dibeli tidak dapat dikembalikan`,
          `• Hubungi admin jika ada masalah dengan akun`,
          '',
          `*╰────「 END SNK 」────╯*`
        );
      }

      const detailAkunCustomer = detailParts.join('\n');

      // Send to customer
      if (globalRonzz) {
        try {
          await sleep(1000);
          await globalRonzz.sendMessage(sender, { text: detailAkunCustomer });
          console.log(`✅ [MID-GLOBAL] Account details sent to ${sender}`);

          // If group message, send public confirmation
          if (from.endsWith('@g.us')) {
            await globalRonzz.sendMessage(from, { text: "🎉 Pembayaran QRIS berhasil! Detail akun telah dikirim ke chat pribadi Anda. Terima kasih!" }, { quoted: { key: messageKey } });
          }
        } catch (error) {
          console.error(`❌ [MID-GLOBAL] Error sending account details:`, error.message);
        }
      }

      // Save receipt
      try {
        const { saveReceipt } = require('./config/r2-storage');
        const result = await saveReceipt(reffId, detailAkunCustomer);
        if (result.success) {
          console.log(`✅ [MID-GLOBAL] Receipt saved: ${result.url || result.path || reffId}`);
        }
      } catch (receiptError) {
        console.error(`❌ [MID-GLOBAL] Error saving receipt:`, receiptError.message);
      }

      // Add to transaction database
      // Import hargaProduk function
      let hargaProduk;
      try {
        const hargaModule = require('./function/harga');
        hargaProduk = hargaModule.hargaProduk || ((id, role) => 0);
      } catch {
        hargaProduk = (id, role) => 0;
      }

      db.data.transaksi.push({
        id: productId,
        name: db.data.produk[productId].name,
        price: hargaProduk(productId, db.data.users[sender]?.role || 'bronze'),
        date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
        profit: db.data.produk[productId].profit || 0,
        jumlah: jumlah,
        user: sender.split("@")[0],
        userRole: db.data.users[sender]?.role || 'bronze',
        reffId: reffId,
        metodeBayar: "MIDTRANS",
        totalBayar: totalAmount
      });

      if (typeof global.scheduleSave === 'function') {
        global.scheduleSave();
      }

      delete db.data.order[sender];
      await db.save();
      console.log(`✅ [MID-GLOBAL] Transaction completed: ${orderId} - ${reffId}`);

    } catch (error) {
      console.error(`❌ [MID-GLOBAL] Error processing webhook:`, error.message);
      console.error(error.stack);
    }
  });

  console.log('✅ [MID-GLOBAL] Global webhook listener registered');
}

module.exports = async (ronzz, m, mek) => {
  // Set global reference untuk webhook listener
  globalRonzz = ronzz;

  try {
    __wrapSendMessageOnce(ronzz)
    const { isQuotedMsg, fromMe } = m
    if (fromMe) return
    initializeAutoDeleteManager(ronzz)
    const jamwib = moment.tz('Asia/Jakarta').format('HH:mm:ss')
    const dt = moment.tz('Asia/Jakarta').format('HH')
    const content = JSON.stringify(mek.message)
    const type = Object.keys(mek.message)[0];
    const from = m.chat
    const rawChats =
      (m.mtype === 'conversation') ? m.message.conversation :
        (m.mtype == 'imageMessage') ? m.message.imageMessage.caption :
          (m.mtype == 'videoMessage') ? m.message.videoMessage.caption :
            (m.mtype == 'extendedTextMessage') ? m.message.extendedTextMessage.text :
              (m.mtype == 'buttonsResponseMessage') && m.message.buttonsResponseMessage.selectedButtonId ? m.message.buttonsResponseMessage.selectedButtonId :
                (m.mtype == 'listResponseMessage') && m.message.listResponseMessage.singleSelectReply.selectedRowId ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
                  (m.mtype == 'templateButtonReplyMessage') && m.message.templateButtonReplyMessage.selectedId ? m.message.templateButtonReplyMessage.selectedId :
                    (m.mtype == 'interactiveResponseMessage') && JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id :
                      (m.mtype == 'messageContextInfo') ? (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text) :
                        ""
    const chats = (typeof rawChats === 'string' ? rawChats : (rawChats ?? '')?.toString() ?? '').trim()
    const toJSON = j => JSON.stringify(j, null, '\t')
    const prefix = prefa ? /^[°•π÷×¶∆£¢€¥®=????+✓_=|~!?@#%^&.©^]/gi.test(chats) ? chats.match(/^[°•π÷×¶∆£¢€¥®=????+✓_=|~!?@#%^&.©^]/gi)[0] : "" : prefa ?? '#'
    const isGroup = m.isGroup
    const sender = m.isGroup ? (mek.key.participant ? mek.key.participant : mek.participant) : mek.key.remoteJid
    const isOwner = [ronzz.user.id, ...owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(sender) ? true : false
    const pushname = m.pushName
    const budy = (typeof m.text == 'string' ? m.text : '')
    const args = chats.split(/ +/).slice(1);
    const q = args.join(" ");
    const command = chats.replace(prefix, '').trim().split(/ +/).shift().toLowerCase()
    const botNumber = ronzz.user.id.split(':')[0] + '@s.whatsapp.net'
    let groupMetadata = ''
    try {
      groupMetadata = isGroup ? await ronzz.groupMetadata(from) : ''
    } catch (e) {
      console.warn(`WARNING: Failed to fetch group metadata for ${from}: ${e.message}`)
      groupMetadata = { subject: 'Unknown Group', id: from, participants: [] }
    }
    const groupName = isGroup ? groupMetadata.subject : ''
    const groupId = isGroup ? groupMetadata.id : ''
    const groupMembers = isGroup ? groupMetadata.participants : ''
    const groupAdmins = isGroup ? getGroupAdmins(groupMembers) : ''
    const isBotGroupAdmins = groupAdmins.includes(botNumber) || false
    const isGroupAdmins = groupAdmins.includes(sender)
    const participants = isGroup ? await groupMetadata.participants : ''

    const isImage = (m.mtype == 'imageMessage')
    const isQuotedImage = isQuotedMsg ? content.includes('imageMessage') ? true : false : false
    const isVideo = (m.mtype == 'videoMessage')
    const isQuotedVideo = isQuotedMsg ? content.includes('videoMessage') ? true : false : false
    const isSewa = db.data.sewa[from] ? true : false

    // 🛡️ GROUP WHITELIST: Cek apakah group diizinkan (hanya untuk group, bukan private chat)
    if (isGroup && !isOwner) {
      // Pastikan groupName valid
      if (!groupName || typeof groupName !== 'string') {
        console.warn(`⚠️ [GROUP-WHITELIST] Invalid group name, blocking for safety`)
        console.warn(`   Group metadata: ${JSON.stringify({ from, isGroup, hasMetadata: !!groupMetadata })}`)
        return
      }

      // Debug: Log konfigurasi whitelist
      console.log(`🔍 [GROUP-WHITELIST] Checking group: "${groupName}" (${from})`)
      console.log(`   BOT_GROUP_NAMES: ${global.groupNames && global.groupNames.length > 0 ? global.groupNames.join(', ') : 'NOT SET'}`)
      console.log(`   BOT_GROUP_LINKS: ${global.linkGroup && global.linkGroup.length > 0 ? `${global.linkGroup.length} links` : 'NOT SET'}`)

      let isAllowedGroup = false
      let checkMethod = ''

      // Prioritas 1: Cek berdasarkan nama group (jika BOT_GROUP_NAMES di-set)
      // Cek apakah BOT_GROUP_NAMES environment variable di-set (bukan hanya array kosong)
      const hasGroupNamesEnv = process.env.BOT_GROUP_NAMES !== undefined && process.env.BOT_GROUP_NAMES !== null

      if (hasGroupNamesEnv) {
        // Jika BOT_GROUP_NAMES di-set tapi kosong, block semua group
        if (!global.groupNames || global.groupNames.length === 0) {
          console.log(`🚫 [GROUP-WHITELIST] BLOCKED - BOT_GROUP_NAMES is set but empty (whitelist mode enabled, no groups allowed)`)
          console.log(`   Group: "${groupName}" (${from})`)
          return
        }

        // Normalize: lowercase, trim, dan hapus karakter whitespace berlebih
        const normalizedGroupName = groupName.toLowerCase().trim().replace(/\s+/g, ' ')
        isAllowedGroup = global.groupNames.some(allowedName => {
          const normalizedAllowed = allowedName.toLowerCase().trim().replace(/\s+/g, ' ')
          return normalizedGroupName === normalizedAllowed
        })
        checkMethod = 'name'

        console.log(`   Checking name: "${normalizedGroupName}" in [${global.groupNames.map(n => `"${n.toLowerCase().trim().replace(/\s+/g, ' ')}"`).join(', ')}]`)

        if (isAllowedGroup) {
          console.log(`✅ [GROUP-WHITELIST] Allowed group by name: ${groupName}`)
        } else {
          console.log(`🚫 [GROUP-WHITELIST] BLOCKED - Group name not in whitelist:`)
          console.log(`   Group: "${groupName}" (normalized: "${normalizedGroupName}")`)
          console.log(`   Allowed Names: ${global.groupNames.map(n => `"${n}"`).join(', ')}`)
          return // Block jika tidak match nama
        }
      }
      // Prioritas 2: Cek berdasarkan invite code (jika BOT_GROUP_LINKS di-set)
      else if (global.linkGroup && global.linkGroup.length > 0) {
        try {
          // Ambil group invite code
          const groupInviteCode = await ronzz.groupInviteCode(from)
          const groupLink = `https://chat.whatsapp.com/${groupInviteCode}`

          // Extract invite code dari whitelist links
          const allowedInviteCodes = global.linkGroup.map(link => {
            // Extract invite code dari link (format: https://chat.whatsapp.com/INVITECODE?mode=...)
            const match = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
            return match ? match[1] : null
          }).filter(code => code !== null)

          // Cek apakah group invite code ada di whitelist
          isAllowedGroup = allowedInviteCodes.includes(groupInviteCode)
          checkMethod = 'invite_code'

          if (!isAllowedGroup) {
            console.log(`🚫 [GROUP-WHITELIST] BLOCKED - Group invite code not in whitelist:`)
            console.log(`   Group: ${groupName} (${from})`)
            console.log(`   Group Invite Code: ${groupInviteCode}`)
            console.log(`   Allowed Codes: ${allowedInviteCodes.join(', ')}`)
            return // Jangan proses pesan dari group yang tidak diizinkan
          } else {
            console.log(`✅ [GROUP-WHITELIST] Allowed group by invite code: ${groupName} (${groupInviteCode})`)
          }
        } catch (error) {
          // Jika error saat ambil invite code (misal: not-authorized), fallback ke nama group jika ada
          if (error.message && error.message.includes('not-authorized')) {
            console.warn(`⚠️ [GROUP-WHITELIST] Cannot get invite code (not-authorized), falling back to name check`)

            // Jika BOT_GROUP_NAMES tidak di-set, block untuk safety
            if (!global.groupNames || global.groupNames.length === 0) {
              console.log(`🚫 [GROUP-WHITELIST] BLOCKED - Cannot verify (no BOT_GROUP_NAMES set and invite code check failed)`)
              console.log(`   Group: ${groupName} (${from})`)
              return
            }

            // Coba cek berdasarkan nama group sebagai fallback
            const normalizedGroupName = groupName.toLowerCase().trim().replace(/\s+/g, ' ')
            isAllowedGroup = global.groupNames.some(allowedName => {
              const normalizedAllowed = allowedName.toLowerCase().trim().replace(/\s+/g, ' ')
              return normalizedGroupName === normalizedAllowed
            })
            checkMethod = 'name (fallback)'

            console.log(`   Fallback checking name: "${normalizedGroupName}" in [${global.groupNames.map(n => `"${n.toLowerCase().trim().replace(/\s+/g, ' ')}"`).join(', ')}]`)

            if (!isAllowedGroup) {
              console.log(`🚫 [GROUP-WHITELIST] BLOCKED - Group name not in whitelist (fallback):`)
              console.log(`   Group: "${groupName}" (normalized: "${normalizedGroupName}")`)
              console.log(`   Allowed Names: ${global.groupNames.map(n => `"${n}"`).join(', ')}`)
              return
            } else {
              console.log(`✅ [GROUP-WHITELIST] Allowed group by name (fallback): ${groupName}`)
            }
          } else {
            // Error lain, block untuk safety
            console.error(`❌ [GROUP-WHITELIST] Error checking group:`, error.message)
            console.error(`   Group: ${groupName} (${from})`)
            console.log(`🚫 [GROUP-WHITELIST] BLOCKED - Error during check (safety measure)`)
            return
          }
        }
      } else {
        // Jika tidak ada whitelist sama sekali, izinkan semua (backward compatibility)
        console.log(`⚠️ [GROUP-WHITELIST] No whitelist configured (BOT_GROUP_NAMES or BOT_GROUP_LINKS), allowing all groups`)
        isAllowedGroup = true
      }
    }

    function parseMention(text = '') {
      return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
    }

    const reply = (teks, options = {}) => { ronzz.sendMessage(from, { text: teks, ...options }, { quoted: m }) }
    let cachedThumbnailBuffer = null
    function getThumbnailBuffer() {
      if (!cachedThumbnailBuffer) {
        try {
          cachedThumbnailBuffer = fs.readFileSync(thumbnail)
        } catch (e) {
          cachedThumbnailBuffer = undefined
        }
      }
      return cachedThumbnailBuffer
    }
    const Reply = (teks) => ronzz.sendMessage(from, { text: Styles(teks), contextInfo: { mentionedJid: parseMention(teks), externalAdReply: { showAdAttribution: true, title: `${botName} © ${ownerName}`, body: ownerName + botName, thumbnail: getThumbnailBuffer(), sourceUrl: linkGroup, mediaType: 1, renderLargerThumbnail: true } } }, { quoted: m })

    const mentionByTag = m.mtype == "extendedTextMessage" && m.message.extendedTextMessage.contextInfo != null ? m.message.extendedTextMessage.contextInfo.mentionedJid : []
    const mentionByReply = m.mtype == "extendedTextMessage" && m.message.extendedTextMessage.contextInfo != null ? m.message.extendedTextMessage.contextInfo.participant || "" : ""
    const mention = typeof (mentionByTag) == 'string' ? [mentionByTag] : mentionByTag
    mention != undefined ? mention.push(mentionByReply) : []

    try {
      var ppuser = await ronzz.profilePictureUrl(sender, "image")
    } catch {
      var ppuser = "https://telegra.ph/file/8dcf2bc718248d2dd189b.jpg"
    }

    async function downloadAndSaveMediaMessage(type_file, path_file) {
      try {
        let messageToDownload = null;

        if (type_file === 'image') {
          messageToDownload = m.message.imageMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.imageMessage;
        } else if (type_file === 'video') {
          messageToDownload = m.message.videoMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.videoMessage;
        } else if (type_file === 'sticker') {
          messageToDownload = m.message.stickerMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.stickerMessage;
        } else if (type_file === 'audio') {
          messageToDownload = m.message.audioMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.audioMessage;
        }

        if (!messageToDownload) {
          throw new Error(`No ${type_file} message found`);
        }

        // Use Gowa adapter's downloadMedia method
        const buffer = await ronzz.downloadMedia(messageToDownload);
        fs.writeFileSync(path_file, buffer);
        return path_file;
      } catch (error) {
        console.error(`[DOWNLOAD] Error downloading ${type_file}:`, error.message);
        throw error;
      }
    }

    async function pepe(media) {
      const jimp = await jimp_1.read(media)
      const min = jimp.getWidth()
      const max = jimp.getHeight()
      const cropped = jimp.crop(0, 0, min, max)
      return {
        img: await cropped.scaleToFit(720, 720).getBufferAsync(jimp_1.MIME_JPEG),
        preview: await cropped.normalize().getBufferAsync(jimp_1.MIME_JPEG)
      }
    }

    function wrapText(text, maxLineLength) {
      const lines = [];
      while (text.length > maxLineLength) {
        let spaceIndex = text.lastIndexOf(" ", maxLineLength);
        if (spaceIndex === -1) {
          spaceIndex = maxLineLength;
        }
        lines.push(text.substring(0, spaceIndex));
        text = text.substring(spaceIndex).trim();
      }
      lines.push(text);
      return lines;
    }

    async function generateInvoiceWithBackground(data, backgroundPath) {
      const canvas = createCanvas(600, 400);
      const ctx = canvas.getContext("2d");

      if (backgroundPath && fs.existsSync(backgroundPath)) {
        const backgroundImage = await loadImage(backgroundPath);
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 10px Arial";

      ctx.fillText(`${data.invoice}`, 275, 134);
      ctx.fillText(`${data.product}`, 177, 188);
      ctx.fillText(`${data.tujuan}`, 177, 228);
      ctx.fillText(`${data.nickname}`, 177, 270);
      ctx.fillText(`${data.waktu}`, 86, 134);

      ctx.fillStyle = "#FCD201";
      const snLines = wrapText(data.sn, 40);
      let startY = 313;
      const lineSpacing = 20;

      snLines.forEach((line, index) => {
        ctx.fillText(line, 177, startY + (index * lineSpacing));
      });

      const outputPath = `./options/sticker/${data.invoice}.png`
      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(outputPath, buffer);

      return outputPath;
    }

    function digit() {
      let unik = (Math.floor(Math.random() * 200)).toFixed()
      while (db.data.unik.includes(unik) || unik == undefined) {
        unik = (Math.floor(Math.random() * 200)).toFixed()
      }
      db.data.unik.push(unik)
      return Number(unik)
    }

    const formatp = sizeFormatter({
      std: 'JEDEC',
      decimalPlaces: 2,
      keepTrailingZeroes: false,
      render: (literal, symbol) => `${literal} ${symbol}B`,
    })

    //Ucapan waktu
    if (dt >= 0) {
      var ucapanWaktu = ('Selamat Malam🌃')
    }
    if (dt >= 4) {
      var ucapanWaktu = ('Selamat Pagi🌄')
    }
    if (dt >= 12) {
      var ucapanWaktu = ('Selamat Siang☀️')
    }
    if (dt >= 16) {
      var ucapanWaktu = ('️ Selamat Sore🌇')
    }
    if (dt >= 23) {
      var ucapanWaktu = ('Selamat Malam🌙')
    }

    if (!db.data.orkut) db.data.orkut = {
      username: "",
      authToken: ""
    }
    if (!db.data.unik || db.data.unik.length >= 199) db.data.unik = ['0']
    if (!db.data.users[sender]) db.data.users[sender] = {
      saldo: 0,
      role: "bronze"
    }
    if (!db.data.persentase["feeDepo"]) db.data.persentase["feeDepo"] = feeDepo
    if (!db.data.persentase["bronze"]) db.data.persentase["bronze"] = bronze
    if (!db.data.persentase["silver"]) db.data.persentase["silver"] = silver
    if (!db.data.persentase["gold"]) db.data.persentase["gold"] = gold
    if (!db.data.profit["bronze"]) db.data.profit["bronze"] = nBronze
    if (!db.data.profit["silver"]) db.data.profit["silver"] = nSilver
    if (!db.data.profit["gold"]) db.data.profit["gold"] = nGold
    if (!db.data.setting[botNumber]) db.data.setting[botNumber] = {
      autoread: true,
      autoketik: false,
      anticall: true
    }
    if (isGroup && !db.data.chat[from]) db.data.chat[from] = {
      welcome: false,
      antilink: false,
      antilink2: false,
      sDone: "",
      sProses: ""
    }

    function Styles(text, style = 2) {
      var xStr = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split('');
      var yStr = Object.freeze({
        1: 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘqʀꜱᴛᴜᴠᴡxʏᴢ1234567890',
        2: '𝖺 𝖻 𝖼 𝖽 𝖾 𝖿 𝗀 𝗁 𝗂 𝗃 𝗄 𝗅 𝗆 𝗇 𝗈 𝗉 𝗊 𝗋 𝗌 𝗍 𝗎 𝗏 𝗐 𝗑 𝗒 𝗓 𝖠 𝖡 𝖢 𝖣 𝖤 𝖥 𝖦 𝖧 𝖨 𝖩 𝖪 𝖫 𝖬 𝖭 𝖮 𝖯 𝖰 𝖱 𝖲 𝖳 𝖴 𝖵 𝖶 𝖷 𝖸 𝖹 1 2 3 4 5 6 7 8 9 0'
      });
      var replacer = [];
      xStr.map((v, i) => replacer.push({
        original: v,
        convert: style == 2 ? yStr[style].split(' ')[i] : yStr[style].split('')[i]
      }));
      var str = text.split('');
      var output = [];
      str.map(v => {
        const find = replacer.find(x => x.original == v);
        find ? output.push(find.convert) : output.push(v);
      });
      return output.join('');
    }

    function toRupiah(angka) {
      var saldo = '';
      var angkarev = angka.toString().split('').reverse().join('');
      for (var i = 0; i < angkarev.length; i++)
        if (i % 3 == 0) saldo += angkarev.substr(i, 3) + '.';
      return '' + saldo.split('', saldo.length - 1).reverse().join('');
    }

    function hargaSetelahProfit(harga, role, kategori) {
      if (db.data.customProfit[kategori.toLowerCase()] !== undefined) {
        if (db.data.customProfit[kategori.toLowerCase()] == "persen") {
          let fee = (db.data.persentase[role] / 100) * Number(harga)
          let total = Number(harga) + Number(Math.ceil(fee))
          return total
        } else if (db.data.customProfit[kategori.toLowerCase()] == "nominal") {
          let total = Number(harga) + Number(db.data.profit[role])
          return total
        }
      } else if (kategori.includes("PULSA") && db.data.customProfit["pulsa"] !== undefined) {
        if (db.data.customProfit["pulsa"] == "persen") {
          let fee = (db.data.persentase[role] / 100) * Number(harga)
          let total = Number(harga) + Number(Math.ceil(fee))
          return total
        } else if (db.data.customProfit["pulsa"] == "nominal") {
          let total = Number(harga) + Number(db.data.profit[role])
          return total
        }
      } else if (kategori.includes("KUOTA") && db.data.customProfit["kuota"] !== undefined) {
        if (db.data.customProfit["kuota"] == "persen") {
          let fee = (db.data.persentase[role] / 100) * Number(harga)
          let total = Number(harga) + Number(Math.ceil(fee))
          return total
        } else if (db.data.customProfit["kuota"] == "nominal") {
          let total = Number(harga) + Number(db.data.profit[role])
          return total
        }
      } else if (db.data.type == "persen") {
        let fee = (db.data.persentase[role] / 100) * Number(harga)
        let total = Number(harga) + Number(Math.ceil(fee))
        return total
      } else if (db.data.type == "nominal") {
        let total = Number(harga) + Number(db.data.profit[role])
        return total
      }
    }

    function hargaProduk(id, role) {
      if (role == "bronze") return db.data.produk[id].priceB
      if (role == "silver") return db.data.produk[id].priceS
      if (role == "gold") return db.data.produk[id].priceG
    }
    expiredCheck(ronzz, m, groupId)

    if (db.data.topup[sender]) {
      if (!fromMe) {
        if (db.data.topup[sender].session == "INPUT-TUJUAN") {
          if (chats == "") return
          axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(async res => {
            let product = res.data.find(i => i.kode == db.data.topup[sender].data.code)

            if (product.produk == "TPG Diamond Mobile Legends" || product.produk == "TPG Genshin Impact Crystals") {
              if (!chats.split(" ")[1]) return reply("Untuk produk ML atau yang ada server id penggunaannya seperti dibawah ini\nContoh:\n12345678 (12345) ❌\n12345678 12345 ✅")

              let nickname = ""
              if (product.produk == "TPG Diamond Mobile Legends") {
                nickname = await getUsernameMl(chats.split(" ")[0], chats.split(" ")[1])
              } else if (product.produk == "TPG Genshin Impact Crystals") {
                nickname = await getUsernameGi(chats.split(" ")[0], chats.split(" ")[1])
              }

              let teks = `*🧾 KONFIRMASI TOPUP 🧾*\n\n*Produk ID:* ${product.kode}\n*User Id:* ${chats.split(" ")[0]}\n*Zone Id:* ${chats.split(" ")[1]}\n*Nickname:* ${nickname}\n\n「  DETAIL PRODUCT ✅  」\n*Kategori:* ${product.kategori}\n*Produk:* ${product.keterangan}\n*Harga:* Rp${toRupiah(hargaSetelahProfit(product.harga, db.data.users[sender].role, product.kategori))}\n\nPeriksa apakah inputan sudah benar, jika salah maka akan gagal.`
              ronzz.sendMessage(from, {
                footer: `${botName} © ${ownerName}`,
                buttons: [
                  {
                    buttonId: 'lanjut', buttonText: { displayText: 'Lanjut' }, type: 1,
                  }, {
                    buttonId: 'batal', buttonText: { displayText: 'Batal' }, type: 1,
                  }
                ],
                headerType: 1,
                viewOnce: true,
                image: fs.readFileSync(thumbnail),
                caption: teks,
                contextInfo: {
                  forwardingScore: 999,
                  isForwarded: true,
                  mentionedJid: parseMention(teks),
                  externalAdReply: {
                    title: botName,
                    body: `By ${ownerName}`,
                    thumbnailUrl: ppuser,
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: false
                  }
                }
              }, { quoted: m });
              db.data.topup[sender].data.id = chats.split(" ")[0]
              db.data.topup[sender].data.zone = chats.split(" ")[1]
              db.data.topup[sender].data.nickname = nickname
            } else if (product.kategori == "DIGITAL") {
              let nickname = ""
              if (product.produk == "TPG Diamond Free Fire") {
                nickname = await getUsernameFf(chats)
              } else if (product.produk == "TPG Game Mobile PUBG") {
                nickname = await getUsernamePubg(chats)
              } else if (product.produk == "TPG Goldstar Super Sus") {
                nickname = await getUsernameSus(chats)
              } else if (product.produk == "TPG Arena of Valor") {
                nickname = await getUsernameAov(chats)
              } else if (product.produk == "TPG Honor of Kings") {
                nickname = await getUsernameHok(chats)
              } else if (product.produk == "TPG Call Of Duty") {
                nickname = await getUsernameCod(chats)
              } else if (product.produk == "TPG Point Blank Zepetto") {
                nickname = await getUsernamePb(chats)
              } else {
                nickname = ""
              }

              let teks = `*🧾 KONFIRMASI TOPUP 🧾*\n\n*Produk ID:* ${product.kode}\n*User Id:* ${chats}\n*Nickname:* ${nickname}\n\n「  DETAIL PRODUCT ✅  」\n*Kategori:* ${product.kategori}\n*Produk:* ${product.keterangan}\n*Harga:* Rp${toRupiah(hargaSetelahProfit(product.harga, db.data.users[sender].role, product.kategori))}\n\nPeriksa apakah inputan sudah benar, jika salah maka akan gagal.`
              ronzz.sendMessage(from, {
                footer: `${botName} © ${ownerName}`,
                buttons: [
                  {
                    buttonId: 'lanjut', buttonText: { displayText: 'Lanjut' }, type: 1,
                  }, {
                    buttonId: 'batal', buttonText: { displayText: 'Batal' }, type: 1,
                  }
                ],
                headerType: 1,
                viewOnce: true,
                image: fs.readFileSync(thumbnail),
                caption: teks,
                contextInfo: {
                  forwardingScore: 999,
                  isForwarded: true,
                  mentionedJid: parseMention(teks),
                  externalAdReply: {
                    title: botName,
                    body: `By ${ownerName}`,
                    thumbnailUrl: ppuser,
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: false
                  }
                }
              }, { quoted: m });
              db.data.topup[sender].data.id = chats
              db.data.topup[sender].data.nickname = nickname
            } else {
              let teks = `*🧾 KONFIRMASI TOPUP 🧾*\n\n*Produk ID:* ${product.kode}\n*Tujuan:* ${chats}\n\n「  DETAIL PRODUCT ✅  」\n*Kategori:* ${product.kategori}\n*Produk:* ${product.keterangan}\n*Harga:* Rp${toRupiah(hargaSetelahProfit(product.harga, db.data.users[sender].role, product.kategori))}\n\nPeriksa apakah inputan sudah benar, jika salah maka akan gagal.`
              ronzz.sendMessage(from, {
                footer: `${botName} © ${ownerName}`,
                buttons: [
                  {
                    buttonId: 'lanjut', buttonText: { displayText: 'Lanjut' }, type: 1,
                  }, {
                    buttonId: 'batal', buttonText: { displayText: 'Batal' }, type: 1,
                  }
                ],
                headerType: 1,
                viewOnce: true,
                image: fs.readFileSync(thumbnail),
                caption: teks,
                contextInfo: {
                  forwardingScore: 999,
                  isForwarded: true,
                  mentionedJid: parseMention(teks),
                  externalAdReply: {
                    title: botName,
                    body: `By ${ownerName}`,
                    thumbnailUrl: ppuser,
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: false
                  }
                }
              }, { quoted: m });
              db.data.topup[sender].data.id = chats
            }
            db.data.topup[sender].data.price = hargaSetelahProfit(product.harga, db.data.users[sender].role, product.kategori)
            db.data.topup[sender].session = "KONFIRMASI-TOPUP"
          })
        } else if (db.data.topup[sender].session == "KONFIRMASI-TOPUP") {
          if (chats.toLowerCase() == "lanjut") {
            axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(async res => {
              let product = res.data.find(i => i.kode == db.data.topup[sender].data.code)
              if (db.data.users[sender].saldo < db.data.topup[sender].data.price) {
                reply("Saldo kamu tidak mencukupi untuk melakukan transaksi ini, sesaat lagi bot akan mengirimkan Pembayaran Otomatis.")

                let amount = Number(db.data.topup[sender].data.price) + Number(digit())

                let pay = await qrisDinamis(`${amount}`, "./options/sticker/qris.jpg")
                let time = Date.now() + toMs("5m");
                let expirationTime = new Date(time);
                let timeLeft = Math.max(0, Math.floor((expirationTime - new Date()) / 60000));
                let currentTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
                let expireTimeJakarta = new Date(currentTime.getTime() + timeLeft * 60000);
                let hours = expireTimeJakarta.getHours().toString().padStart(2, '0');
                let minutes = expireTimeJakarta.getMinutes().toString().padStart(2, '0');
                let formattedTime = `${hours}:${minutes}`

                await sleep(500)
                let cap
                if (product.produk == "TPG Diamond Mobile Legends" || product.produk == "TPG Genshin Impact Crystals") {
                  cap = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk ID:* ${product.kode}\n*User Id:* ${db.data.topup[sender].data.id}\n*Zone Id:* ${db.data.topup[sender].data.zone}\n*Nickname:* ${db.data.topup[sender].data.nickname}\n\n「  DETAIL PRODUCT ✅  」\n*Kategori:* ${product.kategori}\n*Produk:* ${product.keterangan}\n*Harga:* Rp${toRupiah(db.data.topup[sender].data.price)} + 2 digit acak\n*Total Harga:* Rp${toRupiah(amount)}\n*Waktu:* ${timeLeft} menit\n\nSilahkan scan Qris di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n`;
                } else if (product.kategori == "DIGITAL") {
                  cap = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk ID:* ${product.kode}\n*User Id:* ${db.data.topup[sender].data.id}\n*Nickname:* ${db.data.topup[sender].data.nickname}\n\n「  DETAIL PRODUCT ✅  」\n*Kategori:* ${product.kategori}\n*Produk:* ${product.keterangan}\n*Harga:* Rp${toRupiah(db.data.topup[sender].data.price)} + 2 digit acak\n*Total Harga:* Rp${toRupiah(amount)}\n*Waktu:* ${timeLeft} menit\n\nSilahkan scan Qris di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n`;
                } else {
                  cap = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk ID:* ${product.kode}\n*Tujuan:* ${db.data.topup[sender].data.id}\n\n「  DETAIL PRODUCT ✅  」\n*Kategori:* ${product.kategori}\n*Produk:* ${product.keterangan}\n*Harga:* Rp${toRupiah(db.data.topup[sender].data.price)} + 2 digit acak\n*Total Harga:* Rp${toRupiah(amount)}\n*Waktu:* ${timeLeft} menit\n\nSilahkan scan Qris di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n`;
                }
                let mess = await ronzz.sendMessage(from, { image: fs.readFileSync(pay), caption: Styles(cap) }, { quoted: m })

                let statusPay = false;

                while (!statusPay) {
                  await sleep(10000)
                  if (Date.now() >= time) {
                    statusPay = true

                    await ronzz.sendMessage(from, { delete: mess.key })
                    reply("Pembayaran dibatalkan karena telah melewati batas expired.")
                    delete db.data.topup[sender]
                  }
                  try {
                    let orkut = new OrderKuota(db.data.orkut["username"], db.data.orkut["authToken"])
                    let response = await orkut.getTransactionQris()
                    let result = response.qris_history.results.find(i => i.status == "IN" && Number(i.kredit.replace(/[.]/g, '')) == parseInt(amount))

                    if (result !== undefined) {
                      statusPay = true;

                      await ronzz.sendMessage(from, { delete: mess.key })
                      axios.get(`https://b2b.okeconnect.com/trx-v2?product=${product.kode}&dest=${db.data.topup[sender].data.id}${db.data.topup[sender].data.zone}&refID=${db.data.topup[sender].id}&memberID=${memberId}&pin=${pin}&password=${pw}`).then(async ress => {
                        if (ress.data.status == "GAGAL") {
                          ronzz.sendMessage(from, {
                            footer: `${botName} © ${ownerName}`,
                            buttons: [
                              {
                                buttonId: 'saldo', buttonText: { displayText: 'Saldo' }, type: 1,
                              }
                            ],
                            headerType: 1,
                            viewOnce: true,
                            image: fs.readFileSync(thumbnail),
                            caption: `Pesanan dibatalkan!\nAlasan: ${ress.data.message}\n\nUang akan dimasukkan ke saldo Anda`,
                            contextInfo: {
                              forwardingScore: 999,
                              isForwarded: true,
                              externalAdReply: {
                                title: botName,
                                body: `By ${ownerName}`,
                                thumbnailUrl: ppuser,
                                sourceUrl: '',
                                mediaType: 1,
                                renderLargerThumbnail: false
                              }
                            }
                          }, { quoted: m });
                          await dbHelper.updateUserSaldo(sender, db.data.topup[sender].data.price, 'add')
                          delete db.data.topup[sender]
                        } else {
                          if (product.produk == "TPG Diamond Mobile Legends" || product.produk == "TPG Genshin Impact Crystals") {
                            await Reply(`*⏳「 TRANSAKSI PENDING 」⏳*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Zone Id:* ${db.data.topup[sender].data.zone}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n_Harap ditunggu ya kak._`)
                          } else if (product.kategori == "DIGITAL") {
                            await Reply(`*⏳「 TRANSAKSI PENDING 」⏳*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n_Harap ditunggu ya kak._`)
                          } else {
                            await Reply(`*⏳「 TRANSAKSI PENDING 」⏳*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» Tujuan:* ${db.data.topup[sender].data.id}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n_Harap ditunggu ya kak._`)
                          }
                        }

                        let status = ress.data.status
                        while (status !== "SUKSES") {
                          await sleep(5000)
                          let responsed = await axios.get(`https://b2b.okeconnect.com/trx-v2?product=${product.kode}&dest=${db.data.topup[sender].data.id}${db.data.topup[sender].data.zone}&refID=${db.data.topup[sender].id}&memberID=${memberId}&pin=${pin}&password=${pw}`)
                          let responses = await responsed.data
                          status = responses.status

                          if (responses.status == "GAGAL") {
                            ronzz.sendMessage(from, {
                              footer: `${botName} © ${ownerName}`,
                              buttons: [
                                {
                                  buttonId: 'saldo', buttonText: { displayText: 'Saldo' }, type: 1,
                                }
                              ],
                              headerType: 1,
                              viewOnce: true,
                              image: fs.readFileSync(thumbnail),
                              caption: `Pesanan dibatalkan!\nAlasan: ${ress.data.message}\n\nUang akan dimasukkan ke saldo Anda`,
                              contextInfo: {
                                forwardingScore: 999,
                                isForwarded: true,
                                externalAdReply: {
                                  title: botName,
                                  body: `By ${ownerName}`,
                                  thumbnailUrl: ppuser,
                                  sourceUrl: '',
                                  mediaType: 1,
                                  renderLargerThumbnail: false
                                }
                              }
                            }, { quoted: m });
                            await dbHelper.updateUserSaldo(sender, db.data.topup[sender].data.price, 'add')
                            delete db.data.topup[sender]
                            break
                          }
                          if (responses.status == "SUKSES") {
                            if (product.produk == "TPG Diamond Mobile Legends" || product.produk == "TPG Genshin Impact Crystals") {
                              let data = {
                                invoice: db.data.topup[sender].id,
                                product: product.keterangan,
                                tujuan: `${db.data.topup[sender].data.id} (${db.data.topup[sender].data.zone})`,
                                nickname: db.data.topup[sender].data.nickname,
                                waktu: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
                                sn: responses.sn
                              }
                              let invoice = await generateInvoiceWithBackground(data, "./options/image/bg.jpg")
                              await sleep(200)
                              await ronzz.sendMessage(from, { image: fs.readFileSync(invoice), caption: `*✅「 TRANSAKSI SUKSES 」✅*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Zone Id:* ${db.data.topup[sender].data.zone}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n*» Fee Qris:* Rp${Number(amount) - Number(db.data.topup[sender].data.price)}\n*» Total Bayar:* Rp${toRupiah(amount)}\n\n*» SN:*\n${responses.sn}\n\n_Terimakasih kak sudah order.️_` }, { quoted: m })
                              fs.unlinkSync(invoice)
                            } else if (product.kategori == "DIGITAL") {
                              let data = {
                                invoice: db.data.topup[sender].id,
                                product: product.keterangan,
                                tujuan: db.data.topup[sender].data.id,
                                nickname: db.data.topup[sender].data.nickname,
                                waktu: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
                                sn: responses.sn
                              }
                              let invoice = await generateInvoiceWithBackground(data, "./options/image/bg.jpg")
                              await sleep(200)
                              await ronzz.sendMessage(from, { image: fs.readFileSync(invoice), caption: `*✅「 TRANSAKSI SUKSES 」✅*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n*» Fee Qris:* Rp${Number(amount) - Number(db.data.topup[sender].data.price)}\n*» Total Bayar:* Rp${toRupiah(amount)}\n\n*» SN:*\n${responses.sn}\n\n_Terimakasih kak sudah order.️_` }, { quoted: m })
                              fs.unlinkSync(invoice)
                            } else {
                              let data = {
                                invoice: db.data.topup[sender].id,
                                product: product.keterangan,
                                tujuan: db.data.topup[sender].data.id,
                                nickname: "",
                                waktu: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
                                sn: responses.sn
                              }
                              let invoice = await generateInvoiceWithBackground(data, "./options/image/bg.jpg")
                              await sleep(200)
                              await ronzz.sendMessage(from, { image: fs.readFileSync(invoice), caption: `*✅「 TRANSAKSI SUKSES 」✅*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» Tujuan:* ${db.data.topup[sender].data.id}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n*» Fee Qris:* Rp${Number(amount) - Number(db.data.topup[sender].data.price)}\n*» Total Bayar:* Rp${toRupiah(amount)}\n\n*» SN:*\n${responses.sn}\n\n_Terimakasih kak sudah order.️_` }, { quoted: m })
                              fs.unlinkSync(invoice)
                            }
                            delete db.data.topup[sender]
                            break
                          }
                        }
                      })
                    }
                  } catch (error) {
                    statusPay = true

                    reply("Pesanan dibatalkan!")
                    console.log("Error checking transaction status:", error);
                    delete db.data.topup[sender]
                  }
                }
              } else if (db.data.users[sender].saldo >= db.data.topup[sender].data.price) {
                axios.get(`https://b2b.okeconnect.com/trx-v2?product=${product.kode}&dest=${db.data.topup[sender].data.id}${db.data.topup[sender].data.zone}&refID=${db.data.topup[sender].id}&memberID=${memberId}&pin=${pin}&password=${pw}`).then(async ress => {
                  if (ress.data.status == "GAGAL") {
                    reply(`Pesanan dibatalkan!\nAlasan: ${ress.data.message}`)
                    delete db.data.topup[sender]
                  } else {
                    if (product.produk == "TPG Diamond Mobile Legends" || product.produk == "TPG Genshin Impact Crystals") {
                      await Reply(`*⏳「 TRANSAKSI PENDING 」⏳*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Zone Id:* ${db.data.topup[sender].data.zone}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n_Harap ditunggu ya kak._`)
                    } else if (product.kategori == "DIGITAL") {
                      await Reply(`*⏳「 TRANSAKSI PENDING 」⏳*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n_Harap ditunggu ya kak._`)
                    } else {
                      await Reply(`*⏳「 TRANSAKSI PENDING 」⏳*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» Tujuan:* ${db.data.topup[sender].data.id}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n_Harap ditunggu ya kak._`)
                    }
                  }

                  let status = ress.data.status
                  while (status !== "SUKSES") {
                    await sleep(5000)
                    let responsed = await axios.get(`https://b2b.okeconnect.com/trx-v2?product=${product.kode}&dest=${db.data.topup[sender].data.id}${db.data.topup[sender].data.zone}&refID=${db.data.topup[sender].id}&memberID=${memberId}&pin=${pin}&password=${pw}`)
                    let responses = await responsed.data
                    status = responses.status

                    if (responses.status == "GAGAL") {
                      reply(`Pesanan dibatalkan!\nAlasan: ${responses.message}`)
                      delete db.data.topup[sender]
                      break
                    }
                    if (responses.status == "SUKSES") {
                      if (product.produk == "TPG Diamond Mobile Legends" || product.produk == "TPG Genshin Impact Crystals") {
                        let data = {
                          invoice: db.data.topup[sender].id,
                          product: product.keterangan,
                          tujuan: `${db.data.topup[sender].data.id} (${db.data.topup[sender].data.zone})`,
                          nickname: db.data.topup[sender].data.nickname,
                          waktu: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
                          sn: responses.sn
                        }
                        let invoice = await generateInvoiceWithBackground(data, "./options/image/bg.jpg")
                        await sleep(200)
                        await ronzz.sendMessage(from, { image: fs.readFileSync(invoice), caption: `*✅「 TRANSAKSI SUKSES 」✅*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Zone Id:* ${db.data.topup[sender].data.zone}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n*» SN:*\n${responses.sn}\n\n_Terimakasih kak sudah order.️_` }, { quoted: m })
                        fs.unlinkSync(invoice)
                      } else if (product.kategori == "DIGITAL") {
                        let data = {
                          invoice: db.data.topup[sender].id,
                          product: product.keterangan,
                          tujuan: db.data.topup[sender].data.id,
                          nickname: db.data.topup[sender].data.nickname,
                          waktu: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
                          sn: responses.sn
                        }
                        let invoice = await generateInvoiceWithBackground(data, "./options/image/bg.jpg")
                        await sleep(200)
                        await ronzz.sendMessage(from, { image: fs.readFileSync(invoice), caption: `*✅「 TRANSAKSI SUKSES 」✅*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» User Id:* ${db.data.topup[sender].data.id}\n*» Nickname:* ${db.data.topup[sender].data.nickname}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n*» SN:*\n${responses.sn}\n\n_Terimakasih kak sudah order.️_` }, { quoted: m })
                        fs.unlinkSync(invoice)
                      } else {
                        let data = {
                          invoice: db.data.topup[sender].id,
                          product: product.keterangan,
                          tujuan: db.data.topup[sender].data.id,
                          nickname: "",
                          waktu: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
                          sn: responses.sn
                        }
                        let invoice = await generateInvoiceWithBackground(data, "./options/image/bg.jpg")
                        await sleep(200)
                        await ronzz.sendMessage(from, { image: fs.readFileSync(invoice), caption: `*✅「 TRANSAKSI SUKSES 」✅*\n*${product.keterangan}*\n\n*» Reff Id:* ${db.data.topup[sender].id}\n*» Tujuan:* ${db.data.topup[sender].data.id}\n*» Harga:* Rp${toRupiah(db.data.topup[sender].data.price)}\n\n*» SN:*\n${responses.sn}\n\n_Terimakasih kak sudah order.️_` }, { quoted: m })
                        fs.unlinkSync(invoice)
                      }
                      await dbHelper.updateUserSaldo(sender, db.data.topup[sender].data.price, 'subtract')
                      delete db.data.topup[sender]
                      break
                    }
                  }
                })
              }
            })
          } else if (chats.toLowerCase() == "batal") {
            reply(`Baik kak, topup dengan id *${db.data.topup[sender].id}* dibatalkan.`)
            delete db.data.topup[sender]
          }
        }
      }
    }

    if (command === "payqris") {
      if (!db.data.deposit[sender]) {
        db.data.deposit[sender] = {
          ID: crypto.randomBytes(5).toString("hex").toUpperCase(),
          session: "amount",
          name: pushname,
          date: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
          number: sender,
          payment: "QRIS",
          data: {
            amount_deposit: "",
            total_deposit: ""
          }
        }
        reply("Oke kak mau deposit berapa?\n\nContoh: 15000")
      } else {
        reply("Proses deposit kamu masih ada yang belum terselesaikan.\n\nKetik *batal* untuk membatalkan.")
      }
    } else if (command === "paywallet") {
      if (!db.data.deposit[sender]) {
        db.data.deposit[sender] = {
          ID: crypto.randomBytes(5).toString("hex").toUpperCase(),
          session: "amount",
          name: pushname,
          date: moment.tz('Asia/Jakarta').format('DD MMMM YYYY'),
          number: sender,
          payment: "E-WALLET",
          data: {
            amount_deposit: "",
            total_deposit: ""
          }
        }
        reply("Oke kak mau deposit berapa?\n\nContoh: 15000")
      } else {
        reply("Proses deposit kamu masih ada yang belum terselesaikan.\n\nKetik *batal* untuk membatalkan.")
      }
    }

    if (db.data.deposit[sender]) {
      if (!m.key.fromMe) {
        if (db.data.deposit[sender].session === "amount") {
          if (isNaN(chats)) return reply("Masukan hanya angka ya")
          if (chats == "") return
          let pajakny = (Number(db.data.persentase["feeDepo"]) / 100) * Number(chats)
          let pajak2 = Number(Math.ceil(pajakny)) + Number(digit())
          db.data.deposit[sender].data.amount_deposit = Number(chats);
          db.data.deposit[sender].data.total_deposit = Number(chats) + Number(pajak2)
          db.data.deposit[sender].session = "konfirmasi_deposit";

          let teks = `*🧾 KONFIRMASI DEPOSIT 🧾*\n\n*ID:* ${db.data.deposit[sender].ID}\n*Nomor:* ${db.data.deposit[sender].number.split('@')[0]}\n*Payment:* ${db.data.deposit[sender].payment}\n*Jumlah Deposit:* Rp${toRupiah(db.data.deposit[sender].data.amount_deposit)}\n*Pajak:* Rp${toRupiah(Number(pajak2))}\n*Total Pembayaran:* Rp${toRupiah(db.data.deposit[sender].data.total_deposit)}\n\n_Deposit akan dibatalkan otomatis apabila terdapat kesalahan input._`
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'lanjut', buttonText: { displayText: 'Lanjut' }, type: 1,
              }, {
                buttonId: 'batal', buttonText: { displayText: 'Batal' }, type: 1,
              }
            ],
            headerType: 1,
            viewOnce: true,
            image: fs.readFileSync(thumbnail),
            caption: teks,
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              mentionedJid: parseMention(teks),
              externalAdReply: {
                title: botName,
                body: `By ${ownerName}`,
                thumbnailUrl: ppuser,
                sourceUrl: '',
                mediaType: 1,
                renderLargerThumbnail: false
              }
            }
          }, { quoted: m });
        } else if (db.data.deposit[sender].session === "konfirmasi_deposit") {
          if (chats.toLowerCase() === "lanjut") {
            if (db.data.deposit[sender].payment === "QRIS") {
              let pay = await qrisDinamis(`${db.data.deposit[sender].data.total_deposit}`, "./options/sticker/qris.jpg")
              let time = Date.now() + toMs("30m");
              let expirationTime = new Date(time);
              let timeLeft = Math.max(0, Math.floor((expirationTime - new Date()) / 60000));
              let currentTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
              let expireTimeJakarta = new Date(currentTime.getTime() + timeLeft * 60000);
              let hours = expireTimeJakarta.getHours().toString().padStart(2, '0');
              let minutes = expireTimeJakarta.getMinutes().toString().padStart(2, '0');
              let formattedTime = `${hours}:${minutes}`

              await sleep(1000)
              let pyqrs = `*🧾 MENUNGGU PEMBAYARAN 🧾*
 
*A/N:* ${payment.qris.an}

_Silahkan scan dan transfer dengan nominal yang benar, jika sudah bot akan otomatis konfirmasi deposit._`
              let mess = await ronzz.sendMessage(from, { image: fs.readFileSync(pay), caption: pyqrs }, { quoted: m })

              while (db.data.deposit[sender] !== undefined) {
                await sleep(10000)
                if (Date.now() >= time) {
                  await ronzz.sendMessage(from, { delete: mess.key })
                  reply("Deposit dibatalkan karena telah melewati batas expired.")
                  delete db.data.deposit[sender]
                }
                try {
                  let orkut = new OrderKuota(db.data.orkut["username"], db.data.orkut["authToken"])
                  let response = await orkut.getTransactionQris()
                  let result = response.qris_history.results.find(i => i.status == "IN" && Number(i.kredit.replace(/[.]/g, '')) == parseInt(db.data.deposit[sender].data.total_deposit))

                  if (result !== undefined) {
                    await ronzz.sendMessage(from, { delete: mess.key })

                    let text_sukses = `*✅「 DEPOSIT SUKSES 」✅*

ID: ${db.data.deposit[sender].ID}
Nomer: @${db.data.deposit[sender].number.split('@')[0]}
Payment: ${db.data.deposit[sender].payment}
Tanggal: ${db.data.deposit[sender].date.split(' ')[0]}
Jumlah Deposit: Rp${toRupiah(db.data.deposit[sender].data.amount_deposit)}
Pajak: Rp${toRupiah(Number(db.data.deposit[sender].data.total_deposit) - Number(db.data.deposit[sender].data.amount_deposit))}
Total Bayar: Rp${toRupiah(db.data.deposit[sender].data.total_deposit)}`
                    await ronzz.sendMessage(from, {
                      footer: `${botName} © ${ownerName}`,
                      buttons: [
                        {
                          buttonId: 'saldo', buttonText: { displayText: 'Saldo' }, type: 1,
                        }
                      ],
                      headerType: 1,
                      viewOnce: true,
                      image: fs.readFileSync(thumbnail),
                      caption: `${text_sukses}\n\n_Deposit kamu telah dikonfirmasi otomatis oleh bot, silahkan cek saldo Anda.`,
                      contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        mentionedJid: parseMention(text_sukses),
                        externalAdReply: {
                          title: botName,
                          body: `By ${ownerName}`,
                          thumbnailUrl: ppuser,
                          sourceUrl: '',
                          mediaType: 1,
                          renderLargerThumbnail: false
                        }
                      }
                    }, { quoted: m });


                    await dbHelper.updateUserSaldo(sender, Number(db.data.deposit[sender].data.amount_deposit), 'add')
                    delete db.data.deposit[sender]
                  }
                } catch (error) {
                  reply("Deposit dibatalkan!")
                  console.log("Error checking transaction status:", error);
                  delete db.data.deposit[sender]
                }
              }
              fs.unlinkSync(pay)
            } else if (db.data.deposit[sender].payment === "E-WALLET") {
              let py_dana = `*PAYMENT E-WALLET*

*DANA*
NOMER: ${payment.dana.nope}
A/N: ${payment.dana.an}

*GOPAY*
NOMER: ${payment.gopay.nope}
A/N: ${payment.gopay.an}

*OVO*
NOMER: ${payment.ovo.nope}
A/N: ${payment.ovo.an}

_Silahkan transfer dengan nomor yang sudah tertera, jika sudah harap kirim bukti foto dengan caption *bukti* untuk di acc oleh Admin._`
              reply(py_dana)
            }
          } else if (chats.toLowerCase() === "batal") {
            reply(`Baik kak, deposit dengan ID: ${db.data.deposit[sender].ID} dibatalkan`)
            delete db.data.deposit[sender]
          }
        }
      }
    }

    if (isGroup && isAlreadyResponList(from, chats.toLowerCase())) {
      let get_data_respon = getDataResponList(from, chats.toLowerCase())
      if (get_data_respon.isImage === false) {
        ronzz.sendMessage(from, { text: sendResponList(from, chats.toLowerCase()) }, {
          quoted: m
        })
      } else {
        ronzz.sendMessage(from, { image: { url: get_data_respon.image_url }, caption: get_data_respon.response }, {
          quoted: m
        })
      }
    }

    if (isAlreadyResponTesti(chats.toLowerCase())) {
      var get_data_respon = getDataResponTesti(chats.toLowerCase())
      ronzz.sendMessage(from, { image: { url: get_data_respon.image_url }, caption: get_data_respon.response }, { quoted: m })
    }

    if (isGroup && db.data.chat[from].antilink) {
      let gc = await ronzz.groupInviteCode(from)
      if (chats.match(/(`https:\/\/chat.whatsapp.com\/${gc}`)/gi)) {
        if (!isBotGroupAdmins) return
        reply(`*GROUP LINK DETECTOR*\n\nAnda tidak akan dikick oleh bot, karena yang anda kirim adalah link group ini.`)
      } else if ((chats.match("http://") || chats.match("https://") || chats.match("wa.me") || chats.match("t.me")) && !chats.match(`https://chat.whatsapp.com/${gc}`)) {
        if (!isBotGroupAdmins) return
        if (!isOwner && !isGroupAdmins) {
          await ronzz.sendMessage(from, { delete: m.key })
          ronzz.sendMessage(from, { text: `*LINK DETECTOR*\n\nMaaf @${sender.split('@')[0]}, sepertinya kamu mengirimkan link, maaf kamu akan di kick.`, mentions: [sender] })
          await sleep(500)
          ronzz.groupParticipantsUpdate(from, [sender], "remove")
        }
      }
    }

    if (isGroup && db.data.chat[from].antilink2) {
      let gc = await ronzz.groupInviteCode(from)
      if ((chats.match("http://") || chats.match("https://") || chats.match("wa.me") || chats.match("t.me")) && !chats.match(`https://chat.whatsapp.com/${gc}`)) {
        if (!isBotGroupAdmins) return
        if (!isOwner && !isGroupAdmins) {
          await ronzz.sendMessage(from, { delete: m.key })
          ronzz.sendMessage(from, { text: `*LINK DETECTOR*\n\nMaaf @${sender.split('@')[0]}, sepertinya kamu mengirimkan link, lain kali jangan kirim link yaa.`, mentions: [sender] })
        }
      }
    }

    if (db.data.setting[botNumber].autoread) ronzz.readMessages([m.key])
    if (db.data.setting[botNumber].autoketik) ronzz.sendPresenceUpdate('composing', from)
    if (chats) console.log('->[\x1b[1;32mCMD\x1b[1;37m]', color(moment(m.messageTimestamp * 1000).format('DD/MM/YYYY HH:mm:ss'), 'yellow'), color(`${prefix + command} [${args.length}]`), 'from', color(pushname), isGroup ? 'in ' + color(groupName) : '')

    // 🔔 Auto-forward pesan yang mengandung kata "zoom" ke grup admin
    if (!fromMe && budy.toLowerCase().includes('zoom')) {
      try {
        let targetGroupId = global.adminGroupId

        // Jika ID grup admin tidak di-set, cari grup berdasarkan nama
        if (!targetGroupId && global.adminGroupName) {
          const groups = await ronzz.groupFetchAllParticipating()
          const targetGroup = Object.values(groups).find(g =>
            g.subject && g.subject.toLowerCase().includes(global.adminGroupName.toLowerCase())
          )
          if (targetGroup) {
            targetGroupId = targetGroup.id
          }
        }

        if (targetGroupId) {
          const forwardText = `🔔 *NOTIFIKASI ZOOM REQUEST*\n\n` +
            `👤 Dari: @${sender.split('@')[0]}\n` +
            `📝 Nama: ${pushname}\n` +
            `💬 Chat: ${isGroup ? `Grup "${groupName}"` : 'Private Chat'}\n` +
            `⏰ Waktu: ${moment(m.messageTimestamp * 1000).format('DD/MM/YYYY HH:mm:ss')}\n\n` +
            `📩 Pesan:\n${budy}`

          await ronzz.sendMessage(targetGroupId, {
            text: forwardText,
            mentions: [sender]
          })

          console.log(`✅ [ZOOM-FORWARD] Pesan dari ${pushname} di-forward ke grup admin`)
        } else {
          console.warn(`⚠️ [ZOOM-FORWARD] Grup admin "${global.adminGroupName}" tidak ditemukan`)
        }
      } catch (err) {
        console.error(`❌ [ZOOM-FORWARD] Error:`, err.message)
      }
    }

    switch (command) {
      case 'testmsg':
        if (!isOwner) return reply('❌ Hanya owner yang dapat menggunakan command ini')

        if (!q) return reply('❌ Format: .testmsg <nomor_whatsapp>\nContoh: .testmsg 6281234567890')

        const testNumber = q.trim() + '@s.whatsapp.net'
        console.log('🧪 Testing message delivery to:', testNumber)

        try {
          // Test 1: Simple message
          await ronzz.sendMessage(testNumber, { text: '🧪 Test 1: Pesan sederhana - apakah sampai?' })
          console.log('✅ Test 1 sent')

          await sleep(2000)

          // Test 2: Formatted message
          const testMsg = `*🧪 TEST MESSAGE 2*
*Format:* Test dengan format
*Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}
*Jam:* ${jamwib} WIB

📧 Test: example@test.com
🔐 Test: password123

Jika pesan ini sampai, sistem berfungsi normal.`

          await ronzz.sendMessage(testNumber, { text: testMsg })
          console.log('✅ Test 2 sent')

          reply(`✅ Test messages sent to ${q}. Check if received.`)

        } catch (error) {
          console.error('❌ Test message failed:', error)
          reply(`❌ Failed to send test message: ${error.message}`)
        }
        break

      case 'resendakun':
        if (!isOwner) return reply('❌ Hanya owner yang dapat menggunakan command ini')

        if (!q) return reply('❌ Format: .resendakun <nomor_customer> <product_id> <jumlah>\nContoh: .resendakun 6281234567890 vid3u 1')

        const [customerNum, productId, amount] = q.split(' ')
        if (!customerNum || !productId || !amount) {
          return reply('❌ Format: .resendakun <nomor_customer> <product_id> <jumlah>\nContoh: .resendakun 6281234567890 vid3u 1')
        }

        if (!db.data.produk[productId]) {
          return reply(`❌ Product ID ${productId} tidak ditemukan`)
        }

        const customerNumber = customerNum + '@s.whatsapp.net'
        const qty = parseInt(amount)

        if (db.data.produk[productId].stok.length < qty) {
          return reply(`❌ Stok tidak cukup. Stok tersedia: ${db.data.produk[productId].stok.length}`)
        }

        try {
          // Ambil stok untuk dikirim (simulasi pembelian)
          let accountData = []
          for (let i = 0; i < qty; i++) {
            accountData.push(db.data.produk[productId].stok[i])
          }

          // Buat pesan detail akun
          let accountDetails = `*📦 RESEND AKUN MANUAL*\n\n`
          accountDetails += `*Produk:* ${db.data.produk[productId].name}\n`
          accountDetails += `*Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}\n`
          accountDetails += `*Jam:* ${jamwib} WIB\n\n`

          accountData.forEach((item, index) => {
            let dataAkun = item.split("|")
            accountDetails += `*═══ AKUN ${index + 1} ═══*\n`
            accountDetails += `📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`
            accountDetails += `🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`
            if (dataAkun[2]) accountDetails += `👤 Profil: ${dataAkun[2]}\n`
            if (dataAkun[3]) accountDetails += `🔢 Pin: ${dataAkun[3]}\n`
            if (dataAkun[4]) accountDetails += `🔒 2FA: ${dataAkun[4]}\n\n`
          })

          // Kirim ke customer
          await ronzz.sendMessage(customerNumber, { text: accountDetails })
          console.log('✅ Manual account resend successful')

          reply(`✅ Detail akun berhasil dikirim ulang ke ${customerNum}\n\nProduk: ${db.data.produk[productId].name}\nJumlah: ${qty} akun`)

        } catch (error) {
          console.error('❌ Manual resend failed:', error)
          reply(`❌ Gagal mengirim ulang akun: ${error.message}`)
        }
        break

      case 'stok': case 'stock': {
        try {
          // Check database structure
          if (!db?.data?.produk) {
            return reply("❌ Database tidak tersedia atau rusak")
          }

          const products = db.data.produk
          if (Object.keys(products).length === 0) {
            return reply("📦 Belum ada produk di database")
          }

          let teks = `*╭────〔 PRODUCT LIST📦 〕─*\n`
          teks += `*┊・* Cara membeli:\n`
          teks += `*┊・* 1. Buynow (QRIS Otomatis): ${prefix}buynow kodeproduk jumlah\n`
          teks += `*┊・*    Contoh: ${prefix}buynow netflix 2\n`
          teks += `*┊・* 2. Buy (Saldo): ${prefix}buy kodeproduk jumlah\n`
          teks += `*┊・*    Contoh: ${prefix}buy netflix 2\n`
          teks += `*┊・* Kontak Admin: @${ownerNomer}\n`
          teks += `*┊・* _⏰ Pesan ini akan terhapus otomatis dalam 5 menit_\n`
          teks += `*╰┈┈┈┈┈┈┈┈*\n\n`

          // Convert products to array and sort by sales (terjual) in descending order
          const productsArray = Object.keys(products).map(productId => ({
            id: productId,
            ...products[productId]
          })).sort((a, b) => (b.terjual || 0) - (a.terjual || 0))

          // Process each product safely
          for (const produk of productsArray) {
            const productId = produk.id
            try {
              if (!produk) continue

              // Safe property access with defaults
              const name = produk.name || 'Unknown'
              const desc = produk.desc || 'Tidak ada deskripsi'
              const stokLength = Array.isArray(produk.stok) ? produk.stok.length : 0
              const terjual = produk.terjual || 0

              // Get price safely
              let harga = 'Harga tidak tersedia'
              try {
                if (typeof hargaProduk === 'function' && typeof toRupiah === 'function') {
                  const userRole = db.data.users?.[sender]?.role || 'bronze'
                  const hargaValue = hargaProduk(productId, userRole)
                  if (hargaValue && !isNaN(hargaValue)) {
                    harga = `Rp${toRupiah(hargaValue)}`
                  }
                }
              } catch (error) {
                console.log(`⚠️ Error getting price for product ${productId}:`, error.message)
              }

              // Build product info
              teks += `*╭──〔 ${name} 〕─*\n`
              teks += `*┊・ 🔐| Kode:* ${productId}\n`
              teks += `*┊・ 🏷️| Harga:* ${harga}\n`
              teks += `*┊・ 📦| Stok:* ${stokLength}\n`
              teks += `*┊・ 🧾| Terjual:* ${terjual}\n`
              teks += `*┊・ 📝| Desk:* ${desc}\n`
              teks += `*┊・ ✍️| Beli:* ${prefix}buy ${productId} 1\n`
              teks += `*╰┈┈┈┈┈┈┈┈*\n\n`

            } catch (error) {
              console.log(`⚠️ Error processing product ${productId}:`, error.message)
              // Continue with next product instead of breaking
            }
          }

          // Send the message
          const sentMessage = await ronzz.sendMessage(from, {
            text: teks,
            mentions: [ownerNomer + "@s.whatsapp.net"]
          }, { quoted: m })

          scheduleAutoDelete(sentMessage.key, from, 300000, 'stok list message')

        } catch (error) {
          console.error('❌ Error in stok command:', error)
          reply(`❌ Terjadi kesalahan pada command stok: ${error.message}`)
        }
      }
        break

      case 'addproduk': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[5]) return reply(`Contoh: ${prefix + command} id|namaproduk|deskripsi|snk|harga bronze|harga silver|harga gold|profit`)
        if (db.data.produk[data[0]]) return reply(`Produk dengan ID ${data[0]} sudah ada di database`)

        db.data.produk[data[0]] = {
          id: data[0],
          name: data[1],
          desc: data[2],
          snk: data[3],
          priceB: data[4],
          priceS: data[5],
          priceG: data[6],
          profit: data[7],
          terjual: 0,
          stok: []
        }

        // Schedule save after product added
        if (typeof global.scheduleSave === 'function') {
          global.scheduleSave();
        }

        reply(`Berhasil menambahkan produk *${data[1]}*`)
      }
        break

      case 'delproduk': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} idproduk`)
        if (!db.data.produk[q]) return reply(`Produk dengan ID *${q}* tidak ada di database`)

        delete db.data.produk[q]

        // Schedule save after product deleted
        if (typeof global.scheduleSave === 'function') {
          global.scheduleSave();
        }

        reply(`Berhasil delete produk *${q}*`)
      }
        break

      case 'setharga': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[2]) return reply(`Contoh: ${prefix + command} idproduk|role|harga`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)

        if (data[1].toLowerCase() == "bronze") {
          db.data.produk[data[0]].priceB = Number(data[2])
          reply(`Berhasil set harga produk dengan ID *${data[0]}* menjadi Rp${toRupiah(Number(data[2]))}`)
        } else if (data[1].toLowerCase() == "silver") {
          db.data.produk[data[0]].priceS = Number(data[2])
          reply(`Berhasil set harga produk dengan ID *${data[0]}* menjadi Rp${toRupiah(Number(data[2]))}`)
        } else if (data[1].toLowerCase() == "gold") {
          db.data.produk[data[0]].priceG = Number(data[2])
          reply(`Berhasil set harga produk dengan ID *${data[0]}* menjadi Rp${toRupiah(Number(data[2]))}`)
        } else {
          reply("Role tersedia\n- bronze\n- silver\n- gold")
        }

        // Schedule save after product price updated
        if (typeof global.scheduleSave === 'function') {
          global.scheduleSave();
        }
      }
        break

      case 'setjudul': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk|namaproduk`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)

        db.data.produk[data[0]].name = data[1]

        // Schedule save after product name updated
        if (typeof global.scheduleSave === 'function') {
          global.scheduleSave();
        }

        reply(`Berhasil set judul produk dengan ID *${data[0]}* menjadi *${data[1]}*`)
      }
        break

      case 'setdesk': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk|deskripsi`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)

        db.data.produk[data[0]].desc = data[1]

        // Schedule save after product description updated
        if (typeof global.scheduleSave === 'function') {
          global.scheduleSave();
        }

        reply(`Berhasil set deskripsi produk dengan ID *${data[0]}*`)
      }
        break

      case 'setsnk': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk|snk`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)

        db.data.produk[data[0]].snk = data[1]

        // Schedule save after product SNK updated
        if (typeof global.scheduleSave === 'function') {
          global.scheduleSave();
        }

        reply(`Berhasil set SNK produk dengan ID *${data[0]}*`)
      }
        break

      case 'setprofit': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk|snk`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)

        db.data.produk[data[0]].profit = Number(data[1])
        reply(`Berhasil set profit produk dengan ID *${data[0]}*`)
      }
        break

      case 'setkode': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idlama|idbaru`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)

        db.data.produk[data[0]].id = data[1]
        db.data.produk[data[1]] = db.data.produk[data[0]]
        reply(`Berhasil set kode produk dengan ID *${data[0]}* menjadi *${data[1]}*`)
        delete db.data.produk[data[0]]
      }
        break

      case 'addstok': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split(",")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk,email1@gmail.com|password1|profil1|pin1|2fa1\nemail2@gmail.com|password2|profil2|pin2|2fa2\n\n*NOTE*\nJika tidak ada Profil, Pin, 2FA, kosongkan saja atau dikasih tanda strip (-)`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada`)

        let dataStok = data[1].split("\n").map(i => i.trim())
        db.data.produk[data[0]].stok.push(...dataStok)

        reply(`Berhasil menambahkan stok sebanyak ${dataStok.length}`)
      }
        break

      case 'delstok': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} idproduk`)
        if (!db.data.produk[q]) return reply(`Produk dengan ID *${q}* tidak ada`)

        db.data.produk[q].stok = []

        reply(`Berhasil delete stok produk *${q}*`)
      }
        break

        // ====== CONFIG & IMPORT ======
        // using top-level fs and axios imports

        // Ganti sesuai punyamu / .env
        const PG_ENDPOINT = process.env.PG_ENDPOINT || "https://api-pg.nicola.id";
        const PG_API_KEY = process.env.PG_API_KEY || "kodeku";

        // QRIS statis GoPay Merchant dari kamu (JANGAN DIUBAH)

        // ====== UTIL: Rupiah (fallback kalau belum ada) ======
        function toRupiahLocal(num) {
          try {
            if (typeof toRupiah === "function") return toRupiah(num);
          } catch { }
          const n = Number(num) || 0;
          return n.toLocaleString("id-ID");
        }

        // ====== UTIL: Waktu Indonesia ======
        function nowJakarta() {
          return moment.tz("Asia/Jakarta");
        }
        function formatClockJakarta(ts) {
          return moment(ts).tz("Asia/Jakarta").format("HH:mm");
        }

        // ====== UTIL: CRC16-CCITT (0x1021) untuk EMV ======
        function crc16ccitt(payload) {
          let crc = 0xFFFF;
          for (let i = 0; i < payload.length; i++) {
            crc ^= payload.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
              if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
              else crc <<= 1;
              crc &= 0xFFFF;
            }
          }
          return crc.toString(16).toUpperCase().padStart(4, "0");
        }

        // ====== UTIL: Build TLV ======
        function tlv(tag, value) {
          const len = String(value.length).padStart(2, "0");
          return `${tag}${len}${value}`;
        }

        // ====== QRIS Dinamis dari QRIS statis ======
        // - Set Tag 54 (Amount)
        // - Set Tag 62 (Additional Data) sub-tag 01 (Bill Number) & 05 (Reference ID) = reffId
        // - Recompute CRC Tag 63
        function generateDynamicQrisFromStatic(baseQris, amount, reffId) {
          if (!baseQris || !amount || amount <= 0) throw new Error("QRIS/amount invalid");

          // Buang CRC lama: cari "6304" (Tag 63 len 04)
          const idxCrc = baseQris.indexOf("6304");
          const withoutCRC = idxCrc > -1 ? baseQris.slice(0, idxCrc) : baseQris;

          // Bersihkan Tag 54 (Amount) & Tag 62 (Additional Data) jika ada
          let payload = withoutCRC
            .replace(/54\d{2}[\d.]+/g, "")      // amount
            .replace(/62\d{2}[0-9A-Za-z]+/g, ""); // additional data

          // Pastikan amount tanpa desimal (IDR)
          const amountStr = String(Math.floor(Number(amount)));

          // Build Tag 62 (01=Bill Number, 05=Reference ID)
          const tag62Value = tlv("01", reffId) + tlv("05", reffId);
          const tag62 = tlv("62", tag62Value);

          // Sisipkan Tag 54 dan Tag 62 di akhir (sebelum CRC)
          payload = payload + tlv("54", amountStr) + tag62;

          // Hitung CRC baru
          const withCrcHeader = payload + "6304";
          const crc = crc16ccitt(withCrcHeader);

          // Hasil final
          return withCrcHeader + crc;
        }

        // ====== Validasi pembayaran via backend listener ======
        // Strategi: cari notifikasi terbaru setelah pembuatan QR, dengan:
        // - amountDetected == totalAmount (string/number sama2 dibandingkan)
        // - package_name "com.gojek.gopaymerchant" atau appName "GOPAY"/"GOJEK" (kalau ada)
        // - posted_at >= createdAt
        async function checkPaymentViaPG({ totalAmount, createdAtISO, deviceId = null }) {
          const url = `${PG_ENDPOINT}/notifications?limit=50` + (deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : "");
          const headers = { "X-API-Key": PG_API_KEY };

          const res = await axios.get(url, { headers, timeout: 10000 });
          const items = Array.isArray(res.data) ? res.data : [];

          const createdAt = new Date(createdAtISO).getTime();

          const match = items.find(n => {
            try {
              const postedAt = n.posted_at ? new Date(n.posted_at).getTime() : 0;
              const amt = String(n.amountDetected || "").replace(/\D/g, "");
              const want = String(totalAmount);
              const appOk = (n.packageName === "com.gojek.gopaymerchant") || (String(n.appName || "").toUpperCase().includes("GOPAY")) || (String(n.appName || "").toUpperCase().includes("GOJEK"));
              const textOk = /menerima|received/i.test(String(n.text || "")) || /masuk/i.test(String(n.text || ""));
              return appOk && textOk && postedAt >= createdAt && amt === want;
            } catch {
              return false;
            }
          });

          return !!match;
        }



      case 'deposit': {
        const parts = (q || '').trim().split(/\s+/).filter(Boolean)
        if (!parts[0]) return reply(`Contoh: ${prefix + command} 10000`)
        const baseAmount = Number(parts[0])
        if (!Number.isFinite(baseAmount) || baseAmount <= 0) return reply("Nominal harus berupa angka lebih dari 0")

        if (!db.data.users[sender]) db.data.users[sender] = { saldo: 0, role: 'bronze' }
        if (!db.data.orderDeposit) db.data.orderDeposit = {}
        if (db.data.orderDeposit[sender]) return reply(`Kamu sedang memiliki deposit yang belum selesai. Ketik *${prefix}batal* untuk membatalkan.`)

        const reffId = crypto.randomBytes(5).toString("hex").toUpperCase()
        const uniqueCode = Math.floor(1 + Math.random() * 99)
        const totalAmount = baseAmount + uniqueCode
        // Bonus Rp2.000 per Rp50.000 topup (minimal Rp50.000; contoh: 50.000 -> 2.000; 100.000 -> 4.000)
        const bonus = baseAmount >= 50000 ? Math.floor(baseAmount / 50000) * 2000 : 0
        // Catat waktu pembuatan order untuk menghindari match notifikasi lama
        const createdAtTs = Date.now()

        db.data.orderDeposit[sender] = { status: 'processing', reffId, metode: 'QRIS', startedAt: createdAtTs, baseAmount, totalAmount, uniqueCode, bonus }

        try {
          reply("Sedang membuat QR Code...")

          const orderId = `DEP-${reffId}-${Date.now()}`
          // Gunakan QRIS dinamis (sama seperti buynow)
          const qrImagePath = await qrisDinamis(`${totalAmount}`, "./options/sticker/qris.jpg")
          console.log(`✅ [DEPOSIT] QRIS dinamis generated: ${orderId}, Amount: Rp${totalAmount}`)

          const expirationTime = Date.now() + toMs("30m")
          const expireDate = new Date(expirationTime)
          const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000))
          const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
          const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000)
          const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`

          const caption = `*🧾 MENUNGGU PEMBAYARAN DEPOSIT 🧾*\n\n` +
            `*Nominal:* Rp${toRupiah(baseAmount)}\n` +
            `*Bonus:* Rp${toRupiah(bonus)} (Rp2.000 tiap kelipatan Rp50.000)\n` +
            `*Kode Unik:* *${uniqueCode}*\n` +
            `*Total Transfer:* *Rp${toRupiah(totalAmount)}*\n` +
            `*Order ID:* ${orderId}\n` +
            `*Waktu:* ${timeLeft} menit\n\n` +
            `📱 *Cara Bayar:*\n` +
            `1. Scan QRIS di atas dengan aplikasi pembayaran Anda\n` +
            `2. *Nominal sudah ter-set otomatis: Rp${toRupiah(totalAmount)}*\n` +
            `   (Rp${toRupiah(baseAmount)} + *kode unik ${uniqueCode}*)\n` +
            `3. Konfirmasi pembayaran di aplikasi\n` +
            `4. *Pembayaran akan terdeteksi otomatis via webhook*\n\n` +
            `⏰ Batas waktu: sebelum ${formattedTime}\n` +
            `Ketik *${prefix}batal* untuk membatalkan.`

          // Improvement: Async file read
          const qrImage = await fs.promises.readFile(qrImagePath)
          const message = await ronzz.sendMessage(from, {
            image: qrImage,
            caption: caption
          }, { quoted: m })

          db.data.orderDeposit[sender] = {
            from,
            key: message.key,
            orderId,
            reffId,
            baseAmount,
            totalAmount,
            uniqueCode,
            bonus,
            metode: 'QRIS', // Pastikan metode di-set untuk global listener
            createdAt: createdAtTs
          }

          console.log(`📝 [DEPOSIT] Order created: ${orderId}, Amount: Rp${totalAmount}, Sender: ${sender}`)

          // Setup webhook listener untuk payment-completed event
          const paymentListener = async (webhookData) => {
            try {
              const { orderId: webhookOrderId, transactionStatus, gross_amount } = webhookData;

              // Match berdasarkan totalAmount
              const order = db.data.orderDeposit[sender];
              if (!order) return; // Order sudah tidak ada

              const webhookAmount = Number(gross_amount || webhookData.gross_amount || 0);
              const orderAmount = Number(totalAmount);
              const amountDiff = Math.abs(webhookAmount - orderAmount);
              const isAmountMatch = amountDiff < 1; // Tolerance untuk handle decimal
              const isStatusPaid = /(settlement|capture)/i.test(String(transactionStatus));

              console.log(`🔍 [DEPOSIT-LOCAL] Checking webhook: Amount Rp${webhookAmount}, Order Amount Rp${orderAmount}, Diff: Rp${amountDiff.toFixed(2)}, Match: ${isAmountMatch}`);

              // Match jika amount sama (dengan tolerance) dan status paid
              if (isAmountMatch && isStatusPaid) {
                console.log(`✅ [DEPOSIT] Webhook payment detected: ${orderId}, Amount: ${webhookAmount}`);

                // Remove listener setelah payment detected
                process.removeListener('payment-completed', paymentListener);

                await ronzz.sendMessage(from, { delete: message.key });

                const credit = baseAmount + bonus + uniqueCode
                const previousSaldo = Number(db.data.users[sender].saldo || 0)
                db.data.users[sender].saldo = previousSaldo + credit
                try { setCachedSaldo(sender, db.data.users[sender].saldo) } catch { }

                const newSaldo = db.data.users[sender].saldo

                // Improvement: Optimize string building
                const successParts = [
                  `✅ DEPOSIT BERHASIL`,
                  '',
                  `Saldo sebelum: Rp${toRupiah(previousSaldo)}`,
                  `Bertambah: Rp${toRupiah(credit)}`,
                  `Saldo sesudah: Rp${toRupiah(newSaldo)}`
                ]
                const successText = successParts.join('\n')

                try {
                  await dbHelper.recordSaldoHistory({
                    userId: sender,
                    action: 'deposit',
                    method: 'qris',
                    source: 'deposit',
                    amount: credit,
                    before: previousSaldo,
                    after: newSaldo,
                    actor: sender,
                    refId: orderId,
                    notes: `Bonus: Rp${toRupiah(bonus)}`
                  })
                } catch (historyError) {
                  console.error('❌ [DEPOSIT] Failed to record saldo history:', historyError.message)
                }

                try {
                  if (!db.data.transaksi) db.data.transaksi = []
                  const depositTransaction = {
                    id: 'DEPOSIT',
                    name: 'Deposit Saldo',
                    price: credit,
                    date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
                    profit: 0,
                    jumlah: 1,
                    user: sender.split("@")[0],
                    userRole: db.data.users[sender]?.role || 'bronze',
                    reffId: orderId,
                    metodeBayar: 'Deposit',
                    status: 'completed',
                    totalBayar: credit,
                    type: 'deposit'
                  }
                  db.data.transaksi.push(depositTransaction)
                  if (typeof global.scheduleSave === 'function') {
                    global.scheduleSave()
                  }
                } catch (transactionError) {
                  console.error('❌ [DEPOSIT] Failed to record deposit transaction:', transactionError.message)
                }

                await ronzz.sendMessage(from, { text: successText }, { quoted: m })

                delete db.data.orderDeposit[sender]
                await db.save()
                console.log(`✅ [DEPOSIT] Transaction completed via webhook: ${orderId} - ${reffId}`);
              }
            } catch (error) {
              console.error(`❌ [DEPOSIT] Error in webhook listener:`, error.message);
            }
          };

          // Register webhook listener
          process.on('payment-completed', paymentListener);

          // Polling untuk timeout handling (jika webhook tidak datang)
          let pollInterval = 2000; // Mulai dari 2 detik (lebih cepat)
          const maxInterval = 10000; // Maksimal 10 detik (lebih cepat)
          let pollCount = 0

          while (db.data.orderDeposit[sender]) {
            await sleep(pollInterval)

            if (pollCount < 10) {
              pollInterval = Math.min(Math.floor(pollInterval * 1.2), maxInterval)
            }
            pollCount++

            if (Date.now() >= expirationTime) {
              // Remove listener saat timeout
              process.removeListener('payment-completed', paymentListener);
              await ronzz.sendMessage(from, { delete: message.key })
              reply("Deposit dibatalkan karena melewati batas waktu 30 menit.")
              delete db.data.orderDeposit[sender]
              break
            }

            // Fallback: Cek webhook dari PostgreSQL database (karena dashboard-api dan bot-wa adalah process terpisah)
            if (pollCount % 2 === 0) { // Cek setiap 2 polling cycle (sekitar 4-8 detik) - lebih cepat untuk deteksi
              try {
                if (usePg && pg) {
                  // Query dari PostgreSQL
                  const orderAmount = Number(totalAmount);
                  const tolerance = 1; // Tolerance 1 rupiah untuk handle decimal

                  const result = await pg.query(
                    `SELECT id, order_id, transaction_id, transaction_status, payment_type, gross_amount, settlement_time, webhook_data
               FROM midtrans_webhooks
               WHERE processed = false 
                 AND transaction_status IN ('settlement', 'capture')
                 AND ABS(gross_amount - $1) < $2
               ORDER BY created_at DESC
               LIMIT 10`,
                    [orderAmount, tolerance]
                  );

                  if (result.rows.length > 0) {
                    console.log(`🔍 [DEPOSIT] Found ${result.rows.length} unprocessed webhooks from PostgreSQL, looking for amount Rp${orderAmount}`);
                  }

                  for (const row of result.rows) {
                    const webhookAmount = Number(row.gross_amount || 0);
                    const amountDiff = Math.abs(webhookAmount - orderAmount);
                    const isAmountMatch = amountDiff < tolerance;

                    console.log(`  - Webhook: Amount Rp${webhookAmount} (${typeof row.gross_amount}), Order Amount Rp${orderAmount}, Diff: Rp${amountDiff.toFixed(2)}, Match: ${isAmountMatch}`);

                    if (isAmountMatch) {
                      console.log(`✅ [DEPOSIT] Payment detected via PostgreSQL webhook: Amount Rp${webhookAmount}, OrderID: ${row.order_id}`);

                      // Mark as processed di PostgreSQL
                      await pg.query(
                        `UPDATE midtrans_webhooks 
                   SET processed = true, processed_at = now() 
                   WHERE id = $1`,
                        [row.id]
                      );

                      // Trigger same processing as webhook listener
                      paymentListener({
                        orderId: row.order_id || orderId,
                        transactionStatus: row.transaction_status,
                        gross_amount: webhookAmount,
                        paymentType: row.payment_type,
                        settlementTime: row.settlement_time
                      });
                      break;
                    }
                  }
                } else {
                  // Fallback ke JSON database jika PostgreSQL tidak tersedia
                  const webhooks = db.data.midtransWebhooks || [];
                  const unprocessedWebhooks = webhooks.filter(w => !w.processed && w.gross_amount);

                  if (unprocessedWebhooks.length > 0) {
                    console.log(`🔍 [DEPOSIT] Checking ${unprocessedWebhooks.length} unprocessed webhooks from JSON, looking for amount Rp${totalAmount}`);
                  }

                  for (const webhook of unprocessedWebhooks) {
                    const webhookAmount = Number(webhook.gross_amount || 0);
                    const amountDiff = Math.abs(webhookAmount - Number(totalAmount));
                    const isAmountMatch = amountDiff < 1;
                    const isStatusPaid = /(settlement|capture)/i.test(String(webhook.transactionStatus));

                    console.log(`  - Webhook: Amount Rp${webhookAmount}, Status: ${webhook.transactionStatus}, Diff: Rp${amountDiff.toFixed(2)}, Match: ${isAmountMatch}`);

                    if (isAmountMatch && isStatusPaid) {
                      console.log(`✅ [DEPOSIT] Payment detected via JSON webhook: Amount Rp${webhookAmount}, OrderID: ${webhook.orderId}`);

                      // Mark as processed
                      webhook.processed = true;
                      if (typeof db.save === 'function') {
                        await db.save();
                      }

                      // Trigger same processing as webhook listener
                      paymentListener({
                        orderId: webhook.orderId || orderId,
                        transactionStatus: webhook.transactionStatus,
                        gross_amount: webhook.gross_amount
                      });
                      break;
                    }
                  }
                }
              } catch (dbError) {
                // Ignore database errors
                console.log(`⚠️ [DEPOSIT] Database webhook check failed:`, dbError.message);
              }
            }
          }

          // Remove listener jika loop selesai (timeout atau payment detected)
          try {
            process.removeListener('payment-completed', paymentListener);
          } catch { }
        } catch (error) {
          console.error(`Error creating QRIS DEPOSIT for ${sender}:`, error)
          reply("Gagal membuat QR Code deposit. Silakan coba lagi.")
          delete db.data.orderDeposit[sender]
        }
      }
        break;

      case 'buynow': {
        // 🛡️ RATE LIMIT: Prevent spam (max 3 mid per minute for non-owners)
        if (!isOwner) {
          const rateLimit = await checkRateLimit(sender, 'mid', 3, 60)
          if (!rateLimit.allowed) {
            return reply(`⚠️ *Terlalu banyak request!*\n\nAnda sudah melakukan ${rateLimit.current} pembelian dalam 1 menit.\nSilakan tunggu ${rateLimit.resetIn} detik lagi.`)
          }
        }

        // 🔒 REDIS LOCK: Prevent race condition (double purchase)
        const lockAcquired = await acquireLock(sender, 'mid', 30)
        if (!lockAcquired) {
          return reply(`⚠️ *Transaksi sedang diproses*\n\nAnda sedang melakukan transaksi lain. Harap tunggu sampai selesai atau ketik *${prefix}batal* untuk membatalkan.`)
        }

        try {
          if (db.data.order[sender] !== undefined) {
            await releaseLock(sender, 'mid')
            return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *${prefix}batal* untuk membatalkan pembayaran.`)
          }
          let data = q.split(" ")
          if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk jumlah`)
          if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada`)

          const jumlah = Number(data[1])
          if (!Number.isFinite(jumlah) || jumlah <= 0) return reply("Jumlah harus berupa angka lebih dari 0")

          let stok = db.data.produk[data[0]].stok
          if (stok.length <= 0) return reply("Stok habis, silahkan hubungi Owner untuk restok")
          if (stok.length < jumlah) return reply(`Stok tersedia ${stok.length}, jadi harap jumlah tidak melebihi stok`)

          const reffId = crypto.randomBytes(5).toString("hex").toUpperCase()
          const createdAtTs = Date.now()
          db.data.order[sender] = { status: 'processing', reffId, idProduk: data[0], jumlah, metode: 'MIDTRANS', startedAt: createdAtTs }
          requestPendingOrderSave()

          try {
            // Hitung harga
            let totalHarga = Number(hargaProduk(data[0], db.data.users[sender].role)) * jumlah
            const uniqueCode = Math.floor(1 + Math.random() * 99);
            const totalAmount = totalHarga + uniqueCode;

            reply("Sedang membuat QR Code ...");

            const orderId = `MID-${reffId}-${Date.now()}`;

            // Gunakan QRIS statis Midtrans (tracking via webhook)
            // const qrImagePath = "./options/sticker/qris-midtrans.jpg";
            // try {
            //   await qrisStatisMidtrans(qrImagePath);
            //   console.log(`✅ [MID] QRIS statis Midtrans loaded: ${orderId}`);
            // } catch (qrisError) {
            //   console.error(`❌ [MID] Error loading QRIS statis:`, qrisError.message);
            //   await releaseLock(sender, 'mid')
            //   return reply(`❌ Gagal memuat QR Code Midtrans. Silakan hubungi admin.`)
            // }
            const qrImagePath = await qrisDinamis(`${totalAmount}`, "./options/sticker/qris.jpg");
            console.log(`✅ [MID] QRIS dinamis generated: ${orderId}, Amount: Rp${totalAmount}`);


            const expirationTime = Date.now() + toMs("30m");
            const expireDate = new Date(expirationTime);
            const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000));
            const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
            const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000);
            const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`;

            const caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n` +
              `*Produk ID:* ${data[0]}\n` +
              `*Nama Produk:* ${db.data.produk[data[0]].name}\n` +
              `*Harga:* Rp${toRupiah(totalHarga / jumlah)}\n` +
              `*Jumlah:* ${jumlah}\n` +
              `*Subtotal:* Rp${toRupiah(totalHarga)}\n` +
              `*Kode Unik:* *${uniqueCode}*\n` +
              `*Total:* *Rp${toRupiah(totalAmount)}*\n` +
              `*Order ID:* ${orderId}\n` +
              `*Waktu:* ${timeLeft} menit\n\n` +
              `📱 *Cara Bayar:*\n` +
              `1. Scan QRIS di atas dengan aplikasi pembayaran Anda\n` +
              `2. *Nominal sudah ter-set otomatis: Rp${toRupiah(totalAmount)}*\n` +
              `   (Rp${toRupiah(totalHarga)} + *kode unik ${uniqueCode}*)\n` +
              `3. Konfirmasi pembayaran di aplikasi\n` +
              `4. *Pembayaran akan terdeteksi otomatis via webhook*\n\n` +
              `⏰ Batas waktu: sebelum ${formattedTime}\n` +
              `Jika ingin membatalkan, ketik *${prefix}batal*`;

            const qrImage = await fs.promises.readFile(qrImagePath);
            const message = await ronzz.sendMessage(from, {
              image: qrImage,
              caption: caption
            }, { quoted: m });

            db.data.order[sender] = {
              id: data[0],
              jumlah: jumlah,
              from,
              key: message.key,
              orderId,
              reffId,
              totalAmount,
              uniqueCode,
              metode: 'MIDTRANS', // Pastikan metode di-set untuk global listener
              createdAt: createdAtTs
            };
            requestPendingOrderSave();

            console.log(`📝 [MID] Order created: ${orderId}, Amount: Rp${totalAmount}, Sender: ${sender}`);

            // Setup webhook listener untuk payment-completed event
            const paymentListener = async (webhookData) => {
              try {
                const { orderId: webhookOrderId, transactionStatus, gross_amount } = webhookData;

                // Match berdasarkan totalAmount (karena QRIS statis, Midtrans akan kirim gross_amount)
                // Atau bisa juga match berdasarkan orderId jika kita set di metadata
                const order = db.data.order[sender];
                if (!order) return; // Order sudah tidak ada

                const webhookAmount = Number(gross_amount || webhookData.gross_amount || 0);
                const orderAmount = Number(totalAmount);
                const amountDiff = Math.abs(webhookAmount - orderAmount);
                const isAmountMatch = amountDiff < 1; // Tolerance untuk handle decimal (2027.00 vs 2027)
                const isStatusPaid = /(settlement|capture)/i.test(String(transactionStatus));

                console.log(`🔍 [MID-LOCAL] Checking webhook: Amount Rp${webhookAmount}, Order Amount Rp${orderAmount}, Diff: Rp${amountDiff.toFixed(2)}, Match: ${isAmountMatch}`);

                // Match jika amount sama (dengan tolerance) dan status paid
                if (isAmountMatch && isStatusPaid) {
                  // IDEMPOTENCY CHECK: Prevent duplicate processing for same order
                  if (order.processed) {
                    console.log(`⚠️ [MID-LOCAL] Order ${orderId} already processed, skipping duplicate event.`);
                    return;
                  }

                  // Mark as processed immediately
                  order.processed = true;
                  db.data.order[sender] = order; // Save state back to memory

                  console.log(`✅ [MID] Webhook payment detected: ${orderId}, Amount: ${webhookAmount}`);

                  // Remove listener setelah payment detected
                  process.removeListener('payment-completed', paymentListener);

                  // Fix message deletion: use deleteMessage explicitly
                  try {
                    await ronzz.deleteMessage(from, message.key.id);
                  } catch (delError) {
                    console.warn(`[MID] Failed to delete QRIS bubble: ${delError.message}`);
                  }

                  reply("Pembayaran berhasil, data akun akan segera diproses.");

                  // Proses pembelian
                  db.data.produk[data[0]].terjual += jumlah
                  let dataStok = []
                  for (let i = 0; i < jumlah; i++) {
                    dataStok.push(db.data.produk[data[0]].stok.shift())
                  }

                  // Important: Delete old stock property to force recalculation from stok.length
                  delete db.data.produk[data[0]].stock;

                  const detailParts = [
                    `*📦 Produk:* ${db.data.produk[data[0]].name}`,
                    `*📅 Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`,
                    `*⏰ Jam:* ${jamwib} WIB`,
                    `*Refid:* ${reffId}`,
                    ''
                  ];

                  dataStok.forEach((i) => {
                    const dataAkun = i.split("|");
                    detailParts.push(
                      `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
                      `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}`,
                      `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}`,
                      `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}`,
                      `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}`,
                      ''
                    );
                  });

                  if (db.data.produk[data[0]].snk) {
                    detailParts.push(
                      `*╭────「 SYARAT & KETENTUAN 」────╮*`,
                      '',
                      `*📋 SNK PRODUK: ${db.data.produk[data[0]].name}*`,
                      '',
                      db.data.produk[data[0]].snk,
                      '',
                      `*⚠️ PENTING:*`,
                      `• Baca dan pahami SNK sebelum menggunakan akun`,
                      `• Akun yang sudah dibeli tidak dapat dikembalikan`,
                      `• Hubungi admin jika ada masalah dengan akun`,
                      '',
                      `*╰────「 END SNK 」────╯*`
                    );
                  }

                  const detailAkunCustomer = detailParts.join('\n');

                  // Kirim ke customer
                  let customerMessageSent = false;
                  try {
                    await sleep(1000);
                    await ronzz.sendMessage(sender, { text: detailAkunCustomer });
                    customerMessageSent = true;
                  } catch (error) {
                    console.error('❌ [MID] Error sending account details:', error.message);
                  }

                  if (customerMessageSent) {
                    if (isGroup) {
                      reply("🎉 Pembayaran QRIS berhasil! Detail akun telah dikirim ke chat pribadi Anda. Terima kasih!");
                    } else {
                      reply("🎉 Pembayaran QRIS berhasil! Detail akun telah dikirim di atas. Terima kasih!");
                    }
                  } else {
                    reply("⚠️ Pembayaran QRIS berhasil, tetapi terjadi masalah saat mengirim detail akun. Admin akan segera mengirim detail akun secara manual.");
                  }

                  // Save receipt
                  try {
                    const { saveReceipt } = require('./config/r2-storage');
                    const result = await saveReceipt(reffId, detailAkunCustomer);
                    if (result.success) {
                      console.log(`✅ Receipt saved: ${result.url || result.path || reffId}`);
                    }
                  } catch (receiptError) {
                    console.error('❌ Error saving receipt:', receiptError.message);
                  }

                  // Tambah ke database transaksi
                  db.data.transaksi.push({
                    id: data[0],
                    name: db.data.produk[data[0]].name,
                    price: hargaProduk(data[0], db.data.users[sender].role),
                    date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
                    profit: db.data.produk[data[0]].profit,
                    jumlah: jumlah,
                    user: sender.split("@")[0],
                    userRole: db.data.users[sender].role,
                    reffId: reffId,
                    metodeBayar: "QRIS",
                    totalBayar: totalAmount
                  });

                  if (typeof global.scheduleSave === 'function') {
                    global.scheduleSave();
                  }

                  delete db.data.order[sender];
                  await db.save();
                  console.log(`✅ [MID] Transaction completed via webhook: ${orderId} - ${reffId}`);
                }
              } catch (error) {
                console.error(`❌ [MID] Error in webhook listener:`, error.message);
              }
            };

            // Register webhook listener
            process.on('payment-completed', paymentListener);

            // Polling untuk timeout handling (jika webhook tidak datang)
            let pollInterval = 2000; // Mulai dari 2 detik (lebih cepat)
            const maxInterval = 10000; // Maksimal 10 detik (lebih cepat)
            let pollCount = 0;

            while (db.data.order[sender]) {
              await sleep(pollInterval);

              if (pollCount < 10) {
                pollInterval = Math.min(Math.floor(pollInterval * 1.2), maxInterval);
              }
              pollCount++;

              if (Date.now() >= expirationTime) {
                // Remove listener saat timeout
                process.removeListener('payment-completed', paymentListener);
                await ronzz.sendMessage(from, { delete: message.key });
                reply("Pembayaran dibatalkan karena melewati batas waktu 30 menit.");
                delete db.data.order[sender];
                requestPendingOrderSave();
                break;
              }

              // Fallback: Cek webhook dari PostgreSQL database (karena dashboard-api dan bot-wa adalah process terpisah)
              if (pollCount % 2 === 0) { // Cek setiap 2 polling cycle (sekitar 6-10 detik) - lebih cepat untuk deteksi
                try {
                  if (usePg && pg) {
                    // Query dari PostgreSQL - cari webhook yang belum processed dengan amount yang match
                    const orderAmount = Number(totalAmount);
                    const tolerance = 1; // Tolerance 1 rupiah untuk handle decimal

                    const result = await pg.query(
                      `SELECT id, order_id, transaction_id, transaction_status, payment_type, gross_amount, settlement_time, webhook_data
                   FROM midtrans_webhooks
                   WHERE processed = false 
                     AND transaction_status IN ('settlement', 'capture')
                     AND ABS(gross_amount - $1) < $2
                   ORDER BY created_at DESC
                   LIMIT 10`,
                      [orderAmount, tolerance]
                    );

                    if (result.rows.length > 0) {
                      console.log(`🔍 [MID] Found ${result.rows.length} unprocessed webhooks from PostgreSQL, looking for amount Rp${orderAmount}`);
                    }

                    for (const row of result.rows) {
                      const webhookAmount = Number(row.gross_amount || 0);
                      const amountDiff = Math.abs(webhookAmount - orderAmount);
                      const isAmountMatch = amountDiff < tolerance;

                      console.log(`  - Webhook: Amount Rp${webhookAmount} (${typeof row.gross_amount}), Order Amount Rp${orderAmount}, Diff: Rp${amountDiff.toFixed(2)}, Match: ${isAmountMatch}`);

                      if (isAmountMatch) {
                        console.log(`✅ [MID] Payment detected via PostgreSQL webhook: Amount Rp${webhookAmount}, OrderID: ${row.order_id}`);

                        // Mark as processed di PostgreSQL
                        await pg.query(
                          `UPDATE midtrans_webhooks 
                       SET processed = true, processed_at = now() 
                       WHERE id = $1`,
                          [row.id]
                        );

                        // Trigger same processing as webhook listener
                        paymentListener({
                          orderId: row.order_id || orderId,
                          transactionStatus: row.transaction_status,
                          gross_amount: webhookAmount,
                          paymentType: row.payment_type,
                          settlementTime: row.settlement_time
                        });
                        break;
                      }
                    }
                  } else {
                    // Fallback ke JSON database jika PostgreSQL tidak tersedia
                    const webhooks = db.data.midtransWebhooks || [];
                    const unprocessedWebhooks = webhooks.filter(w => !w.processed && w.gross_amount);

                    if (unprocessedWebhooks.length > 0) {
                      console.log(`🔍 [MID] Checking ${unprocessedWebhooks.length} unprocessed webhooks from JSON, looking for amount Rp${totalAmount}`);
                    }

                    for (const webhook of unprocessedWebhooks) {
                      const webhookAmount = Number(webhook.gross_amount || 0);
                      const amountDiff = Math.abs(webhookAmount - Number(totalAmount));
                      const isAmountMatch = amountDiff < 1;
                      const isStatusPaid = /(settlement|capture)/i.test(String(webhook.transactionStatus));

                      console.log(`  - Webhook: Amount Rp${webhookAmount}, Status: ${webhook.transactionStatus}, Diff: Rp${amountDiff.toFixed(2)}, Match: ${isAmountMatch}`);

                      if (isAmountMatch && isStatusPaid) {
                        console.log(`✅ [MID] Payment detected via JSON webhook: Amount Rp${webhookAmount}, OrderID: ${webhook.orderId}`);

                        // Mark as processed
                        webhook.processed = true;
                        if (typeof db.save === 'function') {
                          await db.save();
                        }

                        // Trigger same processing as webhook listener
                        paymentListener({
                          orderId: webhook.orderId || orderId,
                          transactionStatus: webhook.transactionStatus,
                          gross_amount: webhook.gross_amount
                        });
                        break;
                      }
                    }
                  }
                } catch (dbError) {
                  // Ignore database errors
                  console.log(`⚠️ [MID] Database webhook check failed:`, dbError.message);
                }
              }

              // Fallback: Cek via API juga (optional, untuk backup)
              if (USE_POLLING && pollCount % 5 === 0) { // Cek setiap 5 polling cycle
                try {
                  // Cek via checkStaticQRISPayment untuk backup
                  const { checkStaticQRISPayment } = require('./config/midtrans');
                  const backupCheck = await checkStaticQRISPayment(totalAmount, createdAtTs);

                  if (backupCheck.found && backupCheck.paid) {
                    console.log(`✅ [MID] Payment detected via API backup check: ${orderId}`);
                    // Trigger same processing as webhook
                    paymentListener({
                      orderId: orderId,
                      transactionStatus: backupCheck.status,
                      gross_amount: backupCheck.gross_amount
                    });
                    break;
                  }
                } catch (apiError) {
                  // Ignore API errors, continue with webhook
                  console.log(`⚠️ [MID] API backup check failed:`, apiError.message);
                }
              }
            }
          } catch (error) {
            console.error(`❌ [MID] Error processing Midtrans for ${data[0]}:`, error);
            reply("Gagal membuat QR Code Midtrans. Silakan coba lagi.");
            if (db.data.order[sender]) {
              delete db.data.order[sender];
              requestPendingOrderSave();
            }
          }
        } catch (outerError) {
          console.error('❌ [MID] Outer error:', outerError)
          reply("Terjadi kesalahan saat memproses pembelian. Silakan coba lagi.")
        } finally {
          await releaseLock(sender, 'mid')
        }
      }
        break;

      case 'buy': {
        // 🛡️ RATE LIMIT: Prevent spam (max 3 buy per minute for non-owners)
        if (!isOwner) {
          const rateLimit = await checkRateLimit(sender, 'buy', 3, 60)
          if (!rateLimit.allowed) {
            return reply(`⚠️ *Terlalu banyak request!*\n\nAnda sudah melakukan ${rateLimit.current} pembelian dalam 1 menit.\nSilakan tunggu ${rateLimit.resetIn} detik lagi.`)
          }
        }

        // 🔒 REDIS LOCK: Prevent race condition (double purchase)
        const lockAcquired = await acquireLock(sender, 'buy', 30)
        if (!lockAcquired) {
          return reply(`⚠️ *Transaksi sedang diproses*\n\nAnda sedang melakukan transaksi lain. Harap tunggu sampai selesai atau ketik *${prefix}batal* untuk membatalkan.`)
        }

        try {
          if (db.data.order[sender] !== undefined) {
            await releaseLock(sender, 'buy')
            return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *${prefix}batal* untuk membatalkan pembayaran.`)
          }
          let data = q.split(" ")

          // Cek apakah ini adalah command untuk owner/admin dengan nomor tujuan
          let targetNumber = null
          let isOwnerBuy = false
          let cleanedNumber = null

          if (isOwner && data.length >= 3) {
            // Format: buy kode nominal nomorcust
            // Contoh: buy net2u 1 6281389592981 atau buy net2u 1 +62 852-3554-0944
            // Gabungkan semua parameter setelah jumlah menjadi nomor (untuk handle spasi dan dash)
            const nomorTujuan = data.slice(2).join(' ')

            // Fungsi untuk membersihkan nomor WhatsApp
            function cleanWhatsAppNumber(input) {
              if (!input) return null

              // Hapus semua karakter selain angka dan +
              let cleaned = input.replace(/[^\d+]/g, '')

              // Jika dimulai dengan +62, hapus + dan ganti dengan 62
              if (cleaned.startsWith('+62')) {
                cleaned = '62' + cleaned.substring(3)
              }
              // Jika dimulai dengan 62, biarkan
              else if (cleaned.startsWith('62')) {
                // Sudah benar
              }
              // Jika dimulai dengan 0, ganti dengan 62
              else if (cleaned.startsWith('0')) {
                cleaned = '62' + cleaned.substring(1)
              }
              // Jika dimulai dengan 8 (tanpa 0), tambahkan 62
              else if (cleaned.startsWith('8')) {
                cleaned = '62' + cleaned
              }

              return cleaned
            }

            cleanedNumber = cleanWhatsAppNumber(nomorTujuan)

            if (cleanedNumber && cleanedNumber.match(/^62\d{9,13}$/)) {
              // Validasi nomor WhatsApp Indonesia (62 + 9-13 digit)
              targetNumber = cleanedNumber + '@s.whatsapp.net'
              isOwnerBuy = true
              console.log(`🛒 Owner/Admin buy detected - Target: ${targetNumber}`)
              console.log(`📱 Original input: ${nomorTujuan} -> Cleaned: ${cleanedNumber}`)
            } else {
              return reply(`❌ Format nomor tidak valid.\n\n✅ Format yang diterima:\n• ${prefix + command} ${data[0]} ${data[1]} 6281389592981\n• ${prefix + command} ${data[0]} ${data[1]} +62 852-3554-0944\n• ${prefix + command} ${data[0]} ${data[1]} 085235540944\n• ${prefix + command} ${data[0]} ${data[1]} 85235540944`)
            }
          } else if (!isOwner && data.length >= 3) {
            // Jika bukan owner tapi ada 3 parameter, abaikan parameter ketiga dan stop
            console.log(`⚠️ Non-owner user tried to use 3 parameters, ignoring third parameter`)
            return reply(`ℹ️ Parameter ketiga diabaikan. Untuk membeli akun dan mengirim ke nomor lain, hubungi owner/admin.\n\nGunakan format: ${prefix + command} ${data[0]} ${data[1]}`)
          }

          if (!data[1]) {
            if (isOwner) {
              return reply(`Contoh: ${prefix + command} idproduk jumlah\nAtau untuk kirim ke nomor lain: ${prefix + command} idproduk jumlah nomorcust\n\n✅ Format nomor yang diterima:\n• 6281389592981\n• +62 852-3554-0944\n• 085235540944\n• 85235540944`)
            } else {
              return reply(`Contoh: ${prefix + command} idproduk jumlah`)
            }
          }

          // Pastikan minimal ada 2 parameter (kode dan jumlah)
          if (data.length < 2) {
            return reply(`Contoh: ${prefix + command} idproduk jumlah`)
          }

          if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada`)

          const jumlah = Number(data[1])
          if (!Number.isFinite(jumlah) || jumlah <= 0) return reply("Jumlah harus berupa angka lebih dari 0")

          let stok = db.data.produk[data[0]].stok
          if (stok.length <= 0) return reply("Stok habis, silahkan hubungi Owner untuk restok")
          if (stok.length < jumlah) return reply(`Stok tersedia ${stok.length}, jadi harap jumlah tidak melebihi stok`)

          const reffId = crypto.randomBytes(5).toString("hex").toUpperCase()
          db.data.order[sender] = { status: 'processing', reffId, idProduk: data[0], jumlah, metode: 'Saldo', startedAt: Date.now() }
          requestPendingOrderSave()

          try {
            // Cek saldo user (PG-aware)
            let totalHarga = Number(hargaProduk(data[0], db.data.users[sender].role)) * jumlah
            const currentSaldo = typeof dbHelper.getUserSaldoAsync === 'function' ? await dbHelper.getUserSaldoAsync(sender) : dbHelper.getUserSaldo(sender)
            if (currentSaldo < totalHarga) {
              delete db.data.order[sender]
              requestPendingOrderSave()
              return reply(`Saldo tidak cukup! Saldo kamu: Rp${toRupiah(currentSaldo)}\nTotal harga: Rp${toRupiah(totalHarga)}\n\nSilahkan topup saldo terlebih dahulu dengan ketik *${prefix}deposit nominal*`)
            }

            reply(isOwnerBuy ? `Sedang memproses pembelian untuk nomor ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'}.` : "Sedang memproses pembelian dengan saldo...")

            // Kurangi saldo user (PG)
            await dbHelper.updateUserSaldo(sender, totalHarga, 'subtract')

            await sleep(1000)

            // Proses pembelian langsung
            db.data.produk[data[0]].terjual += jumlah
            let dataStok = []
            for (let i = 0; i < jumlah; i++) {
              dataStok.push(db.data.produk[data[0]].stok.shift())
            }

            // Important: Delete old stock property to force recalculation from stok.length
            delete db.data.produk[data[0]].stock;

            // Improvement: Optimize string building dengan array.join()
            const detailParts = [
              `*📦 Produk:* ${db.data.produk[data[0]].name}`,
              `*📅 Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`,
              `*⏰ Jam:* ${jamwib} WIB`,
              `*Refid:* ${reffId}`,
              ''
            ]

            dataStok.forEach((i) => {
              const dataAkun = i.split("|")
              detailParts.push(
                `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
                `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}`,
                `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}`,
                `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}`,
                `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}`,
                ''
              )
            })

            // Tambahkan SNK
            detailParts.push(
              `*╭────「 SYARAT & KETENTUAN 」────╮*`,
              '',
              `*📋 SNK PRODUK: ${db.data.produk[data[0]].name}*`,
              '',
              db.data.produk[data[0]].snk,
              '',
              `*╰────「 END SNK 」────╯*`
            )

            const detailAkunCustomer = detailParts.join('\n')

            // Improvement: Remove unused detailAkunOwner variable

            // Improvement: Better message sending with detailed logging
            const recipientNumber = isOwnerBuy ? targetNumber : sender
            const recipientType = isOwnerBuy ? 'target customer' : 'customer'

            console.log('🚀 STARTING CUSTOMER MESSAGE SEND PROCESS (BUY CASE)');
            console.log('📞 Customer WhatsApp ID:', recipientNumber);
            console.log('📏 Message length:', detailAkunCustomer.length);
            console.log('🎯 Owner buy mode:', isOwnerBuy ? 'YES' : 'NO');

            let customerMessageSent = false;

            try {
              console.log(`📤 ATTEMPT 1: Sending complete account details to ${recipientType}...`);

              await sleep(500)
              const messageResult = await ronzz.sendMessage(recipientNumber, { text: detailAkunCustomer }, { quoted: m })
              console.log('📨 Message result:', JSON.stringify(messageResult?.key || 'no key'))
              console.log(`✅ SUCCESS: Complete account details sent to ${recipientType}!`)
              customerMessageSent = true;

            } catch (error) {
              console.error('❌ ATTEMPT 1 FAILED:', error.message);
              console.error('❌ Full error:', JSON.stringify(error, null, 2));

              // Attempt 2: coba kirim tanpa quoted message
              try {
                console.log(`📤 ATTEMPT 2: Sending without quoted message to ${recipientType}...`);
                await sleep(500)
                const msg2 = await ronzz.sendMessage(recipientNumber, { text: detailAkunCustomer })
                console.log('📨 Message result:', JSON.stringify(msg2?.key || 'no key'))
                console.log(`✅ SUCCESS: Account details sent without quoted message to ${recipientType}!`)
                customerMessageSent = true;
              } catch (fallbackError1) {
                console.error('❌ ATTEMPT 2 FAILED:', fallbackError1.message);
                console.error('❌ Full error:', JSON.stringify(fallbackError1, null, 2));

                // Attempt 3: send simple account info
                try {
                  console.log(`📤 ATTEMPT 3: Sending simple account info to ${recipientType}...`);
                  const simpleParts = [
                    `*📦 AKUN PEMBELIAN*`,
                    '',
                    `*Produk:* ${db.data.produk[data[0]].name}`,
                    `*Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`,
                    ''
                  ]
                  dataStok.forEach((i, index) => {
                    const dataAkun = i.split("|")
                    simpleParts.push(
                      `*Akun ${index + 1}:*`,
                      `Email: ${dataAkun[0] || 'Tidak ada'}`,
                      `Password: ${dataAkun[1] || 'Tidak ada'}`,
                      ''
                    )
                  })
                  await sleep(500)
                  const msg3 = await ronzz.sendMessage(recipientNumber, { text: simpleParts.join('\n') })
                  console.log('📨 Message result:', JSON.stringify(msg3?.key || 'no key'))
                  console.log(`✅ SUCCESS: Simple account details sent to ${recipientType}!`)
                  customerMessageSent = true;
                } catch (fallbackError2) {
                  console.error('❌ ALL ATTEMPTS FAILED:', fallbackError2.message);
                  console.error('❌ CUSTOMER WILL NOT RECEIVE ACCOUNT DETAILS!');
                }
              }
            }

            console.log('🏁 CUSTOMER MESSAGE SEND RESULT (BUY CASE):', customerMessageSent ? 'SUCCESS' : 'FAILED');
            if (isOwnerBuy) {
              console.log(`🎯 OWNER BUY SUMMARY:`);
              console.log(`   - Owner: ${sender}`);
              console.log(`   - Target User: ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'}`);
              console.log(`   - Target WhatsApp: ${targetNumber}`);
              console.log(`   - Product: ${data[0]} (${jumlah} items)`);
              console.log(`   - Delivery: ${customerMessageSent ? 'SUCCESS' : 'FAILED'}`);
              console.log(`   - Database User: ${isOwnerBuy ? (cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || sender.split("@")[0]) : sender.split("@")[0]}`);
            } else {
              console.log(`👤 REGULAR BUY SUMMARY:`);
              console.log(`   - Customer: ${sender}`);
              console.log(`   - Product: ${data[0]} (${jumlah} items)`);
              console.log(`   - Delivery: ${customerMessageSent ? 'SUCCESS' : 'FAILED'}`);
            }

            // Improvement: Async file write untuk receipt (R2 atau local)
            try {
              const result = await saveReceipt(reffId, detailAkunCustomer);
              if (result.success) {
                if (result.url) {
                  console.log(`✅ Receipt saved to ${result.storage}: ${result.url}`);
                } else {
                  console.log(`✅ Receipt saved to ${result.storage}: ${result.path || reffId}`);
                }
              } else {
                console.error('❌ Error saving receipt:', result.error);
              }
            } catch (receiptError) {
              console.error('❌ Error saving receipt:', receiptError.message);
            }

            // Tambah ke database transaksi
            db.data.transaksi.push({
              id: data[0],
              name: db.data.produk[data[0]].name,
              price: hargaProduk(data[0], db.data.users[sender].role),
              date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
              profit: db.data.produk[data[0]].profit,
              jumlah: jumlah,
              user: isOwnerBuy ? (cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || sender.split("@")[0]) : sender.split("@")[0],
              userRole: db.data.users[sender].role,
              reffId: reffId,
              metodeBayar: "Saldo",
              totalBayar: totalHarga,
              isOwnerBuy: isOwnerBuy,
              targetNumber: isOwnerBuy ? (cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '')) : null,
              ownerNumber: isOwnerBuy ? sender.split("@")[0] : null
            })

            // Schedule save after transaction (debounced)
            if (typeof global.scheduleSave === 'function') {
              global.scheduleSave();
            } else {
              await db.save();
            }

            // Cek apakah stok habis dan kirim notifikasi ke admin
            if (db.data.produk[data[0]].stok.length === 0) {
              // Improvement: Optimize string building
              const alertParts = [
                `🚨 *STOK HABIS ALERT!* 🚨`,
                '',
                `*📦 Produk:* ${db.data.produk[data[0]].name}`,
                `*🆔 ID Produk:* ${data[0]}`,
                `*📊 Stok Sebelumnya:* ${jumlah}`,
                `*📉 Stok Sekarang:* 0 (HABIS)`,
                `*🛒 Terjual Terakhir:* ${jumlah} akun`,
                `*👤 Pembeli:* @${sender.split("@")[0]}${isOwnerBuy ? ` (Owner buy ke ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'})` : ''}`,
                `*💰 Total Transaksi:* Rp${toRupiah(totalHarga)}`,
                `*📅 Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`,
                `*⏰ Jam:* ${jamwib} WIB`,
                '',
                `*⚠️ TINDAKAN YANG DIPERLUKAN:*`,
                `• Segera restok produk ini`,
                `• Update harga jika diperlukan`,
                `• Cek profit margin`,
                '',
                `*💡 Tips:* Gunakan command *${prefix}addstok ${data[0]} jumlah* untuk menambah stok`
              ]
              const stokHabisMessage = alertParts.join('\n')

              // Skip admin stock-empty notifications
            }

            // Send single comprehensive success message
            if (customerMessageSent) {
              if (isOwnerBuy) {
                reply(`🎉 Pembelian berhasil! Detail akun telah dikirim ke nomor ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'}. Terima kasih!`)

              } else if (isGroup) {
                reply("🎉 Pembelian dengan saldo berhasil! Detail akun telah dikirim ke chat pribadi Anda. Terima kasih!");
              } else {
                reply("🎉 Pembelian dengan saldo berhasil! Detail akun telah dikirim di atas. Apabila tidak terlihat rechat agar dikirim ulang Terima kasih!");
              }
            } else {
              if (isOwnerBuy) {
                reply(`⚠️ Pembelian berhasil, tetapi terjadi masalah saat mengirim detail akun ke nomor ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'}. Silakan coba kirim ulang atau hubungi admin.`);

              } else {
                reply("⚠️ Pembelian dengan saldo berhasil, tetapi terjadi masalah saat mengirim detail akun. Admin akan segera mengirim detail akun secara manual.");
              }

              // Skip failed-delivery alert to admin
            }
          } catch (error) {
            console.log("Error processing buy:", error)
            reply("Terjadi kesalahan saat memproses pembelian. Silakan coba lagi atau hubungi admin.")
          } finally {
            delete db.data.order[sender]
            await db.save()
          }
        } catch (outerError) {
          console.error('❌ [BUY] Outer error:', outerError)
          reply("Terjadi kesalahan saat memproses pembelian. Silakan coba lagi.")
        } finally {
          // 🔓 REDIS UNLOCK: Always release lock
          await releaseLock(sender, 'buy')
        }
      }
        break

      case 'batal': {
        let cancelled = false

        // Initialize if not exists
        if (!db.data.order) db.data.order = {}
        if (!db.data.orderDeposit) db.data.orderDeposit = {}

        // Jika admin/owner quote pesan user LAIN, batalkan pesanan user yang di-quote
        if (m.quoted && (isOwner || isGroupAdmins)) {
          const quotedSender = m.quoted.sender
          if (quotedSender && quotedSender !== sender) {
            // Admin membatalkan pesanan user lain
            if (db.data.order[quotedSender] !== undefined) {
              try {
                await ronzz.sendMessage(db.data.order[quotedSender].from, { delete: db.data.order[quotedSender].key })
              } catch { }
              delete db.data.order[quotedSender]
              requestPendingOrderSave()
              cancelled = true
            }

            if (db.data.orderDeposit && db.data.orderDeposit[quotedSender] !== undefined) {
              try {
                await ronzz.sendMessage(db.data.orderDeposit[quotedSender].from, { delete: db.data.orderDeposit[quotedSender].key })
              } catch { }
              delete db.data.orderDeposit[quotedSender]
              cancelled = true
            }

            if (cancelled) {
              reply(`✅ Berhasil membatalkan pembayaran user @${quotedSender.split('@')[0]}`, { mentions: [quotedSender] })
            } else {
              reply(`❌ Tidak ada pembayaran yang sedang berlangsung untuk user @${quotedSender.split('@')[0]}`, { mentions: [quotedSender] })
            }
            break
          }
        }

        // Logika: user membatalkan pesanan sendiri (dengan atau tanpa quote)
        if (db.data.order[sender] !== undefined) {
          await ronzz.sendMessage(db.data.order[sender].from, { delete: db.data.order[sender].key })
          delete db.data.order[sender]
          requestPendingOrderSave()
          cancelled = true
        }

        if (db.data.orderDeposit && db.data.orderDeposit[sender] !== undefined) {
          try {
            await ronzz.sendMessage(db.data.orderDeposit[sender].from, { delete: db.data.orderDeposit[sender].key })
          } catch { }
          delete db.data.orderDeposit[sender]
          cancelled = true
        }

        if (cancelled) {
          reply("Berhasil membatalkan pembayaran")
        } else {
          reply("Tidak ada pembayaran yang sedang berlangsung untuk dibatalkan")
        }
      }
        break

      // Handler umum: user bisa ketik "netflix", "canva", "viu", dll
      case 'netflix':
      case 'canva':
      case 'viu':
      case 'vidio':
      case 'wetv':
      case 'prime':
      case 'youtube':
      case 'capcut':
      case 'gpt':
        try {
          if (!db?.data?.produk) return reply("❌ Database tidak tersedia atau rusak")
          const products = db.data.produk
          if (Object.keys(products).length === 0) return reply("📦 Belum ada produk di database")

          // ambil keyword dari command
          const keyword = command.toLowerCase()

          // cari produk yang mengandung keyword di nama
          const matchedProducts = Object.entries(products).filter(([id, product]) =>
            product.name && product.name.toLowerCase().includes(keyword)
          )

          if (matchedProducts.length === 0) {
            return reply(`❌ Tidak ada produk *${command}* yang tersedia saat ini`)
          }

          // format teks hasil
          let teks = `*╭────〔 ${command.toUpperCase()} PRODUCTS 📦 〕────╮*\n\n`
          teks += `*📋 Daftar Produk ${command.toUpperCase()} yang Tersedia:*\n\n`

          matchedProducts.forEach(([productId, product], index) => {
            const name = product.name || 'Unknown'
            const desc = product.desc || 'Tidak ada deskripsi'
            const stokLength = Array.isArray(product.stok) ? product.stok.length : 0
            const terjual = product.terjual || 0

            // cek harga sesuai role
            let harga = 'Harga tidak tersedia'
            try {
              if (typeof hargaProduk === 'function' && typeof toRupiah === 'function') {
                const userRole = db.data.users?.[sender]?.role || 'bronze'
                const hargaValue = hargaProduk(productId, userRole)
                if (hargaValue && !isNaN(hargaValue)) {
                  harga = `Rp${toRupiah(hargaValue)}`
                }
              }
            } catch { }

            teks += `*${index + 1}. ${name}*\n`
            teks += `   🔐 Kode: ${productId}\n`
            teks += `   🏷️ Harga: ${harga}\n`
            teks += `   📦 Stok: ${stokLength}\n`
            teks += `   🧾 Terjual: ${terjual}\n`
            teks += `   📝 Deskripsi: ${desc}\n`
            teks += `   ✍️ Beli: ${prefix}buy ${productId} 1\n\n`
          })

          teks += `*╰────「 END LIST 」────╯*\n\n`
          teks += `*💡 Cara membeli:*\n`
          teks += `*┊・* Buynow (QRIS Otomatis): ${prefix}buynow kodeproduk jumlah\n`
          teks += `*┊・*    Contoh: ${prefix}buynow netflix 2\n`
          teks += `*┊・* Buy (Saldo): ${prefix}buy kodeproduk jumlah\n`
          teks += `*┊・*    Contoh: ${prefix}buy netflix 2\n`
          teks += `*📞 Kontak Admin:* @${ownerNomer}\n\n`
          teks += `_⏰ Pesan ini akan terhapus otomatis dalam 5 menit_`

          const sentMessage = await ronzz.sendMessage(from, {
            text: teks,
            mentions: [ownerNomer + "@s.whatsapp.net"]
          }, { quoted: m })

          scheduleAutoDelete(sentMessage.key, from, 300000, `${command} product list message`)

        } catch (e) {
          console.error(`❌ Error in ${command} command:`, e)
          reply(`❌ Terjadi kesalahan pada command ${command}: ${e.message}`)
        }
        break

      case 'ceksaldo': case 'saldo': {
        // Check if there's a phone number parameter
        if (args.length > 0) {
          // Only owner can check other people's saldo by phone number
          if (!isOwner) {
            reply(`❌ Maaf, hanya owner yang bisa cek saldo user lain dengan nomor HP.\n\n💡 *Tips:* Gunakan command ini tanpa parameter untuk cek saldo sendiri.`);
            return;
          }

          let phoneNumber = args[0];

          // Clean phone number (remove +, -, spaces, etc)
          phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

          // Check both formats: with and without @s.whatsapp.net suffix
          const cleanPhoneNumber = phoneNumber;
          const targetUserIdWithSuffix = phoneNumber + '@s.whatsapp.net';

          // Try to find user in database with both formats
          let targetUser = null;
          let foundKey = null;

          if (db.data.users && db.data.users[cleanPhoneNumber]) {
            targetUser = db.data.users[cleanPhoneNumber];
            foundKey = cleanPhoneNumber;
          } else if (db.data.users && db.data.users[targetUserIdWithSuffix]) {
            targetUser = db.data.users[targetUserIdWithSuffix];
            foundKey = targetUserIdWithSuffix;
          }

          if (targetUser) {
            // Try to get saldo from cache first for better performance
            let saldo = getCachedSaldo(foundKey);
            if (saldo === null) {
              // If not in cache, get from database and cache it
              saldo = parseInt(targetUser.saldo) || 0;
              setCachedSaldo(foundKey, saldo);
            }

            const username = targetUser.username || `User ${cleanPhoneNumber.slice(-4)}`;

            reply(`*💰 Cek Saldo User (Owner Only)*\n\n👤 *User:* ${username}\n📱 *Nomor HP:* ${cleanPhoneNumber}\n💳 *Saldo:* Rp${toRupiah(saldo)}\n\n👑 *Checked by:* Owner`);
          } else {
            // User not found, create new user with 0 saldo
            if (!db.data.users) db.data.users = {};

            // Create user with both formats
            db.data.users[cleanPhoneNumber] = {
              saldo: 0,
              role: 'bronze',
              username: `User ${cleanPhoneNumber.slice(-4)}`,
              createdAt: new Date().toISOString()
            };

            // Also create with suffix format for consistency
            db.data.users[targetUserIdWithSuffix] = {
              saldo: 0,
              role: 'bronze',
              username: `User ${cleanPhoneNumber.slice(-4)}`,
              createdAt: new Date().toISOString()
            };

            await db.save();

            reply(`*💰 Cek Saldo User (Owner Only)*\n\n👤 *User:* User ${cleanPhoneNumber.slice(-4)}\n📱 *Nomor HP:* ${cleanPhoneNumber}\n💳 *Saldo:* Rp0\n\n👑 *Checked by:* Owner\n\n💡 *Info:* User baru dibuat dengan saldo 0`);
          }
        }
        // Check if this is a reply/quote reply
        else if (m.quoted) {
          // Only owner can check other people's saldo
          if (!isOwner) {
            reply(`❌ Maaf, hanya owner yang bisa cek saldo user lain.\n\n💡 *Tips:* Gunakan command ini tanpa reply untuk cek saldo sendiri.`, { quoted: m });
            return;
          }

          // Get the quoted message sender - use m.quoted.sender which is processed by myfunc.js
          const quotedSender = m.quoted.sender;

          // Debug: Log the quoted message structure
          console.log('🔍 Quote Debug:', {
            quotedSender,
            quoted: m.quoted,
            participant: m.quoted.participant,
            key: m.quoted.key,
            sender: m.quoted.sender,
            isQuotedMsg: m.isQuotedMsg,
            contextInfo: m.msg?.contextInfo
          });

          if (quotedSender) {
            // Extract user ID from quoted sender
            const targetUserId = quotedSender.split('@')[0];
            const targetUserIdWithSuffix = quotedSender;

            // Try to find user in database with both formats
            let targetUser = null;
            let foundKey = null;

            if (db.data.users && db.data.users[targetUserId]) {
              targetUser = db.data.users[targetUserId];
              foundKey = targetUserId;
            } else if (db.data.users && db.data.users[targetUserIdWithSuffix]) {
              targetUser = db.data.users[targetUserIdWithSuffix];
              foundKey = targetUserIdWithSuffix;
            }

            // Debug: Log database search
            console.log('🔍 Database Search:', {
              targetUserId,
              targetUserIdWithSuffix,
              foundInDB: !!targetUser,
              foundKey,
              availableKeys: Object.keys(db.data.users || {}).slice(0, 5) // Show first 5 keys
            });

            if (targetUser) {
              // Try to get saldo from cache first for better performance
              let saldo = getCachedSaldo(foundKey);
              if (saldo === null) {
                // If not in cache, get from database and cache it
                saldo = parseInt(targetUser.saldo) || 0;
                setCachedSaldo(foundKey, saldo);
              }

              const username = targetUser.username || `User ${targetUserId.slice(-4)}`;

              reply(`*💰 Cek Saldo User Lain (Owner Only)*\n\n👤 *User:* ${username}\n🆔 *ID:* ${targetUserId}\n💳 *Saldo:* Rp${toRupiah(saldo)}\n\n👑 *Checked by:* Owner`, { quoted: m });
            } else {
              // User not found, create new user with 0 saldo
              if (!db.data.users) db.data.users = {};

              // Create user with both formats
              db.data.users[targetUserId] = {
                saldo: 0,
                role: 'bronze',
                username: `User ${targetUserId.slice(-4)}`,
                createdAt: new Date().toISOString()
              };

              // Also create with suffix format for consistency
              db.data.users[targetUserIdWithSuffix] = {
                saldo: 0,
                role: 'bronze',
                username: `User ${targetUserId.slice(-4)}`,
                createdAt: new Date().toISOString()
              };

              await db.save();

              reply(`*💰 Cek Saldo User Lain (Owner Only)*\n\n👤 *User:* User ${targetUserId.slice(-4)}\n🆔 *ID:* ${targetUserId}\n💳 *Saldo:* Rp0\n\n👑 *Checked by:* Owner\n\n💡 *Info:* User baru dibuat dengan saldo 0`, { quoted: m });
            }
          } else {
            reply(`❌ Tidak bisa mendapatkan informasi user dari pesan yang di-reply.\n\n💡 *Tips:* Reply/quote reply pesan user lain yang ingin di-cek saldonya.\n\n🔍 *Debug Info:*\n• Quoted Structure: ${JSON.stringify(m.quoted, null, 2)}`, { quoted: m });
          }
        } else {
          // If not reply and no parameter, check own saldo (all users can do this)
          // Self saldo check
          const senderWithoutSuffix = sender.replace(/@s\.whatsapp\.net$/, '');
          const saldo = typeof dbHelper.getUserSaldoAsync === 'function' ? await dbHelper.getUserSaldoAsync(sender) : dbHelper.getUserSaldo(sender);

          // Try to find user record key for display
          let foundKey = sender;
          if (db.data && db.data.users) {
            if (!db.data.users[sender] && db.data.users[senderWithoutSuffix]) {
              foundKey = senderWithoutSuffix;
            }
          }

          const user = (db.data && db.data.users && db.data.users[foundKey]) || {};
          const username = user.username || `User ${senderWithoutSuffix.slice(-4)}`;

          reply(`*💰 Cek Saldo Sendiri*\n\n👤 *User:* ${username}\n🆔 *ID:* ${foundKey}\n💳 *Saldo:* Rp${toRupiah(saldo)}\n\n💡 *Saldo hanya untuk transaksi dibot ini.*`);
        }
      }
        break

      case 'addsaldo': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} 628xx,20000`)
        if (!q.split(",")[0]) return reply(`Contoh: ${prefix + command} 628xx,20000`)
        if (!q.split(",")[1]) return reply(`Contoh: ${prefix + command} 628xx,20000`)
        let nomorNya = q.split(",")[0].replace(/[^0-9]/g, '') + "@s.whatsapp.net"
        let nominal = Number(q.split(",")[1])

        // Check if user exists, if not create them
        if (!db.data.users[nomorNya]) {
          db.data.users[nomorNya] = {
            saldo: 0,
            role: 'bronze'
          }
        }

        const previousSaldo = Number(db.data.users[nomorNya].saldo || 0)
        await dbHelper.updateUserSaldo(nomorNya, nominal, 'add')
        await sleep(50)
        const newSaldo = Number(db.data.users[nomorNya].saldo || (previousSaldo + nominal))

        try {
          await dbHelper.recordSaldoHistory({
            userId: nomorNya,
            action: 'manual-add',
            method: 'admin',
            source: 'addsaldo',
            amount: nominal,
            before: previousSaldo,
            after: newSaldo,
            actor: sender,
            notes: `Manual addsaldo oleh @${sender.split('@')[0]}`
          })
        } catch (historyError) {
          console.error('❌ [HISTORY] Failed to record addsaldo history:', historyError.message)
        }

        // Notifikasi ke admin
        ronzz.sendMessage(from, { text: `*SALDO BERHASIL DITAMBAHKAN!*\n\n👤 *User:* @${nomorNya.split('@')[0]}\n💰 *Nominal:* Rp${toRupiah(nominal)}\n💳 *Saldo Sekarang:* Rp${toRupiah(db.data.users[nomorNya].saldo)}`, mentions: [nomorNya] }, { quoted: m })

        // Notifikasi ke user yang ditambahkan saldonya
        ronzz.sendMessage(nomorNya, { text: `💰 *SALDO BERHASIL DITAMBAHKAN!*\n\n👤 *User:* @${nomorNya.split('@')[0]}\n💰 *Nominal:* Rp${toRupiah(nominal)}\n💳 *Saldo Sekarang:* Rp${toRupiah(db.data.users[nomorNya].saldo)}\n\n*By:* @${sender.split('@')[0]}`, mentions: [nomorNya, sender] })
      }
        break

      case 'minsaldo': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} 628xx,20000`)
        if (!q.split(",")[0]) return reply(`Contoh: ${prefix + command} 628xx,20000`)
        if (!q.split(",")[1]) return reply(`Contoh: ${prefix + command} 628xx,20000`)

        let nomorNya = q.split(",")[0].replace(/[^0-9]/g, '') + "@s.whatsapp.net"
        let nominal = Number(q.split(",")[1])

        // Check if user exists, if not create them
        if (!db.data.users[nomorNya]) {
          db.data.users[nomorNya] = {
            saldo: 0,
            role: 'bronze'
          }
        }

        // Validate saldo before deduction
        if (db.data.users[nomorNya].saldo <= 0) return reply("User belum terdaftar di database saldo atau saldo 0.")
        if (db.data.users[nomorNya].saldo < nominal) return reply(`Saldo user tidak cukup! Saldo: Rp${toRupiah(db.data.users[nomorNya].saldo)}, yang ingin dikurangi: Rp${toRupiah(nominal)}`)

        const previousSaldo = Number(db.data.users[nomorNya].saldo || 0)
        await dbHelper.updateUserSaldo(nomorNya, nominal, 'subtract')
        await sleep(50)
        const newSaldo = Number(db.data.users[nomorNya].saldo || Math.max(0, previousSaldo - nominal))

        try {
          await dbHelper.recordSaldoHistory({
            userId: nomorNya,
            action: 'manual-subtract',
            method: 'admin',
            source: 'minsaldo',
            amount: -Math.abs(nominal),
            before: previousSaldo,
            after: newSaldo,
            actor: sender,
            notes: `Manual minsado oleh @${sender.split('@')[0]}`
          })
        } catch (historyError) {
          console.error('❌ [HISTORY] Failed to record minsado history:', historyError.message)
        }

        // Notifikasi ke admin
        ronzz.sendMessage(from, { text: `*SALDO BERHASIL DIKURANGI!*\n\n👤 *User:* @${nomorNya.split('@')[0]}\n💰 *Nominal:* Rp${toRupiah(nominal)}\n💳 *Saldo Sekarang:* Rp${toRupiah(db.data.users[nomorNya].saldo)}`, mentions: [nomorNya] }, { quoted: m })

        // Notifikasi ke user yang dikurangi saldonya
        ronzz.sendMessage(nomorNya, { text: `⚠️ *SALDO TELAH DIKURANGI!*\n\n👤 *User:* @${nomorNya.split('@')[0]}\n💰 *Nominal:* Rp${toRupiah(nominal)}\n💳 *Saldo Sekarang:* Rp${toRupiah(db.data.users[nomorNya].saldo)}\n\n*By:* @${sender.split('@')[0]}`, mentions: [nomorNya, sender] })
      }
        break

      case 'isi': {
        if (!isOwner) return reply(mess.owner)
        if (!isQuotedMsg) return reply(`Reply pesan orang yang ingin diisi saldonya dengan caption *${prefix + command} nominal*\n\nContoh: ${prefix + command} 100000`)
        if (!q) return reply(`Masukkan nominal saldo yang ingin diisi!\n\nContoh: ${prefix + command} 100000`)

        let nominal = parseInt(q.replace(/[^0-9]/g, ''))
        if (isNaN(nominal) || nominal <= 0) return reply(`Nominal tidak valid! Masukkan angka yang benar.\n\nContoh: ${prefix + command} 100000`)

        let targetUser = m.quoted.sender
        if (!db.data.users[targetUser]) {
          db.data.users[targetUser] = {
            saldo: 0,
            role: 'bronze'
          }
        }

        const previousSaldo = Number(db.data.users[targetUser].saldo || 0)
        await dbHelper.updateUserSaldo(targetUser, nominal, 'add')
        await sleep(50)
        const newSaldo = Number(db.data.users[targetUser].saldo || (previousSaldo + nominal))

        try {
          await dbHelper.recordSaldoHistory({
            userId: targetUser,
            action: 'manual-add',
            method: 'admin',
            source: 'isi',
            amount: nominal,
            before: previousSaldo,
            after: newSaldo,
            actor: sender,
            notes: `Isi saldo manual oleh @${sender.split('@')[0]}`
          })
        } catch (historyError) {
          console.error('❌ [HISTORY] Failed to record isi history:', historyError.message)
        }

        reply(`✅ *SALDO BERHASIL DITAMBAHKAN!*\n\n👤 *User:* @${targetUser.split('@')[0]}\n💰 *Nominal:* Rp${toRupiah(nominal)}\n💳 *Saldo Sekarang:* Rp${toRupiah(db.data.users[targetUser].saldo)}\n\n*By:* @${sender.split('@')[0]}`, { mentions: [targetUser, sender] })
      }
        break

      case 'antilink': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!q) return reply(`Contoh: ${prefix + command} on/off`)
        if (q.toLowerCase() == "on") {
          if (db.data.chat[from].antilink) return reply('Antilink sudah aktif di grup ini.')
          db.data.chat[from].antilink = true
          reply('Sukses mengaktifkan antilink di grup ini.')
        } else if (q.toLowerCase() == "off") {
          if (!db.data.chat[from].antilink) return reply('Antilink sudah tidak aktif di grup ini.')
          db.data.chat[from].antilink = false
          reply('Sukses menonaktifkan antilink di grup ini.')
        }
      }
        break

      case 'antilinkv2': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!q) return reply(`Contoh: ${prefix + command} on/off`)
        if (q.toLowerCase() == "on") {
          if (db.data.chat[from].antilink2) return reply('Antilinkv2 sudah aktif di grup ini.')
          db.data.chat[from].antilink2 = true
          reply('Sukses mengaktifkan antilinkv2 di grup ini.')
        } else if (q.toLowerCase() == "off") {
          if (!db.data.chat[from].antilink2) return reply('Antilinkv2 sudah tidak aktif di grup ini.')
          db.data.chat[from].antilink2 = false
          reply('Sukses menonaktifkan antilinkv2 di grup ini.')
        }
      }
        break

      case 'anticall': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} on/off`)
        if (q.toLowerCase() == "on") {
          if (db.data.chat[from].anticall) return reply('Anticall sudah aktif.')
          db.data.chat[from].anticall = true
          reply('Sukses mengaktifkan anticall.')
        } else if (q.toLowerCase() == "off") {
          if (!db.data.chat[from].anticall) return reply('Anticall sudah tidak aktif.')
          db.data.chat[from].anticall = false
          reply('Sukses menonaktifkan anticall.')
        }
      }
        break

      case 'kick': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        let number;
        if (q.length !== 0) {
          number = q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          ronzz.groupParticipantsUpdate(from, [number], "remove")
            .then(res => reply('Sukses...'))
            .catch((err) => reply(mess.error.api))
        } else if (isQuotedMsg) {
          number = m.quoted.sender
          ronzz.groupParticipantsUpdate(from, [number], "remove")
            .then(res => reply('Sukses...'))
            .catch((err) => reply(mess.error.api))
        } else {
          reply('Tag atau balas pesan orang yang ingin dikeluarkan dari grup.')
        }
      }
        break

      case 'blok': case 'block':
        if (!isOwner && !fromMe) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} 628xxx`)
        await ronzz.updateBlockStatus(q.replace(/[^0-9]/g, '') + '@s.whatsapp.net', "block") // Block user
        reply('Sukses block nomor.')
        break

      case 'unblok': case 'unblock':
        if (!isOwner && !fromMe) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} 628xxx`)
        await ronzz.updateBlockStatus(q.replace(/[^0-9]/g, '') + '@s.whatsapp.net', "unblock") // Block user
        reply('Sukses unblock nomor.')
        break

      case 'kirimulang': case 'resend': case 'sendagain':
        try {
          // Get user phone number
          const userPhone = sender.split("@")[0]

          // Check if transaksi exists
          if (!db.data.transaksi || !Array.isArray(db.data.transaksi)) {
            return reply('❌ Database transaksi tidak ditemukan.')
          }

          // Find user's last transaction
          const userTransaksi = db.data.transaksi.filter(t =>
            t.user === userPhone ||
            t.buyer === userPhone ||
            (t.targetNumber && t.targetNumber === userPhone)
          )

          if (userTransaksi.length === 0) {
            return reply('❌ Anda belum memiliki riwayat transaksi.\n\n💡 *Tips:* Lakukan pembelian terlebih dahulu dengan command:\n• `.buy <kode> <jumlah>` - Bayar dengan saldo\n• `.buynow <kode> <jumlah>` - Bayar dengan QRIS')
          }

          // Get last transaction
          const lastTransaksi = userTransaksi[userTransaksi.length - 1]

          if (!lastTransaksi.reffId) {
            return reply(`❌ Transaksi terakhir tidak memiliki Reference ID.\n\n📦 *Detail Transaksi:*\n• Produk: ${lastTransaksi.name || 'N/A'}\n• Tanggal: ${lastTransaksi.date || 'N/A'}\n\n💡 Silakan hubungi admin untuk bantuan.`)
          }

          // Get receipt from R2 or local storage
          const { getReceipt } = require('./config/r2-storage');
          const receiptResult = await getReceipt(lastTransaksi.reffId);

          if (!receiptResult.success) {
            // Receipt not found in R2 or local, send basic info
            console.log(`⚠️ [RESEND] Receipt not found for ${lastTransaksi.reffId} (checked R2 and local)`)
            let basicInfo = `*🔁 KIRIM ULANG TRANSAKSI TERAKHIR*\n\n`
            basicInfo += `⚠️ File receipt tidak ditemukan, mengirim informasi dasar:\n\n`
            basicInfo += `*╭────「 TRANSAKSI INFO 」────╮*\n`
            basicInfo += `*┊・ 🆔 | Reff ID:* ${lastTransaksi.reffId}\n`
            basicInfo += `*┊・ 📦 | Produk:* ${lastTransaksi.name || 'N/A'}\n`
            basicInfo += `*┊・ 🛍️ | Jumlah:* ${lastTransaksi.jumlah || 1}\n`
            basicInfo += `*┊・ 💰 | Total:* Rp${toRupiah(lastTransaksi.totalBayar || lastTransaksi.price || 0)}\n`
            basicInfo += `*┊・ 💳 | Metode:* ${lastTransaksi.metodeBayar || 'N/A'}\n`
            basicInfo += `*┊・ 📅 | Tanggal:* ${lastTransaksi.date || 'N/A'}\n`
            basicInfo += `*╰┈┈┈┈┈┈┈┈*\n\n`
            basicInfo += `⚠️ *PENTING:*\n`
            basicInfo += `Detail akun tidak tersimpan dalam sistem.\n`
            basicInfo += `Silakan hubungi admin @${ownerNomer} untuk mendapatkan detail akun Anda.\n\n`
            basicInfo += `📝 *Berikan Reff ID:* \`${lastTransaksi.reffId}\` kepada admin untuk verifikasi.`

            return ronzz.sendMessage(from, {
              text: basicInfo,
              mentions: [ownerNomer + "@s.whatsapp.net"]
            }, { quoted: m })
          }

          // Receipt found (from R2 or local)
          const receiptContent = receiptResult.content
          console.log(`✅ [RESEND] Receipt found from ${receiptResult.storage || 'storage'} for ${lastTransaksi.reffId}`)

          // Send receipt to private chat first
          await ronzz.sendMessage(sender, { text: receiptContent }, { quoted: m })

          // Wait a bit to ensure receipt is delivered first
          await sleep(500)

          // Send confirmation based on context
          if (isGroup) {
            // If in group, send confirmation to group
            let confirmMsg = `✅ *Transaksi terakhir berhasil dikirim ulang!*\n\n`
            confirmMsg += `*╭────「 DETAIL 」────╮*\n`
            confirmMsg += `*┊・ 🆔 | Reff ID:* ${lastTransaksi.reffId}\n`
            confirmMsg += `*┊・ 📦 | Produk:* ${lastTransaksi.name || 'N/A'}\n`
            confirmMsg += `*┊・ 🛍️ | Jumlah:* ${lastTransaksi.jumlah || 1}\n`
            confirmMsg += `*┊・ 📅 | Tanggal:* ${lastTransaksi.date || 'N/A'}\n`
            confirmMsg += `*╰┈┈┈┈┈┈┈┈*\n\n`
            confirmMsg += `📝 *Info:* Detail akun telah dikirim ke chat pribadi Anda.\n\n`
            confirmMsg += `💡 *Tips:* Simpan detail akun dengan baik dan jangan bagikan ke orang lain!`
            await reply(confirmMsg)
          } else {
            // If in private, send simple confirmation
            let confirmMsg = `✅ *Berhasil mengirim ulang detail akun!*\n\n`
            confirmMsg += `📦 *Produk:* ${lastTransaksi.name}\n`
            confirmMsg += `📅 *Tanggal:* ${lastTransaksi.date}\n`
            confirmMsg += `🆔 *Reff ID:* ${lastTransaksi.reffId}\n\n`
            confirmMsg += `💡 *Tips:* Simpan detail akun dengan baik!`
            await ronzz.sendMessage(from, { text: confirmMsg }, { quoted: m })
          }

          // Log for owner/admin tracking
          console.log(`🔁 [RESEND] User ${userPhone} requested resend for transaction ${lastTransaksi.reffId}`)

        } catch (err) {
          console.error('❌ Error kirimulang:', err)
          reply(`❌ Terjadi kesalahan saat mengirim ulang transaksi.\n\n*Error:* ${err.message}\n\n💡 Silakan hubungi admin @${ownerNomer} jika masalah berlanjut.`)
        }
        break

      case 'qristoday': {
        try {
          if (!db?.data?.transaksi) return reply('❌ Belum ada data transaksi')
          const today = moment.tz('Asia/Jakarta').format('YYYY-MM-DD')
          const transaksiQris = db.data.transaksi.filter(t =>
            String(t.metodeBayar).toUpperCase() === 'QRIS' &&
            String(t.date || '').startsWith(today)
          )
          if (transaksiQris.length === 0) {
            return reply(`📊 Tidak ada transaksi QRIS pada ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`)
          }

          const totalAmount = transaksiQris.reduce((sum, t) => {
            if (Number.isFinite(Number(t.totalBayar))) return sum + Number(t.totalBayar)
            if (Number.isFinite(Number(t.price))) return sum + Number(t.price)
            return sum
          }, 0)

          const message = [
            `*📊 RINGKASAN TRANSAKSI QRIS HARI INI*`,
            ``,
            `*Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`,
            `*Total Transaksi:* ${transaksiQris.length} kali`,
            `*Total Nominal:* Rp${toRupiah(totalAmount)}`,
            ``,
            `_Data diambil dari transaksi dengan metode QRIS pada hari ini._`
          ].join('\n')

          reply(message)
        } catch (err) {
          console.error('❌ Error qristoday:', err)
          reply('❌ Gagal mengambil data QRIS hari ini.')
        }
      }
        break

      case 'saldotoday': {
        try {
          if (!db?.data?.transaksi) return reply('❌ Belum ada data transaksi')
          const today = moment.tz('Asia/Jakarta').format('YYYY-MM-DD')
          const transaksiSaldo = db.data.transaksi.filter(t =>
            String(t.metodeBayar).toUpperCase() === 'SALDO' &&
            String(t.date || '').startsWith(today)
          )
          if (transaksiSaldo.length === 0) {
            return reply(`📊 Tidak ada transaksi saldo pada ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`)
          }

          const totalAmount = transaksiSaldo.reduce((sum, t) => {
            if (Number.isFinite(Number(t.totalBayar))) return sum + Number(t.totalBayar)
            if (Number.isFinite(Number(t.price))) return sum + Number(t.price)
            return sum
          }, 0)

          const message = [
            `*📊 RINGKASAN TRANSAKSI SALDO HARI INI*`,
            ``,
            `*Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`,
            `*Total Transaksi:* ${transaksiSaldo.length} kali`,
            `*Total Nominal:* Rp${toRupiah(totalAmount)}`,
            ``,
            `_Data diambil dari transaksi dengan metode Saldo pada hari ini._`
          ].join('\n')

          reply(message)
        } catch (err) {
          console.error('❌ Error saldotoday:', err)
          reply('❌ Gagal mengambil data saldo hari ini.')
        }
      }
        break

      case 'tes': case 'runtime':
        reply(`*STATUS : BOT ONLINE*\n_Runtime : ${runtime(process.uptime())}_`)
        break

      case 'ping':
        let timestamp = speed()
        let latensi = speed() - timestamp
        reply(`Kecepatan respon _${latensi.toFixed(4)} Second_\n\n*💻 INFO SERVER*\nHOSTNAME: ${os.hostname}\nRAM: ${formatp(os.totalmem() - os.freemem())} / ${formatp(os.totalmem())}\nCPUs: ${os.cpus().length} core`)
        break

      case 'server': {
        const cpus = os.cpus() || []
        const cpuModel = cpus[0]?.model || 'Unknown'
        const cpuSpeed = cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'N/A'
        const cpuCount = cpus.length || 1
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const usedMem = totalMem - freeMem
        const memPercent = ((usedMem / totalMem) * 100).toFixed(2)
        const osUptime = runtime(os.uptime())

        const info = [
          `*🖥️ SERVER INFORMATION*`,
          ``,
          `*• Hostname:* ${os.hostname()}`,
          `*• Platform:* ${os.platform()} ${os.release()} (${os.arch()})`,
          `*• Uptime OS:* ${osUptime}`,
          ``,
          `*🧠 CPU*`,
          `*• Model:* ${cpuModel}`,
          `*• Speed:* ${cpuSpeed}`,
          `*• Cores:* ${cpuCount}`,
          ``,
          `*💾 MEMORY*`,
          `*• Total:* ${formatp(totalMem)}`,
          `*• Used:* ${formatp(usedMem)} (${memPercent}%)`,
          `*• Free:* ${formatp(freeMem)}`,
          ``,
          `*⚙️ Node.js:* ${process.version}`,
          `*📦 Bot Uptime:* ${runtime(process.uptime())}`
        ].join('\n')

        reply(info)
      }
        break

      case 'performa': {
        const t1 = speed()
        const latency = speed() - t1
        const memUsage = process.memoryUsage()
        const heapUsed = formatp(memUsage.heapUsed || 0)
        const heapTotal = formatp(memUsage.heapTotal || 0)
        const rss = formatp(memUsage.rss || 0)
        const loadAvg = os.loadavg ? os.loadavg().map(n => n.toFixed(2)).join(', ') : 'N/A'
        const uptimeBot = runtime(process.uptime())

        const info = [
          `*⚡ BOT PERFORMANCE REPORT*`,
          ``,
          `*• Latensi:* ${latency.toFixed(4)}s`,
          `*• Uptime:* ${uptimeBot}`,
          ``,
          `*📊 MEMORY (process)*`,
          `*• RSS:* ${rss}`,
          `*• Heap:* ${heapUsed} / ${heapTotal}`,
          ``,
          `*⚙️ LOAD AVERAGE:* ${loadAvg}`,
          `*• CPU cores:* ${os.cpus().length}`,
          ``,
          `*📝 Catatan:* Gunakan command ini saat Anda merasa bot lemot untuk melihat kondisi server.`
        ].join('\n')

        reply(info)
      }
        break

      case 'done': {
        if (!isGroup) return (mess.group)
        if (!isGroupAdmins && !isOwner) return (mess.admin)
        if (q.startsWith("@")) {
          if (db.data.chat[from].sDone.length !== 0) {
            let textDone = db.data.chat[from].sDone
            ronzz.sendMessage(from, { text: textDone.replace('tag', q.replace(/[^0-9]/g, '')).replace('@jam', jamwib).replace('@tanggal', moment.tz('Asia/Jakarta').format('DD MMMM YYYY')).replace('@status', 'Berhasil'), mentions: [q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'] });
          } else {
            ronzz.sendMessage(from, { text: `「 *TRANSAKSI BERHASIL* 」\n\n\`\`\`📆 TANGGAL : ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}\n⌚ JAM : ${jamwib}\n✨ STATUS: Berhasil\`\`\`\n\nTerimakasih @${q.replace(/[^0-9]/g, '')} next order yaa🙏`, mentions: [q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'] }, { quoted: m });
          }
        } else if (isQuotedMsg) {
          if (db.data.chat[from].sDone.length !== 0) {
            let textDone = db.data.chat[from].sDone
            ronzz.sendMessage(from, { text: textDone.replace('tag', m.quoted.sender.split("@")[0]).replace('@jam', jamwib).replace('@tanggal', moment.tz('Asia/Jakarta').format('DD MMMM YYYY')).replace('@status', 'Berhasil'), mentions: [m.quoted.sender] }, { quoted: m })
          } else {
            ronzz.sendMessage(from, { text: `「 *TRANSAKSI BERHASIL* 」\n\n\`\`\`📆 TANGGAL : ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}\n⌚ JAM : ${jamwib}\n✨ STATUS: Berhasil\`\`\`\n\nTerimakasih @${m.quoted.sender.split("@")[0]} next order yaa🙏`, mentions: [m.quoted.sender] })
          }
        } else {
          reply('Reply atau tag orangnya')
        }
      }
        break

      case 'open':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        await ronzz.groupSettingUpdate(from, 'not_announcement')
        await reply(`Sukses mengizinkan semua peserta dapat mengirim pesan ke grup ini.`)
        break

      case 'close':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        await ronzz.groupSettingUpdate(from, 'announcement')
        await reply(`Sukses mengizinkan hanya admin yang dapat mengirim pesan ke grup ini.`)
        break


      case 'hidetag': case 'ht': case 'h': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        let mem = groupMembers.map(i => i.id)
        ronzz.sendMessage(from, { text: q ? q : '', mentions: mem })
        if (isBotGroupAdmins) {
          try {
            const deleteKey = m.isGroup
              ? { remoteJid: from, id: (mek && mek.key && mek.key.id) || (m.key && m.key.id), participant: (mek && (mek.key && mek.key.participant)) || mek.participant || sender, fromMe: false }
              : { remoteJid: from, id: (mek && mek.key && mek.key.id) || (m.key && m.key.id), fromMe: false }
            if (deleteKey && deleteKey.id) {
              await ronzz.sendMessage(from, { delete: deleteKey })
            }
          } catch { }
        }
      }
        break

      case 'setdesc':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        if (!q) return reply(`Contoh: ${prefix + command} New Description by ${ownerName}`)
        await ronzz.groupUpdateDescription(from, q)
          .then(res => {
            reply(`Sukses set deskripsi group.`)
          }).catch(() => reply(mess.error.api))
        break

      case 'backup': {
        if (!isOwner) return reply(mess.owner)
        await reply('Mengumpulkan semua file ke folder...')

        // Create backup directory if it doesn't exist
        const backupDir = './backup';
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        let ls = (await execSync("ls")).toString().split("\n").filter((pe) =>
          pe != "node_modules" &&
          pe != "session" &&
          pe != "package-lock.json" &&
          pe != "yarn.lock" &&
          pe != ".npm" &&
          pe != ".cache" &&
          pe != "backup" &&
          pe != ""
        )

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup-bot-wa-${timestamp}.zip`;
        const backupPath = `${backupDir}/${backupFileName}`;

        await execSync(`zip -r ${backupPath} ${ls.join(" ")}`)

        if (isGroup) {
          reply(`✅ Backup berhasil dibuat: ${backupPath}`)
        } else {
          reply(`✅ Backup berhasil dibuat: ${backupPath}`)
        }

        // Hapus backup lama (lebih dari 7 hari)
        const files = fs.readdirSync(backupDir);
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        files.forEach(file => {
          if (file.startsWith('backup-bot-wa-') && file.endsWith('.zip')) {
            const filePath = `${backupDir}/${file}`;
            const stats = fs.statSync(filePath);
            if (now - stats.mtime.getTime() > sevenDays) {
              fs.unlinkSync(filePath);
              console.log(`🗑️ Backup lama dihapus: ${file}`);
            }
          }
        });
      }
        break

      case 'reloaddb': {
        try {
          if (!isOwner) return reply('❌ Command ini hanya untuk owner!')

          await reply('🔄 Sedang reload database dari PostgreSQL...')

          if (usePg && typeof db.load === 'function') {
            await db.load()

            // Clear saldo cache
            saldoCache.clear()

            // Emit reload event
            process.emit('database:reloaded')

            const productCount = Object.keys(db.data.produk || {}).length
            const userCount = Object.keys(db.data.users || {}).length

            await reply(`✅ Database berhasil di-reload!\n📊 Produk: ${productCount}\n👥 Users: ${userCount}\n🔄 Cache dibersihkan`)
          } else {
            await reply('❌ PostgreSQL tidak aktif atau database tidak mendukung reload')
          }

        } catch (error) {
          console.error('Reload database error:', error)
          await reply('❌ Gagal reload database: ' + error.message)
        }
      }
        break

      default:
        if (budy.startsWith('=>')) {
          if (!isOwner) return
          function Return(sul) {
            sat = JSON.stringify(sul, null, 2)
            bang = util.format(sat)
            if (sat == undefined) {
              bang = util.format(sul)
            }
            return reply(bang)
          }
          try {
            reply(util.format(eval(`(async () => { ${budy.slice(3)} })()`)))
          } catch (e) {
            reply(String(e))
          }
        }
        if (budy.startsWith('>')) {
          if (!isOwner) return
          try {
            let evaled = await eval(budy.slice(2))
            if (typeof evaled !== 'string') evaled = require('util').inspect(evaled)
            await reply(evaled)
          } catch (err) {
            reply(String(err))
          }
        }
        if (budy.startsWith('$')) {
          if (!isOwner) return
          let qur = budy.slice(2)
          exec(qur, (err, stdout) => {
            if (err) return reply(err)
            if (stdout) {
              reply(stdout)
            }
          })
        }
    }
  } catch (err) {
    console.log(color('[ERROR]', 'red'), err)
  }
}