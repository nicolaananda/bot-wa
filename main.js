require("./setting.js")
const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, jidDecode, delay } = require("@dappaoffc/baileys")
const chalk = require('chalk')
const readline = require('readline')
const pino = require('pino')
const fs = require("fs");
const figlet = require("figlet")
const PhoneNumber = require('awesome-phonenumber')
const moment = require('moment')
const time = moment(new Date()).format('HH:mm:ss DD/MM/YYYY')
const yargs = require('yargs/yargs')
const { exec, execSync } = require("child_process");

const { smsg, getBuffer } = require("./function/myfunc.js")
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./function/uploader.js')
const { color } = require('./function/console.js')
const { groupResponseWelcome, groupResponseRemove, groupResponsePromote, groupResponseDemote } = require('./function/respon-group.js')
const { nocache } = require('./function/chache.js')

const question = (text) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise((resolve) => {
    rl.question(text, resolve)
  })
}

//DATABASE
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.db = new (require('./function/database'))()

// Load graceful shutdown handler
require('./options/graceful-shutdown')

// Load database helper
global.dbHelper = require('./options/db-helper')

// Initialize Redis (Phase 1)
const { isRedisAvailable, closeRedis } = require('./config/redis')
;(async () => {
  const redisReady = await isRedisAvailable()
  if (redisReady) {
    console.log('✅ [REDIS] Phase 1 features enabled: Locking, Rate Limiting, Caching')
  } else {
    console.log('⚠️ [REDIS] Not configured - Bot will run without Redis features')
    console.log('💡 [REDIS] Setup guide: REDIS-SETUP.md')
  }
})()

// Graceful shutdown is now handled by options/graceful-shutdown.js
// This ensures proper cleanup order: timeouts -> Redis -> database

// Load full snapshot from PG (if enabled), then init defaults and log counts
;(async () => {
  try {
    const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true'
    if (usePg && typeof db.load === 'function') {
      await db.load()
    }
  } catch (e) {
    console.error('[DB] Failed to load from Postgres:', e)
  }

  // Initialize database structure only if it doesn't exist
  // Don't overwrite existing data
  if (!db.data.list) db.data.list = []
  if (!db.data.testi) db.data.testi = []
  if (!db.data.chat) db.data.chat = {}
  if (!db.data.users) db.data.users = {}
  if (!db.data.sewa) db.data.sewa = {}
  if (!db.data.profit) db.data.profit = {}
  if (!db.data.topup) db.data.topup = {}
  if (!db.data.type) db.data.type = type
  if (!db.data.setting) db.data.setting = {}
  if (!db.data.deposit) db.data.deposit = {}
  if (!db.data.produk) db.data.produk = {}
  if (!db.data.order) db.data.order = {}
  if (!db.data.transaksi) db.data.transaksi = []
  if (!db.data.saldoHistory) db.data.saldoHistory = []
  if (!db.data.persentase) db.data.persentase = {}
  if (!db.data.customProfit) db.data.customProfit = {}

  // Log database status
  console.log(`📊 Database loaded: ${Object.keys(db.data.users || {}).length} users, ${(db.data.transaksi || []).length} transactions`)

  // Optimized debounced save system
  // Instead of checking every 5 seconds with expensive JSON.stringify,
  // we save only after data changes and wait for inactivity period
  let saveTimeout = null
  let isSaving = false
  const SAVE_DELAY_MS = 10 * 1000 // Save after 10 seconds of inactivity

  // Debounced save function - call this after any data modification
  global.scheduleSave = function() {
    if (global.opts['test']) return // Skip in test mode
    
    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    // Schedule new save
    saveTimeout = setTimeout(async () => {
      if (isSaving) return // Prevent concurrent saves
      
      isSaving = true
      try {
        await db.save()
        // console.log('[DB] Auto-saved after inactivity period')
      } catch (error) {
        console.error('[DB] Save failed:', error.message)
      } finally {
        isSaving = false
      }
    }, SAVE_DELAY_MS)
  }

  // Force save on shutdown
  process.on('SIGINT', async () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    if (!isSaving) {
      try {
        await db.save()
        console.log('[DB] Saved on shutdown')
      } catch (error) {
        console.error('[DB] Save failed on shutdown:', error.message)
      }
    }
  })

  process.on('SIGTERM', async () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    if (!isSaving) {
      try {
        await db.save()
        console.log('[DB] Saved on shutdown')
      } catch (error) {
        console.error('[DB] Save failed on shutdown:', error.message)
      }
    }
  })

  console.log('✅ [DB] Debounced save system initialized (10s inactivity delay)')
})()

