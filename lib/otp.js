'use strict'

const { randomUUID } = require('node:crypto')
const { ensureOtpWalletSchema } = require('./otp-wallet')
const DEADLINE = 20 * 60 * 1000
const terminal = new Set(['cancelled', 'done', 'rejected'])
const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
const money = (value) => {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(String(value)))
    throw new Error('Harga layanan tidak valid.')
  const amount = Number(value)
  if (!Number.isSafeInteger(Math.round(amount * 100)) || amount <= 0)
    throw new Error('Harga layanan tidak valid.')
  return amount
}

async function api(action, params = {}) {
  const key = process.env.OTPCEPAT_API_KEY
  if (!key || key === 'your_otpcepat_api_key')
    throw new Error('OTP belum dikonfigurasi oleh admin.')
  const url = new URL('https://otpcepat.org/api/handler_api.php')
  url.search = new URLSearchParams({ api_key: key, action, ...params }).toString()
  // No retries or redirects: get_order has no idempotency key.
  try {
    const response = await require('node-fetch')(url, {
      timeout: 15000,
      redirect: 'error',
      size: 2 * 1024 * 1024,
    })
    if (!response.ok) throw new Error('http')
    const body = await response.json()
    const status = String(body.status).trim().toLowerCase()
    if (['false', 'error', 'failed'].includes(status) && !body.data?.order_id && !body.data?.number)
      return { ok: false }
    if (!['true', 'success'].includes(status)) throw new Error('schema')
    return { ok: true, data: body.data }
  } catch {
    throw new Error('Provider tidak dapat dipastikan. Cek status; jangan ulangi pembelian.')
  }
}

function countryMatch(countries, input) {
  const names = new Set([normalize(input)])
  if (/^[a-z]{2}$/i.test(input)) {
    for (const locale of ['en', 'id']) {
      const name = new Intl.DisplayNames([locale], { type: 'region' }).of(input.toUpperCase())
      names.add(normalize(name))
    }
  }
  const aliases = [
    ['uk', 'gb', 'United Kingdom', 'Great Britain', 'Inggris'],
    ['us', 'usa', 'United States', 'United States of America', 'America', 'Amerika Serikat'],
    ['ru', 'Russia', 'Russian Federation', 'Rusia'],
    ['kr', 'South Korea', 'Republic of Korea', 'Korea Selatan'],
    ['vn', 'Vietnam', 'Viet Nam'],
  ]
  for (const group of aliases) {
    if (group.some((name) => names.has(normalize(name))))
      group.forEach((name) => names.add(normalize(name)))
  }
  const matches = countries.filter((c) => names.has(normalize(c.countryName)))
  if (matches.length !== 1)
    throw new Error('Negara tidak ditemukan atau ambigu. Gunakan nama negara dari #otp.')
  return matches[0]
}

function cheapest(services, input) {
  const aliases = { wa: 'whatsapp', tg: 'telegram', ig: 'instagram', fb: 'facebook' }
  const name = aliases[normalize(input)] || normalize(input)
  const ids = services.filter((s) => String(s.serviceID) === input)
  const exact = ids.length ? ids : services.filter((s) => normalize(s.serviceName) === name)
  if (!exact.length)
    throw new Error(
      'Layanan tidak cocok persis. Lihat #otp <negara>; gunakan nama atau serviceID yang tepat.'
    )
  return exact.map((s) => ({ ...s, price: money(s.price) })).sort((a, b) => a.price - b.price)[0]
}

