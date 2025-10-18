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
const BASE_QRIS_DANA = "00020101021126570011id.bmri.livinmerchant.WWW011893600915317777611502091777761150303UMI51440014ID.CO.QRIS.WWW0215ID10211049592540303UMI5204899953033605802ID5910gigihadiod6011Kab. Kediri610564154630406C2";
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true'
const { core, isProduction } = require('./config/midtrans');
const USE_POLLING = true; // true = pakai polling status Midtrans; false = andalkan webhook saja

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
      
      case 'menu': {
        let teks = global.menu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    },
                    {
                      title: 'LIST MENU',
                      highlight_label: 'Recommend',
                      rows: [
                        {
                          title: 'All Menu 📚',
                          description: 'Menampilkan semua menu',
                          id: '.allmenu'
                        },
                        {
                          title: 'Group Menu 🏢',
                          description: 'Menampilkan menu group',
                          id: '.groupmenu'
                        },
                        {
                          title: 'Info Bot 📌',
                          description: 'Menampilkan info bot',
                          id: '.infobot'
                        },
                        {
                          title: 'Order Menu 🛍️',
                          description: 'Menampilkan menu auto order',
                          id: '.ordermenu'
                        },
                        {
                          title: 'Owner Menu 🔑',
                          description: 'Menampilkan menu owner',
                          id: '.ownermenu'
                        },
                        {
                          title: 'Stalker Menu 📰',
                          description: 'Menampilkan menu cek nickname game',
                          id: '.stalkermenu'
                        },
                        {
                          title: 'Store Menu 🛒',
                          description: 'Menampilkan menu store',
                          id: '.storemenu'
                        },
                        {
                          title: 'Topup Menu 📥',
                          description: 'Menampilkan menu topup',
                          id: '.topupmenu'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'allmenu': {
        let teks = global.allmenu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'groupmenu': case 'grupmenu': {
        let teks = global.groupmenu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'infobot': {
        let teks = global.infobot(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'ownermenu': {
        let teks = global.ownermenu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'stalkermenu': {
        let teks = global.stalkermenu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'storemenu': {
        let teks = global.storemenu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'topupmenu': {
        let teks = global.topupmenu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break
        
      case 'ordermenu': {
        let teks = global.ordermenu(prefix, sender, pushname)
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: '.saldo', buttonText: { displayText: 'Saldo 📥' }, type: 1,
            }, {
              buttonId: '.owner', buttonText: { displayText: 'Owner 👤' }, type: 1,
            },
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'INFORMATION',
                      rows: [
                        {
                          title: 'Saldo 💳',
                          description: 'Menampilkan saldo kamu',
                          id: '.saldo'
                        },
                        {
                          title: 'List Harga 💰',
                          description: 'Menampilkan list harga layanan',
                          id: '.listharga'
                        }
                      ]
                    }
                  ]
                })
              }
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

// QRIS statis DANA dari kamu (JANGAN DIUBAH)

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
// - package_name "id.bmri.livinmerchant" atau appName "DANA" (kalau ada)
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
      const appOk = (n.packageName === "id.bmri.livinmerchant") || (String(n.appName || "").toUpperCase().includes("DANA"));
      const textOk = /menerima|received/i.test(String(n.text || "")) || /masuk/i.test(String(n.text || ""));
      return appOk && textOk && postedAt >= createdAt && amt === want;
    } catch {
      return false;
    }
  });

  return !!match;
}

// ====== CASE: QRIS Dinamis + Validasi PG ======
case 'qris': {
  // Validasi order berjalan
  if (db.data.order[sender]) {
    return reply(`Kamu sedang melakukan order. Harap tunggu sampai selesai atau ketik *${prefix}batal* untuk membatalkan.`);
  }

  // Validasi input
  const [productId, quantity] = q.split(" ");
  if (!productId || !quantity) {
    return reply(`Contoh: ${prefix + command} idproduk jumlah`);
  }

  // Validasi produk
  const product = db.data.produk[productId];
  if (!product) return reply(`Produk dengan ID *${productId}* tidak ditemukan.`);

  // Validasi stok
  const stock = product.stok;
  const quantityNum = Number(quantity);
  if (!Number.isInteger(quantityNum) || quantityNum <= 0) return reply(`Jumlah harus berupa angka positif.`);
  if (stock.length === 0) return reply("Stok habis, silakan hubungi Owner untuk restok.");
  if (stock.length < quantityNum) return reply(`Stok tersedia ${stock.length}, jumlah pesanan tidak boleh melebihi stok.`);

  reply("Sedang membuat QR Code...");

  // Proses
  const tanggal = nowJakarta().format("YYYY-MM-DD");
  const jamwib  = nowJakarta().format("HH:mm");

  try {
    // Harga
    const unitPrice = Number(hargaProduk(productId, db.data.users[sender]?.role));
    if (!unitPrice || unitPrice <= 0) throw new Error('Harga produk tidak valid');

    const amount = unitPrice * quantityNum;
    const uniqueCode = Math.floor(1 + Math.random() * 99);
    const totalAmount = amount + uniqueCode;
    if (totalAmount <= 0) throw new Error('Total amount tidak valid');

    const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
    const orderId = `TRX-${reffId}-${Date.now()}`;

    const qrImagePath = await qrisDinamis(`${totalAmount}`, "./options/sticker/qris.jpg");

    const expirationTime = Date.now() + toMs("30m");
    const expireDate = new Date(expirationTime);
    const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000));
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000);
    const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`;

    const caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n` +
        `*Produk ID:* ${productId}\n` +
        `*Nama Produk:* ${product.name}\n` +
        `*Harga:* Rp${toRupiah(unitPrice)}\n` +
        `*Jumlah:* ${quantityNum}\n` +
        `*Subtotal:* Rp${toRupiah(amount)}\n` +
        `*Kode Unik:* ${uniqueCode}\n` +
        `*Total:* Rp${toRupiah(totalAmount)}\n` +
        `*Waktu:* ${timeLeft} menit\n\n` +
        `Silakan scan QRIS di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n\n` +
        `Jika ingin membatalkan, ketik *${prefix}batal*`;

    const message = await ronzz.sendMessage(from, {
        image: fs.readFileSync(qrImagePath),
        caption: caption
    }, { quoted: m });

    db.data.order[sender] = {
        id: productId,
        jumlah: quantityNum,
        from,
        key: message.key,
        orderId,
        reffId,
        totalAmount,
        uniqueCode
    };

    // Polling status pembayaran (tiap 15 detik)
    while (db.data.order[sender]) {
      await sleep(15000);

      // Cek expired
      if (Date.now() >= expirationTime) {
        await ronzz.sendMessage(from, { delete: message.key });
        reply("Pembayaran dibatalkan karena melewati batas waktu 30 menit.");
        delete db.data.order[sender];
        break;
      }

      try {
        // Cek ke payment-gateway backend listener kamu
        const paid = await checkPaymentViaPG({
          totalAmount: totalAmount,
          createdAtISO: db.data.order[sender].createdAtISO,
          // deviceId: "opsional-jika-ada",
        });

        if (paid) {
          await ronzz.sendMessage(from, { delete: message.key });
          reply("Pembayaran berhasil, data akun akan segera diproses.");

          // Update stok & transaksi
          product.terjual = (product.terjual || 0) + quantityNum;
          const soldItems = stock.splice(0, quantityNum);
          await db.save();

          // Rangkai detail akun
          let detailAkun = `*📦 Produk:* ${product.name}\n` +
                           `*📅 Tanggal:* ${tanggal}\n` +
                           `*⏰ Jam:* ${jamwib} WIB\n\n`;

          soldItems.forEach((i) => {
            const dataAkun = i.split("|");
            detailAkun += `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`;
            detailAkun += `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`;
            detailAkun += `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}\n`;
            detailAkun += `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}\n`;
            detailAkun += `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}\n\n`;
          });

          await ronzz.sendMessage(sender, { text: detailAkun }, { quoted: m });
          await ronzz.sendMessage("6281389592985@s.whatsapp.net", { text: detailAkun }, { quoted: m });

          // SNK produk
          let snkProduk = `*╭────「 SYARAT & KETENTUAN 」────╮*\n\n`;
          snkProduk += `*📋 SNK PRODUK: ${product.name}*\n\n`;
          snkProduk += `${product.snk}\n\n`;
          snkProduk += `*⚠️ PENTING:*\n`;
          snkProduk += `• Baca dan pahami SNK sebelum menggunakan akun\n`;
          snkProduk += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`;
          snkProduk += `• Hubungi admin jika ada masalah dengan akun\n\n`;
          snkProduk += `*╰────「 END SNK 」────╯*`;
          await ronzz.sendMessage(sender, { text: snkProduk }, { quoted: m });

          if (isGroup) reply("Pembelian berhasil! Detail akun telah dikirim ke chat.");

          

          // Simpan transaksi
          db.data.transaksi.push({
            id: productId,
            name: product.name,
            price: unitPrice,
            date: nowJakarta().format("YYYY-MM-DD HH:mm:ss"),
            profit: product.profit,
            jumlah: quantityNum,
            user: sender.split("@")[0],
            userRole: db.data.users[sender]?.role,
            reffId,
            metodeBayar: "QRIS-DANA",
            totalBayar: totalAmount
          });
          await db.save();

          

          // Cleanup
          delete db.data.order[sender];
          await db.save();

          console.log(`✅ Transaction completed: ${orderId} - ${reffId}`);
          break;
        }
      } catch (err) {
        console.error(`Error checking payment via PG for ${orderId}:`, err.message);
        if (err.message?.includes("timeout")) continue;

        await ronzz.sendMessage(from, { delete: message.key });
        reply("Pesanan dibatalkan karena error sistem.");
        delete db.data.order[sender];
        break;
      }
    }
  } catch (error) {
    console.error(`Error creating QRIS DANA for ${sender}:`, error);
    reply("Gagal membuat QR Code pembayaran. Silakan coba lagi.");
  }
}
break;



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

  db.data.orderDeposit[sender] = { status: 'processing', reffId, metode: 'QRIS', startedAt: Date.now(), baseAmount, totalAmount, uniqueCode, bonus }

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

        const paid = notifs.find(n => (n.package_name === 'id.bmri.livinmerchant' || (n.app_name||'').toUpperCase().includes('DANA')) && Number((n.amount_detected || '').toString().replace(/[^0-9]/g, '')) === Number(totalAmount))

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
  if (db.data.order[sender] !== undefined) return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *${prefix}batal* untuk membatalkan pembayaran.`)
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
                    const pkgOk = (n.package_name === 'id.bmri.livinmerchant') || (String(n.app_name||'').toUpperCase().includes('DANA'))
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

                    // Improvement #3: Async file write untuk receipt
                    try {
                      const receiptPath = `./options/receipts/${reffId}.txt`;
                      
                      // Pastikan folder receipts ada
                      if (!fs.existsSync('./options/receipts')) {
                        fs.mkdirSync('./options/receipts', { recursive: true });
                      }
                      
                      await fs.promises.writeFile(receiptPath, detailAkunCustomer, 'utf8');
                      console.log(`✅ Receipt saved: ${receiptPath}`);
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
  }
  break;

case 'buymidtrans': {
  if (db.data.order[sender]) {
    return reply(`Kamu sedang melakukan order. Harap tunggu sampai selesai atau ketik *${prefix}batal* untuk membatalkan.`)
  }

  const [productId, quantity] = q.split(" ")
  if (!productId || !quantity) {
    return reply(`Contoh: ${prefix + command} idproduk jumlah`)
  }

  const product = db.data.produk[productId]
  if (!product) return reply(`Produk dengan ID *${productId}* tidak ditemukan.`)

  const stock = product.stok
  const quantityNum = Number(quantity)
  if (!Number.isInteger(quantityNum) || quantityNum <= 0) return reply(`Jumlah harus berupa angka positif.`)
  if (stock.length === 0) return reply("Stok habis, silakan hubungi Owner untuk restok.")
  if (stock.length < quantityNum) return reply(`Stok tersedia ${stock.length}, jumlah pesanan tidak boleh melebihi stok.`)

  reply("Sedang membuat QR Code Midtrans...")

  try {
    const unitPrice = Number(hargaProduk(productId, db.data.users[sender].role))
    if (!unitPrice || unitPrice <= 0) throw new Error('Harga produk tidak valid')

    const amount = unitPrice * quantityNum
    const feeOriginal = (amount * 0.007) + 0.20
    const fee = Math.ceil(feeOriginal * 0.5)
    const totalAmount = amount + fee
    if (totalAmount <= 0) throw new Error('Total amount tidak valid')

    const reffId = crypto.randomBytes(5).toString("hex").toUpperCase()
    const orderId = `TRX-${reffId}-${Date.now()}`
    const forceStatic = String(process.env.MIDTRANS_USE_STATIC_ONLY || '').toLowerCase() === 'true'
    let usingStatic = forceStatic
    let qrImagePath
    if (!forceStatic) {
      try {
        const qrisPayment = await createQRISPayment(totalAmount, orderId)
        if (!qrisPayment?.qr_string) {
          try { console.error('Midtrans QRIS charge missing qr_string:', JSON.stringify(qrisPayment)) } catch {}
          usingStatic = true
        } else {
          qrImagePath = await qrisDinamis(qrisPayment.qr_string, "./options/sticker/qris.jpg")
        }
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e)
        if (msg.includes('Payment channel is not activated') || msg.toLowerCase().includes('midtrans charge failed')) {
          usingStatic = true
        } else {
          throw e
        }
      }
    }

    if (usingStatic) {
      // fallback to static QR. If MIDTRANS_STATIC_QRIS provided, render that; else use image file
      const staticQris = process.env.MIDTRANS_STATIC_QRIS
      if (staticQris && staticQris.length > 50) {
        qrImagePath = await qrisDinamis(staticQris, "./options/sticker/qris_midtrans.jpg")
      } else {
        qrImagePath = "./options/sticker/qris_midtrans.jpg"
      }
    }

    const expirationTime = Date.now() + toMs("10m")
    const expireDate = new Date(expirationTime)
    const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000))
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000)
    const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`

    const caption = `*🧾 MENUNGGU PEMBAYARAN (QRIS Midtrans) 🧾*\n\n` +
      `*Produk ID:* ${productId}\n` +
      `*Nama Produk:* ${product.name}\n` +
      `*Harga:* Rp${toRupiah(unitPrice)}\n` +
      `*Jumlah:* ${quantityNum}\n` +
      `*Biaya Admin:* Rp${toRupiah(fee)}\n` +
      `*Total:* Rp${toRupiah(totalAmount)}\n` +
      `*Waktu:* ${timeLeft} menit\n\n` +
      (usingStatic ? `Scan QR statis Midtrans (GoPay via QRIS). Bayar sebelum ${formattedTime}.\n\n` : `Scan QR ini (mendukung GoPay via QRIS). Bayar sebelum ${formattedTime}.\n\n`) +
      `Jika ingin membatalkan, ketik *${prefix}batal*`

    const message = await ronzz.sendMessage(from, {
      image: fs.readFileSync(qrImagePath),
      caption: caption
    }, { quoted: m })

    db.data.order[sender] = { id: productId, jumlah: quantityNum, from, key: message.key, orderId, reffId }

    while (db.data.order[sender]) {
      await sleep(15000)
      if (Date.now() >= expirationTime) {
        await ronzz.sendMessage(from, { delete: message.key })
        reply("Pembayaran dibatalkan karena melewati batas waktu 10 menit.")
        delete db.data.order[sender]
        break
      }
      try {
        let paidNow = false
        if (!usingStatic) {
          const paymentStatus = await Promise.race([
            isPaymentCompleted(orderId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('API Timeout')), 10000))
          ])
          console.log(`Checking payment status for ${orderId}:`, paymentStatus)
          paidNow = (paymentStatus.status === "PAID" && Number(paymentStatus.paid_amount) >= Number(totalAmount))
        } else {
          // Check via external listener by matching the total amount
          try {
            const url = `${listener.baseUrl}/notifications?limit=50`
            const headers = listener.apiKey ? { 'X-API-Key': listener.apiKey } : {}
            const resp = await axios.get(url, { headers })
            const notifs = Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data) ? resp.data : [])
            const paid = notifs.find(n => (n.package_name === 'id.bmri.livinmerchant' || (n.app_name||'').toUpperCase().includes('DANA') || (n.app_name||'').toUpperCase().includes('GOPAY')) && Number((n.amount_detected || '').toString().replace(/[^0-9]/g, '')) === Number(totalAmount))
            paidNow = !!paid
          } catch (e) {
            console.error('Listener polling failed (static QR check):', e && e.message ? e.message : e)
          }
        }

        if (paidNow) {
          await ronzz.sendMessage(from, { delete: message.key })
          reply("Pembayaran berhasil, data akun akan segera diproses.")

          product.terjual += quantityNum
          const soldItems = stock.splice(0, quantityNum)
          await db.save()

          let detailAkun = `*📦 Produk:* ${product.name}\n`
          detailAkun += `*📅 Tanggal:* ${tanggal}\n`
          detailAkun += `*⏰ Jam:* ${jamwib} WIB\n\n`
          soldItems.forEach((i) => {
            let dataAkun = i.split("|")
            detailAkun += `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`
            detailAkun += `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`
            detailAkun += `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}\n`
            detailAkun += `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}\n`
            detailAkun += `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}\n\n`
          })

          await ronzz.sendMessage(sender, { text: detailAkun }, { quoted: m })

          let snkProduk = `*╭────「 SYARAT & KETENTUAN 」────╮*\n\n`
          snkProduk += `*📋 SNK PRODUK: ${product.name}*\n\n`
          snkProduk += `${product.snk}\n\n`
          snkProduk += `*⚠️ PENTING:*\n`
          snkProduk += `• Baca dan pahami SNK sebelum menggunakan akun\n`
          snkProduk += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`
          snkProduk += `• Hubungi admin jika ada masalah dengan akun\n\n`
          snkProduk += `*╰────「 END SNK 」────╯*`
          await ronzz.sendMessage(sender, { text: snkProduk }, { quoted: m })

          if (isGroup) reply("Pembelian berhasil! Detail akun telah dikirim ke chat.")

          await ronzz.sendMessage(ownerNomer + "@s.whatsapp.net", { text: `Hai Owner,\nAda transaksi dengan BUYMIDTRANS yang telah selesai!\n\n*╭────「 TRANSAKSI DETAIL 」───*\n*┊・ 🧾| Reff Id:* ${reffId}\n*┊・ 📮| Nomor:* @${sender.split("@")[0]}\n*┊・ 📦| Nama Barang:* ${product.name}\n*┊・ 🏷️️| Harga Barang:* Rp${toRupiah(unitPrice)}\n*┊・ 🛍️| Jumlah Order:* ${quantityNum}\n*┊・ 💰| Total Bayar:* Rp${toRupiah(totalAmount)}\n*┊・ 💳| Metode Bayar:* QRIS-MIDTRANS (GoPay)\n*┊・ 📅| Tanggal:* ${tanggal}\n*┊・ ⏰| Jam:* ${jamwib} WIB\n*╰┈┈┈┈┈┈┈┈*`, mentions: [sender] })

          db.data.transaksi.push({
            id: productId,
            name: product.name,
            price: unitPrice,
            date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
            profit: product.profit,
            jumlah: quantityNum,
            user: sender.split("@")[0],
            userRole: db.data.users[sender].role,
            reffId,
            metodeBayar: "QRIS",
            totalBayar: totalAmount
          })
          await db.save()

          if (stock.length === 0) {
            const stokHabisMessage = `🚨 *STOK HABIS ALERT!* 🚨\n\n` +
              `*📦 Produk:* ${product.name}\n` +
              `*🆔 ID Produk:* ${productId}\n` +
              `*📊 Stok Sebelumnya:* ${quantityNum}\n` +
              `*📉 Stok Sekarang:* 0 (HABIS)\n` +
              `*🛒 Terjual Terakhir:* ${quantityNum} akun\n` +
              `*👤 Pembeli:* @${sender.split("@")[0]}\n` +
              `*💰 Total Transaksi:* Rp${toRupiah(totalAmount)}\n` +
              `*📅 Tanggal:* ${tanggal}\n` +
              `*⏰ Jam:* ${jamwib} WIB\n\n` +
              `*⚠️ TINDAKAN YANG DIPERLUKAN:*\n` +
              `• Segera restok produk ini\n` +
              `• Update harga jika diperlukan\n` +
              `• Cek profit margin\n\n` +
              `*💡 Tips:* Gunakan command *${prefix}addstok ${productId} jumlah* untuk menambah stok`
            await ronzz.sendMessage(ownerNomer + "@s.whatsapp.net", { text: stokHabisMessage, mentions: [sender] })
          }

          delete db.data.order[sender]
          await db.save()
          console.log(`✅ Transaction completed: ${orderId} - ${reffId}`)
          break
        }
      } catch (error) {
        console.error(`Error checking payment status for ${orderId}:`, error)
        if (error.message === 'API Timeout') {
          console.log(`API timeout for ${orderId}, continuing...`)
          continue
        }
        await ronzz.sendMessage(from, { delete: message.key })
        reply("Pesanan dibatalkan karena error sistem.")
        delete db.data.order[sender]
        break
      }
    }
  } catch (error) {
    console.error('Error creating QRIS payment for buymidtrans:', error)
    reply("Gagal membuat QR Code pembayaran. Silakan coba lagi.")
  }
}
break;

