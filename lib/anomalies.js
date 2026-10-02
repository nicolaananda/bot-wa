'use strict'

function classify({ transactions = [], webhooks = [] }, now = Date.now(), staleMs = 30 * 60 * 1000) {
  const completed = new Set(transactions.filter((item) => item.status === 'completed').map((item) => item.ref_id))
  return {
    paidWithoutCompletion: webhooks.filter((item) => ['settlement', 'capture'].includes(item.transaction_status) && !completed.has(item.order_id)),
    stalePending: transactions.filter((item) => item.status === 'pending' && now - new Date(item.created_at).getTime() > staleMs),
    repeatedProviderErrors: webhooks.filter((item) => item.lifecycle_status === 'failed' && Number(item.attempts) >= 3),
  }
}

async function report(pg) {
  const [transactions, webhooks] = await Promise.all([
    pg.query(`SELECT ref_id,status,created_at FROM transaksi WHERE status='pending' OR created_at >= now() - interval '7 days'`),
    pg.query(`SELECT order_id,transaction_status,lifecycle_status,attempts,created_at FROM midtrans_webhooks WHERE created_at >= now() - interval '7 days'`),
  ])
  const result = classify({ transactions: transactions.rows, webhooks: webhooks.rows })
  return { generatedAt: new Date().toISOString(), counts: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.length])), candidates: result }
}

if (require.main === module) {
  require('dotenv').config()
  const pg = require('../config/postgres')
  report(pg).then((value) => console.log(JSON.stringify(value, null, 2))).finally(() => pg.closePool())
}

module.exports = { classify, report }
