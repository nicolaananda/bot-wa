'use strict'

require('dotenv').config()
require('./setting.js')

const { Telegraf, Markup } = require('telegraf')
const path = require('path')
const fs = require('fs')
const moment = require('moment-timezone')
const fetch = require('node-fetch')

// Initialize global DB similar to WA bot
global.opts = {}
global.db = new (require('./function/database'))('options/database.json', null, 2)
global.dbHelper = require('./options/db-helper')

// Initialize Redis (optional)
const { isRedisAvailable } = require('./config/redis')
const { acquireLock, releaseLock, checkRateLimit } = require('./function/redis-helper')

// QRIS util
const { qrisDinamis } = require('./function/dinamis')
const stockHelper = require('./options/stock-helper')

// Simple currency helper
function toRupiah(n) {
  const num = Number(n || 0)
  return num.toLocaleString('id-ID')
}

// Price resolver (mirror of index.js hargaProduk)
function hargaProduk(id, role) {
  const p = (global.db?.data?.produk || {})[id]
  if (!p) return 0
  if (role === 'silver') return p.priceS
  if (role === 'gold') return p.priceG
  return p.priceB
}

// Get user profile in DB snapshot
function getUserData(userId) {
  const users = global.db?.data?.users || {}
  return users[userId] || users[`${userId}@s.whatsapp.net`] || { saldo: 0, role: 'bronze' }
}

// Ensure DB base structure and load from Postgres if enabled
;(async () => {
  try {
    const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true'
    if (usePg && typeof global.db.load === 'function') {
      await global.db.load()
    }
  } catch (e) {
    console.error('[DB] Failed to load from Postgres:', e && e.message ? e.message : e)
  }
  if (!global.db.data.list) global.db.data.list = []
  if (!global.db.data.users) global.db.data.users = {}
  if (!global.db.data.produk) global.db.data.produk = {}
  if (!global.db.data.order) global.db.data.order = {}
  if (!global.db.data.transaksi) global.db.data.transaksi = []
  try { await global.db.save() } catch {}
})()

// Bot token
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set in environment')
  process.exit(1)
}

const bot = new Telegraf(BOT_TOKEN)

// Formatting helpers
function badge(text) { return `▪️ ${text}` }
function bold(text) { return `*${text}*` }
function code(text) { return `\`${text}\`` }
function normalize(text) { return String(text || '').toLowerCase().trim() }
// Keep last shown list for quick numeric selection
const userListMap = Object.create(null) // { [userId]: { ids: string[], page: number, filter: string } }

// Start / help
bot.start(async (ctx) => {
  const uid = String(ctx.from.id)
  const user = getUserData(uid)
  const produk = Object.values(global.db?.data?.produk || {})
  const totalProduk = produk.length
  const lowCount = produk.filter(p => (p.stok?.length || 0) > 0 && (p.stok?.length || 0) <= 3).length
  const outCount = produk.filter(p => (p.stok?.length || 0) === 0).length

  const welcome = `${bold('✨ GiHa Smart Store')}` +
    `\n${badge('Hai, ' + (ctx.from.first_name || 'User'))}` +
    `\n${badge('Saldo: Rp' + toRupiah(user.saldo))}  ${badge('Role: ' + (user.role || 'bronze'))}` +
    `\n${badge('Produk: ' + totalProduk)}  ${badge('Low stock: ' + lowCount)}  ${badge('Habis: ' + outCount)}` +
    `\n\n${bold('Aksi cepat:')}` +
    `\n• Katalog produk dengan tombol di bawah` +
    `\n• /cari <prefix> (contoh: /cari netflix)` +
    `\n• /stok [prefix] untuk lihat stok + harga`

  await ctx.reply(welcome, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🛒 Buka Katalog', 'CATALOG_PAGE_1')],
      [Markup.button.callback('🔎 Cari Produk', 'PROMPT_SEARCH'), Markup.button.callback('📉 Stok Tipis', 'LOW_STOCK')],
      [Markup.button.callback('💳 Deposit', 'DEPOSIT'), Markup.button.callback('🧾 Pesanan Saya', 'MY_ORDERS')],
      [Markup.button.callback('⭐ Netflix', 'CATALOG_PAGE_1_F_netflix'), Markup.button.callback('📺 VIU', 'CATALOG_PAGE_1_F_viu')],
      [Markup.button.callback('🎨 Canva', 'CATALOG_PAGE_1_F_canva'), Markup.button.callback('🎵 Spotify', 'CATALOG_PAGE_1_F_spotify')],
    ])
  })
})