function createOtp({ pg, request = api, now = Date.now, ensure = ensureOtpWalletSchema }) {
  async function locked(user, work) {
    await ensure()
    const client = await pg.getClient()
    let acquired = false
    try {
      acquired = (
        await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [
          `otp:${user}`,
        ])
      ).rows[0].locked
      if (!acquired) throw new Error('Order OTP sedang diproses. Tunggu lalu #otp cek.')
      return await work(client)
    } finally {
      let destroy = false
      if (acquired) {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`otp:${user}`])
        } catch {
          destroy = true
        }
      }
      client.release(destroy)
    }
  }

  async function transaction(client, work) {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
    try {
      const result = await work()
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {}
      throw error
    }
  }
  async function save(client, order) {
    await client.query('UPDATE otp_orders SET state=$2, amount=$3, data=$4::jsonb WHERE id=$1', [
      order.id,
      order.state,
      order.amount,
      JSON.stringify(order.data),
    ])
  }
  async function latest(client, user) {
    return (
      await client.query(
        "SELECT * FROM otp_orders WHERE user_id=$1 ORDER BY (data->>'created')::bigint DESC LIMIT 1",
        [user]
      )
    ).rows[0]
  }
  async function list(action, params) {
    const result = await request(action, params)
    if (!result.ok || !Array.isArray(result.data))
      throw new Error('Daftar provider belum tersedia. Coba lagi nanti.')
    return result.data
  }
  async function buy(user, input) {
    return locked(user, async (client) => {
      const previous = await latest(client, user)
      if (previous && !terminal.has(previous.state))
        throw new Error('Masih ada order OTP aktif. Gunakan #otp cek.')
      const countries = await list('getCountries')
      const words = input.trim().split(/\s+/)
      let country, serviceInput
      for (let count = words.length - 1; count > 0; count--) {
        try {
          country = countryMatch(countries, words.slice(0, count).join(' '))
          serviceInput = words.slice(count).join(' ')
          break
        } catch {}
      }
      if (!country) throw new Error('Format: #buy otp id gopay. Negara harus cocok dengan #otp.')
      const service = cheapest(
        await list('getServices', { country_id: country.countryID }),
        serviceInput
      )
      const operators = await list('getOperators', { country_id: country.countryID })
      const operator = operators.includes('random')
        ? 'random'
        : operators.find((value) => typeof value === 'string' && value)
      if (!operator) throw new Error('Operator tidak tersedia.')
      const order = {
        id: randomUUID(),
        user_id: user,
        state: 'purchasing',
        amount: service.price,
        data: {
          created: now(),
          deadline: now() + DEADLINE,
          service: service.serviceName,
          country: country.countryName,
          debited: false,
        },
      }
      await transaction(client, async () => {
        await client.query(
          'INSERT INTO otp_orders(id,user_id,state,amount,data) VALUES($1,$2,$3,$4,$5::jsonb)',
          [order.id, user, order.state, order.amount, JSON.stringify(order.data)]
        )
        const wallet = await client.query('SELECT saldo FROM users WHERE user_id=$1 FOR UPDATE', [
          user,
        ])
        const holds = await client.query(
          "SELECT COALESCE(SUM(amount),0) AS amount FROM otp_orders WHERE user_id=$1 AND state IN ('purchasing','uncertain')",
          [user]
        )
        if (!wallet.rows.length || Number(wallet.rows[0].saldo) < Number(holds.rows[0].amount))
          throw new Error('Saldo tidak cukup. Isi saldo melalui #deposit.')
      })
      // A crash from here leaves a durable hold. Never repeat this request on recovery.
      let result
      try {
        result = await request('get_order', {
          country_id: country.countryID,
          service_id: service.serviceID,
          operator_id: operator,
        })
      } catch {
        order.state = 'uncertain'
        await save(client, order)
        return describe(order)
      }
      if (!result.ok) {
        order.state = 'rejected'
        await save(client, order)
        return 'Pembelian ditolak provider. Dana reservasi dilepas; saldo tidak dipotong.'
      }
      const data = result.data
      if (
        !data ||
        !['string', 'number'].includes(typeof data.order_id) ||
        !String(data.order_id).trim()
      ) {
        order.state = 'uncertain'
        await save(client, order)
        return describe(order)
      }
      order.data.providerId = String(data.order_id)
      if (['string', 'number'].includes(typeof data.number) && String(data.number).trim()) {
        order.data.number = String(data.number)
        order.data.deadline = now() + DEADLINE
      }
      if (
        data.status === 'Recieved' ||
        (typeof data.sms === 'string'
          ? data.sms.trim()
          : data.sms && typeof data.sms === 'object' && Object.keys(data.sms).length)
      ) {
        order.data.received = true
        if (data.sms) order.data.sms = data.sms
      }
      if (!order.data.number) order.state = 'uncertain'
      let price
      try {
        price = money(data.price)
      } catch {
        price = null
      }
      order.data.providerPrice = price
      if (price === null || price > service.price) {
        order.data.cancelRequested = true
        order.data.priceMismatch = true
      } else {
        order.amount = price
      }
      // Persist both number and settlement price before debit, including restart recovery.
      await save(client, order)
      await settle(client, order)
      if (order.data.cancelRequested) await refresh(client, order, 'batal')
      return describe(
        order,
        (await client.query('SELECT saldo FROM users WHERE user_id=$1', [user])).rows[0]?.saldo
      )
    })
  }
  async function settle(client, order) {
    if (order.data.debited || !order.data.number) return
    await transaction(client, async () => {
      order.state = 'waiting'
      order.data.debited = true
      await save(client, order)
      const debit = await client.query(
        'UPDATE users SET saldo=saldo-$2 WHERE user_id=$1 AND saldo >= $2 RETURNING saldo',
        [order.user_id, order.amount]
      )
      if (debit.rowCount !== 1)
        throw new Error('Debit OTP perlu rekonsiliasi admin. Jangan beli ulang.')
    })
  }
  async function refresh(client, order, action) {
    if (terminal.has(order.state)) return
    if (!order.data.providerId) {
      order.state = 'uncertain'
      await save(client, order)
      return
    }
    await settle(client, order)
    const result = await request('get_status', { order_id: order.data.providerId })
    if (
      !result.ok ||
      !result.data ||
      (result.data.order_id != null && String(result.data.order_id) !== order.data.providerId)
    )
      throw new Error('Status provider belum terkonfirmasi. Dana belum dikembalikan.')
    const status = result.data.status
    if (!['Waiting SMS', 'Recieved', 'Cancel', 'Done'].includes(status))
      throw new Error('Status provider tidak dikenal; order tetap disimpan.')
    const sms = result.data.sms
    const hasSms =
      typeof sms === 'string'
        ? Boolean(sms.trim())
        : Array.isArray(sms)
          ? sms.length > 0
          : sms && typeof sms === 'object' && Object.keys(sms).length > 0
    if (
      !order.data.number &&
      ['string', 'number'].includes(typeof result.data.number) &&
      String(result.data.number).trim()
    ) {
      order.data.number = String(result.data.number)
      order.data.deadline = now() + DEADLINE
      await save(client, order)
      await settle(client, order)
    }
    if (status === 'Recieved' || hasSms) {
      order.data.received = true
      if (hasSms && JSON.stringify(sms) !== JSON.stringify(order.data.sms)) {
        order.data.sms = sms
        order.data.notice = `OTP ${order.data.service}\nNomor: ${order.data.number}\nSMS: ${typeof sms === 'string' ? sms : JSON.stringify(sms)}`
      }
      order.state = order.data.debited ? 'received' : 'uncertain'
    }
    if (status === 'Cancel') {
      await transaction(client, async () => {
        order.state = 'cancelled'
        if (order.data.debited && !order.data.refunded && !order.data.received) {
          order.data.refunded = true
          const refund = await client.query('UPDATE users SET saldo=saldo+$2 WHERE user_id=$1', [
            order.user_id,
            order.amount,
          ])
          if (refund.rowCount !== 1) throw new Error('Saldo refund perlu rekonsiliasi admin.')
        }
        const cancellation = order.data.refunded
          ? `Order OTP dibatalkan provider. Rp${order.amount} dikembalikan ke saldo.`
          : order.data.received
            ? 'Order OTP dibatalkan provider. Tidak ada refund karena OTP sudah diterima.'
            : 'Order OTP dibatalkan provider. Reservasi dilepas; saldo tidak dipotong.'
        order.data.notice = [order.data.notice, cancellation].filter(Boolean).join('\n')
        await save(client, order)
      })
      return
    }
    if (status === 'Done') {
      order.state = 'done'
      order.data.notice = [order.data.notice, 'Order OTP selesai.'].filter(Boolean).join('\n')
    }
    await save(client, order)
    if (terminal.has(order.state) || action === 'confirm') return
    const cancel =
      !order.data.received &&
      (action === 'batal' || now() >= order.data.deadline || order.data.cancelRequested)
    if (action === 'batal' && order.data.received)
      throw new Error('OTP sudah diterima. Tidak bisa batal/refund; gunakan #otp selesai.')
    const next = cancel ? 2 : action === 'resend' ? 3 : action === 'selesai' ? 4 : null
    if (next === 4 && !order.data.received) throw new Error('Belum ada OTP. Gunakan #otp batal.')
    if (next) {
      if (cancel) {
        order.data.cancelRequested = true
        await save(client, order)
      }
      const changed = await request('set_status', { order_id: order.data.providerId, status: next })
      if (!changed.ok)
        throw new Error('Perubahan status ditolak provider. Order dan dana tetap disimpan.')
      if (next !== 3) await refresh(client, order, 'confirm')
    }
  }
  async function operate(user, action, send, id) {
    return locked(user, async (client) => {
      const order = id
        ? (await client.query('SELECT * FROM otp_orders WHERE user_id=$1 AND id=$2', [user, id]))
            .rows[0]
        : await latest(client, user)
      if (!order) return 'Belum ada order OTP. Gunakan #buy otp id gopay.'
      await refresh(client, order, action)
      if (send && order.data.notice) {
        await send(user, order.data.notice)
        delete order.data.notice
        await save(client, order)
      }
      return describe(order)
    })
  }
  async function menu(input) {
    if (!input || input === 'menu') {
      const countries = await list('getCountries')
      return (
        '#buy otp <negara> <layanan>\n#otp <negara>\n#otp cek / resend / batal / selesai\nBatas tunggu 20 menit; resend tidak memperpanjang.\nNegara (kode ISO atau nama):\n' +
        countries.map((c) => c.countryName).join(', ')
      )
    }
    const country = countryMatch(await list('getCountries'), input)
    const services = await list('getServices', { country_id: country.countryID })
    return (
      `Layanan ${country.countryName}:\n` +
      services.map((s) => `${s.serviceID}: ${s.serviceName} - Rp${money(s.price)}`).join('\n')
    )
  }
  async function poll(send) {
    await ensure()
    const result = await pg.query(
      "SELECT id, user_id FROM otp_orders WHERE state NOT IN ('cancelled','done','rejected') OR data ? 'notice'"
    )
    for (const { user_id: user, id } of result.rows) {
      try {
        await operate(user, 'poll', send, id)
      } catch {
        /* Durable state is retried on the next poll. */
      }
    }
  }
  return { buy, operate, menu, poll }
}

