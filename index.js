require("./setting.js")
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
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
const { qrisDinamis } = require("./function/dinamis");
const { createPaymentLink, getPaymentLinkStatus, isPaymentCompleted, createQRISCore, createQRISPayment, getTransactionStatusByOrderId, getTransactionStatusByTransactionId } = require('./config/midtrans');
const { acquireLock, releaseLock, checkRateLimit, getCache, setCache, invalidateCachePattern, cacheAside } = require('./function/redis-helper');
const { saveReceipt } = require('./config/r2-storage');
const BASE_QRIS_DANA = "00020101021126690021ID.CO.BANKMANDIRI.WWW01189360000801903662320211719036623250303UMI51440014ID.CO.QRIS.WWW0215ID10254355825370303UMI5204508553033605802ID5925gh store Perlengkapan Ind6012Kediri (Kab)61056415462070703A0163044DC9";
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true'
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
    ronzz.sendMessage = async function(jid, content, options) {
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
            try { console.warn('[WA] send retry', { attempt, backoff, code, message: msg }); } catch {}
            await __delay(backoff);
          }
        }
      });
      return __sendQueue;
    };
    Object.defineProperty(ronzz, '__sendWrapped', { value: true, enumerable: false, configurable: false });
  } catch {}
}

// Performance optimization: Cache for user saldo
const saldoCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Invalidate saldo cache when database file is reloaded externally
try {
  process.on('database:reloaded', () => {
    saldoCache.clear();
  });
} catch {}

// Watch for external changes to the database file (bot-tele/posweb updates) only in JSON mode
if (!usePg) {
  try {
    const dbFilePath = path.join(__dirname, 'options', 'database.json');
    if (fs.existsSync(dbFilePath)) {
      fs.watchFile(dbFilePath, { interval: 1000 }, () => {
        try {
          const raw = fs.readFileSync(dbFilePath, 'utf8');
          if (!raw || raw.trim().length < 2) return; // skip empty/partial writes
          const parsed = JSON.parse(raw);
          if (global.db && global.db.data) {
            global.db.data = parsed;
          } else {
            global.db = {
              data: parsed,
              save: async () => fs.writeFileSync(dbFilePath, JSON.stringify(global.db.data, null, 2))
            };
          }
          process.emit('database:reloaded');
          console.log('[DB] Reloaded from external change');
        } catch (e) {
          // Retry once after a short delay to handle atomic writes
          setTimeout(() => {
            try {
              const raw2 = fs.readFileSync(dbFilePath, 'utf8');
              if (!raw2 || raw2.trim().length < 2) return;
              const parsed2 = JSON.parse(raw2);
              if (global.db && global.db.data) {
                global.db.data = parsed2;
              } else {
                global.db = {
                  data: parsed2,
                  save: async () => fs.writeFileSync(dbFilePath, JSON.stringify(global.db.data, null, 2))
                };
              }
              process.emit('database:reloaded');
              console.log('[DB] Reloaded from external change');
            } catch (ee) {
              console.error('[DB] Failed to reload external change:', ee.message);
            }
          }, 300);
        }
      });
    }
  } catch (e) {
    console.error('[DB] Watch setup failed:', e.message);
  }
}

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
const tanggal = moment.tz('Asia/Jakarta').format('DD MMMM YYYY')