// /menu as alias of /start
bot.command('menu', async (ctx) => {
  return bot.start(ctx)
})

// Build paginated catalog
function filterAndSortProducts(keyword) {
  let all = Object.entries(global.db?.data?.produk || {})
    .map(([id, p]) => ({ id, ...p }))
  if (keyword) {
    const key = normalize(keyword)
    all = all.filter(p => normalize(p.name).startsWith(key))
  }
  // sort by name asc
  all.sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)))
  return all
}

function buildCatalogPage(page = 1, perPage = 8, keyword = '', userId = '') {
  const all = filterAndSortProducts(keyword)
  const total = all.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const p = Math.min(Math.max(1, Number(page)), pages)
  const slice = all.slice((p - 1) * perPage, (p - 1) * perPage + perPage)

  const lines = slice.map((prod, idx) => {
    const stock = prod.stok?.length || 0
    const tag = stock === 0 ? '⛔️ Habis' : stock <= 3 ? '🟠 Tipis' : '🟢 Ready'
    const role = getUserData(userId).role || 'bronze'
    const price = toRupiah(hargaProduk(prod.id, role))
    return `${bold(`${idx + 1}. ${prod.name}`)}\n${badge(`Stok: ${stock}`)}  ${badge(tag)}  ${badge(`Harga: Rp${price}`)}`
  }).join('\n\n')

  const text = `${bold('📚 Katalog Produk')}${keyword ? `\nFilter: ${code(keyword)}` : ''}\n\n${lines || '_Tidak ada produk_'}\n\nHalaman ${p}/${pages}`

  // Buttons: product detail (numbered), pagination
  const safeKey = encodeURIComponent(keyword || '')
  // Use pipe-delimited callback data to avoid underscore parsing issues
  const itemButtons = slice.map((prod, idx) => Markup.button.callback(`${idx + 1}`, `PD|${encodeURIComponent(prod.id)}|${p}|${safeKey}`))
  const rows = []
  for (let i = 0; i < itemButtons.length; i += 4) rows.push(itemButtons.slice(i, i + 4))
  const nav = [
    Markup.button.callback('⬅️ Prev', `CATALOG_PAGE_${Math.max(1, p - 1)}_F_${safeKey}`),
    Markup.button.callback('Next ➡️', `CATALOG_PAGE_${p + 1}_F_${safeKey}`),
  ]
  rows.push(nav)
  const ids = slice.map(s => s.id)
  return { text, keyboard: Markup.inlineKeyboard(rows), ids, page: p, keyword }
}

// Catalog view (paginated)
bot.action(/CATALOG_PAGE_(\d+)(?:_F_(.*))?/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const page = Number(ctx.match[1]) || 1
  const keyword = decodeURIComponent(ctx.match[2] || '')
  const { text, keyboard, ids, page: p, keyword: k } = buildCatalogPage(page, 8, keyword, String(ctx.from.id))
  userListMap[String(ctx.from.id)] = { ids, page: p, filter: k }
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard })
})

// Product detail (encoded id, pipe-delimited)
bot.action(/PD\|([^|]+)\|([^|]+)\|?(.*)?/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const productId = decodeURIComponent(ctx.match[1])
  const pageBack = Number(ctx.match[2] || 1)
  const keyword = decodeURIComponent(ctx.match[3] || '')
  const p = global.db?.data?.produk?.[productId]
  if (!p) return ctx.reply('Produk tidak ditemukan.')
  const role = (getUserData(String(ctx.from.id)).role) || 'bronze'
  const price = toRupiah(hargaProduk(productId, role))
  const text = `${bold('📦 ' + p.name)}\n\n${badge('Harga (' + role + '): Rp' + price)}\n\n${badge('Stok: ' + (p.stok?.length || 0))}`
  await ctx.editMessageText(
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback('📱 Buynow (QRIS)', `BN_${productId}`)],
      [Markup.button.callback('⬅️ Kembali', `CATALOG_PAGE_${pageBack}_F_${encodeURIComponent(keyword)}`)],
    ])
  )
})

// Search command: /cari netflix
bot.command('cari', async (ctx) => {
  const keyword = String(ctx.message.text || '').split(' ').slice(1).join(' ').trim()
  if (!keyword) return ctx.reply('Format: /cari <prefix produk>\nContoh: /cari netflix')
  const { text, keyboard, ids, page, keyword: k } = buildCatalogPage(1, 8, keyword, String(ctx.from.id))
  userListMap[String(ctx.from.id)] = { ids, page, filter: k }
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard })
})

