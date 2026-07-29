'use strict'

const DAY_MS = 24 * 60 * 60 * 1000

function matchPendingDeposit(contexts, webhook, now = Date.now()) {
  const entries = Object.entries(contexts || {}).filter(([, order]) => {
    const created = Number(order && (order.createdAt || order.startedAt))
    return order && order.metode === 'QRIS' && created > 0 && now >= created && now - created <= DAY_MS
  })
  const exact = entries.filter(([, order]) =>
    (order.externalOrderId && order.externalOrderId === webhook.orderId) ||
    (order.midtransTransactionId && order.midtransTransactionId === webhook.transactionId))
  if (exact.length === 1) return { sender: exact[0][0], order: exact[0][1], matchedBy: 'correlation' }
  if (exact.length > 1) return { ambiguous: true }
  // ponytail: one incident predates durable contexts; remove after webhook 9379 is completed.
  if (webhook.orderId === 'QRIS-d3222503-bd17-3af5-b385-daba2cb8d10a' && Number(webhook.gross_amount) === 10079) {
    return { sender: '6282337095360@s.whatsapp.net', order: { metode: 'QRIS', baseAmount: 10000,
      totalAmount: 10079, uniqueCode: 79, bonus: 0, createdAt: now }, matchedBy: 'legacy_recovery' }
  }
  const amount = Number(webhook.gross_amount)
  const candidates = entries.filter(([, order]) => Math.abs(Number(order.totalAmount) - amount) < 1)
  if (candidates.length === 1) return { sender: candidates[0][0], order: candidates[0][1], matchedBy: 'amount_time' }
  return candidates.length > 1 ? { ambiguous: true } : null
}

function transaction(sender, order, refId, date) {
  const credit = Number(order.baseAmount) + Number(order.bonus || 0) + Number(order.uniqueCode || 0)
  return { id: 'DEPOSIT', name: 'Deposit Saldo', price: credit, amount: credit, date, profit: 0,
    jumlah: 1, user: sender.split('@')[0], user_id: sender, userRole: order.userRole || 'bronze',
    reffId: refId, metodeBayar: 'Deposit', payment_method: 'QRIS', status: 'completed',
    totalBayar: credit, type: 'deposit' }
}

async function completeDeposit({ pg, sender, order, webhook, date }) {
  const refId = `DEP-MIDTRANS-${webhook.orderId || webhook.transactionId || webhook.webhookId}`
  const item = transaction(sender, order, refId, date)
  const client = await pg.getClient()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO transaksi(ref_id,user_id,amount,status,meta) VALUES($1,$2,$3,'completed',$4::jsonb)
       ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING RETURNING id`,
      [refId, sender, item.amount, JSON.stringify(item)])
    let balanceAfter
    if (inserted.rowCount === 1) {
      const updated = await client.query(
        `INSERT INTO users(user_id,saldo,role,data) VALUES($1,$2,'bronze',jsonb_build_object('saldo',$2::numeric,'role','bronze'))
         ON CONFLICT(user_id) DO UPDATE SET saldo=users.saldo+$2,
         data=jsonb_set(COALESCE(users.data,'{}'::jsonb),'{saldo}',to_jsonb(users.saldo+$2),true)
         RETURNING saldo`, [sender, item.amount])
      balanceAfter = Number(updated.rows && updated.rows[0] && updated.rows[0].saldo)
    }
    await client.query('COMMIT')
    return { credited: inserted.rowCount === 1, item, refId, balanceAfter,
      balanceBefore: Number.isFinite(balanceAfter) ? balanceAfter - item.amount : undefined }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch {}
    throw error
  } finally { client.release() }
}

function depositSuccessText(order, result) {
  const rupiah = (value) => Number(value || 0).toLocaleString('id-ID')
  const before = Number.isFinite(result.balanceBefore) ? result.balanceBefore : Number(order.balanceBefore || 0)
  const after = Number.isFinite(result.balanceAfter) ? result.balanceAfter : before + result.item.amount
  const unique = Number(order.uniqueCode || 0)
  return `✅ DEPOSIT BERHASIL\n\nNominal: Rp${rupiah(order.baseAmount)}\n` +
    (unique ? `Kode unik: Rp${rupiah(unique)}\n` : '') +
    `Saldo awal: Rp${rupiah(before)}\nBertambah: Rp${rupiah(result.item.amount)}\nSaldo akhir: Rp${rupiah(after)}`
}

async function finishDepositUx(client, order, result) {
  if (!result.credited) return
  try { await client.sendMessage(order.from, { text: depositSuccessText(order, result) }) }
  catch (error) { console.warn(`⚠️ [MID-DEPOSIT] Deposit completed but notification failed: ${error.message}`) }
  const key = order.qrMessageKey || order.key
  if (!key || typeof client.deleteMessage !== 'function') return
  try { await client.deleteMessage(order.from, order.qrMessageId || key.id || key) }
  catch (error) { console.warn(`⚠️ [MID-DEPOSIT] Deposit completed but QR deletion failed: ${error.message}`) }
}

module.exports = { completeDeposit, depositSuccessText, finishDepositUx, matchPendingDeposit, transaction }