module.exports = async (ronzz, m, mek) => {
  try {
    __wrapSendMessageOnce(ronzz)
    const { isQuotedMsg, fromMe } = m
    if (fromMe) return
    const jamwib = moment.tz('Asia/Jakarta').format('HH:mm:ss')
    const dt = moment.tz('Asia/Jakarta').format('HH')
    const content = JSON.stringify(mek.message)
    const type = Object.keys(mek.message)[0];
    const from = m.chat
    const chats = (m.mtype === 'conversation') ? m.message.conversation : (m.mtype == 'imageMessage') ? m.message.imageMessage.caption : (m.mtype == 'videoMessage') ? m.message.videoMessage.caption : (m.mtype == 'extendedTextMessage') ? m.message.extendedTextMessage.text : (m.mtype == 'buttonsResponseMessage') && m.message.buttonsResponseMessage.selectedButtonId ? m.message.buttonsResponseMessage.selectedButtonId : (m.mtype == 'listResponseMessage') && m.message.listResponseMessage.singleSelectReply.selectedRowId ? m.message.listResponseMessage.singleSelectReply.selectedRowId : (m.mtype == 'templateButtonReplyMessage') && m.message.templateButtonReplyMessage.selectedId ? m.message.templateButtonReplyMessage.selectedId : (m.mtype == 'interactiveResponseMessage') && JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : (m.mtype == 'messageContextInfo') ? (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text) : ""
    const toJSON = j => JSON.stringify(j, null, '\t')
    const prefix = prefa ? /^[°•π÷×¶∆£¢€¥®=????+✓_=|~!?@#%^&.©^]/gi.test(chats) ? chats.match(/^[°•π÷×¶∆£¢€¥®=????+✓_=|~!?@#%^&.©^]/gi)[0] : "" : prefa ?? '#'
    const isGroup = m.isGroup
    const sender = m.isGroup ? (mek.key.participant ? mek.key.participant : mek.participant) : mek.key.remoteJid
    const isOwner = [ronzz.user.id, ...owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(sender) ? true : false
    const pushname = m.pushName
    const budy = (typeof m.text == 'string' ? m.text : '')
    const args = chats.trim().split(/ +/).slice(1);
    const q = args.join(" ");
    const command = chats.replace(prefix, '').trim().split(/ +/).shift().toLowerCase()
    const botNumber = ronzz.user.id.split(':')[0] + '@s.whatsapp.net'
    const groupMetadata = isGroup ? await ronzz.groupMetadata(from) : ''
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
      if (type_file === 'image') {
        var stream = await downloadContentFromMessage(m.message.imageMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.imageMessage, 'image')
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk])
        }
        fs.writeFileSync(path_file, buffer)
        return path_file
      }
      else if (type_file === 'video') {
        var stream = await downloadContentFromMessage(m.message.videoMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.videoMessage, 'video')
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk])
        }
        fs.writeFileSync(path_file, buffer)
        return path_file
      } else if (type_file === 'sticker') {
        var stream = await downloadContentFromMessage(m.message.stickerMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.stickerMessage, 'sticker')
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk])
        }
        fs.writeFileSync(path_file, buffer)
        return path_file
      } else if (type_file === 'audio') {
        var stream = await downloadContentFromMessage(m.message.audioMessage || m.message.extendedTextMessage?.contextInfo.quotedMessage.audioMessage, 'audio')
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk])
        }
        fs.writeFileSync(path_file, buffer)
        return path_file
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
                                waktu: tanggal,
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
                                waktu: tanggal,
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
                                waktu: tanggal,
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
                          waktu: tanggal,
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
                          waktu: tanggal,
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
                          waktu: tanggal,
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
*Tanggal:* ${tanggal}
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
          accountDetails += `*Tanggal:* ${tanggal}\n`
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

          // Auto delete setelah 5 menit (300000 ms)
          setTimeout(async () => {
            try {
              await ronzz.sendMessage(from, {
                delete: sentMessage.key
              })
              console.log(`🗑️ Auto-deleted stok list message after 5 minutes`)
            } catch (deleteError) {
              console.error(`❌ Failed to auto-delete stok message:`, deleteError.message)
            }
          }, 300000) // 5 menit = 300000 ms
          
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

        reply(`Berhasil menambahkan produk *${data[1]}*`)
      }
        break

      case 'delproduk': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} idproduk`)
        if (!db.data.produk[q]) return reply(`Produk dengan ID *${q}* tidak ada di database`)

        delete db.data.produk[q]

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
      }
        break
        
      case 'setjudul': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk|namaproduk`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)
        
        db.data.produk[data[0]].name = data[1]
        reply(`Berhasil set judul produk dengan ID *${data[0]}* menjadi *${data[1]}*`)
      }
        break
        
      case 'setdesk': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk|deskripsi`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)
        
        db.data.produk[data[0]].desc = data[1]
        reply(`Berhasil set deskripsi produk dengan ID *${data[0]}*`)
      }
        break
        
      case 'setsnk': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk|snk`)
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada di database`)
        
        db.data.produk[data[0]].snk = data[1]
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
const PG_API_KEY  = process.env.PG_API_KEY  || "kodeku";

// QRIS statis Livin Merchant dari kamu (JANGAN DIUBAH)

// ====== UTIL: Rupiah (fallback kalau belum ada) ======
function toRupiahLocal(num) {
  try {
    if (typeof toRupiah === "function") return toRupiah(num);
  } catch {}
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
// - package_name "id.bmri.livinmerchant" atau appName "LIVIN" (kalau ada)
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
      const appOk = (n.packageName === "id.bmri.livinmerchant") || (String(n.appName || "").toUpperCase().includes("LIVIN"));
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
    const qrImagePath = await qrisDinamis(`${totalAmount}`, "./options/sticker/qris.jpg")

    const expirationTime = Date.now() + toMs("30m")
    const expireDate = new Date(expirationTime)
    const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000))
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000)
    const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`

    const caption = `*🧾 MENUNGGU PEMBAYARAN DEPOSIT 🧾*\n\n` +
      `*Nominal:* Rp${toRupiah(baseAmount)}\n` +
      `*Bonus:* Rp${toRupiah(bonus)} (Rp2.000 tiap kelipatan Rp50.000)\n` +
      `*Kode Unik:* ${uniqueCode}\n` +
      `*Total Transfer:* Rp${toRupiah(totalAmount)}\n` +
      `*Waktu:* ${timeLeft} menit\n\n` +
      `Silakan scan QRIS di atas sebelum ${formattedTime}. Transfer sesuai total agar otomatis terdeteksi.\n\n` +
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
      // Simpan timestamp utk validasi notifikasi pembayaran
      createdAt: createdAtTs
    }

    // Improvement: Exponential backoff polling
    let pollInterval = 3000  // Mulai dari 3 detik
    const maxInterval = 15000 // Maksimal 15 detik
    let pollCount = 0

    while (db.data.orderDeposit[sender]) {
      await sleep(pollInterval)

      // Tingkatkan interval secara bertahap
      if (pollCount < 10) {
        pollInterval = Math.min(Math.floor(pollInterval * 1.2), maxInterval)
      }
      pollCount++

      if (Date.now() >= expirationTime) {
        await ronzz.sendMessage(from, { delete: message.key })
        reply("Deposit dibatalkan karena melewati batas waktu 30 menit.")
        delete db.data.orderDeposit[sender]
        break
      }

      try {
        const url = `${listener.baseUrl}/notifications?limit=50`
        const headers = listener.apiKey ? { 'X-API-Key': listener.apiKey } : {}
        const resp = await axios.get(url, { headers, timeout: 5000 })
        const notifs = Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data) ? resp.data : [])

                // Hanya terima notifikasi setelah order dibuat dan jumlah harus sama persis
                const paid = notifs.find(n => {
                  try {
                    const pkgOk = (n.package_name === 'id.bmri.livinmerchant') || (String(n.app_name||'').toUpperCase().includes('LIVIN'))
                    const amt = Number(String(n.amount_detected || '').replace(/[^0-9]/g, ''))
                    const postedAt = n.posted_at ? new Date(n.posted_at).getTime() : 0
                    return pkgOk && amt === Number(totalAmount) && postedAt >= createdAtTs
                  } catch {
                    return false
                  }
                })

        if (paid) {
          await ronzz.sendMessage(from, { delete: message.key })

          const credit = baseAmount + bonus + uniqueCode
          const previousSaldo = Number(db.data.users[sender].saldo || 0)
          db.data.users[sender].saldo = previousSaldo + credit
          try { setCachedSaldo(sender, db.data.users[sender].saldo) } catch {}

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

          await ronzz.sendMessage(from, { text: successText }, { quoted: m })

          delete db.data.orderDeposit[sender]
          
          // Improvement: Batch database save (save sekali saja di akhir)
          await db.save()
          break
        }
      } catch (err) {
        if (err.message?.includes("timeout")) continue

        await ronzz.sendMessage(from, { delete: message.key })
        reply("Deposit dibatalkan karena error sistem.")
        delete db.data.orderDeposit[sender]
        break
      }
    }
  } catch (error) {
    console.error(`Error creating QRIS DEPOSIT for ${sender}:`, error)
    reply("Gagal membuat QR Code deposit. Silakan coba lagi.")
    delete db.data.orderDeposit[sender]
  }
}
break;