case 'midtrans': {
  if (db.data.order[sender]) {
    return reply(`Kamu sedang melakukan order. Harap tunggu sampai selesai atau ketik *${prefix}batal* untuk membatalkan.`)
  }

  const [productId, quantity] = q.split(" ")
  if (!productId || !quantity) {
    return reply(`Contoh: ${prefix + command} idproduk jumlah`)
  }

  const product = db.data.produk[productId]
  if (!product) return reply(`Produk dengan ID *${productId}* tidak ditemukan.`)

  const stock = product.stok
  const quantityNum = Number(quantity)
  if (!Number.isInteger(quantityNum) || quantityNum <= 0) return reply(`Jumlah harus berupa angka positif.`)
  if (stock.length === 0) return reply("Stok habis, silakan hubungi Owner untuk restok.")
  if (stock.length < quantityNum) return reply(`Stok tersedia ${stock.length}, jumlah pesanan tidak boleh melebihi stok.`)

  reply("Sedang membuat QR Code...")

  try {
    const unitPrice = Number(hargaProduk(productId, db.data.users[sender].role))
    if (!unitPrice || unitPrice <= 0) throw new Error('Harga produk tidak valid')

    const amount = unitPrice * quantityNum
    const feeOriginal = (amount * 0.007) + 0.20
    const fee = Math.ceil(feeOriginal * 0.5)
    const totalAmount = amount + fee
    if (totalAmount <= 0) throw new Error('Total amount tidak valid')

    const reffId = crypto.randomBytes(5).toString("hex").toUpperCase()
    const orderId = `TRX-${reffId}-${Date.now()}`

    const qrisPayment = await createQRISPayment(totalAmount, orderId)
    if (!qrisPayment?.qr_string) throw new Error('Gagal membuat QRIS payment')

    const qrImagePath = await qrisDinamis(qrisPayment.qr_string, "./options/sticker/qris.jpg")

    const expirationTime = Date.now() + toMs("10m")
    const expireDate = new Date(expirationTime)
    const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000))
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000)
    const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`

    const caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n` +
      `*Produk ID:* ${productId}\n` +
      `*Nama Produk:* ${product.name}\n` +
      `*Harga:* Rp${toRupiah(unitPrice)}\n` +
      `*Jumlah:* ${quantityNum}\n` +
      `*Biaya Admin:* Rp${toRupiah(fee)}\n` +
      `*Total:* Rp${toRupiah(totalAmount)}\n` +
      `*Waktu:* ${timeLeft} menit\n\n` +
      `Silakan scan QRIS di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n\n` +
      `*🔗 Link Invoice:* ${qrisPayment.snap_url || qrisPayment.qr_string}\n\n` +
      `Jika ingin membatalkan, ketik *${prefix}batal*`

    const message = await ronzz.sendMessage(from, {
      image: fs.readFileSync(qrImagePath),
      caption: caption
    }, { quoted: m })

    db.data.order[sender] = { id: productId, jumlah: quantityNum, from, key: message.key, orderId, reffId }

    while (db.data.order[sender]) {
      await sleep(15000)
      if (Date.now() >= expirationTime) {
        await ronzz.sendMessage(from, { delete: message.key })
        reply("Pembayaran dibatalkan karena melewati batas waktu 10 menit.")
        delete db.data.order[sender]
        break
      }
      try {
        const paymentStatus = await Promise.race([
          isPaymentCompleted(orderId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('API Timeout')), 10000))
        ])
        console.log(`Checking payment status for ${orderId}:`, paymentStatus)
        if (paymentStatus.status === "PAID" && Number(paymentStatus.paid_amount) >= Number(totalAmount)) {
          await ronzz.sendMessage(from, { delete: message.key })
          reply("Pembayaran berhasil, data akun akan segera diproses.")

          product.terjual += quantityNum
          const soldItems = stock.splice(0, quantityNum)
          await db.save()

          let detailAkun = `*📦 Produk:* ${product.name}\n`
          detailAkun += `*📅 Tanggal:* ${tanggal}\n`
          detailAkun += `*⏰ Jam:* ${jamwib} WIB\n\n`
          soldItems.forEach((i) => {
            let dataAkun = i.split("|")
            detailAkun += `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`
            detailAkun += `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`
            detailAkun += `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}\n`
            detailAkun += `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}\n`
            detailAkun += `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}\n\n`
          })

          await ronzz.sendMessage(sender, { text: detailAkun }, { quoted: m })

          let snkProduk = `*╭────「 SYARAT & KETENTUAN 」────╮*\n\n`
          snkProduk += `*📋 SNK PRODUK: ${product.name}*\n\n`
          snkProduk += `${product.snk}\n\n`
          snkProduk += `*⚠️ PENTING:*\n`
          snkProduk += `• Baca dan pahami SNK sebelum menggunakan akun\n`
          snkProduk += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`
          snkProduk += `• Hubungi admin jika ada masalah dengan akun\n\n`
          snkProduk += `*╰────「 END SNK 」────╯*`
          await ronzz.sendMessage(sender, { text: snkProduk }, { quoted: m })

          if (isGroup) reply("Pembelian berhasil! Detail akun telah dikirim ke chat.")

          await ronzz.sendMessage(ownerNomer + "@s.whatsapp.net", { text: `Hai Owner,\nAda transaksi dengan QRIS-MIDTRANS yang telah selesai!\n\n*╭────「 TRANSAKSI DETAIL 」───*\n*┊・ 🧾| Reff Id:* ${reffId}\n*┊・ 📮| Nomor:* @${sender.split("@")[0]}\n*┊・ 📦| Nama Barang:* ${product.name}\n*┊・ 🏷️️| Harga Barang:* Rp${toRupiah(unitPrice)}\n*┊・ 🛍️| Jumlah Order:* ${quantityNum}\n*┊・ 💰| Total Bayar:* Rp${toRupiah(totalAmount)}\n*┊・ 💳| Metode Bayar:* QRIS-MIDTRANS\n*┊・ 📅| Tanggal:* ${tanggal}\n*┊・ ⏰| Jam:* ${jamwib} WIB\n*╰┈┈┈┈┈┈┈┈*`, mentions: [sender] })

          db.data.transaksi.push({
            id: productId,
            name: product.name,
            price: unitPrice,
            date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
            profit: product.profit,
            jumlah: quantityNum,
            user: sender.split("@")[0],
            userRole: db.data.users[sender].role,
            reffId,
            metodeBayar: "QRIS",
            totalBayar: totalAmount
          })
          await db.save()

          if (stock.length === 0) {
            const stokHabisMessage = `🚨 *STOK HABIS ALERT!* 🚨\n\n` +
              `*📦 Produk:* ${product.name}\n` +
              `*🆔 ID Produk:* ${productId}\n` +
              `*📊 Stok Sebelumnya:* ${quantityNum}\n` +
              `*📉 Stok Sekarang:* 0 (HABIS)\n` +
              `*🛒 Terjual Terakhir:* ${quantityNum} akun\n` +
              `*👤 Pembeli:* @${sender.split("@")[0]}\n` +
              `*💰 Total Transaksi:* Rp${toRupiah(totalAmount)}\n` +
              `*📅 Tanggal:* ${tanggal}\n` +
              `*⏰ Jam:* ${jamwib} WIB\n\n` +
              `*⚠️ TINDAKAN YANG DIPERLUKAN:*\n` +
              `• Segera restok produk ini\n` +
              `• Update harga jika diperlukan\n` +
              `• Cek profit margin\n\n` +
              `*💡 Tips:* Gunakan command *${prefix}addstok ${productId} jumlah* untuk menambah stok`
            await ronzz.sendMessage(ownerNomer + "@s.whatsapp.net", { text: stokHabisMessage, mentions: [sender] })
          }

          delete db.data.order[sender]
          await db.save()
          console.log(`✅ Transaction completed: ${orderId} - ${reffId}`)
          break
        }
      } catch (error) {
        console.error(`Error checking payment status for ${orderId}:`, error)
        if (error.message === 'API Timeout') {
          console.log(`API timeout for ${orderId}, continuing...`)
          continue
        }
        await ronzz.sendMessage(from, { delete: message.key })
        reply("Pesanan dibatalkan karena error sistem.")
        delete db.data.order[sender]
        break
      }
    }
  } catch (error) {
    console.error(`Error creating QRIS payment for ${orderId}:`, error)
    reply("Gagal membuat QR Code pembayaran. Silakan coba lagi.")
  }
}
break;

case 'cekmidtrans': {
  const id = (q || '').trim()
  if (!id) return reply(`Contoh: ${prefix + command} <order_id ATAU transaction_id>`)
  try {
    let data
    // Try order_id first
    try {
      data = await getTransactionStatusByOrderId(id)
    } catch (e1) {
      // fallback to transaction_id
      data = await getTransactionStatusByTransactionId(id)
    }
    const lines = []
    lines.push(`*Midtrans Status*`)
    if (data.order_id) lines.push(`Order ID: ${data.order_id}`)
    if (data.transaction_id) lines.push(`Transaction ID: ${data.transaction_id}`)
    if (data.payment_type) lines.push(`Channel: ${data.payment_type.toUpperCase()}`)
    if (data.transaction_status) lines.push(`Status: ${data.transaction_status}`)
    if (data.gross_amount) lines.push(`Amount: Rp${toRupiah(Number(data.gross_amount))}`)
    if (data.acquirer) lines.push(`Acquirer: ${data.acquirer}`)
    if (data.issuer) lines.push(`Issuer: ${data.issuer}`)
    if (data.payment_reference) lines.push(`Payment Ref: ${data.payment_reference}`)
    lines.push(`Raw code: ${data.status_code || '-'} | ${data.status_message || '-'}`)
    reply(lines.join("\n"))
  } catch (error) {
    console.error('cekmidtrans error:', error && error.message ? error.message : error)
    reply('Gagal cek status Midtrans. Pastikan ID benar (order_id atau transaction_id).')
  }
}
break;

case 'buy': {
  if (db.data.order[sender] !== undefined) return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *${prefix}batal* untuk membatalkan pembayaran.`)
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
    // Jika bukan owner tapi ada 3 parameter, abaikan parameter ketiga
    console.log(`⚠️ Non-owner user tried to use 3 parameters, ignoring third parameter`)
    reply(`ℹ️ Parameter ketiga diabaikan. Untuk membeli akun dan mengirim ke nomor lain, hubungi owner/admin.`)
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

    reply(isOwnerBuy ? `Sedang memproses pembelian untuk nomor ${data[2]}...` : "Sedang memproses pembelian dengan saldo...")

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
      `*⚠️ PENTING:*`,
      `• Baca dan pahami SNK sebelum menggunakan akun`,
      `• Akun yang sudah dibeli tidak dapat dikembalikan`,
      `• Hubungi admin jika ada masalah dengan akun`,
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
      console.log(`   - Target: ${targetNumber}`);
      console.log(`   - Cleaned Number: ${cleanedNumber || 'N/A'}`);
      console.log(`   - Product: ${data[0]} (${jumlah} items)`);
      console.log(`   - Delivery: ${customerMessageSent ? 'SUCCESS' : 'FAILED'}`);
    } else {
      console.log(`👤 REGULAR BUY SUMMARY:`);
      console.log(`   - Customer: ${sender}`);
      console.log(`   - Product: ${data[0]} (${jumlah} items)`);
      console.log(`   - Delivery: ${customerMessageSent ? 'SUCCESS' : 'FAILED'}`);
    }

    // Improvement: Async file write untuk receipt
    try {
      const receiptPath = `./options/receipts/${reffId}.txt`;
      
      // Pastikan folder receipts ada
      if (!fs.existsSync('./options/receipts')) {
        fs.mkdirSync('./options/receipts', { recursive: true });
      }
      
      await fs.promises.writeFile(receiptPath, detailAkunCustomer, 'utf8');
      console.log(`✅ Receipt saved: ${receiptPath}`);
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
      metodeBayar: "Saldo",
      totalBayar: totalHarga,
      isOwnerBuy: isOwnerBuy,
      targetNumber: isOwnerBuy ? (cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '')) : null
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
        
        // Kirim notifikasi ke owner tentang transaksi yang berhasil
        const ownerNotification = `📋 *OWNER BUY NOTIFICATION*
        
*✅ Transaksi Berhasil*
*📦 Produk:* ${db.data.produk[data[0]].name}
*🔢 Jumlah:* ${jumlah} akun
*📞 Nomor Tujuan:* ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'}
*💰 Total Harga:* Rp${toRupiah(totalHarga)}
*📅 Tanggal:* ${tanggal}
*⏰ Jam:* ${jamwib} WIB
*🆔 Ref ID:* ${reffId}

*📤 Status Pengiriman:* ✅ Berhasil dikirim ke nomor tujuan`
        
        try {
          await ronzz.sendMessage(sender, { text: ownerNotification })
          console.log('✅ Owner notification sent successfully')
        } catch (notifError) {
          console.error('❌ Failed to send owner notification:', notifError.message)
        }
      } else if (isGroup) {
        reply("🎉 Pembelian dengan saldo berhasil! Detail akun telah dikirim ke chat pribadi Anda. Terima kasih!");
      } else {
        reply("🎉 Pembelian dengan saldo berhasil! Detail akun telah dikirim di atas. Apabila tidak terlihat rechat agar dikirim ulang Terima kasih!");
      }
    } else {
      if (isOwnerBuy) {
        reply(`⚠️ Pembelian berhasil, tetapi terjadi masalah saat mengirim detail akun ke nomor ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'}. Silakan coba kirim ulang atau hubungi admin.`);
        
        // Kirim notifikasi error ke owner
        const errorNotification = `📋 *OWNER BUY ERROR NOTIFICATION*
        
*⚠️ Transaksi Berhasil - Pengiriman Gagal*
*📦 Produk:* ${db.data.produk[data[0]].name}
*🔢 Jumlah:* ${jumlah} akun
*📞 Nomor Tujuan:* ${cleanedNumber || targetNumber?.replace('@s.whatsapp.net', '') || 'N/A'}
*💰 Total Harga:* Rp${toRupiah(totalHarga)}
*📅 Tanggal:* ${tanggal}
*⏰ Jam:* ${jamwib} WIB
*🆔 Ref ID:* ${reffId}

*📤 Status Pengiriman:* ❌ Gagal dikirim ke nomor tujuan
*🔧 Tindakan:* Silakan kirim manual atau coba ulang`
        
        try {
          await ronzz.sendMessage(sender, { text: errorNotification })
          console.log('✅ Owner error notification sent successfully')
        } catch (notifError) {
          console.error('❌ Failed to send owner error notification:', notifError.message)
        }
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
  
      case 'batal': {
        let cancelled = false
        if (db.data.order && db.data.order[sender] !== undefined) {
          await ronzz.sendMessage(db.data.order[sender].from, { delete: db.data.order[sender].key })
          delete db.data.order[sender]
          cancelled = true
        }
        if (db.data.orderDeposit && db.data.orderDeposit[sender] !== undefined) {
          try { await ronzz.sendMessage(db.data.orderDeposit[sender].from, { delete: db.data.orderDeposit[sender].key }) } catch {}
          delete db.data.orderDeposit[sender]
          cancelled = true
        }
        if (cancelled) reply("Berhasil membatalkan pembayaran")
      }
        break
        
      case 'riwayat': {
        if (!q) {
          // Tampilkan 10 transaksi terbaru (global)
          const trx = (db.data.transaksi || [])
            .filter(Boolean)
            .slice(-10)
            .reverse();
          if (trx.length === 0) return reply('Belum ada transaksi.');
          let teks = `*📊 10 Transaksi Terbaru*\n\n`;
          trx.forEach((t, i) => {
            teks += `*${i + 1}. ${t.name}*\n`;
            teks += `• ID: ${t.id}\n`;
            teks += `• Harga: Rp${toRupiah(parseInt(t.price) || 0)}\n`;
            teks += `• Jumlah: ${t.jumlah || 1}\n`;
            teks += `• Total: Rp${toRupiah(t.totalBayar || ((parseInt(t.price) || 0) * (t.jumlah || 1)))}\n`;
            teks += `• Metode: ${t.metodeBayar || t.payment_method || 'Tidak diketahui'}\n`;
            teks += `• Tanggal: ${t.date || '-'}\n`;
            teks += `• Reff ID: ${t.reffId || t.order_id || '-'}\n\n`;
          });
          return reply(teks);
        }
        
        let targetUser = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net"
        let alluserTransaksi = db.data.transaksi.filter(t => t.user === q.replace(/[^0-9]/g, ''))
        let userTransaksi = (db.data.transaksi || [])
          .filter(t => t && (t.user === q.replace(/[^0-9]/g, '')))
          .slice(-10)
          .reverse()
        
        if (userTransaksi.length === 0) {
          return reply(`Tidak ada riwayat transaksi untuk nomor *${q}*`)
        }
        
        let teks = `*📊 RIWAYAT TRANSAKSI USER*\n\n`
        teks += `*📱 Nomor:* ${q}\n`
        teks += `*📅 Total Transaksi:* ${alluserTransaksi.length}\n\n`
        
        userTransaksi.forEach((t, i) => {
          teks += `*${i + 1}. ${t.name}*\n`
          teks += `• ID: ${t.id}\n`
          teks += `• Harga: Rp${toRupiah(t.price)}\n`
          teks += `• Jumlah: ${t.jumlah}\n`
          teks += `• Total: Rp${toRupiah(t.totalBayar || (t.price * t.jumlah))}\n`
          teks += `• Metode: ${t.metodeBayar || 'Tidak diketahui'}\n`
          teks += `• Tanggal: ${t.date}\n`
          teks += `• Reff ID: ${t.reffId || 'Tidak ada'}\n\n`
        })
        
        reply(teks)
        
        // Auto delete after 5 minutes
        setTimeout(() => {
          try {
            client.deleteMessage(from, { id: m.key.id, remoteJid: from, participant: m.key.participant })
          } catch (e) {
            console.log('Failed to delete riwayat message:', e.message)
          }
        }, 5 * 60 * 1000)
      }
        break
        
      case 'statistik': {
        if (!isOwner) return reply(mess.owner)
        
        let totalTransaksi = db.data.transaksi.length
        let transaksiSaldo = db.data.transaksi.filter(t => t.metodeBayar === "Saldo").length
        let transaksiQris = db.data.transaksi.filter(t => t.metodeBayar === "QRIS").length
        let totalPendapatan = db.data.transaksi.reduce((sum, t) => sum + (t.totalBayar || (t.price * t.jumlah)), 0)
        
        // Hitung user unik yang melakukan transaksi
        let uniqueUsers = [...new Set(db.data.transaksi.map(t => t.user).filter(u => u))]
        let totalUsers = uniqueUsers.length
        
        let teks = `*📊 STATISTIK TRANSAKSI*\n\n`
        teks += `*📈 Total Transaksi:* ${totalTransaksi}\n`
        teks += `*👥 Total User Unik:* ${totalUsers}\n`
        teks += `*💳 Transaksi Saldo:* ${transaksiSaldo}\n`
        teks += `*📱 Transaksi QRIS:* ${transaksiQris}\n`
        teks += `*💰 Total Pendapatan:* Rp${toRupiah(totalPendapatan)}\n\n`
        
        if (uniqueUsers.length > 0) {
          teks += `*🏆 TOP 5 USER AKTIF:*\n`
          let userStats = {}
          db.data.transaksi.forEach(t => {
            if (t.user) {
              userStats[t.user] = (userStats[t.user] || 0) + 1
            }
          })
          
          let sortedUsers = Object.entries(userStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
          
          sortedUsers.forEach(([user, count], i) => {
            teks += `${i + 1}. ${user}: ${count} transaksi\n`
          })
        }
        
        reply(teks)
      }
        break
        
      case 'cari': {
        if (!q) return reply(`Contoh: ${prefix + command} <reff_id>\n\nContoh: ${prefix + command} ABC123`)
        
        let reffId = q.toUpperCase()
        let transaksi = db.data.transaksi.find(t => t.reffId === reffId)
        
        if (!transaksi) {
          return reply(`Tidak ada transaksi dengan Reff ID *${reffId}*`)
        }
        
        let teks = `*🔍 DETAIL TRANSAKSI*\n\n`
        teks += `*🧾 Reff ID:* ${transaksi.reffId}\n`
        teks += `*📱 User:* ${transaksi.user || 'Tidak diketahui'}\n`
        teks += `*👑 Role:* ${transaksi.userRole || 'Tidak diketahui'}\n`
        teks += `*📦 Produk:* ${transaksi.name}\n`
        teks += `*🏷️ ID Produk:* ${transaksi.id}\n`
        teks += `*💰 Harga Satuan:* Rp${toRupiah(transaksi.price)}\n`
        teks += `*🛍️ Jumlah:* ${transaksi.jumlah}\n`
        teks += `*💵 Total Bayar:* Rp${toRupiah(transaksi.totalBayar || (transaksi.price * transaksi.jumlah))}\n`
        teks += `*💳 Metode Bayar:* ${transaksi.metodeBayar || 'Tidak diketahui'}\n`
        teks += `*📅 Tanggal:* ${transaksi.date}\n`
        teks += `*💸 Profit:* ${transaksi.profit || 'Tidak diketahui'}`
        
        reply(teks)
      }
        break
        
      case 'export': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} <format>\n\nFormat: json, csv, txt`)
        
        let format = q.toLowerCase()
        let filename = `transaksi_${moment.tz("Asia/Jakarta").format("YYYY-MM-DD_HH-mm-ss")}`
        
        if (format === 'json') {
          let jsonData = JSON.stringify(db.data.transaksi, null, 2)
          fs.writeFileSync(`./options/${filename}.json`, jsonData, 'utf8')
          reply(`Data transaksi berhasil diexport ke file *${filename}.json*`)
        } else if (format === 'csv') {
          let csvData = 'User,Role,Produk,ID Produk,Harga,Jumlah,Total,Metode,Tanggal,Reff ID,Profit\n'
          db.data.transaksi.forEach(t => {
            csvData += `${t.user || 'N/A'},${t.userRole || 'N/A'},${t.name},${t.id},${t.price},${t.jumlah},${t.totalBayar || (t.price * t.jumlah)},${t.metodeBayar || 'N/A'},${t.date},${t.reffId || 'N/A'},${t.profit || 'N/A'}\n`
          })
          fs.writeFileSync(`./options/${filename}.csv`, csvData, 'utf8')
          reply(`Data transaksi berhasil diexport ke file *${filename}.csv*`)
        } else if (format === 'txt') {
          let txtData = 'DATA TRANSAKSI\n\n'
          db.data.transaksi.forEach((t, i) => {
            txtData += `${i + 1}. ${t.name}\n`
            txtData += `   User: ${t.user || 'N/A'}\n`
            txtData += `   Role: ${t.userRole || 'N/A'}\n`
            txtData += `   ID: ${t.id}\n`
            txtData += `   Harga: Rp${t.price}\n`
            txtData += `   Jumlah: ${t.jumlah}\n`
            txtData += `   Total: Rp${t.totalBayar || (t.price * t.jumlah)}\n`
            txtData += `   Metode: ${t.metodeBayar || 'N/A'}\n`
            txtData += `   Tanggal: ${t.date}\n`
            txtData += `   Reff ID: ${t.reffId || 'N/A'}\n`
            txtData += `   Profit: ${t.profit || 'N/A'}\n\n`
          })
          fs.writeFileSync(`./options/${filename}.txt`, txtData, 'utf8')
          reply(`Data transaksi berhasil diexport ke file *${filename}.txt*`)
        } else {
          reply(`Format tidak valid! Gunakan: json, csv, atau txt`)
        }
      }
        break
        
      case 'ubahrole': {
        if (!isOwner) return reply(mess.owner)
        
        // Cek apakah ada quote/reply message
        if (!m.quoted) {
          return reply(`Contoh penggunaan:\n\n1. Reply/quote pesan user: ${prefix + command} <tiperole>\n2. Ubah role sendiri: ${prefix + command} saya <tiperole>\n\nRole tersedia: bronze, silver, gold`)
        }
        
        let args = q.split(' ')
        let targetUser, newRole
        
        // Cek apakah user ingin mengubah role sendiri
        if (args[0] === 'saya') {
          targetUser = sender
          newRole = args[1]
        } else {
          // Ambil user dari quoted message
          targetUser = m.quoted.participant || m.quoted.sender
          newRole = args[0]
        }
        
        if (!newRole) {
          return reply(`Contoh penggunaan:\n\n1. Reply/quote pesan user: ${prefix + command} <tiperole>\n2. Ubah role sendiri: ${prefix + command} saya <tiperole>\n\nRole tersedia: bronze, silver, gold`)
        }
        
        // Validasi role
        const validRoles = ['bronze', 'silver', 'gold']
        if (!validRoles.includes(newRole.toLowerCase())) {
          return reply(`Role tidak valid! Role tersedia: ${validRoles.join(', ')}`)
        }
        
        // Cek apakah user ada di database
        if (!db.data.users[targetUser]) {
          db.data.users[targetUser] = {
            saldo: 0,
            role: 'bronze'
          }
        }
        
        // Simpan role lama untuk notifikasi
        let oldRole = db.data.users[targetUser].role || 'bronze'
        
        // Update role
        db.data.users[targetUser].role = newRole.toLowerCase()
        
        // Kirim notifikasi
        let teks = `*🔄 ROLE BERHASIL DIUBAH*\n\n`
        teks += `*👤 User:* ${targetUser.split('@')[0]}\n`
        teks += `*👑 Role Lama:* ${oldRole}\n`
        teks += `*👑 Role Baru:* ${newRole}\n`
        teks += `*👨‍💼 Diubah oleh:* ${sender.split('@')[0]}\n`
        teks += `*⏰ Waktu:* ${moment.tz("Asia/Jakarta").format("HH:mm:ss")}`
        
        reply(teks)
      }
        break
        
      case 'dashboard': {
        if (!isOwner) return reply(mess.owner)
        
        // Data untuk dashboard
        let dashboardData = {
          totalTransaksi: db.data.transaksi.length,
          totalPendapatan: db.data.transaksi.reduce((sum, t) => sum + (t.totalBayar || (t.price * t.jumlah)), 0),
          transaksiHariIni: db.data.transaksi.filter(t => {
            let today = moment.tz("Asia/Jakarta").format("YYYY-MM-DD")
            return t.date.startsWith(today)
          }).length,
          pendapatanHariIni: db.data.transaksi.filter(t => {
            let today = moment.tz("Asia/Jakarta").format("YYYY-MM-DD")
            return t.date.startsWith(today)
          }).reduce((sum, t) => sum + (t.totalBayar || (t.price * t.jumlah)), 0),
          metodeBayar: {
            saldo: db.data.transaksi.filter(t => t.metodeBayar === "Saldo").length,
            qris: db.data.transaksi.filter(t => t.metodeBayar === "QRIS").length
          },
          topUsers: []
        }
        
        // Hitung top users
        let userStats = {}
        db.data.transaksi.forEach(t => {
          if (t.user) {
            userStats[t.user] = (userStats[t.user] || 0) + 1
          }
        })
        
        let sortedUsers = Object.entries(userStats)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
        
        dashboardData.topUsers = sortedUsers.map(([user, count]) => ({
          user: user,
          transaksi: count,
          totalSpent: db.data.transaksi.filter(t => t.user === user)
            .reduce((sum, t) => sum + (t.totalBayar || (t.price * t.jumlah)), 0)
        }))
        
        // Export data dashboard ke JSON
        let filename = `dashboard_${moment.tz("Asia/Jakarta").format("YYYY-MM-DD_HH-mm-ss")}.json`
        fs.writeFileSync(`./options/${filename}`, JSON.stringify(dashboardData, null, 2), 'utf8')
        
        let teks = `*📊 DASHBOARD DATA EXPORTED*\n\n`
        teks += `*📈 Total Transaksi:* ${dashboardData.totalTransaksi}\n`
        teks += `*💰 Total Pendapatan:* Rp${toRupiah(dashboardData.totalPendapatan)}\n`
        teks += `*📅 Transaksi Hari Ini:* ${dashboardData.transaksiHariIni}\n`
        teks += `*💵 Pendapatan Hari Ini:* Rp${toRupiah(dashboardData.pendapatanHariIni)}\n`
        teks += `*💳 Metode Bayar:*\n`
        teks += `  • Saldo: ${dashboardData.metodeBayar.saldo}\n`
        teks += `  • QRIS: ${dashboardData.metodeBayar.qris}\n\n`
        teks += `*🏆 TOP 10 USERS:*\n`
        
        dashboardData.topUsers.forEach((user, i) => {
          teks += `${i + 1}. ${user.user}\n`
          teks += `   • Transaksi: ${user.transaksi}\n`
          teks += `   • Total Spent: Rp${toRupiah(user.totalSpent)}\n\n`
        })
        
        teks += `*📁 File:* ${filename}\n`
        teks += `*💡 Gunakan file JSON ini untuk dashboard web*`
        
        reply(teks)
      }
        break
        
      case 'rekap': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh ${prefix + command} mingguan\n\nTipe rekap:\nmingguan\nbulanan`)
        
        function bulankelompok(transaksi) {
          let transaksiHarian = {};

          transaksi.forEach(data => {
            let tanggall = new Date(data.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            if (!transaksiHarian[tanggall]) {
              transaksiHarian[tanggall] = [];
            }
            transaksiHarian[tanggall].push(data);
          });

          return transaksiHarian;
        }
        
        function kelompokkanTransaksi(transaksi) {
          let today = new Date(moment.tz("Asia/Jakarta").format("YYYY-MM-DD"));
          let startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());

          let endOfWeek = new Date(today);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23);
          endOfWeek.setMinutes(59);

          let transaksiMingguIni = transaksi.filter(data => {
            let transaksiDate = new Date(data.date);
            transaksiDate.setDate(transaksiDate.getDate());
            return transaksiDate >= startOfWeek && transaksiDate <= endOfWeek;
          });

          let transaksiMingguan = {};
          transaksiMingguIni.forEach(data => {
            let tanggall = new Date(data.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            if (!transaksiMingguan[tanggall]) {
              transaksiMingguan[tanggall] = [];
            }
            transaksiMingguan[tanggall].push(data);
          });

          let sortedTransaksiMingguan = {};
          Object.keys(transaksiMingguan).sort((a, b) => {
            let days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            return days.indexOf(a.split(',')[0]) - days.indexOf(b.split(',')[0]);
          }).forEach(key => {
            sortedTransaksiMingguan[key] = transaksiMingguan[key];
          });

          return sortedTransaksiMingguan;
        }
        
        function rekapMingguan(transaksiHarian) {
          let totalStokTerjual = 0;
          let totalPendapatanKotor = 0;
          let totalPendapatanBersih = 0;
          let rekap = "*`Rekap Mingguan:`*\n\n";

          let sortedDates = Object.keys(transaksiHarian).sort((a, b) => {
            let dateA = new Date(a.split(',')[1]);
            let dateB = new Date(b.split(',')[1]);
            return dateA - dateB;
          });

          sortedDates.forEach((tanggall, index) => {
            let dataTransaksi = transaksiHarian[tanggall];
            let stokTerjualHarian = 0;
            let pendapatanKotorHarian = 0;
            let pendapatanBersihHarian = 0;

            dataTransaksi.forEach(data => {
              stokTerjualHarian += parseInt(data.jumlah);
              pendapatanKotorHarian += parseInt(data.price) * parseInt(data.jumlah);
              pendapatanBersihHarian += parseInt(data.profit) * parseInt(data.jumlah);
            });

            totalStokTerjual += stokTerjualHarian;
            totalPendapatanKotor += pendapatanKotorHarian;
            totalPendapatanBersih += pendapatanBersihHarian;
            rekap += `- *Total Stok Terjual:* ${totalStokTerjual}\n`;
            rekap += `- *Total Pendapatan Kotor:* Rp${toRupiah(totalPendapatanKotor)}\n`;
            rekap += `- *Total Pendapatan Bersih:* Rp${toRupiah(totalPendapatanBersih)}\n\n`;

            rekap += `${index + 1}. *\`${new Date(tanggall.split(',')[1] + tanggall.split(',')[2]).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\`*\n`;
            rekap += `- *Stok Terjual:* ${stokTerjualHarian}\n`;
            rekap += `- *Pendapatan Kotor:* Rp${toRupiah(pendapatanKotorHarian)}\n`;
            rekap += `- *Pendapatan Bersih:* Rp${toRupiah(pendapatanBersihHarian)}\n\n`;
          });

          return rekap;
        }
        
        function rekapBulanan(transaksiHarian) {
          let totalStokTerjual = 0;
          let totalPendapatanKotor = 0;
          let totalPendapatanBersih = 0;
          let rekap = "*`Rekap Bulanan:`*\n\n";

          const bulanan = {};

          Object.entries(transaksiHarian).forEach(([tanggall, dataTransaksi]) => {
            let bulan = new Date(tanggall).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

            if (!bulanan[bulan]) {
              bulanan[bulan] = {
                stokTerjual: 0,
                pendapatanKotor: 0,
                pendapatanBersih: 0,
                transaksiPerHari: {}
              };
            }

            dataTransaksi.forEach(data => {
              let hari = new Date(data.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

              if (!bulanan[bulan].transaksiPerHari[hari]) {
                bulanan[bulan].transaksiPerHari[hari] = [];
              }

              bulanan[bulan].transaksiPerHari[hari].push(data);
            });

            dataTransaksi.forEach(data => {
              bulanan[bulan].stokTerjual += parseInt(data.jumlah);
              bulanan[bulan].pendapatanKotor += parseInt(data.price) * parseInt(data.jumlah);
              bulanan[bulan].pendapatanBersih += parseInt(data.profit) * parseInt(data.jumlah);
            });
          });

          Object.entries(bulanan).forEach(([bulan, dataBulan]) => {
            rekap += `\`${bulan}:\`\n`;

            Object.entries(dataBulan.transaksiPerHari).forEach(([hari, transaksiHari]) => {
              let stokTerjualHari = 0;
              let pendapatanKotorHari = 0;
              let pendapatanBersihHari = 0;
              transaksiHari.forEach(transaksi => {
                stokTerjualHari += parseInt(transaksi.jumlah);
                pendapatanKotorHari += parseInt(transaksi.price) * parseInt(transaksi.jumlah);
                pendapatanBersihHari += parseInt(transaksi.profit) * parseInt(transaksi.jumlah);
              });
              rekap += `- *${hari}:*\n`;
              rekap += `  - *Stok Terjual:* ${stokTerjualHari}\n`;
              rekap += `  - *Pendapatan Kotor:* Rp${toRupiah(parseInt(pendapatanKotorHari))}\n`;
              rekap += `  - *Pendapatan Bersih:* Rp${toRupiah(parseInt(pendapatanBersihHari))}\n\n`;
            });

            rekap += `- *Total Stok Terjual:* ${dataBulan.stokTerjual}\n`;
            rekap += `- *Total Pendapatan Kotor:* Rp${toRupiah(dataBulan.pendapatanKotor)}\n`;
            rekap += `- *Total Pendapatan Bersih:* Rp${toRupiah(dataBulan.pendapatanBersih)}\n\n`;

            totalStokTerjual += dataBulan.stokTerjual;
            totalPendapatanKotor += dataBulan.pendapatanKotor;
            totalPendapatanBersih += dataBulan.pendapatanBersih;
          });

          return rekap;
        }
        
        if (q.toLowerCase() == "harian") {
          let harian = kelompokkanTransaksi(db.data.transaksi);
          reply(rekapMingguan(harian))
        } else if (q.toLowerCase() == "mingguan") {
          let mingguan = kelompokkanTransaksi(db.data.transaksi);
          reply(rekapMingguan(mingguan))
        } else if (q.toLowerCase() == "bulanan") {
          let bulanan = bulankelompok(db.data.transaksi);
          reply(rekapBulanan(bulanan))
        } else {
          reply("Tipe rekap tidak valid")
        }
      }
        break

      case 'bukti': {
        if (!db.data.deposit[sender]) return ronzz.sendMessage(from, { text: `Maaf *@${sender.split('@')[0]}* sepertinya kamu belum pernah melakukan deposit`, mentions: [sender] }, { quoted: m })
        if (!isImage && !isQuotedImage) return reply(`Kirim gambar dengan caption *${prefix}bukti* atau reply gambar yang sudah dikirim dengan caption *${prefix}bukti*`)
        let media = await downloadAndSaveMediaMessage('image', `./options/sticker/${sender.split('@')[0]}.jpg`)
        let caption_bukti = `*🧾 DEPOSIT USER 🧾*

*ID:* ${db.data.deposit[sender].ID}
*Nomer:* @${db.data.deposit[sender].number.split('@')[0]}
*Payment:* ${db.data.deposit[sender].payment}
*Tanggal:* ${db.data.deposit[sender].date}
*Jumlah Deposit:* Rp${toRupiah(db.data.deposit[sender].data.amount_deposit)}
*Pajak:* Rp${toRupiah(Number(db.data.deposit[sender].data.total_deposit) - Number(db.data.deposit[sender].data.amount_deposit))}
*Total Bayar:* Rp${toRupiah(db.data.deposit[sender].data.total_deposit)}

Ada yang deposit nih kak, coba dicek saldonya`
        ronzz.sendMessage(`${ownerNomer}@s.whatsapp.net`, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: `.accdepo ${db.data.deposit[sender].number.split('@')[0]}`, buttonText: { displayText: 'Accept' }, type: 1,
            }, {
              buttonId: `.rejectdepo ${db.data.deposit[sender].number.split('@')[0]}`, buttonText: { displayText: 'Reject' }, type: 1,
            }
          ],
          headerType: 1,
          viewOnce: true,
          image: fs.readFileSync(media),
          caption: caption_bukti,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            mentionedJid: parseMention(caption_bukti),
          }
        });
        await reply(`Mohon tunggu yaa kak, sampai di acc oleh owner`)
        fs.unlinkSync(media)
      }
        break

      case 'accdepo': {
        if (!isOwner) return
        if (!q) return reply(`Contoh: ${prefix + command} 628xxx`)
        let orang = q.split(",")[0].replace(/[^0-9]/g, '')
        let pajakny = (Number(db.data.persentase["feeDepo"] / 100)) * Number(db.data.deposit[orang + "@s.whatsapp.net"].data.amount_deposit)
        await dbHelper.updateUserSaldo(orang + "@s.whatsapp.net", Number(db.data.deposit[orang + "@s.whatsapp.net"].data.amount_deposit), 'add')
        var text_sukses = `*✅「 DEPOSIT SUKSES 」✅*
*ID:* ${db.data.deposit[orang + "@s.whatsapp.net"].ID}
*Nomer:* @${db.data.deposit[orang + "@s.whatsapp.net"].number.split('@')[0]}
*Payment:* ${db.data.deposit[orang + "@s.whatsapp.net"].payment}
*Tanggal:* ${db.data.deposit[orang + "@s.whatsapp.net"].date.split(' ')[0]}
*Jumlah Deposit:* Rp${toRupiah(db.data.deposit[orang + "@s.whatsapp.net"].data.amount_deposit)}
*Pajak:* Rp${toRupiah(Number(db.data.deposit[orang + "@s.whatsapp.net"].data.total_deposit) - Number(db.data.deposit[orang + "@s.whatsapp.net"].data.amount_deposit))}
*Total Bayar:* Rp${toRupiah(db.data.deposit[orang + "@s.whatsapp.net"].data.total_deposit)}`
        await reply(text_sukses)
        await ronzz.sendMessage(orang + "@s.whatsapp.net", {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: `saldo`, buttonText: { displayText: 'Saldo' }, type: 1,
            }
          ],
          headerType: 1,
          viewOnce: true,
          image: fs.readFileSync(thumbnail),
          caption: `${text_sukses}\n\n_Deposit kamu telah dikonfirmasi oleh Admin, silahkan cek saldo Anda.`,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            mentionedJid: parseMention(text_sukses),
          }
        });
        delete db.data.deposit[orang + "@s.whatsapp.net"]
      }
        break

      case 'rejectdepo': {
        if (!isOwner) return
        if (!q) return reply(`Contoh: ${prefix + command} 628xxx`)
        let orang = q.split(",")[0].replace(/[^0-9]/g, '')
        await reply(`Sukses reject deposit dengan ID: ${db.data.deposit[orang + "@s.whatsapp.net"].ID}`)
        await ronzz.sendMessage(db.data.deposit[orang + "@s.whatsapp.net"].number, { text: `Maaf deposit dengan ID: *${db.data.deposit[orang + "@s.whatsapp.net"].ID}* ditolak, Jika ada kendala silahkan hubungin owner bot.\nwa.me/${ownerNomer}` })
        delete db.data.deposit[orang + "@s.whatsapp.net"]
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

      case 'payment': {
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: 'ceksaldo', buttonText: { displayText: 'ceksaldo' }, type: 1,
            }
          ],
          headerType: 1,
          viewOnce: true,
          image: fs.readFileSync('./options/image/payment.jpg'),
          caption: `*DEPOSIT / ISI SALDO DI BOT TANPA MINIMAL ORDER*

*BONUS SALDO 2k DEPOSIT DENGAN NOMINAL 50.000 KE ATAS*

*BUKTI PAYMENT SENT NICOLA/GIGI*
*contoh depo :*
50.000 + (Bonus 2.000) = 52.000
100.000 + (Bonus 4.000) = 104.000
Dst

ALL PAYMENT LANGSUNG TF KE QRIS YA❣️NO FEE

*PAYMENT KE QRIS ATAU DATA DIBAWAH*
BCA 1400804423 an B N
OVO | GOPAY | SHOPEEPAY | DANA
085235540944 an B N`,
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

      case 'tp': {
        if (!q) return
        if (!db.data.topup[sender]) {
          db.data.topup[sender] = {
            id: crypto.randomBytes(5).toString("hex").toUpperCase(),
            session: "INPUT-TUJUAN",
            name: pushname,
            date: tanggal,
            data: {
              code: q,
              price: "",
              id: "",
              zone: "",
              nickname: ""
            }
          }
          reply(`Silahkan kirim nomor tujuan atau id game kamu\n\n*NOTE*\nUntuk produk ML atau yang ada server id penggunaannya seperti dibawah ini\nContoh:\n12345678 (12345) ❌\n12345678 12345 ✅`)
        } else {
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'batal', buttonText: { displayText: 'Batal' }, type: 1,
              }
            ],
            headerType: 1,
            viewOnce: true,
            image: fs.readFileSync(thumbnail),
            caption: "Proses topup kamu masih ada yang belum terselesaikan.",
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
        }
      }
        break

      case 'listharga': {
        let teks = `Hai *@${sender.split('@')[0]}*\nIngin melakukan topup? Silahkan pilih layanan yang tersedia di bawah ini`
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'Games',
                      rows: [
                        {
                          title: 'Mobile Legends',
                          description: 'List harga topup Mobile Legends',
                          id: '.ml'
                        },
                        {
                          title: 'Free Fire',
                          description: 'List harga topup Free Fire',
                          id: '.ff'
                        },
                        {
                          title: 'PUBG Mobile',
                          description: 'List harga topup PUBG Mobile',
                          id: '.pubg'
                        },
                        {
                          title: 'Honor of Kings',
                          description: 'List harga topup Honor of Kings',
                          id: '.hok'
                        },
                        {
                          title: 'Arena of Valor',
                          description: 'List harga topup Arena of Valor',
                          id: '.aov'
                        },
                        {
                          title: 'Point Blank',
                          description: 'List harga topup Point Blank',
                          id: '.pointblank'
                        },
                        {
                          title: 'Call of Duty Mobile',
                          description: 'List harga topup Call of Duty Mobile',
                          id: '.cod'
                        },
                        {
                          title: 'Lords Mobile',
                          description: 'List harga topup Lords Mobile',
                          id: '.lordsmobile'
                        },
                        {
                          title: 'Valorant',
                          description: 'List harga topup Valorant',
                          id: '.valorant'
                        },
                        {
                          title: 'Genshin Impact',
                          description: 'List harga topup Genshin Impact',
                          id: '.genshin'
                        },
                        {
                          title: 'Super Sus',
                          description: 'List harga topup Super Sus',
                          id: '.supersus'
                        },
                        {
                          title: 'Stumble Guys',
                          description: 'List harga topup Stumble Guys',
                          id: '.stumbleguys'
                        },
                        {
                          title: 'Eggy Party',
                          description: 'List harga topup Eggy Party',
                          id: '.eggyparty'
                        },
                        {
                          title: 'Blood Strike',
                          description: 'List harga topup Blood Strike',
                          id: '.bloodstrike'
                        },
                        {
                          title: 'Arena Breakout',
                          description: 'List harga topup Arena Breakout',
                          id: '.arenabreakout'
                        },
                        {
                          title: 'Delta Force',
                          description: 'List harga topup Delta Force',
                          id: '.deltaforce'
                        }
                      ]
                    }, {
                      title: 'E-Money',
                      rows: [
                        {
                          title: 'Dana',
                          description: 'List harga topup saldo Dana',
                          id: '.dana'
                        },
                        {
                          title: 'Gopay',
                          description: 'List harga topup saldo Gopay',
                          id: '.gopay'
                        },
                        {
                          title: 'Ovo',
                          description: 'List harga topup saldo Ovo',
                          id: '.ovo'
                        },
                        {
                          title: 'Grab',
                          description: 'List harga topup saldo Grab',
                          id: '.grab'
                        },
                        {
                          title: 'Shopee Pay',
                          description: 'List harga topup Shopee Pay',
                          id: '.shopeepay'
                        },
                        {
                          title: 'LinkAja',
                          description: 'List harga topup saldo LinkAja',
                          id: '.linkaja'
                        },
                        {
                          title: 'BRI Brizzi',
                          description: 'List harga topup saldo BRI Brizzi',
                          id: '.bribrizzi'
                        },
                        {
                          title: 'Tapcash BNI',
                          description: 'List harga topup saldo Tapcash BNI',
                          id: '.tapcashbni'
                        },
                        {
                          title: 'Mandiri E-Tol',
                          description: 'List harga topup saldo Mandiri E-Tol',
                          id: '.mandirietol'
                        },
                        {
                          title: 'Maxim',
                          description: 'List harga topup saldo Maxim',
                          id: '.maxim'
                        },
                        {
                          title: 'Astrapay',
                          description: 'List harga topup saldo Astrapay',
                          id: '.astrapay'
                        },
                        {
                          title: 'Doku',
                          description: 'List harga topup saldo Doku',
                          id: '.doku'
                        },
                        {
                          title: 'iSaku',
                          description: 'List harga topup saldo iSaku',
                          id: '.isaku'
                        }
                      ]
                    }, {
                      title: 'PLN',
                      rows: [
                        {
                          title: 'PLN',
                          description: 'List harga token PLN',
                          id: '.pln'
                        }
                      ]
                    }, {
                      title: 'Pulsa',
                      rows: [
                        {
                          title: 'Telkomsel',
                          description: 'List harga pulsa Telkomsel',
                          id: '.ptelkomsel'
                        },
                        {
                          title: 'Indosat',
                          description: 'List harga pulsa Indosat',
                          id: '.pindosat'
                        },
                        {
                          title: 'Smartfren',
                          description: 'List harga Pulsa Smartfren',
                          id: '.psmartfren'
                        },
                        {
                          title: 'Axis',
                          description: 'List harga pulsa Axis',
                          id: '.paxis'
                        },
                        {
                          title: 'XL',
                          description: 'List harga pulsa XL',
                          id: '.pxl'
                        },
                        {
                          title: 'Three',
                          description: 'List harga pulsa Three',
                          id: '.ptri'
                        },
                        {
                          title: 'ByU',
                          description: 'List harga pulsa ByU',
                          id: '.pbyu'
                        }
                      ]
                    }, {
                      title: 'Kuota',
                      rows: [
                        {
                          title: 'Telkomsel',
                          description: 'List harga kuota Telkomsel',
                          id: '.dtelkomsel'
                        },
                        {
                          title: 'Indosat',
                          description: 'List harga kuota Indosat',
                          id: '.dindosat'
                        },
                        {
                          title: 'Smartfren',
                          description: 'List harga kuota Smartfren',
                          id: '.dsmartfren'
                        },
                        {
                          title: 'Axis',
                          description: 'List harga kuota Axis',
                          id: '.daxis'
                        },
                        {
                          title: 'XL',
                          description: 'List harga kuota XL',
                          id: '.dxl'
                        },
                        {
                          title: 'Three',
                          description: 'List harga kuota Three',
                          id: '.dtri'
                        },
                        {
                          title: 'ByU',
                          description: 'List harga kuota ByU',
                          id: '.dbyu'
                        }
                      ]
                    }
                  ]
                })
              }
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
      }
        break

      case 'ml': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Diamond Mobile Legends")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Mobile Legends`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'ff': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Diamond Free Fire")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Free Fire`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'pubg': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Game Mobile PUBG")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup PUBG Mobile`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'hok': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Honor of Kings")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Honor of Kings`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'aov': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Arena of Valor")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Arena of Valor`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'pointblank': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Point Blank Zepetto")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Point Blank`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'lordsmobile': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Lord Mobile Diamonds")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Lords Mobile`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'valorant': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Valorant Points")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Valorant`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'genshin': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Genshin Impact Crystals")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Genshin Impact`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'supersus': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Goldstar Super Sus")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Super Sus`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'stumbleguys': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Stumble Guys")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Stumble Guys`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'eggyparty': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Eggy Party Coin")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Eggy Party`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'deltaforce': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Delta Force")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Delta Force`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'arenabreakout': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Arena Breakout")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Arena Breakout`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'bloodstrike': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DIGITAL" && i.produk == "TPG Blood Strike")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup Blood Strike`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'dana': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo DANA")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Dana`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'gopay': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo Gopay Promo")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Gopay`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'ovo': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo OVO")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Ovo`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'grab': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo GRAB Customer")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Grab`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'linkaja': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo LinkAja")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo LinkAja`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'shopeepay': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo Shopee")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Shopee Pay`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'bribrizzi': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.produk == "Top Up Saldo BRIzzi")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo BRI Brizzi`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'tapcashbni': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.produk == "Top Up Saldo Tapcash BNI")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Tapcash BNI`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'mandirietol': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.produk == "Top Up Saldo Tol Mandiri")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Mandiri E-Tol`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'astrapay': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Topup Saldo Astrapay")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Astrapay`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'doku': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo Doku")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo Doku`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'isaku': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "DOMPET DIGITAL" && i.produk == "Top Up Saldo iSaku Indomaret")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga topup saldo iSaku`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'ptelkomsel': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "PULSA" && i.produk == "Telkomsel")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga pulsa Telkomsel`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'pindosat': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "PULSA" && i.produk == "Indosat")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga pulsa Indosat`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'paxis': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "PULSA" && i.produk == "Axis")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga pulsa Axis`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'psmartfren': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "PULSA" && i.produk == "Smartfren")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga pulsa Smartfren`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'ptri': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "PULSA" && i.produk == "Three")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga pulsa Three`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'pxl': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "PULSA" && i.produk == "XL")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga pulsa XL`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'dtelkomsel': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "KUOTA TELKOMSEL")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga kuota Telkomsel`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'dindosat': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "KUOTA INDOSAT")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga kuota Indosat`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'daxis': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "KUOTA AXIS")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga kuota Axis`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'dsmartfren': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "KUOTA SMARTFREN")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga kuota Smartfren`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'dtri': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "KUOTA TRI")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga kuota Three`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'dxl': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "KUOTA XL")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga kuota XL`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'dbyu': {
        axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a").then(res => {
          var regeXcomp = (a, b) => {
            var aPrice = Number(a.harga);
            var bPrice = Number(b.harga);
            return aPrice - bPrice
          };
          let listproduk = res.data.filter(i => i.kategori == "KUOTA BYU")
          listproduk.sort(regeXcomp)
          let teks = `Hai *@${sender.split('@')[0]}*\nSilahkan klik button di bawah ini untuk melihat list harga kuota ByU`
          let rows = []
          listproduk.map(i => {
            rows.push({
              title: i.keterangan,
              description: `Harga: Rp${toRupiah(hargaSetelahProfit(i.harga, db.data.users[sender].role, i.kategori))} | Status: ${i.status == 1 ? "✅" : "❌"}`,
              id: `tp ${i.kode}`
            })
          })
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST HARGA',
                        rows
                      }
                    ]
                  })
                }
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
        })
      }
        break

      case 'cekml': case 'cekff': case 'cekpubg': case 'cekhok': case 'cekgi': case 'cekhi': case 'cekhsr': case 'cekpb': case 'cekzzz': case 'ceksm': case 'ceksus': case 'cekvalo': case 'cekaov': case 'cekcodm': case 'cekpgr': {
        let userId = q.split(" ")[0]
        let zoneId = q.split(" ")[1]
        if ((command == "cekml" || command == "cekpgr") && !zoneId) return reply(`Contoh: ${prefix + command} id zone`)
        if (!userId) return reply(`Contoh: ${prefix + command} id`)

        let nickname = "User Id not found"
        if (command == "cekml") nickname = await getUsernameMl(userId, zoneId)
        if (command == "cekff") nickname = await getUsernameFf(userId)
        if (command == "cekpubg") nickname = await getUsernamePubg(userId)
        if (command == "cekhok") nickname = await getUsernameHok(userId)
        if (command == "cekgi") nickname = await getUsernameGi(userId)
        if (command == "cekhi") nickname = await getUsernameHi(userId)
        if (command == "cekhsr") nickname = await getUsernameHsr(userId)
        if (command == "cekpb") nickname = await getUsernamePb(userId)
        if (command == "ceksm") nickname = await getUsernameSm(userId)
        if (command == "cekzzz") nickname = await getUsernameZzz(userId)
        if (command == "ceksus") nickname = await getUsernameSus(userId)
        if (command == "cekvalo") nickname = await getUsernameValo(userId)
        if (command == "cekaov") nickname = await getUsernameAov(userId)
        if (command == "cekcodm") nickname = await getUsernameCod(userId)
        if (command == "cekpgr") nickname = await getUsernamePgr(userId, zoneId)

        await reply(nickname)
      }
        break

      case 'upgrade': {
        if (q.toLowerCase() == "silver") {
          if (db.data.users[sender].role == "gold") return reply("Role kamu sudah tertinggi")

          let fee = digit()
          let amount = Number(uSilver) + Number(fee)

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
          let cap = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk Name:* Upgrade Role Silver\n*Harga:* Rp${toRupiah(uSilver)}\n*Fee:* Rp${toRupiah(Number(fee))}\n*Total:* Rp${toRupiah(amount)}\n*Waktu:* ${timeLeft} menit\n\nSilahkan scan Qris di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n`;
          let mess = await ronzz.sendMessage(from, { image: fs.readFileSync(pay), caption: Styles(cap) }, { quoted: m })

          let statusPay = false;

          while (!statusPay) {
            await sleep(10000)
            if (Date.now() >= time) {
              statusPay = true

              await ronzz.sendMessage(from, { delete: mess.key })
              reply("Pembayaran dibatalkan karena telah melewati batas expired.")
            }
            try {
              let orkut = new OrderKuota(db.data.orkut["username"], db.data.orkut["authToken"])
              let response = await orkut.getTransactionQris()
              let result = response.qris_history.results.find(i => i.status == "IN" && Number(i.kredit.replace(/[.]/g, '')) == parseInt(amount))

              if (result !== undefined) {
                statusPay = true
                db.data.users[sender].role = "silver"

                await reply(`Sukses upgrade role ke silver

*╭────「 TRANSAKSI DETAIL 」───*
*┊・ 📦| Nama Barang:* Upgrade Role Silver 
*┊・ 🏷️| Harga Barang:* Rp${toRupiah(uSilver)}
*┊・ 🛍️| Fee:* Rp${toRupiah(Number(fee))}
*┊・ 💰| Total Bayar:* Rp${toRupiah(amount)}
*┊・ 📅| Tanggal:* ${tanggal}
*┊・ ⏰| Jam:* ${jamwib} WIB
*╰┈┈┈┈┈┈┈┈*`);

                await ronzz.sendMessage(ownerNomer + "@s.whatsapp.net", {
                  text: `Hai Owner,
Ada yang upgrade role!

*╭────「 TRANSAKSI DETAIL 」───*
*┊・ 📮| Nomer:* @${sender.split("@")[0]}
*┊・ 📦| Nama Barang:* Upgrade Role Silver 
*┊・ 🏷️| Harga Barang:* Rp${toRupiah(uSilver)}
*┊・ 🛍️| Fee:* Rp${toRupiah(Number(fee))}
*┊・ 💰| Total Bayar:* Rp${toRupiah(amount)}
*┊・ 📅| Tanggal:* ${tanggal}
*┊・ ⏰| Jam:* ${jamwib} WIB
*╰┈┈┈┈┈┈┈┈*`, mentions: [sender]
                })
              }
            } catch (error) {
              statusPay = true

              reply("Pesanan dibatalkan!")
              console.log("Error checking transaction status:", error);
            }
          }
          fs.unlinkSync("./options/sticker/qris.jpg")
        } else if (q.toLowerCase() == "gold") {
          if (db.data.users[sender].role == "silver") {
            let fee = digit()
            let amount = (Number(uGold) - Number(uSilver)) + Number(fee)

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
            let cap = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk Name:* Upgrade Role Gold\n*Harga:* Rp${toRupiah(Number(uGold) - Number(uSilver))}\n*Fee:* Rp${toRupiah(Number(fee))}\n*Total:* Rp${toRupiah(amount)}\n*Waktu:* ${timeLeft} menit\n\nDikarenakan role Kamu sebelumnya Silver, maka harga upgrade role ke Gold adalah Rp${toRupiah(Number(uGold) - Number(uSilver))}\n\nSilahkan scan Qris di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n`;
            let mess = await ronzz.sendMessage(from, { image: fs.readFileSync(pay), caption: Styles(cap) }, { quoted: m })

            let statusPay = false;

            while (!statusPay) {
              await sleep(10000)
              if (Date.now() >= time) {
                statusPay = true

                await ronzz.sendMessage(from, { delete: mess.key })
                reply("Pembayaran dibatalkan karena telah melewati batas expired.")
              }
              try {
                let orkut = new OrderKuota(db.data.orkut["username"], db.data.orkut["authToken"])
                let response = await orkut.getTransactionQris()
                let result = response.qris_history.results.find(i => i.status == "IN" && Number(i.kredit.replace(/[.]/g, '')) == parseInt(amount))

                if (result !== undefined) {
                  statusPay = true
                  db.data.users[sender].role = "gold"

                  await reply(`Sukses upgrade role ke Gold

*╭────「 TRANSAKSI DETAIL 」───*
*┊・ 📌| Role Sebelum:* Silver
*┊・ 📦| Nama Barang:* Upgrade Role Gold
*┊・ 🏷️| Harga Barang:* Rp${toRupiah(Number(uGold) - Number(uSilver))}
*┊・ 🛍️| Fee:* Rp${toRupiah(Number(fee))}
*┊・ 💰| Total Bayar:* Rp${toRupiah(amount)}
*┊・ 📅| Tanggal:* ${tanggal}
*┊・ ⏰| Jam:* ${jamwib} WIB
*╰┈┈┈┈┈┈┈┈*`);

                  await ronzz.sendMessage(ownerNomer + "@s.whatsapp.net", {
                    text: `Hai Owner,
Ada yang upgrade role!

*╭────「 TRANSAKSI DETAIL 」───*
*┊・ 📮| Nomer:* @${sender.split("@")[0]}
*┊・ 📌| Role Sebelum:* Silver
*┊・ 📦| Nama Barang:* Upgrade Role Gold
*┊・ 🏷️| Harga Barang:* Rp${toRupiah(uGold)}
*┊・ 🛍️| Fee:* Rp${toRupiah(Number(fee))}
*┊・ 💰| Total Bayar:* Rp${toRupiah(amount)}
*┊・ 📅| Tanggal:* ${tanggal}
*┊・ ⏰| Jam:* ${jamwib} WIB
*╰┈┈┈┈┈┈┈┈*`, mentions: [sender]
                  })
                    }
                } catch (error) {
                statusPay = true

                reply("Pesanan dibatalkan!")
                console.log("Error checking transaction status:", error);
              }
            }
            fs.unlinkSync("./options/sticker/qris.jpg")
          } else {
            let fee = digit()
            let amount = Number(uGold) + Number(fee)

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
            let cap = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk Name:* Upgrade Role Gold\n*Harga:* Rp${toRupiah(uGold)}\n*Fee:* Rp${toRupiah(Number(fee))}\n*Total:* Rp${toRupiah(amount)}\n*Waktu:* ${timeLeft} menit\n\nSilahkan scan Qris di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n`;
            let mess = await ronzz.sendMessage(from, { image: fs.readFileSync(pay), caption: Styles(cap) }, { quoted: m })

            let statusPay = false;

            while (!statusPay) {
              await sleep(10000)
              if (Date.now() >= time) {
                statusPay = true

                await ronzz.sendMessage(from, { delete: mess.key })
                reply("Pembayaran dibatalkan karena telah melewati batas expired.")
              }
              try {
                let orkut = new OrderKuota(db.data.orkut["username"], db.data.orkut["authToken"])
                let response = await orkut.getTransactionQris()
                let result = response.qris_history.results.find(i => i.status == "IN" && Number(i.kredit.replace(/[.]/g, '')) == parseInt(amount))

                if (result !== undefined) {
                  statusPay = true
                  db.data.users[sender].role = "gold"

                  await reply(`Sukses upgrade role ke Gold

*╭────「 TRANSAKSI DETAIL 」───*
*┊・ 📦| Nama Barang:* Upgrade Role Gold
*┊・ 🏷️| Harga Barang:* Rp${toRupiah(uGold)}
*┊・ 🛍️| Fee:* Rp${toRupiah(Number(fee))}
*┊・ 💰| Total Bayar:* Rp${toRupiah(amount)}
*┊・ 📅| Tanggal:* ${tanggal}
*┊・ ⏰| Jam:* ${jamwib} WIB
*╰┈┈┈┈┈┈┈┈*`);

                  await ronzz.sendMessage(ownerNomer + "@s.whatsapp.net", {
                    text: `Hai Owner,
Ada yang upgrade role!
*╭────「 TRANSAKSI DETAIL 」───*
*┊・ 📮| Nomer:* @${sender.split("@")[0]}
*┊・ 📦| Nama Barang:* Upgrade Role Gold
*┊・ 🏷️| Harga Barang:* Rp${toRupiah(uGold)}
*┊・ 🛍️| Fee:* Rp${toRupiah(Number(fee))}
*┊・ 💰| Total Bayar:* Rp${toRupiah(amount)}
*┊・ 📅| Tanggal:* ${tanggal}
*┊・ ⏰| Jam:* ${jamwib} WIB
*╰┈┈┈┈┈┈┈┈*`, mentions: [sender]
                  })
            }
        } catch (error) {
                statusPay = true

                reply("Pesanan dibatalkan!")
                console.log("Error checking transaction status:", error);
              }
            }
            fs.unlinkSync("./options/sticker/qris.jpg")
          }
        } else {
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST ROLE',
                        rows: [
                          {
                            title: `Silver (Rp${toRupiah(uSilver)})`,
                            description: `Benefit: fee produk menjadi ${db.data.type == "persen" ? `${db.data.persentase["silver"]}%` : `+Rp${toRupiah(db.data.profit["silver"])}`}`,
                            id: ".upgrade silver"
                          },
                          {
                            title: `Gold (Rp${toRupiah(uGold)})`,
                            description: `Benefit: fee produk menjadi ${db.data.type == "persen" ? `${db.data.persentase["gold"]}%` : `+Rp${toRupiah(db.data.profit["gold"])}`}`,
                            id: ".upgrade gold"
                          }
                        ]
                      }
                    ]
                  })
                }
              }
            ],
            headerType: 1,
            viewOnce: true,
            image: fs.readFileSync(thumbnail),
            caption: `Silahkan pilih role di bawah ini.`,
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
        }
      }
        break

      case 'ceksaldooke': {
        if (!isOwner) return reply(mess.owner)
        axios.get(`https://b2b.okeconnect.com/trx-v2/balance?memberID=${memberId}&pin=${pin}&password=${pw}`)
          .then(response => response.data)
          .then(res => {
            if (res.status.includes('GAGAL')) return reply('Silahkan sambungkan ip (' + res.message.replace(/[^0-9.]+/g, '') + ') tersebut ke provider')
            reply(`*Sisa saldo Order Kuota kamu :*\nRp${toRupiah(res.message.replace(/[^0-9]+/g, ''))}`)
          })
      }
        break
        
      case 'loginorkut': {
        if (!isOwner) return reply(mess.owner)
        if (isGroup) return reply(mess.private)
        let data = q.split("|")
        if (!data[1]) return reply(`Contoh: ${prefix + command} username|password`)
        let orkut = new OrderKuota()
        let response = await orkut.loginRequest(data[0], data[1])
        if (!response.success) return reply(`Login ke OrderKuota gagal!\n\nAlasan: ${response.message}`)
        db.data.orkut["username"] = data[0]
        reply(`OTP berhasil dikirim ke email ${response.results.otp_value}\n\nUntuk memverifikasi OTP silahkan ketik *${prefix}verifotp <otp>*`)
      }
        break
        
      case 'verifotp': {
        if (!isOwner) return reply(mess.owner)
        if (isGroup) return reply(mess.private)
        if (!q) return reply(`Contoh: ${prefix + command} otp`)
        let orkut = new OrderKuota()
        let response = await orkut.getAuthToken(db.data.orkut["username"], q)
        if (!response.success) return reply(`Gagal memverifikasi OTP!\n\nAlasan: ${response.message}`)
        db.data.orkut["authToken"] = response.results.token
        reply(`Login ke OrderKuota sukses!\n\n*────「 DATA AKUN 」────*\n\n*» Name:* ${response.results.name}\n*» Username:* ${response.results.username}\n*» Saldo:* Rp${toRupiah(response.results.balance)}`)
      }
        break

      case 'cekip': {
        if (!isOwner) return reply(mess.owner)
        if (isGroup) return reply(mess.private)
        fetch("https://api64.ipify.org?format=json")
          .then((response) => response.json())
          .then(res => {
            reply('Silahkan sambungkan IP (' + res.ip + ') tersebut ke provider.')
          })
      }
        break

      case 'settype': {
        if (!isOwner) return reply(mess.owner)
        if (q.toLowerCase() == "persen") {
          db.data.type = "persen"
          reply("Sukses ubah type profit menjadi persentase")
        } else if (q.toLowerCase() == "nominal") {
          db.data.type = "nominal"
          reply("Sukses ubah type profit menjadi nominal")
        } else {
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST TYPE',
                        rows: [
                          {
                            title: `Persentase`,
                            description: `Type profit menjadi persentase`,
                            id: ".settype persen"
                          },
                          {
                            title: `Nominal`,
                            description: `Type profit menjadi nominal`,
                            id: ".settype nominal"
                          }
                        ]
                      }
                    ]
                  })
                }
              }
            ],
            headerType: 1,
            viewOnce: true,
            image: fs.readFileSync(thumbnail),
            caption: `Silahkan pilih type profit di bawah ini.`,
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
        }
      }
        break

      case 'setprofit': {
        if (!isOwner) return reply(mess.owner)
        if (db.data.type == "persen") {
          if (!q.split(" ")[1]) return reply(`Contoh: ${prefix + command} role 5\n\nRole tersedia\n- bronze\n- silver\n- gold`)
          if (isNaN(q.split(" ")[1])) return reply(`Persentase hanya angka\n\nContoh: ${prefix + command} role 5\n\nRole tersedia\n- bronze\n- silver\n- gold`)
          if (q.split(" ")[1].replace(",", ".") < 0.1) return reply('Minimal persentase 0.1%')
          db.data.persentase[q.split(" ")[0]] = q.split(" ")[1].replace(",", ".")
          reply(`Persentase untuk role ${q.split(" ")[0]} telah diset menjadi ${q.split(" ")[1]}%`)
        } else if (db.data.type == "nominal") {
          if (!q.split(" ")[1]) return reply(`Contoh: ${prefix + command} role 1000\n\nRole tersedia\n- bronze\n- silver\n- gold`)
          if (isNaN(q.split(" ")[1])) return reply(`Nominal hanya angka\n\nContoh: ${prefix + command} role 1000\n\nRole tersedia\n- bronze\n- silver\n- gold`)
          if (q.split(" ")[1] < 1) return reply('Minimal nominal Rp1')
          db.data.profit[q.split(" ")[0]] = q.split(" ")[1]
          reply(`Nominal profit untuk role ${q.split(" ")[0]} telah diset menjadi Rp${toRupiah(Number(q.split(" ")[1]))}`)
        }
      }
        break

      case 'customprofit': {
        if (!isOwner) return reply(mess.owner)
        let data = q.split("|")
        if (!data[0]) return reply(`Contoh: ${prefix + command} persen/nominal`)
        if (data[0] && !data[1]) {
          ronzz.sendMessage(from, {
            footer: `${botName} © ${ownerName}`,
            buttons: [
              {
                buttonId: 'action',
                buttonText: { displayText: 'ini pesan interactiveMeta' },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click To List',
                    sections: [
                      {
                        title: 'LIST KATEGORI',
                        rows: [
                          {
                            title: `DIGITAL`,
                            description: `Custom profit untuk kategori Digital`,
                            id: `.${command} DIGITAL|${data[0]}`
                          },
                          {
                            title: `DOMPET DIGITAL`,
                            description: `Custom profit untuk kategori Dompet Digital`,
                            id: `.${command} DOMPET DIGITAL|${data[0]}`
                          },
                          {
                            title: `TOKEN PLN`,
                            description: `Custom profit untuk kategori Token PLN`,
                            id: `.${command} TOKEN PLN|${data[0]}`
                          },
                          {
                            title: `PULSA`,
                            description: `Custom profit untuk kategori Pulsa`,
                            id: `.${command} PULSA|${data[0]}`
                          },
                          {
                            title: `KUOTA`,
                            description: `Custom profit untuk kategori Kuota`,
                            id: `.${command} KUOTA|${data[0]}`
                          }
                        ]
                      }
                    ]
                  })
                }
              }
            ],
            headerType: 1,
            viewOnce: true,
            image: fs.readFileSync(thumbnail),
            caption: `Silahkan pilih kategori yang tersedia di bawah ini.`,
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
        }
        if (data[1] !== "persen" && data[1] !== "nominal") return reply("Type profit tersedia persen/nominal")
        db.data.customProfit[data[0].toLowerCase()] = data[1].toLowerCase()
        reply(`Sukses custom profit kategori ${data[0]} menjadi ${data[1]}`)
      }
        break

      case 'delcustomprofit': {
        if (!isOwner) return reply(mess.owner)
        if (!q) return reply(`Contoh: ${prefix + command} kategori`)
        if (db.data.customProfit[q.toLowerCase()] == undefined) return ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'LIST KATEGORI',
                      rows: [
                        {
                          title: `DIGITAL`,
                          description: `Delete custom profit untuk kategori Digital`,
                          id: `.${command} DIGITAL`
                        },
                        {
                          title: `DOMPET DIGITAL`,
                          description: `Delete custom profit untuk kategori Dompet Digital`,
                          id: `.${command} DOMPET DIGITAL`
                        },
                        {
                          title: `TOKEN PLN`,
                          description: `Delete custom profit untuk kategori Token PLN`,
                          id: `.${command} TOKEN PLN`
                        },
                        {
                          title: `PULSA`,
                          description: `Delete custom profit untuk kategori Pulsa`,
                          id: `.${command} PULSA`
                        },
                        {
                          title: `KUOTA`,
                          description: `Delete custom profit untuk kategori Kuota`,
                          id: `.${command} KUOTA`
                        }
                      ]
                    }
                  ]
                })
              }
            }
          ],
          headerType: 1,
          viewOnce: true,
          image: fs.readFileSync(thumbnail),
          caption: `Silahkan pilih kategori yang tersedia di bawah ini.`,
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
        delete db.data.customProfit[q.toLowerCase()]
        reply(`Sukses delete custom profit dengan kategori ${q}`)
      }
        break

      case 'sticker': case 's': case 'stiker': {
        if (isImage || isQuotedImage) {
          let media = await downloadAndSaveMediaMessage('image', `./options/sticker/${tanggal}.jpg`)
          reply(mess.wait)
          ronzz.sendImageAsSticker(from, media, m, { packname: `${packname}`, author: `${author}` })
        } else if (isVideo || isQuotedVideo) {
          let media = await downloadAndSaveMediaMessage('video', `./options/sticker/${tanggal}.mp4`)
          reply(mess.wait)
          ronzz.sendVideoAsSticker(from, media, m, { packname: `${packname}`, author: `${author}` })
        } else {
          reply(`Kirim/reply gambar/vidio dengan caption *${prefix + command}*`)
        }
      }
        break

      case 'addsewa': {
        if (!isOwner) return reply(mess.owner)
        if (!isGroup) return reply(mess.group)
        if (!q) return reply(`Ex: ${prefix + command} hari\n\nContoh: ${prefix + command} 30d`)
        db.data.sewa[from] = {
          id: from,
          expired: Date.now() + toMs(q)
        }
        Reply(`*SEWA ADDED*\n\n*ID*: ${groupId}\n*EXPIRED*: ${ms(toMs(q)).days} days ${ms(toMs(q)).hours} hours ${ms(toMs(q)).minutes} minutes\n\nBot akan keluar secara otomatis dalam waktu yang sudah di tentukan.`)
      }
        break

      case 'delsewa': {
        if (!isOwner) return reply(mess.owner)
        if (!isGroup) return reply(mess.group)
        delete db.data.sewa[from]
        reply('Sukses delete sewa di group ini.')
      }
        break

      case 'ceksewa': {
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!isGroup) return reply(mess.group)
        if (!isSewa) return reply('Kamu belum sewa bot.')
        let cekExp = ms(db.data.sewa[from].expired - Date.now())
        Reply(`*SEWA EXPIRED*\n\n*ID*: ${groupId}\n*SEWA EXPIRED*: ${cekExp.days} days ${cekExp.hours} hours ${cekExp.minutes} minutes`)
      }
        break

      case 'listsewa': {
        if (!isOwner) return reply(mess.owner)
        if (db.data.sewa == 0) return reply('Belum ada list sewa di database')
        let teks = '*LIST SEWA BOT*\n\n'
        let sewaKe = 0
        for (let i = 0; i < getAllSewa().length; i++) {
          sewaKe++
          teks += `${sewaKe}. ${getAllSewa()[i]}\n\n`
        }
        Reply(teks)
      }
        break

      case 'kalkulator': {
        if (!q) return reply(`Contoh: ${prefix + command} + 5 6\n\nList kalkulator:\n+\n-\n÷\n×`)
        if (q.split(" ")[0] == "+") {
          let q1 = Number(q.split(" ")[1])
          let q2 = Number(q.split(" ")[2])
          reply(`${q1 + q2}`)
        } else if (q.split(" ")[0] == "-") {
          let q1 = Number(q.split(" ")[1])
          let q2 = Number(q.split(" ")[2])
          reply(`${q1 - q2}`)
        } else if (q.split(" ")[0] == "÷") {
          let q1 = Number(q.split(" ")[1])
          let q2 = Number(q.split(" ")[2])
          reply(`${q1 / q2}`)
        } else if (q.split(" ")[0] == "×") {
          let q1 = Number(q.split(" ")[1])
          let q2 = Number(q.split(" ")[2])
          reply(`${q1 * q2}`)
        }
      }
        break

      case 'welcome': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!q) return reply(`Contoh: ${prefix + command} on/off`)
        if (q.toLowerCase() == "on") {
          if (db.data.chat[from].welcome) return reply('Welcome sudah aktif di grup ini.')
          db.data.chat[from].welcome = true
          reply('Sukses mengaktifkan welcome di grup ini.')
        } else if (q.toLowerCase() == "off") {
          if (!db.data.chat[from].welcome) return reply('Welcome sudah tidak aktif di grup ini.')
          db.data.chat[from].welcome = false
          reply('Sukses menonaktifkan welcome di grup ini.')
        }
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

      case 'promote': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        let number;
        if (q.length !== 0) {
          number = q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          ronzz.groupParticipantsUpdate(from, [number], "promote")
            .then(res => ronzz.sendMessage(from, { text: `Sukses menjadikan @${number.split("@")[0]} sebagai admin`, mentions: [number] }, { quoted: m }))
            .catch((err) => reply(mess.error.api))
        } else if (isQuotedMsg) {
          number = m.quoted.sender
          ronzz.groupParticipantsUpdate(from, [number], "promote")
            .then(res => ronzz.sendMessage(from, { text: `Sukses menjadikan @${number.split("@")[0]} sebagai admin`, mentions: [number] }, { quoted: m }))
            .catch((err) => reply(mess.error.api))
        } else {
          reply('Tag atau balas pesan orang yang ingin dijadikan admin.')
        }
      }
        break

      case 'demote': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        let number;
        if (q.length !== 0) {
          number = q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          ronzz.groupParticipantsUpdate(from, [number], "demote")
            .then(res => ronzz.sendMessage(from, { text: `Sukses menjadikan @${number.split("@")[0]} sebagai anggota group`, mentions: [number] }, { quoted: m }))
            .catch((err) => reply(mess.error.api))
        } else if (isQuotedMsg) {
          number = m.quoted.sender
          ronzz.groupParticipantsUpdate(from, [number], "demote")
            .then(res => ronzz.sendMessage(from, { text: `Sukses menjadikan @${number.split("@")[0]} sebagai anggota group`, mentions: [number] }, { quoted: m }))
            .catch((err) => reply(mess.error.api))
        } else {
          reply('Tag atau balas pesan orang yang ingin dijadikan anggota group.')
        }
      }
        break

      case 'revoke':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        await ronzz.groupRevokeInvite(from)
          .then(res => {
            reply('Sukses menyetel tautan undangan grup ini.')
          }).catch(() => reply(mess.error.api))
        break

      case 'linkgrup': case 'linkgroup': case 'linkgc': {
        if (!isGroup) return reply(mess.group)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        let url = await ronzz.groupInviteCode(from).catch(() => reply(mess.errorApi))
        url = 'https://chat.whatsapp.com/' + url
        reply(url)
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

      case 'script': case 'sc':
        reply(`*SCRIPT NO ENC*\nMau beli scriptnya?\n\nhttp://lynk.id/ronzzyt/q6rl11lpgoqw\nHarga terlalu mahal?\nNego tipis aja\n\n*Payment* 💳\n_All Payment_\n\nSudah termasuk tutorial.\nKalau error difixs.\nPasti dapet update dari *Ronzz YT.*\nSize script ringan.\nAnti ngelag/delay.`)
        break

      case 'owner':
        ronzz.sendContact(from, [...owner], m)
        break

      case 'creator':
        ronzz.sendMessage(from, { text: 'Creator sc ini adalah\n@628817861263 (Ronzz YT)', mentions: ['628817861263@s.whatsapp.net'] }, { quoted: m })
        break

      case 'tes': case 'runtime':
        reply(`*STATUS : BOT ONLINE*\n_Runtime : ${runtime(process.uptime())}_`)
        break

      case 'ping':
        let timestamp = speed()
        let latensi = speed() - timestamp
        reply(`Kecepatan respon _${latensi.toFixed(4)} Second_\n\n*💻 INFO SERVER*\nHOSTNAME: ${os.hostname}\nRAM: ${formatp(os.totalmem() - os.freemem())} / ${formatp(os.totalmem())}\nCPUs: ${os.cpus().length} core`)
        break

      case 'setdone':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (db.data.chat[from].sDone.length !== 0) return reply(`Set done sudah ada di group ini.`)
        if (!q) return reply(`Gunakan dengan cara *${prefix + command} teks*\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`)
        db.data.chat[from].sDone = q
        reply(`Sukses set done`)
        break

      case 'deldone':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (db.data.chat[from].sDone.length == 0) return reply(`Belum ada set done di sini.`)
        db.data.chat[from].sDone = ""
        reply(`Sukses delete set done`)
        break

      case 'changedone':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!q) return reply(`Gunakan dengan cara *${prefix + command} teks*\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`)
        db.data.chat[from].sDone = q
        reply(`Sukses mengganti teks set done`)
        break

      case 'setproses':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (db.data.chat[from].sProses.length !== 0) return reply(`Set proses sudah ada di group ini.`)
        if (!q) return reply(`Gunakan dengan cara *${prefix + command} teks*\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`)
        db.data.chat[from].sProses = q
        reply(`Sukses set proses`)
        break
      case 'delproses':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (db.data.chat[from].sProses.length == 0) return reply(`Belum ada set proses di sini.`)
        db.data.chat[from].sProses = ""
        reply(`Sukses delete set proses`)
        break

      case 'changeproses':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!q) return reply(`Gunakan dengan cara *${prefix + command} teks*\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`)
        db.data.chat[from].sProses = q
        reply(`Sukses ganti teks set proses`)
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

      case 'proses':
        if (!isGroup) return (mess.group)
        if (!isGroupAdmins && !isOwner) return (mess.admin)
        if (isQuotedMsg) {
          if (db.data.chat[from].sProses.length !== 0) {
            let textProses = db.data.chat[from].sProses
            ronzz.sendMessage(from, { text: textProses.replace('tag', m.quoted.sender.split("@")[0]).replace('@jam', jamwib).replace('@tanggal', tanggal).replace('@status', 'Pending'), mentions: [m.quoted.sender] }, { quoted: m });
          } else {
            ronzz.sendMessage(from, { text: `「 *TRANSAKSI PENDING* 」\n\n\`\`\`📆 TANGGAL : ${tanggal}\n⌚ JAM : ${jamwib}\n✨ STATUS: Pending\`\`\`\n\nPesanan @${m.quoted.sender.split("@")[0]} sedang diproses🙏`, mentions: [m.quoted.sender] });
          }
        } else if (q.startsWith("@")) {
          if (db.data.chat[from].sProses.length !== 0) {
            let textProses = db.data.chat[from].sProses
            ronzz.sendMessage(from, { text: textProses.replace('tag', q.replace(/[^0-9]/g, '')).replace('@jam', jamwib).replace('@tanggal', tanggal).replace('@status', 'Pending'), mentions: [q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'] });
          } else {
            ronzz.sendMessage(from, { text: `「 *TRANSAKSI PENDING* 」\n\n\`\`\`📆 TANGGAL : ${tanggal}\n⌚ JAM : ${jamwib}\n✨ STATUS: Pending\`\`\`\n\nPesanan @${q.replace(/[^0-9]/g, '')} sedang diproses🙏`, mentions: [q.replace(/[^0-9]/g, '') + '@s.whatsapp.net'] }, { quoted: m });
          }
        } else {
          reply('Reply atau tag orangnya')
        }
        break

      case 'list': {
        if (!isGroup) return reply(mess.group)
        if (db.data.list.length === 0) return reply(`Belum ada list respon di database`)
        if (!isAlreadyResponListGroup(from)) return reply(`Belum ada list respon yang terdaftar di group ini`)
        let teks = `Hai @${sender.split("@")[0]}\nBerikut list message di grup ini`
        let rows = []
        for (let x of db.data.list) {
          if (x.id == from) {
            rows.push({
              title: `🛍️ ${x.key.toUpperCase()}`,
              id: x.key
            })
          }
        }
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'LIST MESSAGE',
                      rows
                    }
                  ]
                })
              }
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
      }
        break

      case 'testi': {
        if (Object.keys(db.data.testi).length === 0) return reply(`Belum ada list testi di database`)
        let teks = `Hai @${sender.split("@")[0]}\nBerikut list testi Owner saya`
        let rows = []
        for (let x of db.data.testi) {
          rows.push({
            title: `🛍️ ${x.key.toUpperCase()}`,
            id: x.key
          })
        }
        ronzz.sendMessage(from, {
          footer: `${botName} © ${ownerName}`,
          buttons: [
            {
              buttonId: 'action',
              buttonText: { displayText: 'ini pesan interactiveMeta' },
              type: 4,
              nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                  title: 'Click To List',
                  sections: [
                    {
                      title: 'LIST TESTI',
                      rows
                    }
                  ]
                })
              }
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
        for (let x of db.data.testi) {
          teks += `*┊ 🛍️ ${x.key}*\n`
        }
        teks += `*╰┈┈┈┈┈┈┈┈*`
        ronzz.sendMessage(from, { text: teks, mentions: [sender] }, { quoted: m })
      }
        break

      case 'addlist': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!q.includes("@")) return reply(`Gunakan dengan cara ${prefix + command} *key@response*\n\n_Contoh_\n\n${prefix + command} tes@apa`)
        if (isAlreadyResponList(from, q.split("@")[0])) return reply(`List respon dengan key : *${q.split("@")[0]}* sudah ada di group ini.`)
        if (isImage || isQuotedImage) {
          let media = await downloadAndSaveMediaMessage('image', `./options/sticker/${sender}.jpg`)
          let tph = await TelegraPh(media)
          addResponList(from, q.split("@")[0], q.split("@")[1], true, tph)
          reply(`Berhasil menambah list menu *${q.split("@")[0]}*`)
          fs.unlinkSync(media)
        } else {
          addResponList(from, q.split("@")[0], q.split("@")[1], false, '-')
          reply(`Berhasil menambah list respon *${q.split("@")[0]}*`)
        }
      }
        break

      case 'addtesti': {
        if (isGroup) return reply(mess.private)
        if (!isOwner) return reply(mess.owner)
        if (isImage || isQuotedImage) {
          if (!q.includes("@")) return reply(`Gunakan dengan cara ${prefix + command} *key@response*\n\n_Contoh_\n\n${prefix + command} tes@apa`)
          if (isAlreadyResponTesti(q.split("@")[0])) return reply(`List respon dengan key : *${q.split("@")[0]}* sudah ada.`)
          let media = await downloadAndSaveMediaMessage('image', `./options/sticker/${sender}.jpg`)
          let tph = await TelegraPh(media)
          addResponTesti(q.split("@")[0], q.split("@")[1], true, tph)
          reply(`Berhasil menambah list testi *${q.split("@")[0]}*`)
          fs.unlinkSync(media)
        } else {
          reply(`Kirim gambar dengan caption ${prefix + command} *key@response* atau reply gambar yang sudah ada dengan caption ${prefix + command} *key@response*`)
        }
      }
        break

      case 'dellist':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (db.data.list.length === 0) return reply(`Belum ada list message di database`)
        if (!q) return reply(`Gunakan dengan cara ${prefix + command} *key*\n\n_Contoh_\n\n${prefix + command} hello`)
        if (!isAlreadyResponList(from, q)) return reply(`List respon dengan key *${q}* tidak ada di database!`)
        delResponList(from, q)
        reply(`Sukses delete list respon dengan key *${q}*`)
        break

      case 'deltesti':
        if (isGroup) return reply(mess.private)
        if (!isOwner) return reply(mess.owner)
        if (db.data.testi.length === 0) return reply(`Belum ada list testi di database`)
        if (!q) return reply(`Gunakan dengan cara ${prefix + command} *key*\n\n_Contoh_\n\n${prefix + command} hello`)
        if (!isAlreadyResponTesti(q)) return reply(`List testi dengan key *${q}* tidak ada di database!`)
        delResponTesti(q)
        reply(`Sukses delete list testi dengan key *${q}*`)
        break

      case 'setlist': {
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!q.includes("@")) return reply(`Gunakan dengan cara ${prefix + command} *key@response*\n\n_Contoh_\n\n${prefix + command} tes@apa`)
        if (!isAlreadyResponList(from, q.split("@")[0])) return reply(`List respon dengan key *${q.split("@")[0]}* tidak ada di group ini.`)
        if (isImage || isQuotedImage) {
          let media = await downloadAndSaveMediaMessage('image', `./options/sticker/${sender}.jpg`)
          let tph = await TelegraPh(media)
          updateResponList(from, q.split("@")[0], q.split("@")[1], true, tph)
          reply(`Berhasil mengganti list menu *${q.split("@")[0]}*`)
          fs.unlinkSync(media)
        } else {
          updateResponList(from, q.split("@")[0], q.split("@")[1], false, '-')
          reply(`Berhasil mengganti list respon *${q.split("@")[0]}*`)
        }
      }
        break

      case 'settesti': {
        if (!isOwner) return reply(mess.owner)
        if (!q.includes("@")) return reply(`Gunakan dengan cara ${prefix + command} *key@response*\n\n_Contoh_\n\n${prefix + command} tes@apa`)
        if (!isAlreadyResponTesti(q.split("@")[0])) return reply(`List testi dengan key *${q.split("@")[0]}* tidak ada di database.`)
        if (isImage || isQuotedImage) {
          let media = await downloadAndSaveMediaMessage('image', `./options/sticker/${sender}.jpg`)
          let tph = await TelegraPh(media)
          updateResponTesti(q.split("@")[0], q.split("@")[1], true, tph)
          reply(`Berhasil mengganti list testi *${q.split("@")[0]}*`)
          fs.unlinkSync(media)
        } else {
          reply(`Kirim gambar dengan caption ${prefix + command} *key@response* atau reply gambar yang sudah ada dengan caption ${prefix + command} *key@response*`)
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

      case 'tagall':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        let teks = `══✪〘 *👥 TAG ALL* 〙✪══\n\n${q ? q : 'Tidak ada pesan'}\n`
        for (let mem of participants) {
          teks += `➲ @${mem.id.split('@')[0]}\n`
        }
        ronzz.sendMessage(from, { text: teks, mentions: participants.map(a => a.id) })
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

      case 'setppgrup': case 'setppgc':
        if (!isGroup) return reply(mess.group)
        if (!isGroupAdmins && !isOwner) return reply(mess.admin)
        if (!isBotGroupAdmins) return reply(mess.botAdmin)
        if (isImage || isQuotedImage) {
          var media = await downloadAndSaveMediaMessage('image', `ppgc${from}.jpeg`)
          try {
            let { img } = await pepe(media)
            await ronzz.query({ tag: 'iq', attrs: { to: from, type: 'set', xmlns: 'w:profile:picture' }, content: [{ tag: 'picture', attrs: { type: 'image' }, content: img }] })
            fs.unlinkSync(media)
            reply(`Sukses set pp group.`)
          } catch {
            var data = await ronzz.updateProfilePicture(from, { url: media })
            fs.unlinkSync(media)
            reply(`Sukses set pp group.`)
          }
        } else {
          reply(`Kirim/balas gambar dengan caption ${prefix + command} untuk mengubah foto profil grup`)
        }
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