async function startronzz() {

  console.log(chalk.bold.green(figlet.textSync('Velzzy', {
    font: 'Standard',
    horizontalLayout: 'default',
    vertivalLayout: 'default',
    whitespaceBreak: false
  })))
  delay(100)
  // console.log(chalk.yellow(`${chalk.red('[ CREATOR RONZZ YT ]')}\n\n${chalk.italic.magenta(`SV Ronzz YT\nNomor: 08817861263\nSebut nama👆,`)}\n\n\n${chalk.red(`ADMIN MENYEDIAKAN`)}\n${chalk.white(`- SC BOT TOPUP\n- SC BOT CPANEL\n- SC BOT CPANEL DEPO OTOMATIS\n- SC BOT PUSH KONTAK\n- ADD FITUR JADIBOT\n- UBAH SC LAMA KE PAIRING CODE\n- FIXS FITUR/SC ERROR\n`)}`))

  require('./index')
  nocache('../index', module => console.log(chalk.greenBright('[ VelzzyBotz ]  ') + time + chalk.cyanBright(` "${module}" Telah diupdate!`)))

  // 🚀 OPTIMIZED: Disable store to reduce RAM usage
  // makeInMemoryStore consumes huge memory storing all chat history
  // Uncomment below if you need message history in memory (increases RAM by ~500MB-1GB)
  /*
  const store = makeInMemoryStore({
    logger: pino().child({
      level: 'silent',
      stream: 'store'
    })
  })
  */
  const store = null // Disabled to save memory

  const { state, saveCreds } = await useMultiFileAuthState('./session')

  const ronzz = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: !pairingCode,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  })

  if (pairingCode && !ronzz.authState.creds.registered) {
    const phoneNumber = await question(color('\n\nSilahkan masukkan nomor Whatsapp bot anda, awali dengan 62:\n', 'magenta'));
    const code = await ronzz.requestPairingCode(phoneNumber.trim(), "RONZZYT1")
    console.log(color(`⚠︎ Phone number:`, "gold"), color(`${phoneNumber}`, "white"))
    console.log(color(`⚠︎ Pairing code:`, "gold"), color(`${code}`, "white"))
  }

  ronzz.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("CONNECTION OPEN ( +" + ronzz.user?.["id"]["split"](":")[0] + " || " + ronzz.user?.["name"] + " )")
    }
    if (connection === "close") {
      console.log("Connection closed, tolong hapus file session dan scan ulang");
      startronzz()
    }
    if (connection === "connecting") {
      if (ronzz.user) {
        console.log("CONNECTION FOR ( +" + ronzz.user?.["id"]["split"](":")[0] + " || " + ronzz.user?.["name"] + " )")
      }
    }
  })

  // Only bind store if it exists
  if (store) {
    store.bind(ronzz.ev)
  }

  // 🔒 Message Deduplication: Track processed message IDs to prevent duplicate responses
  // 🚀 OPTIMIZED: Use Map with timestamps instead of Set + setInterval for better memory management
  const processedMessageIds = new Map() // Map<messageId, timestamp>
  const MESSAGE_CACHE_TTL = 300000 // 5 minutes
  
  // Clean up old entries only when adding new ones (lazy cleanup - more efficient)
  function cleanupOldMessages() {
    const now = Date.now()
    for (const [msgId, timestamp] of processedMessageIds.entries()) {
      if (now - timestamp > MESSAGE_CACHE_TTL) {
        processedMessageIds.delete(msgId)
      }
    }
  }
  
  // Periodic cleanup every 5 minutes (less frequent = less CPU usage)
  setInterval(cleanupOldMessages, MESSAGE_CACHE_TTL)

  ronzz.ev.on('messages.upsert', async chatUpdate => {
    try {
      for (let mek of chatUpdate.messages) {
        if (!mek.message) return
        
        // 🔒 Prevent duplicate processing
        const messageId = mek.key?.id
        if (messageId && processedMessageIds.has(messageId)) {
          console.log(`⚠️ Duplicate message detected: ${messageId}, skipping...`)
          return
        }
        
        // Mark as processed with timestamp
        if (messageId) {
          processedMessageIds.set(messageId, Date.now())
          
          // 🚀 Lazy cleanup: Remove old entries when cache grows too large
          if (processedMessageIds.size > 1000) {
            cleanupOldMessages()
          }
        }
        
        mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
        const m = smsg(ronzz, mek, store)
        if (mek.key && mek.key.remoteJid === 'status@broadcast') return
        if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
        require('./index')(ronzz, m, mek)
      }
    } catch (err) {
      console.log(err)
    }
  })

  ronzz.ev.process(async (events) => {
    if (events['presence.update']) {
      await ronzz.sendPresenceUpdate('available')
    }
    if (events['messages.upsert']) {
      const upsert = events['messages.upsert']
      for (let msg of upsert.messages) {
        if (msg.key.remoteJid === 'status@broadcast') return
      }
    }
    if (events['creds.update']) {
      await saveCreds()
    }
  })

  ronzz.ws.on('CB:call', async (json) => {
    const callerId = json.content[0].attrs['call-creator']
    if (db.data.setting[ronzz.user?.["id"]["split"](":")[0] + "@s.whatsapp.net"].anticall && json.content[0].tag == 'offer') {
      ronzz.sendMessage(callerId, { text: `Kamu telah di blok oleh bot, karena kamu menelpon bot!!\n\nJika tidak sengaja silahkan hubungi owner agar dibuka blocknya!!\nNomor owner : wa.me/${ownerNomer}` })
      
      // Notify owner about auto-block
      const callerNumber = callerId.replace('@s.whatsapp.net', '')
      ronzz.sendMessage(ownerNomer + '@s.whatsapp.net', { 
        text: `🚫 *AUTO-BLOCK NOTIFICATION*\n\n` +
              `📱 User @${callerNumber} telah di-block otomatis karena menelepon bot.\n\n` +
              `💡 *Untuk unblock:*\n` +
              `• Command: .unblock ${callerNumber}\n` +
              `• Atau: .checkuser ${callerNumber}\n\n` +
              `⚙️ *Disable anti-call:* Edit main.js line 220`,
        mentions: [callerId]
      })
      
      setTimeout(() => {
        ronzz.updateBlockStatus(callerId, 'block')
        console.log(`🚫 [AUTO-BLOCK] User ${callerNumber} blocked due to phone call`)
      }, 1000)
    }
  })

  ronzz.ev.on('group-participants.update', async (update) => {
    if (!db.data.chat[update.id]?.welcome) return
    groupResponseDemote(ronzz, update)
    groupResponsePromote(ronzz, update)
    groupResponseWelcome(ronzz, update)
    groupResponseRemove(ronzz, update)
  })

  ronzz.getName = (jid, withoutContact = false) => {
    var id = ronzz.decodeJid(jid)
    withoutContact = ronzz.withoutContact || withoutContact
    let v
    if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
      v = store.contacts[id] || {}
      if (!(v.name || v.subject)) v = ronzz.groupMetadata(id) || {}
      resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
    })
    else v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === ronzz.decodeJid(ronzz.user.id) ? ronzz.user : (store.contacts[id] || {})
    return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
  }

  ronzz.sendContact = async (jid, contact, quoted = '', opts = {}) => {
    let list = []
    for (let i of contact) {
      list.push({
        lisplayName: owner.includes(i) ? ownerName : await ronzz.getName(i + '@s.whatsapp.net'),
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${owner.includes(i) ? ownerName : await ronzz.getName(i + '@s.whatsapp.net')}\nFN:${ownerNomer.includes(i) ? ownerName : await ronzz.getName(i + '@s.whatsapp.net')}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
      })
    }
    return ronzz.sendMessage(jid, { contacts: { displayName: `${list.length} Kontak`, contacts: list }, ...opts }, { quoted })
  }

  ronzz.sendImage = async (jid, path, caption = '', quoted = '', options) => {
    let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
    return await ronzz.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted })
  }

  ronzz.decodeJid = (jid) => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {}
      return decode.user && decode.server && decode.user + '@' + decode.server || jid
    } else return jid
  }

  ronzz.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
    let buffer
    if (options && (options.packname || options.author)) {
      buffer = await writeExifImg(buff, options)
    } else {
      buffer = await imageToWebp(buff)
    }
    await ronzz.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted }).then(response => {
      fs.unlinkSync(buffer)
      return response
    })
  }

  ronzz.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
    let buffer
    if (options && (options.packname || options.author)) {
      buffer = await writeExifVid(buff, options)
    } else {
      buffer = await videoToWebp(buff)
    }
    await ronzz.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted }).then(response => {
      fs.unlinkSync(buffer)
      return response
    })
  }

  return ronzz
}

startronzz()