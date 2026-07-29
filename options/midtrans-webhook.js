'use strict';

const crypto = require('crypto');

const MAX_ATTEMPTS = 10;
const LEASE_MINUTES = 5;

function verifySignature(notification, serverKey) {
  const input = String(notification?.order_id || '') + String(notification?.status_code || '') +
    String(notification?.gross_amount || '') + String(serverKey || '');
  const expected = crypto.createHash('sha512').update(input).digest();
  const actual = Buffer.from(String(notification?.signature_key || ''), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function eventKey(notification) {
  const fields = ['order_id', 'transaction_id', 'transaction_status', 'status_code', 'gross_amount', 'settlement_time'];
  return crypto.createHash('sha256').update(fields.map(key => String(notification[key] || '')).join('|')).digest('hex');
}

async function persistWebhook(pg, notification) {
  const result = await pg.query(
    `INSERT INTO midtrans_webhooks
      (order_id, transaction_id, transaction_status, payment_type, gross_amount,
       settlement_time, processed, webhook_data, event_key, lifecycle_status, attempts, next_attempt_at)
     VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8,'received',0,now())
     ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [notification.order_id, notification.transaction_id || null, notification.transaction_status,
      notification.payment_type || null, Number(notification.gross_amount || 0),
      notification.settlement_time ? new Date(notification.settlement_time) : null,
      JSON.stringify(notification), eventKey(notification)]
  );
  return { inserted: result.rowCount === 1, id: result.rows[0]?.id || null };
}

function createWebhookHandler({ pg, serverKey, wake, ready = () => true }) {
  return async (req, res) => {
    const notification = req.body || {};
    if (!verifySignature(notification, serverKey)) return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    if (!pg || !ready()) return res.status(503).json({ status: 'error', message: 'Webhook persistence unavailable' });
    try {
      const saved = await persistWebhook(pg, notification);
      if (saved.inserted && wake) Promise.resolve(wake()).catch(() => {});
      return res.status(200).json({ status: 'ok', duplicate: !saved.inserted });
    } catch (error) {
      console.error('[Webhook] persistence failed:', error.message);
      return res.status(503).json({ status: 'error', message: 'Webhook persistence failed' });
    }
  };
}

function eventData(row) {
  return { webhookId: row.id, eventKey: row.event_key, orderId: row.order_id,
    transactionId: row.transaction_id, transactionStatus: row.transaction_status,
    paymentType: row.payment_type, settlementTime: row.settlement_time, gross_amount: row.gross_amount };
}

async function processNextWebhook({ pg, dispatch }) {
  const client = await pg.getClient();
  let row;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM midtrans_webhooks
       WHERE (lifecycle_status IN ('received','failed') AND attempts < $1 AND next_attempt_at <= now())
          OR (lifecycle_status='processing' AND attempts < $1 AND locked_at < now() - interval '${LEASE_MINUTES} minutes')
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`, [MAX_ATTEMPTS]
    );
    row = result.rows[0];
    if (!row) { await client.query('COMMIT'); return false; }
    await client.query(
      `UPDATE midtrans_webhooks SET lifecycle_status='processing', attempts=attempts+1,
       locked_at=now(), last_error=NULL WHERE id=$1`, [row.id]);
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }

  try {
    const data = eventData(row);
    if (typeof dispatch !== 'function') throw new Error('Webhook business dispatcher is required');
    await dispatch(data, row);
    await pg.query(`UPDATE midtrans_webhooks SET lifecycle_status='completed', processed=true,
      processed_at=now(), locked_at=NULL, last_error=NULL WHERE id=$1 AND lifecycle_status='processing'`, [row.id]);
    return true;
  } catch (error) {
    await pg.query(`UPDATE midtrans_webhooks SET lifecycle_status='failed', processed=false, locked_at=NULL,
      last_error=$2, next_attempt_at=now() + LEAST(interval '1 hour', interval '5 seconds' * power(2, attempts))
      WHERE id=$1 AND lifecycle_status='processing'`, [row.id, String(error.message || error).slice(0, 4000)]);
    throw error;
  }
}

function matchPendingOrder(orders, webhook, now = Date.now(), windowMs = 24 * 60 * 60 * 1000) {
  const entries = Object.entries(orders || {}).filter(([, order]) => order && ['MIDTRANS', 'MIDTRANS-ZOOM'].includes(order.metode));
  const exact = entries.filter(([, order]) =>
    (order.midtransOrderId && order.midtransOrderId === webhook.orderId) ||
    (order.midtransTransactionId && order.midtransTransactionId === webhook.transactionId));
  if (exact.length === 1) return { sender: exact[0][0], order: exact[0][1], matchedBy: 'correlation' };
  if (exact.length > 1) return { ambiguous: true };
  const amount = Number(webhook.gross_amount);
  const candidates = entries.filter(([, order]) => Math.abs(Number(order.totalAmount) - amount) < 1 &&
    now - Number(order.createdAt || order.startedAt || 0) <= windowMs && now >= Number(order.createdAt || order.startedAt || 0));
  if (candidates.length !== 1) return candidates.length > 1 ? { ambiguous: true } : null;
  return { sender: candidates[0][0], order: candidates[0][1], matchedBy: 'amount_time' };
}

async function ensureWebhookSchema(pg) {
  await pg.query(`ALTER TABLE midtrans_webhooks ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
    ALTER TABLE midtrans_webhooks ADD COLUMN IF NOT EXISTS last_error TEXT;
    ALTER TABLE midtrans_webhooks ADD COLUMN IF NOT EXISTS event_key TEXT;
    ALTER TABLE midtrans_webhooks ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'received';
    ALTER TABLE midtrans_webhooks ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE midtrans_webhooks ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE midtrans_webhooks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
    -- Legacy rows predate the durable worker. Never replay them during migration:
    -- their business side effects may already have completed even when processed=false.
    UPDATE midtrans_webhooks SET lifecycle_status='completed', processed=true,
      processed_at=COALESCE(processed_at, created_at, now()), last_error=NULL
      WHERE event_key IS NULL;
    UPDATE midtrans_webhooks SET event_key=md5(concat_ws('|',order_id,transaction_id,
      transaction_status,gross_amount::text,settlement_time::text,id::text)) WHERE event_key IS NULL;
    DELETE FROM midtrans_webhooks a USING midtrans_webhooks b
      WHERE a.event_key=b.event_key AND a.id>b.id;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_midtrans_webhooks_event_key ON midtrans_webhooks(event_key);
    CREATE INDEX IF NOT EXISTS idx_midtrans_webhooks_worker ON midtrans_webhooks(lifecycle_status,next_attempt_at,id);`);
}

function startWebhookWorker(options, intervalMs = 500) {
  let stopped = false; let timer;
  const run = async () => {
    if (stopped) return;
    try { while (await processNextWebhook(options)) {} } catch (error) { console.error('[Webhook worker]', error.message); }
    if (!stopped) timer = setTimeout(run, intervalMs);
  };
  ensureWebhookSchema(options.pg).then(run).catch(error => console.error('[Webhook worker] schema migration failed:', error.message));
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { createWebhookHandler, ensureWebhookSchema, eventKey, matchPendingOrder, persistWebhook,
  processNextWebhook, startWebhookWorker, verifySignature };