// Stock command: /stok [prefix]
bot.command('stok', async (ctx) => {
  const keyword = String(ctx.message.text || '').split(' ').slice(1).join(' ').trim()
  const list = filterAndSortProducts(keyword)
  if (!list.length) return ctx.reply('Tidak ada produk.')
  const role = (getUserData(String(ctx.from.id)).role) || 'bronze'
  const slice = list.slice(0, 50)
  const lines = slice.map((p, i) => {
    const stock = p.stok?.length || 0
    const price = toRupiah(hargaProduk(p.id, role))
    return `${i + 1}. ${p.name} — Stok: ${stock} — Harga (${role}): Rp${price}`
  }).join('\n')
  await ctx.reply(`${bold('📦 Stok Produk')}${keyword ? `\nFilter: ${code(keyword)}` : ''}\n\n${lines}`, { parse_mode: 'Markdown' })
  userListMap[String(ctx.from.id)] = { ids: slice.map(s => s.id), page: 1, filter: keyword }
})

// Numeric quick-select from last list (catalog or /stok)
bot.hears(/^\d+$/, async (ctx) => {
  const uid = String(ctx.from.id)
  const index = Number((ctx.message.text || '').trim())
  const map = userListMap[uid]
  if (!map || !Array.isArray(map.ids)) return
  if (index < 1 || index > map.ids.length) return
  const productId = map.ids[index - 1]
  const p = global.db?.data?.produk?.[productId]
  if (!p) return ctx.reply('Produk tidak ditemukan.')
  const role = (getUserData(uid).role) || 'bronze'
  const price = toRupiah(hargaProduk(productId, role))
  const text = `${bold('📦 ' + p.name)}\n\n${badge('Harga (' + role + '): Rp' + price)}\n\n${badge('Stok: ' + (p.stok?.length || 0))}`
  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback('📱 Buynow (QRIS)', `BN_${productId}`)],
      [Markup.button.callback('⬅️ Kembali', `CATALOG_PAGE_${map.page}_F_${encodeURIComponent(map.filter || '')}`)],
    ])
  )
})

// Check stock
bot.action(/STOK_(.+)/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const id = ctx.match[1]
  const p = global.db?.data?.produk?.[id]
  if (!p) return ctx.reply('Produk tidak ditemukan.')
  const role = (getUserData(String(ctx.from.id)).role) || 'bronze'
  const price = toRupiah(hargaProduk(id, role))
  await ctx.reply(`Stok tersedia: ${p.stok?.length || 0}\nHarga (${role}): Rp${price}`)
})

// Quick search prompt (inline)
bot.action('PROMPT_SEARCH', async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  await ctx.reply('Ketik perintah: /cari <prefix produk>\nContoh: /cari netflix')
})

// Low stock view
bot.action('LOW_STOCK', async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const list = filterAndSortProducts('')
    .filter(p => (p.stok?.length || 0) > 0 && (p.stok?.length || 0) <= 3)
    .slice(0, 25)
  if (!list.length) return ctx.reply('Tidak ada produk stok tipis saat ini.')
  const text = `${bold('📉 Stok Tipis')}\n\n` + list.map((p, i) => `${i + 1}. ${p.name} — Stok: ${p.stok?.length || 0}`).join('\n')
  await ctx.reply(text, { parse_mode: 'Markdown' })
})

// Buy with saldo (asks quantity via custom buttons)
bot.action(/BUY_(.+)/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const id = ctx.match[1]
  const p = global.db?.data?.produk?.[id]
  if (!p) return ctx.reply('Produk tidak ditemukan.')
  await ctx.reply(
    `${bold('Berapa jumlah?')}\n${p.name}`,
    Markup.inlineKeyboard(
      [1,2,3,5].map(n => Markup.button.callback(`${n}`, `BUYQ_${id}_${n}`)),
      { columns: 4 }
    )
  )
})

