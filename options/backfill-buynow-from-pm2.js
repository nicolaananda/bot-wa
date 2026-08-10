'use strict'

require('dotenv').config()
const fs = require('fs')
const https = require('https')
const moment = require('moment-timezone')
const { query, closePool } = require('../config/postgres')

const apply = process.argv.includes('--apply')
const logPath = process.argv.slice(2).find((arg) => arg !== '--apply') || '/root/.pm2/logs/bot-wa-out.log'

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`${url}: HTTP ${response.statusCode}`))
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve(body))
    }).on('error', reject)
  })
}

function parseCompletedOrders(source) {
  const created = new Map()
  for (const match of source.matchAll(/\[MID\] Order created: (MID-([A-F0-9]+)-(\d+)), Amount: Rp([\d.]+), Sender: (\S+)/g)) {
    created.set(match[1], {
      orderId: match[1],
      refId: match[2],
      createdAt: Number(match[3]),
      amount: Number(match[4].replace(/\./g, '')),
      sender: match[5],
    })
  }

  const completed = new Map()
  for (const match of source.matchAll(/\[MID-GLOBAL\] Transaction completed: (MID-([A-F0-9]+)-\d+) - ([A-F0-9]+)/g)) {
    const order = created.get(match[1])
    if (order && order.refId === match[3]) completed.set(order.refId, order)
  }
  return [...completed.values()]
}

async function main() {
  const orders = parseCompletedOrders(fs.readFileSync(logPath, 'utf8'))
  const refs = orders.map((order) => order.refId)
  const existing = refs.length
    ? await query('SELECT ref_id FROM transaksi WHERE ref_id = ANY($1::text[])', [refs])
    : { rows: [] }
  const existingRefs = new Set(existing.rows.map((row) => row.ref_id))
  const missing = orders.filter((order) => !existingRefs.has(order.refId))

  const products = await query('SELECT id, data FROM produk')
  const byName = new Map(products.rows.map((row) => [String(row.data?.name || row.data?.nama || '').trim(), { id: row.id, data: row.data || {} }]))
  const records = []
  for (const order of missing) {
    const receipt = await fetchText(`https://cdn-receipt.nicola.id/receipts/${order.refId}.txt`)
    const productName = /^\*📦 Produk:\*\s*(.+)$/m.exec(receipt)?.[1]?.trim()
    if (!productName) throw new Error(`Product missing in receipt ${order.refId}`)
    const product = byName.get(productName)
    records.push({
      id: product?.id || 'unknown',
      name: productName,
      price: Number(product?.data?.price || product?.data?.harga || order.amount),
      date: moment(order.createdAt).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
      profit: Number(product?.data?.profit || 0),
      jumlah: 1,
      user: order.sender.split('@')[0],
      reffId: order.refId,
      metodeBayar: 'QRIS',
      status: 'completed',
      totalBayar: order.amount,
      backfilledFrom: 'pm2-completion-log+r2-receipt',
    })
  }

  const total = records.reduce((sum, record) => sum + record.totalBayar, 0)
  console.log(JSON.stringify({ completed: orders.length, existing: existingRefs.size, missing: records.length, total }, null, 2))
  if (!apply || !records.length) return

  await query('BEGIN')
  try {
    for (const record of records) {
      await query(
        `INSERT INTO transaksi(ref_id, user_id, amount, status, meta)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING`,
        [record.reffId, record.user, record.totalBayar, record.status, JSON.stringify(record)]
      )
    }
    await query('COMMIT')
  } catch (error) {
    await query('ROLLBACK')
    throw error
  }
  console.log(`Backfilled ${records.length} completed buynow transaction(s).`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(closePool)