case 'buynow': {
  // 🛡️ RATE LIMIT: Prevent spam (max 3 buynow per minute for non-owners)
  if (!isOwner) {
    const rateLimit = await checkRateLimit(sender, 'buynow', 3, 60)
    if (!rateLimit.allowed) {
      return reply(`⚠️ *Terlalu banyak request!*\n\nAnda sudah melakukan ${rateLimit.current} pembelian dalam 1 menit.\nSilakan tunggu ${rateLimit.resetIn} detik lagi.`)
    }
  }
  
  // 🔒 REDIS LOCK: Prevent race condition (double purchase)
  const lockAcquired = await acquireLock(sender, 'buynow', 30)
  if (!lockAcquired) {
    return reply(`⚠️ *Transaksi sedang diproses*\n\nAnda sedang melakukan transaksi lain. Harap tunggu sampai selesai atau ketik *${prefix}batal* untuk membatalkan.`)
  }
  
  try {
    if (db.data.order[sender] !== undefined) {
      await releaseLock(sender, 'buynow')
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
  // Catat waktu pembuatan order untuk menghindari match notifikasi lama
  const createdAtTs = Date.now()
  db.data.order[sender] = { status: 'processing', reffId, idProduk: data[0], jumlah, metode: 'QRIS', startedAt: createdAtTs }

  try {
    // Hitung harga (sama seperti case 'buy')
    let totalHarga = Number(hargaProduk(data[0], db.data.users[sender].role)) * jumlah
    const uniqueCode = Math.floor(1 + Math.random() * 99);
    const totalAmount = totalHarga + uniqueCode;

    reply("Sedang membuat QR Code...");
    
    const orderId = `TRX-${reffId}-${Date.now()}`;
    const qrImagePath = await qrisDinamis(`${totalAmount}`, "./options/sticker/qris.jpg");

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
        `*Kode Unik:* ${uniqueCode}\n` +
        `*Total:* Rp${toRupiah(totalAmount)}\n` +
        `*Waktu:* ${timeLeft} menit\n\n` +
        `Silakan scan QRIS di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n\n` +
        `Jika ingin membatalkan, ketik *${prefix}batal*`;

    // Improvement #3: Async file read
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
        // Simpan timestamp utk validasi notifikasi pembayaran
        createdAt: createdAtTs
    };

        // Improvement #1: Exponential backoff polling
        let pollInterval = 3000;  // Mulai dari 3 detik
        const maxInterval = 15000; // Maksimal 15 detik
        let pollCount = 0;

        while (db.data.order[sender]) {
            await sleep(pollInterval);

            // Tingkatkan interval secara bertahap
            if (pollCount < 10) {
                pollInterval = Math.min(Math.floor(pollInterval * 1.2), maxInterval);
            }
            pollCount++;

            if (Date.now() >= expirationTime) {
                await ronzz.sendMessage(from, { delete: message.key });
                reply("Pembayaran dibatalkan karena melewati batas waktu 30 menit.");
                delete db.data.order[sender];
                break;
            }

            try {
                const url = `${listener.baseUrl}/notifications?limit=50`;
                const headers = listener.apiKey ? { 'X-API-Key': listener.apiKey } : {};
                const resp = await axios.get(url, { headers, timeout: 5000 });
                const notifs = Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data) ? resp.data : []);

                // Hanya terima notifikasi setelah order dibuat dan jumlah harus sama persis
                const paid = notifs.find(n => {
                  try {
                    const pkgOk = (n.package_name === 'id.bmri.livinmerchant') || (String(n.app_name||'').toUpperCase().includes('LIVIN'))
                    const amt = Number(String(n.amount_detected || '').replace(/[^0-9]/g, ''))
                    const postedAt = n.posted_at ? new Date(n.posted_at).getTime() : 0
                    return pkgOk && amt === Number(totalAmount) && postedAt >= createdAtTs
                  } catch {
                    return false
                  }
                });

                if (paid) {
                    await ronzz.sendMessage(from, { delete: message.key });
                    reply("Pembayaran berhasil, data akun akan segera diproses.");

                    // Proses pembelian langsung (sama seperti case 'buy')
                    db.data.produk[data[0]].terjual += jumlah
                    let dataStok = []
                    for (let i = 0; i < jumlah; i++) {
                      dataStok.push(db.data.produk[data[0]].stok.shift())
                    }

                    // Improvement #4: Optimize string building dengan array.join()
                    const detailParts = [
                      `*📦 Produk:* ${db.data.produk[data[0]].name}`,
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

                    // Tambahkan SNK
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

                    const detailAkunCustomer = detailParts.join('\n');

                    // Improvement #5: Remove unused detailAkunOwner variable

                    // Kirim ke customer (1 pesan gabungan akun + SNK) - PRIORITAS UTAMA
                    console.log('🚀 STARTING CUSTOMER MESSAGE SEND PROCESS');
                    console.log('📞 Customer WhatsApp ID:', sender);
                    console.log('📏 Message length:', detailAkunCustomer.length);
                    
                    let customerMessageSent = false;
                    
                    // Attempt 1: Send with basic format
                    try {
                      console.log('📤 ATTEMPT 1: Sending full account details to customer...');
                      
                      // Add delay before sending to avoid rate limits
                      await sleep(1000);
                      
                      const messageResult = await ronzz.sendMessage(sender, { text: detailAkunCustomer });
                      console.log('📨 Message result:', JSON.stringify(messageResult?.key || 'no key'));
                      console.log('✅ SUCCESS: Account details sent to customer!');
                      
                      customerMessageSent = true;
                      
                    } catch (error) {
                      console.error('❌ ATTEMPT 1 FAILED:', error.message);
                      console.error('❌ Full error:', JSON.stringify(error, null, 2));
                      
                      // Attempt 2: Send in multiple smaller messages
                      try {
                        console.log('📤 ATTEMPT 2: Sending account details in multiple messages...');
                        
                        // Send header first
                        const headerParts = [
                          `*📦 DETAIL AKUN PEMBELIAN*`,
                          '',
                          `*Produk:* ${db.data.produk[data[0]].name}`,
                          `*Tanggal:* ${tanggal}`,
                          `*Jam:* ${jamwib} WIB`,
                          `*Jumlah Akun:* ${dataStok.length}`,
                          '',
                          `📋 Detail akun akan dikirim dalam pesan terpisah...`
                        ];
                        
                        await sleep(1000);
                        const headerMsg = await ronzz.sendMessage(sender, { text: headerParts.join('\n') });
                        console.log('✅ Header message sent:', headerMsg?.key?.id);
                        
                        // Send each account separately
                        for (let index = 0; index < dataStok.length; index++) {
                          await sleep(1500); // Delay between messages
                          const dataAkun = dataStok[index].split("|");
                          const accountParts = [
                            `*═══ AKUN ${index + 1} ═══*`,
                            `📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
                            `🔐 Password: ${dataAkun[1] || 'Tidak ada'}`
                          ];
                          if (dataAkun[2]) accountParts.push(`👤 Profil: ${dataAkun[2]}`);
                          if (dataAkun[3]) accountParts.push(`🔢 Pin: ${dataAkun[3]}`);
                          if (dataAkun[4]) accountParts.push(`🔒 2FA: ${dataAkun[4]}`);
                          
                          const accMsg = await ronzz.sendMessage(sender, { text: accountParts.join('\n') });
                          console.log(`✅ Account ${index + 1} sent:`, accMsg?.key?.id);
                        }
                        
                        // Send SNK separately if it exists
                        if (db.data.produk[data[0]].snk) {
                          await sleep(1500);
                          const snkParts = [
                            `*╭────「 SYARAT & KETENTUAN 」────╮*`,
                            '',
                            db.data.produk[data[0]].snk,
                            '',
                            `*⚠️ PENTING:*`,
                            `• Baca dan pahami SNK sebelum menggunakan akun`,
                            `• Akun yang sudah dibeli tidak dapat dikembalikan`,
                            `• Hubungi admin jika ada masalah dengan akun`,
                            '',
                            `*╰────「 END SNK 」────╯*`
                          ];
                          
                          const snkMsg = await ronzz.sendMessage(sender, { text: snkParts.join('\n') });
                          console.log('✅ SNK message sent:', snkMsg?.key?.id);
                        }
                        
                        console.log('✅ SUCCESS: All account details sent in separate messages!');
                        customerMessageSent = true;
                        
                      } catch (fallbackError) {
                        console.error('❌ ATTEMPT 2 ALSO FAILED:', fallbackError.message);
                        console.error('❌ Full error:', JSON.stringify(fallbackError, null, 2));
                        
                        // Attempt 3: Send basic text only
                        try {
                          console.log('📤 ATTEMPT 3: Sending basic notification...');
                          const basicMessage = `Akun berhasil dibeli!\n\nProduk: ${db.data.produk[data[0]].name}\nJumlah: ${jumlah} akun\n\nSilahkan hubungi admin untuk mendapatkan detail akun.`;
                          const basicMsg = await ronzz.sendMessage(sender, { text: basicMessage });
                          console.log('✅ SUCCESS: Basic notification sent:', basicMsg?.key?.id);
                          customerMessageSent = true;
                          
                        } catch (finalError) {
                          console.error('❌ ALL ATTEMPTS FAILED:', finalError.message);
                          console.error('❌ CUSTOMER WILL NOT RECEIVE ACCOUNT DETAILS!');
                        }
                      }
                    }
                    
                    console.log('🏁 CUSTOMER MESSAGE SEND RESULT:', customerMessageSent ? 'SUCCESS' : 'FAILED');

                    // Send single comprehensive success message
                    if (customerMessageSent) {
                      if (isGroup) {
                        reply("🎉 Pembayaran QRIS berhasil! Detail akun telah dikirim ke chat pribadi Anda. Terima kasih!");
                      } else {
                        reply("🎉 Pembayaran QRIS berhasil! Detail akun telah dikirim di atas. Terima kasih!");
                      }
                    } else {
                      reply("⚠️ Pembayaran QRIS berhasil, tetapi terjadi masalah saat mengirim detail akun. Admin akan segera mengirim detail akun secara manual.");
                      
                    // Skip sending alert to admin about failed delivery
                    }

                    // Improvement #3: Async file write untuk receipt (R2 atau local)
                    try {
                      const { saveReceipt } = require('./config/r2-storage');
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

                    // Tambah ke database transaksi (sama seperti case 'buy')
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

                    // Skip stock-empty admin notifications

                    delete db.data.order[sender];
                    
                    // Improvement #2: Batch database save (save sekali saja di akhir)
                    await db.save();
                    console.log(`✅ Transaction completed: ${orderId} - ${reffId}`);
                    break;
                }
            } catch (error) {
                console.error(`Error checking listener for ${orderId}:`, error);
            }
        }
    } catch (error) {
        console.error(`Error processing QRIS for ${data[0]}:`, error);
        reply("Gagal membuat QR Code pembayaran. Silakan coba lagi.");
        // Cleanup order yang gagal
        if (db.data.order[sender]) {
            delete db.data.order[sender];
        }
    }
  } catch (outerError) {
    console.error('❌ [BUYNOW] Outer error:', outerError)
    reply("Terjadi kesalahan saat memproses pembelian. Silakan coba lagi.")
  } finally {
    // 🔓 REDIS UNLOCK: Always release lock
    await releaseLock(sender, 'buynow')
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

  try {
    // Cek saldo user (PG-aware)
    let totalHarga = Number(hargaProduk(data[0], db.data.users[sender].role)) * jumlah
    const currentSaldo = typeof dbHelper.getUserSaldoAsync === 'function' ? await dbHelper.getUserSaldoAsync(sender) : dbHelper.getUserSaldo(sender)
    if (currentSaldo < totalHarga) {
      delete db.data.order[sender]
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

    // Improvement: Optimize string building dengan array.join()
    const detailParts = [
      `*📦 Produk:* ${db.data.produk[data[0]].name}`,
      `*📅 Tanggal:* ${tanggal}`,
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
            `*Tanggal:* ${tanggal}`,
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

    await db.save()
    
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
        `*📅 Tanggal:* ${tanggal}`,
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

    if (db.data.order[sender] !== undefined) {
      await ronzz.sendMessage(db.data.order[sender].from, { delete: db.data.order[sender].key })
      delete db.data.order[sender]
      cancelled = true
    }

    if (db.data.orderDeposit && db.data.orderDeposit[sender] !== undefined) {
      try { 
        await ronzz.sendMessage(db.data.orderDeposit[sender].from, { delete: db.data.orderDeposit[sender].key }) 
      } catch {}
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
  case 'zoom':
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
        } catch {}
  
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

      // Auto delete setelah 5 menit (300000 ms)
      setTimeout(async () => {
        try {
          await ronzz.sendMessage(from, {
            delete: sentMessage.key
          })
          console.log(`🗑️ Auto-deleted ${command} product list message after 5 minutes`)
        } catch (deleteError) {
          console.error(`❌ Failed to auto-delete ${command} message:`, deleteError.message)
        }
      }, 300000) // 5 menit = 300000 ms
  
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
        
        await dbHelper.updateUserSaldo(nomorNya, nominal, 'add')
        await sleep(50)
        
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
        
        await dbHelper.updateUserSaldo(nomorNya, nominal, 'subtract')
        await sleep(50)
        
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
        
        await dbHelper.updateUserSaldo(targetUser, nominal, 'add')
        await sleep(50)
        
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

      case 'tes': case 'runtime':
        reply(`*STATUS : BOT ONLINE*\n_Runtime : ${runtime(process.uptime())}_`)
        break

      case 'ping':
        let timestamp = speed()
        let latensi = speed() - timestamp
        reply(`Kecepatan respon _${latensi.toFixed(4)} Second_\n\n*💻 INFO SERVER*\nHOSTNAME: ${os.hostname}\nRAM: ${formatp(os.totalmem() - os.freemem())} / ${formatp(os.totalmem())}\nCPUs: ${os.cpus().length} core`)
        break

      case 'done': {
        if (!isGroup) return (mess.group)
        if (!isGroupAdmins && !isOwner) return (mess.admin)
        if (q.startsWith("@")) {
          if (db.data.chat[from].sDone.length !== 0) {
            let textDone = db.data.chat[from].sDone
            ronzz.sendMessage(from, { text: textDone.replace('tag', q.replace(/[^0-9]/g, '')).replace('@jam', jamwib).replace('@tanggal', tanggal).replace('@status', 'Berhasil'), mentions: [q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'] });
          } else {
            ronzz.sendMessage(from, { text: `「 *TRANSAKSI BERHASIL* 」\n\n\`\`\`📆 TANGGAL : ${tanggal}\n⌚ JAM : ${jamwib}\n✨ STATUS: Berhasil\`\`\`\n\nTerimakasih @${q.replace(/[^0-9]/g, '')} next order yaa🙏`, mentions: [q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'] }, { quoted: m });
          }
        } else if (isQuotedMsg) {
          if (db.data.chat[from].sDone.length !== 0) {
            let textDone = db.data.chat[from].sDone
            ronzz.sendMessage(from, { text: textDone.replace('tag', m.quoted.sender.split("@")[0]).replace('@jam', jamwib).replace('@tanggal', tanggal).replace('@status', 'Berhasil'), mentions: [m.quoted.sender] }, { quoted: m })
          } else {
            ronzz.sendMessage(from, { text: `「 *TRANSAKSI BERHASIL* 」\n\n\`\`\`📆 TANGGAL : ${tanggal}\n⌚ JAM : ${jamwib}\n✨ STATUS: Berhasil\`\`\`\n\nTerimakasih @${m.quoted.sender.split("@")[0]} next order yaa🙏`, mentions: [m.quoted.sender] })
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
          } catch {}
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