bot.action(/BUYQ_(.+)_(\d+)/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const productId = ctx.match[1]
  const qty = Number(ctx.match[2])
  const uid = String(ctx.from.id)
  const user = getUserData(uid)

  // Rate limit
  const rl = await checkRateLimit(uid, 'buy', 3, 60)
  if (!rl.allowed) return ctx.reply(`Terlalu sering. Coba lagi ${rl.resetIn}s`) 

  // Lock
  const locked = await acquireLock(uid, 'buy', 30)
  if (!locked) return ctx.reply('Transaksi lain sedang diproses, coba sebentar lagi.')

  try {
    const p = global.db?.data?.produk?.[productId]
    if (!p) return ctx.reply('Produk tidak ditemukan.')
    if (!Array.isArray(p.stok) || p.stok.length < qty) return ctx.reply(`Stok tidak cukup. Tersedia: ${p.stok?.length || 0}`)

    const role = user.role || 'bronze'
    const priceEach = Number(hargaProduk(productId, role))
    const total = priceEach * qty

    const saldoNow = typeof global.dbHelper.getUserSaldoAsync === 'function'
      ? await global.dbHelper.getUserSaldoAsync(uid)
      : global.dbHelper.getUserSaldo(uid)
    if (saldoNow < total) return ctx.reply(`Saldo kurang. Saldo: Rp${toRupiah(saldoNow)} | Total: Rp${toRupiah(total)}`)

    // Deduct saldo
    await global.dbHelper.updateUserSaldo(uid, total, 'subtract')

    // Decrement stock and record transaction
    if (!p.terjual) p.terjual = 0
    p.terjual += qty
    const delivered = []
    for (let i = 0; i < qty; i++) delivered.push(p.stok.shift())

    const reffId = Math.random().toString(36).slice(2, 8).toUpperCase()
    const trx = {
      reffId,
      userId: uid,
      idProduk: productId,
      jumlah: qty,
      metode: 'Saldo',
      total,
      at: Date.now(),
    }
    global.db.data.transaksi.push(trx)
    await global.db.save()

    const lines = delivered.map((s, i) => `#${i+1} ${s}`).join('\n')
    await ctx.replyWithMarkdown(
      `${bold('✅ Pembelian sukses!')}\n${badge('Ref: ' + reffId)}\n${badge('Produk: ' + p.name)}\n${badge('Jumlah: ' + qty)}\n${badge('Total: Rp' + toRupiah(total))}\n\n${bold('Data akun:')}\n${code(lines.replace(/\n/g, '\n'))}`
    )
  } catch (e) {
    console.error(e)
    await ctx.reply('Terjadi kesalahan saat memproses pembelian.')
  } finally {
    await releaseLock(uid, 'buy')
  }
})

// Buynow (QRIS)
bot.action(/BN_(.+)/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const uid = String(ctx.from.id)
  const productId = ctx.match[1]

  // Rate limit
  const rl = await checkRateLimit(uid, 'buynow', 3, 60)
  if (!rl.allowed) return ctx.reply(`Terlalu sering. Coba lagi ${rl.resetIn}s`)

  const locked = await acquireLock(uid, 'buynow', 30)
  if (!locked) return ctx.reply('Transaksi lain sedang diproses, coba sebentar lagi.')

  try {
    const p = global.db?.data?.produk?.[productId]
    if (!p) return ctx.reply('Produk tidak ditemukan.')
    if (!Array.isArray(p.stok) || p.stok.length < 1) return ctx.reply('Stok habis.')

    // Ask qty
    await ctx.reply(
      `${bold('Berapa jumlah?')}\n${p.name}`,
      Markup.inlineKeyboard(
        [1,2,3,5].map(n => Markup.button.callback(`${n}`, `BNQ_${productId}_${n}`)),
        { columns: 4 }
      )
    )
  } catch (e) {
    console.error(e)
    await ctx.reply('Gagal memulai buynow.')
    await releaseLock(uid, 'buynow')
  }
})

