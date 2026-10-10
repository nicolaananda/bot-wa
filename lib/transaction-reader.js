const { transactionDateWib } = require('./qris-summary')

// Read the durable ledger only; never reload unrelated caches or silently use stale RAM.
async function readTransactions(pg, { date, user, reffId, limit } = {}) {
  const params = [], where = []
  if (date) {
    params.push(date)
    where.push(`COALESCE(NULLIF(LEFT(meta->>'date', 10), ''), (created_at AT TIME ZONE 'Asia/Jakarta')::date::text) BETWEEN ($1::date - 1)::text AND ($1::date + 1)::text`)
  }
  if (user) {
    params.push(user, `${user}@s.whatsapp.net`)
    const a = `$${params.length - 1}`, b = `$${params.length}`
    where.push(`(meta->>'user' IN (${a}, ${b}) OR meta->>'buyer' IN (${a}, ${b}) OR meta->>'targetNumber' IN (${a}, ${b}))`)
  }
  if (reffId) { params.push(reffId); where.push(`meta->>'reffId' = $${params.length}`) }
  let sql = `SELECT meta, created_at FROM transaksi${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id ${limit ? 'DESC' : 'ASC'}`
  if (limit != null) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('Invalid transaction limit')
    params.push(limit)
    sql += ` LIMIT $${params.length}`
  }
  const result = await pg.query(sql, params)
  return result.rows.map(row => ({ ...row.meta, created_at: row.created_at || row.meta?.created_at }))
    .filter(t => (!date || transactionDateWib(t) === date) && (!user || [t.user, t.buyer, t.targetNumber].some(value => value === user || value === `${user}@s.whatsapp.net`)))
}
module.exports = { readTransactions }