function describe(order, balance) {
  if (['purchasing', 'uncertain'].includes(order.state))
    return `Order OTP ${order.id}: hasil pembelian belum pasti. Dana tetap direservasi; pembelian baru diblokir. Hubungi admin untuk rekonsiliasi provider. Tidak ada pembelian ulang otomatis.`
  return (
    `OTP ${order.data.service}\nNomor: ${order.data.number}\nBiaya: Rp${order.amount}\nStatus: ${order.state}\nBatas tunggu: ${new Date(order.data.deadline).toISOString()}\n` +
    (balance == null ? '' : `Sisa saldo: Rp${balance}\n`) +
    (order.data.priceMismatch
      ? 'Harga provider berubah/tidak valid. Pembatalan diminta; refund hanya setelah provider mengonfirmasi dan belum ada OTP. Debit tidak melebihi harga awal.\n'
      : '') +
    (order.data.sms
      ? `SMS: ${typeof order.data.sms === 'string' ? order.data.sms : JSON.stringify(order.data.sms)}\n`
      : '') +
    '#otp cek / resend / batal / selesai'
  )
}

let instance,
  timer,
  running = false
function service() {
  return (instance ||= createOtp({ pg: require('../config/postgres') }))
}
function start(nicola) {
  if (timer) clearInterval(timer)
  if (!process.env.OTPCEPAT_API_KEY || process.env.OTPCEPAT_API_KEY === 'your_otpcepat_api_key')
    return
  const tick = async () => {
    if (running) return
    running = true
    try {
      await service().poll((user, text) => nicola.sendMessage(user, { text }))
    } catch {
      console.warn('[OTP] Poll unavailable; check database schema and provider configuration.')
    } finally {
      running = false
    }
  }
  timer = setInterval(tick, 15000)
  timer.unref()
  void tick()
}
async function command(user, input, purchase = false) {
  if (!/^\d+@s\.whatsapp\.net$/.test(user)) return 'Identitas wallet WhatsApp tidak valid.'
  if (typeof input !== 'string' || input.length > 200) return 'Format perintah OTP tidak valid.'
  try {
    if (
      purchase &&
      (!process.env.OTPCEPAT_API_KEY || process.env.OTPCEPAT_API_KEY === 'your_otpcepat_api_key')
    )
      return 'OTP belum dikonfigurasi oleh admin.'
    if (purchase) return await service().buy(user, input)
    const action = input.trim().toLowerCase()
    if (['cek', 'resend', 'batal', 'selesai'].includes(action))
      return await service().operate(user, action)
    return await service().menu(input.trim())
  } catch (error) {
    // Only local validation messages are public; SQL/provider payloads never reach chat.
    if (
      error.code ||
      !/^(OTP|Order|Masih|Format|Negara|Layanan|Harga|Daftar|Operator|Saldo|Provider|Pembelian|Status|Perubahan|Belum|Tunggu|Debit)/.test(
        error.message
      )
    )
      return 'OTP gagal diproses. Cek #otp cek atau hubungi admin; jangan ulangi pembelian yang belum pasti.'
    return error.message
  }
}
async function getBalance(request = api) {
  try {
    const result = await request('getBalance')
    const saldo = result.data?.saldo
    if (
      !result.ok ||
      !['string', 'number'].includes(typeof saldo) ||
      !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(String(saldo)) ||
      !Number.isSafeInteger(Math.round(Number(saldo) * 100))
    )
      return 'Saldo API OTPCepat belum dapat dibaca.'
    return `Saldo API OTPCepat: Rp${Number(saldo).toLocaleString('id-ID')}`
  } catch {
    return 'Gagal cek saldo API OTPCepat. Periksa konfigurasi dan koneksi provider.'
  }
}

module.exports = {
  createOtp,
  countryMatch,
  cheapest,
  money,
  api,
  command,
  start,
  DEADLINE,
  getBalance,
}