bot.action(/BNQ_(.+)_(\d+)/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const uid = String(ctx.from.id)
  const productId = ctx.match[1]
  const qty = Number(ctx.match[2])

  try {
    const p = global.db?.data?.produk?.[productId]
    if (!p) return ctx.reply('Produk tidak ditemukan.')
    if (!Array.isArray(p.stok) || p.stok.length < qty) return ctx.reply(`Stok tidak cukup. Tersedia: ${p.stok?.length || 0}`)

    const role = (getUserData(uid).role) || 'bronze'
    const priceEach = Number(hargaProduk(productId, role))
    const subtotal = priceEach * qty
    const uniqueCode = Math.floor(1 + Math.random() * 99)
    const totalAmount = subtotal + uniqueCode

    const reffId = Math.random().toString(36).slice(2, 8).toUpperCase()
    const orderId = `TRX-${reffId}-${Date.now()}`
    const outPath = path.join(__dirname, 'options', 'image', `qris_${orderId}.png`)

    // Generate QR image using existing dynamic QRIS builder
    await qrisDinamis(String(totalAmount), outPath)

    // Save pending order marker
    global.db.data.order[uid] = {
      status: 'processing',
      reffId,
      idProduk: productId,
      jumlah: qty,
      metode: 'QRIS',
      startedAt: Date.now(),
      total: totalAmount,
      subtotal,
      uniqueCode,
      orderId,
      tgMessageId: undefined,
    }
    await global.db.save()

    const caption = `${bold('🧾 MENUNGGU PEMBAYARAN')}\n\n${badge('Produk: ' + p.name)}\n${badge('Jumlah: ' + qty)}\n${badge('Subtotal: Rp' + toRupiah(subtotal))}\n${badge('Kode Unik: ' + uniqueCode)}\n${badge('Total: Rp' + toRupiah(totalAmount))}\n${badge('Batas waktu: 30 menit')}\n\nSetelah bayar, sistem akan memproses otomatis.`

    const photo = fs.readFileSync(outPath)
    const sent = await ctx.replyWithPhoto(
      { source: photo },
      {
        caption,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Batal', `CANCEL|${orderId}`)]
        ])
      }
    )
    // store message id for later deletion on paid/timeout
    try {
      const mid = sent?.message_id
      if (mid) {
        global.db.data.order[uid].tgMessageId = mid
        await global.db.save()
      }
    } catch {}
  } catch (e) {
    console.error(e)
    await ctx.reply('Gagal membuat QRIS.')
    await releaseLock(uid, 'buynow')
  }
})

// Basic deposit CTA (placeholder)
bot.action('DEPOSIT', async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  await ctx.reply('Fitur deposit via QRIS tersedia dari menu web/dashboard atau gunakan perintah buynow sebagai referensi pembayaran.')
})

// Cancel pending QRIS order by orderId
bot.action(/CANCEL\|(.+)/, async (ctx) => {
  try { await ctx.answerCbQuery('Dibatalkan') } catch {}
  const uid = String(ctx.from.id)
  const orderId = ctx.match[1]
  const ord = global.db?.data?.order?.[uid]
  if (!ord || ord.orderId !== orderId) return ctx.reply('Tidak ada pesanan aktif untuk dibatalkan.')
  try {
    if (ord.tgMessageId) await bot.telegram.deleteMessage(uid, ord.tgMessageId)
  } catch {}
  delete global.db.data.order[uid]
  try { await releaseLock(uid, 'buynow') } catch {}
  await global.db.save()
  try { await ctx.reply('Pesanan dibatalkan.') } catch {}
})

// Health check command
bot.command('ping', async (ctx) => {
  const redisReady = await isRedisAvailable().catch(() => false)
  await ctx.reply(`pong | redis: ${redisReady ? 'ok' : 'off'}`)
})

// Start bot
bot.launch().then(() => {
  console.log('🚀 Telegram bot started')
}).catch((e) => {
  console.error('Failed to start Telegram bot:', e)
  process.exit(1)
})

