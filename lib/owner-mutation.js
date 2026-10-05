'use strict'

const crypto = require('crypto')

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}

function requestHash(req) {
  return crypto.createHash('sha256').update(JSON.stringify(stable({ method: req.method, path: req.path, body: req.body || {} }))).digest('hex')
}

async function runOwnerMutation(pg, req, action, target, mutate) {
  const key = String(req.headers['idempotency-key'] || '').trim()
  const hash = requestHash(req)
  const client = await pg.getClient()
  let finished = false
  try {
    await client.query('BEGIN')
    const claimed = await client.query(
      `INSERT INTO owner_idempotency(key,request_hash) VALUES($1,$2)
       ON CONFLICT (key) DO NOTHING RETURNING key`,
      [key, hash]
    )
    if (!claimed.rowCount) {
      const prior = await client.query('SELECT request_hash,status,result FROM owner_idempotency WHERE key=$1 FOR UPDATE', [key])
      const row = prior.rows[0]
      if (!row || row.request_hash !== hash) {
        await client.query('ROLLBACK'); finished = true
        return { conflict: true }
      }
      if (row.status !== 'completed') throw new Error('Idempotent mutation has no committed result')
      await client.query('COMMIT'); finished = true
      return { duplicate: true, result: row.result }
    }

    const result = await mutate(client)
    const audit = {
      id: `AUD-${crypto.randomUUID()}`,
      action,
      target,
      owner: req.owner,
      reason: String(req.body.reason || '').trim().slice(0, 300),
      requestId: String(req.headers['x-request-id'] || '').trim().slice(0, 100) || null,
      at: new Date().toISOString(),
    }
    await client.query(
      'INSERT INTO owner_audit(id,action,target,owner_id,reason,request_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [audit.id, action, target, req.owner, audit.reason, audit.requestId, JSON.stringify(result.audit || {})]
    )
    await client.query(
      `UPDATE owner_idempotency SET status='completed',result=$2::jsonb,completed_at=now() WHERE key=$1`,
      [key, JSON.stringify(result.data)]
    )
    await client.query('COMMIT'); finished = true
    return { result: result.data }
  } catch (error) {
    if (!finished) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

module.exports = { requestHash, runOwnerMutation }
