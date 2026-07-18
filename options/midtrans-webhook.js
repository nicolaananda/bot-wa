'use strict';

const crypto = require('crypto');

function eventKey(notification) {
  const fields = ['order_id', 'transaction_id', 'transaction_status', 'status_code', 'gross_amount', 'settlement_time'];
  return crypto.createHash('sha256').update(fields.map(key => String(notification[key] || '')).join('|')).digest('hex');
}

async function persistWebhook(pg, notification) {
  const result = await pg.query(
    `INSERT INTO midtrans_webhooks
      (order_id, transaction_id, transaction_status, payment_type, gross_amount,
       settlement_time, processed, webhook_data, event_key)
     VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8)
     ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [notification.order_id, notification.transaction_id || null, notification.transaction_status,
      notification.payment_type || null, Number(notification.gross_amount || 0),
      notification.settlement_time ? new Date(notification.settlement_time) : null,
      JSON.stringify(notification), eventKey(notification)]
  );
  return { inserted: result.rowCount === 1, id: result.rows[0]?.id || null };
}

function createWebhookHandler({ pg, serverKey }) {
  return async (req, res) => {
    const notification = req.body || {};
    const input = String(notification.order_id || '') + String(notification.status_code || '') +
      String(notification.gross_amount || '') + String(serverKey || '');
    const expected = crypto.createHash('sha512').update(input).digest('hex');
    if (notification.signature_key !== expected) return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    if (!pg) return res.status(503).json({ status: 'error', message: 'Webhook persistence unavailable' });
    try {
      const saved = await persistWebhook(pg, notification);
      return res.status(200).json({ status: 'ok', duplicate: !saved.inserted });
    } catch (error) {
      console.error('[Webhook] persistence failed:', error.message);
      return res.status(503).json({ status: 'error', message: 'Webhook persistence failed' });
    }
  };
}

function eventData(row) {
  return { orderId: row.order_id, transactionStatus: row.transaction_status, paymentType: row.payment_type,
    settlementTime: row.settlement_time, gross_amount: row.gross_amount };
}

async function processNextWebhook({ pg, emit = process.emit.bind(process), redis, forward }) {
  const client = await pg.getClient();
  let committed = false;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM midtrans_webhooks WHERE processed=false
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`
    );
    const row = result.rows[0];
    if (!row) { await client.query('COMMIT'); return false; }

    await client.query('UPDATE midtrans_webhooks SET processed=true, processed_at=now(), last_error=NULL WHERE id=$1', [row.id]);
    await client.query('COMMIT');
    committed = true;

    const data = eventData(row);
    try {
      if (/(settlement|capture)/i.test(String(row.transaction_status))) {
        await Promise.resolve(emit('payment-completed', data));
        if (redis) await redis.publish('midtrans:events', JSON.stringify({ event: 'payment-completed', data }));
      }
      if (forward) await forward(row.webhook_data);
    } catch (error) {
      try { await pg.query('UPDATE midtrans_webhooks SET last_error=$2 WHERE id=$1', [row.id, error.message]); } catch {}
      throw error;
    }
    return true;
  } catch (error) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    throw error;
  } finally {
    client.release();
  }
}

function startWebhookWorker(options, intervalMs = 500) {
  let stopped = false;
  let timer;
  const run = async () => {
    if (stopped) return;
    try { await processNextWebhook(options); } catch (error) { console.error('[Webhook worker]', error.message); }
    if (!stopped) timer = setTimeout(run, intervalMs);
  };
  timer = setTimeout(run, 0);
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { createWebhookHandler, eventKey, persistWebhook, processNextWebhook, startWebhookWorker };