// === Auto-detect payment via listener (QRIS static) ===
async function pollPaymentsAndFulfill() {
  try {
    const orders = global.db?.data?.order || {}
    const entries = Object.entries(orders)
    if (!entries.length) return

    const baseUrl = global.listener?.baseUrl
    const apiKey = global.listener?.apiKey
    if (!baseUrl) return

    const url = `${baseUrl.replace(/\/$/, '')}/notifications?limit=50`
    const headers = apiKey ? { 'X-API-Key': apiKey } : {}
    let notifData = []
    try {
      const resp = await fetch(url, { headers })
      if (resp.ok) {
        const body = await resp.json()
        notifData = Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : [])
      }
    } catch (e) {
      // ignore temporary fetch errors
      return
    }

    for (const [uid, ord] of entries) {
      if (!ord || ord.metode !== 'QRIS') continue
      const p = global.db?.data?.produk?.[ord.idProduk]
      if (!p) { delete global.db.data.order[uid]; continue }

      // Expiration: 30 minutes
      const expired = (Date.now() - (ord.startedAt || 0)) > (30 * 60 * 1000)
      if (expired) {
        // delete QR message if exists
        try {
          if (ord.tgMessageId) await bot.telegram.deleteMessage(uid, ord.tgMessageId)
        } catch {}
        delete global.db.data.order[uid]
        await global.db.save()
    try { await releaseLock(uid, 'buynow') } catch {}
        try { await bot.telegram.sendMessage(uid, 'Pembayaran kadaluarsa. Silakan buat pesanan lagi.') } catch {}
        continue
      }

      const totalAmount = Number(ord.total)
      if (!Number.isFinite(totalAmount)) continue

      // Match incoming notifications by amount (DANA only)
      const paid = notifData.find(n => {
        const amt = Number(String(n?.amount_detected || '').replace(/[^0-9]/g, ''))
        const app = (n?.package_name || n?.app_name || '').toString().toUpperCase()
        const isDana = app.includes('DANA')
        return isDana && amt === totalAmount
      })

      if (paid) {
        // delete QR message if exists
        try {
          if (ord.tgMessageId) await bot.telegram.deleteMessage(uid, ord.tgMessageId)
        } catch {}
        // Deliver items
        if (!Array.isArray(p.stok) || p.stok.length < ord.jumlah) {
          // insufficient stock safeguard
          delete global.db.data.order[uid]
          await global.db.save()
        try { await releaseLock(uid, 'buynow') } catch {}
          try { await bot.telegram.sendMessage(uid, 'Stok tidak mencukupi saat pembayaran terdeteksi. Dana akan dianggap pembayaran tanpa pemenuhan otomatis, hubungi admin.') } catch {}
          continue
        }

        if (!p.terjual) p.terjual = 0
        p.terjual += ord.jumlah
        const delivered = []
        for (let i = 0; i < ord.jumlah; i++) delivered.push(p.stok.shift())

        // Build detail akun like WA format
        let detailAkun = `${bold('📦 Produk:')} ${p.name}\n` +
                         `${badge('Tanggal: ' + moment().tz('Asia/Jakarta').format('DD/MM/YYYY'))}\n` +
                         `${badge('Jam: ' + moment().tz('Asia/Jakarta').format('HH:mm') + ' WIB')}\n\n`
        delivered.forEach((item) => {
          const parsed = stockHelper.parseStockItem(item) || {}
          detailAkun += `│ 📧 Email: ${parsed.email || '-'}\n`
          detailAkun += `│ 🔐 Password: ${parsed.password || '-'}\n`
          detailAkun += `│ 👤 Profil: ${parsed.profile || '-'}\n`
          detailAkun += `│ 🔢 Pin: ${parsed.pin || '-'}\n`
          detailAkun += `│ 🔒 2FA: ${parsed.notes || '-'}\n\n`
        })

        const headerMsg = `${bold('✅ Pembayaran diterima!')}\n${badge('Ref: ' + ord.reffId)}\n${badge('Produk: ' + p.name)}\n${badge('Jumlah: ' + ord.jumlah)}\n${badge('Total: Rp' + toRupiah(totalAmount))}`
        try {
          await bot.telegram.sendMessage(uid, headerMsg, { parse_mode: 'Markdown' })
          await bot.telegram.sendMessage(uid, detailAkun, { parse_mode: 'Markdown' })
        } catch {}

        // Send SNK if available
        if (p.snk) {
          let snkProduk = `${bold('╭────「 SYARAT & KETENTUAN 」────╮')}\n\n`
          snkProduk += `${bold('📋 SNK PRODUK: ' + p.name)}\n\n`
          snkProduk += `${p.snk}\n\n`
          snkProduk += `${bold('⚠️ PENTING:')}\n`
          snkProduk += `• Baca dan pahami SNK sebelum menggunakan akun\n`
          snkProduk += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`
          snkProduk += `• Hubungi admin jika ada masalah dengan akun\n\n`
          snkProduk += `${bold('╰────「 END SNK 」────╯')}`
          try { await bot.telegram.sendMessage(uid, snkProduk, { parse_mode: 'Markdown' }) } catch {}
        }

        // Record transaksi
        global.db.data.transaksi.push({
          reffId: ord.reffId,
          userId: uid,
          idProduk: ord.idProduk,
          jumlah: ord.jumlah,
          metode: 'QRIS',
          total: totalAmount,
          at: Date.now(),
        })

        delete global.db.data.order[uid]
        await global.db.save()
        try { await releaseLock(uid, 'buynow') } catch {}
      }
    }
  } catch {}
}

setInterval(pollPaymentsAndFulfill, 15000)

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))


