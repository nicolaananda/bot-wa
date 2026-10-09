const crypto = require('crypto');
const { pool } = require('../config/postgres');

async function transaction(work, db = pool) {
  const client = await (typeof db.connect === 'function' ? db.connect() : db.getClient());
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function persistPaymentCorrelationOnClient(correlation, client) {
  const { providerOrderId, kind, subjectId, userId, amount } = correlation;
  if (!providerOrderId || !['order', 'deposit'].includes(kind) || !subjectId || !userId || !(Number(amount) > 0)) throw new TypeError('invalid payment correlation');
  const orderKind = kind === 'deposit' ? 'deposit' : 'qris';
  const order = await client.query(
    `INSERT INTO business_orders(order_id,kind,user_id,amount,status,provider_order_id)
     VALUES($1,$2,$3,$4,'awaiting_payment',$5) ON CONFLICT (order_id) DO UPDATE SET order_id=EXCLUDED.order_id
     WHERE business_orders.kind=EXCLUDED.kind AND business_orders.user_id=EXCLUDED.user_id
       AND business_orders.amount=EXCLUDED.amount AND business_orders.provider_order_id=EXCLUDED.provider_order_id
     RETURNING order_id`, [subjectId, orderKind, userId, amount, providerOrderId]);
  if (!order.rows[0]) throw new Error('business order identity conflict');
  const result = await client.query(
    `INSERT INTO payment_correlations(provider_order_id,kind,subject_id,user_id,amount)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT (provider_order_id) DO UPDATE
     SET provider_order_id=EXCLUDED.provider_order_id
     WHERE payment_correlations.kind=EXCLUDED.kind
       AND payment_correlations.subject_id=EXCLUDED.subject_id
       AND payment_correlations.user_id=EXCLUDED.user_id
       AND payment_correlations.amount=EXCLUDED.amount
     RETURNING provider_order_id`,
    [providerOrderId, kind, subjectId, userId, amount]
  );
  if (!result.rows[0]) throw new Error('payment correlation conflict');
  return result;
}

async function persistPaymentCorrelation(correlation, db = pool) {
  return transaction(client => persistPaymentCorrelationOnClient(correlation, client), db);
}

async function createQrisAfterPersist(correlation, createQris, db = pool) {
  await persistPaymentCorrelation(correlation, db);
  return createQris();
}

async function allocateStaticPayment({ orderId, userId, baseAmount, maxCode = 99, validMinutes = 30 }, db = pool) {
  if (!orderId || !userId || !Number.isInteger(baseAmount) || baseAmount <= 0) throw new TypeError('invalid static payment');
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('static-qris-allocation',0))");
    await client.query("UPDATE static_payment_orders SET status='expired' WHERE status='awaiting_payment' AND expires_at<now()");
    for (let code = 1; code <= maxCode; code += 1) {
      const amount = baseAmount + code;
      const collision = await client.query(
        `SELECT 1 FROM business_orders WHERE amount=$1 AND status IN ('awaiting_payment','pending','processing','delivery_pending')
         UNION ALL SELECT 1 FROM static_payment_orders WHERE amount=$1 AND status='awaiting_payment' AND expires_at>now() LIMIT 1`, [amount]);
      if (collision.rows[0]) continue;
      await client.query(
        `INSERT INTO business_orders(order_id,kind,user_id,amount,status)
         VALUES($1,'qris',$2,$3,'awaiting_payment')`, [orderId, userId, amount]);
      const result = await client.query(
        `INSERT INTO static_payment_orders(order_id,user_id,amount,marker,expires_at)
         VALUES($1,$2,$3,$4,now()+($5::text||' minutes')::interval) RETURNING *`,
        [orderId, userId, amount, crypto.randomUUID(), validMinutes]);
      return result.rows[0];
    }
    throw new Error('No collision-free static QRIS amount available');
  }, db);
}

async function claimStaticSettlement({ eventKey, amount, authenticated }, db = pool) {
  if (!authenticated || !eventKey || !Number.isInteger(amount) || amount <= 0) return null;
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('static-qris-settlement',0))");
    const event = (await client.query(
      `SELECT created_at AS received_at FROM midtrans_webhooks WHERE event_key=$1 AND gross_amount=$2
       AND transaction_status='settlement'`, [eventKey, amount])).rows[0];
    if (!event) return null;
    const existing = (await client.query(
      `SELECT s.* FROM static_payment_orders s JOIN business_orders b ON b.order_id=s.order_id
       WHERE s.settlement_event_key=$1 AND b.status IN ('pending','processing')`, [eventKey])).rows[0];
    if (existing) return existing;
    const candidates = await client.query(
      `SELECT s.* FROM static_payment_orders s JOIN business_orders b ON b.order_id=s.order_id
       WHERE s.amount=$1 AND s.status='awaiting_payment' AND s.expires_at>=now()
         AND b.created_at <= $2 AND b.status='awaiting_payment'
         AND NOT EXISTS (SELECT 1 FROM business_orders other WHERE other.amount=s.amount
           AND other.order_id<>s.order_id AND other.status IN ('awaiting_payment','pending','processing','delivery_pending'))
       FOR UPDATE OF s,b`, [amount, event.received_at]);
    if (candidates.rows.length !== 1) return null;
    const row = candidates.rows[0];
    const bound = await client.query(
      `UPDATE static_payment_orders SET status='settled',settlement_event_key=$2,settled_at=now()
       WHERE order_id=$1 AND status='awaiting_payment' RETURNING *`, [row.order_id, eventKey]);
    if (!bound.rows[0]) return null;
    await client.query("UPDATE business_orders SET status='pending',updated_at=now() WHERE order_id=$1 AND status='awaiting_payment'", [row.order_id]);
    return bound.rows[0];
  }, db);
}

async function confirmPaidOrder({ providerOrderId, orderId, userId, amount }, db = pool) {
  if (!providerOrderId || !orderId || !userId || !(Number(amount) > 0)) throw new TypeError('invalid paid order');
  return transaction(async client => {
    const values = [providerOrderId, orderId, userId, amount];
    const result = await client.query(
      `UPDATE business_orders o SET status='pending',updated_at=now()
       FROM payment_correlations p
       WHERE o.order_id=$2 AND o.kind='qris' AND o.user_id=$3 AND o.amount=$4
         AND o.provider_order_id=$1 AND o.status='awaiting_payment'
         AND p.provider_order_id=$1 AND p.kind='order' AND p.subject_id=o.order_id
         AND p.user_id=o.user_id AND p.amount=o.amount RETURNING o.order_id`, values);
    if (result.rows[0]) return result.rows[0];
    return (await client.query(
      `SELECT o.order_id FROM business_orders o JOIN payment_correlations p ON p.provider_order_id=$1
       WHERE o.order_id=$2 AND o.kind='qris' AND o.user_id=$3 AND o.amount=$4
         AND o.provider_order_id=$1 AND o.status IN ('pending','processing')
         AND p.kind='order' AND p.subject_id=o.order_id AND p.user_id=o.user_id AND p.amount=o.amount`, values)).rows[0] || null;
  }, db);
}

async function claimFulfillment(orderId, db = pool) {
  if (!orderId) throw new TypeError('orderId required');
  const token = crypto.randomUUID();
  return transaction(async client => {
    const order = (await client.query(
      `SELECT status FROM business_orders WHERE order_id=$1 FOR UPDATE`, [orderId])).rows[0];
    if (order && !['pending', 'processing', 'delivery_pending'].includes(order.status)) return null;
    const result = await client.query(
      `INSERT INTO order_fulfillments(order_id,kind,status,claim_token,claimed_at,attempts)
       VALUES($1,'order','processing',$2,now(),1)
       ON CONFLICT (order_id) DO UPDATE SET status='processing',claim_token=$2,claimed_at=now(),attempts=order_fulfillments.attempts+1
       WHERE order_fulfillments.status IN ('pending','failed')
          OR (order_fulfillments.status='processing' AND order_fulfillments.claimed_at < now()-interval '5 minutes')
       RETURNING *`, [orderId, token]);
    if (result.rows[0] && order && order.status === 'pending') await client.query(
      `UPDATE business_orders SET status='processing',updated_at=now() WHERE order_id=$1 AND status='pending'`, [orderId]);
    return result.rows[0] || null;
  }, db);
}

async function enqueueDelivery(client, { orderId, destination, payload, dedupeKey }) {
  if (!orderId || !destination || !payload || !dedupeKey) throw new TypeError('invalid delivery');
  return client.query(
    `INSERT INTO delivery_outbox(order_id,destination,payload,dedupe_key)
     VALUES($1,$2,$3,$4) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [orderId, destination, payload, dedupeKey]);
}

async function queueFulfillmentDeliveries(orderId, deliveries, db = pool) {
  if (!orderId || !Array.isArray(deliveries) || !deliveries.length) throw new TypeError('invalid deliveries');
  return transaction(async client => {
    for (const delivery of deliveries) await enqueueDelivery(client, { orderId, ...delivery });
    await client.query(
      `UPDATE order_fulfillments SET status='delivery_pending',updated_at=now()
       WHERE order_id=$1 AND status='processing'`, [orderId]);
  }, db);
}

async function completeFulfillment(orderId, db = pool) {
  const result = await db.query(
    `UPDATE order_fulfillments SET status='completed',updated_at=now()
     WHERE order_id=$1 AND status IN ('processing','delivery_pending') RETURNING order_id`, [orderId]);
  return Boolean(result.rows[0]);
}

async function claimDelivery(db = pool) {
  const token = crypto.randomUUID();
  return transaction(async client => {
    const result = await client.query(
      `WITH quarantined AS (
         UPDATE delivery_outbox SET status='manual_review',claim_token=NULL,
           last_error='ambiguous_send_timeout',error_class='ambiguous'
         WHERE claimed_at < now()-interval '5 minutes' AND status='sending' RETURNING id
       ), next AS (SELECT id FROM delivery_outbox
         WHERE status='pending' OR (status='failed' AND attempts < 3 AND COALESCE(next_attempt_at,now()) <= now())
         ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
       UPDATE delivery_outbox d SET status='sending',claim_token=$1,claimed_at=now(),attempts=d.attempts+1
       FROM next WHERE d.id=next.id RETURNING d.*`, [token]);
    return result.rows[0] || null;
  }, db);
}

function sanitizedReceipt(receipt) {
  const id = receipt && (receipt.messageId || receipt.id || receipt.key?.id);
  return id ? { providerMessageId: String(id).slice(0, 160) } : {};
}

async function finishDelivery(id, token, error, db = pool, receipt = null) {
  if (error) {
    const errorClass = error.preSend === true ? 'pre_send_rejection' : 'ambiguous';
    const status = errorClass === 'pre_send_rejection' ? 'failed' : 'manual_review';
    return transaction(client => client.query(
      `UPDATE delivery_outbox SET status=$3,claim_token=NULL,claimed_at=NULL,last_error=$4,error_class=$4,
       next_attempt_at=CASE WHEN $3='failed' THEN now()+interval '30 seconds' ELSE NULL END
       WHERE id=$1 AND claim_token=$2 AND status='sending'`, [id, token, status, errorClass]), db);
  }
  return transaction(async client => {
    const result = await client.query(`UPDATE delivery_outbox SET status='sent',sent_at=now(),claim_token=NULL,
      last_error=NULL,error_class=NULL,provider_receipt=$3,payload='{}'::jsonb
      WHERE id=$1 AND claim_token=$2 AND status='sending' RETURNING order_id`, [id, token, sanitizedReceipt(receipt)]);
    if (!result.rows[0]) return false;
    const completed = await client.query(`UPDATE order_fulfillments f SET status='completed',updated_at=now()
      WHERE f.order_id=$1 AND f.status='delivery_pending' AND NOT EXISTS
      (SELECT 1 FROM delivery_outbox d WHERE d.order_id=f.order_id AND d.status <> 'sent') RETURNING order_id`, [result.rows[0].order_id]);
    if (completed.rows[0]) await client.query(`UPDATE business_orders SET status='completed',updated_at=now()
      WHERE order_id=$1 AND status IN ('processing','delivery_pending')`, [result.rows[0].order_id]);
    return true;
  }, db);
}

async function runDeliveryOutboxOnce(sendMessage, db = pool) {
  if (typeof sendMessage !== 'function') throw new TypeError('sendMessage required');
  const delivery = await claimDelivery(db);
  if (!delivery) return false;
  try {
    const receipt = await sendMessage(delivery.destination, delivery.payload);
    await finishDelivery(delivery.id, delivery.claim_token, null, db, receipt);
  } catch (error) {
    await finishDelivery(delivery.id, delivery.claim_token, error, db);
  }
  return true;
}

async function reserveZoomBooking({ bookingRef, userId, hostId, startsAt, endsAt, capacity, units = 1 }, db = pool) {
  if (!bookingRef || !userId || !hostId || !startsAt || !endsAt || !Number.isInteger(capacity) || capacity < 1) throw new TypeError('invalid zoom reservation');
  return (await db.query(
    'SELECT * FROM reserve_zoom_booking($1,$2,$3,$4,$5,$6,$7)',
    [bookingRef, userId, hostId, startsAt, endsAt, capacity, units]
  )).rows[0];
}

async function claimZoomCreate({ orderId, userId, hostId, startsAt, endsAt, capacity, amount }, db = pool) {
  if (!orderId || !userId || !hostId || !startsAt || !endsAt || !Number.isInteger(capacity) || capacity < 1 || !(Number(amount) > 0)) throw new TypeError('invalid zoom create claim');
  const token = crypto.randomUUID();
  return (await db.query('SELECT * FROM claim_zoom_create($1,$2,$3,$4,$5,$6,$7,$8)',
    [orderId, userId, hostId, startsAt, endsAt, capacity, token, amount])).rows[0] || null;
}

async function finishZoomCreate(orderId, token, meeting, db = pool, failure = {}) {
  if (!orderId || !token) throw new TypeError('invalid zoom create completion');
  const error = failure.error ? String(failure.error.message || failure.error).slice(0, 500) : null;
  const status = failure.ambiguous ? 'manual_review' : meeting ? 'created' : 'cancelled';
  return transaction(async client => {
    const result = await client.query(
      `UPDATE zoom_bookings SET status='${status}',meeting=$3,last_error=$4,claim_token=NULL
       WHERE booking_ref=$1 AND claim_token=$2 AND status='creating' RETURNING *`,
      [orderId, token, meeting || null, error]);
    if (!result.rows[0]) return null;
    if (status === 'cancelled') await client.query(`WITH refund AS (
      INSERT INTO wallet_ledger(order_id,user_id,amount,entry_kind)
      SELECT order_id,user_id,-amount,'refund' FROM wallet_ledger WHERE order_id=$1 AND entry_kind='debit'
      ON CONFLICT (order_id,entry_kind) DO NOTHING RETURNING user_id,amount)
      UPDATE users u SET saldo=u.saldo+refund.amount FROM refund WHERE u.user_id=refund.user_id`, [orderId]);
    await client.query(`UPDATE business_orders SET status=$2,updated_at=now() WHERE order_id=$1`,
      [orderId, status === 'created' ? 'delivery_pending' : status]);
    return result.rows[0];
  }, db);
}

async function cancelOrder(orderId, state = 'cancelled', db = pool) {
  if (!orderId) throw new TypeError('orderId required');
  if (!['cancelled', 'expired'].includes(state)) throw new TypeError('invalid cancellation state');
  return transaction(async client => {
    const result = await client.query(
      `UPDATE business_orders SET status=$2,updated_at=now()
       WHERE order_id=$1 AND status IN ('awaiting_payment','pending') RETURNING order_id`, [orderId, state]);
    if (!result.rows[0]) return false;
    await client.query(`UPDATE zoom_bookings SET status=$2 WHERE booking_ref=$1 AND status='reserved'`, [orderId, state]);
    return true;
  }, db);
}

async function debitSaldoReserveStock({ orderId, userId, productId, quantity, amount }, db = pool) {
  if (!orderId || !userId || !productId || !Number.isInteger(quantity) || quantity < 1 || !(Number(amount) > 0)) throw new TypeError('invalid purchase');
  return transaction(async client => (await client.query(
    'SELECT * FROM debit_saldo_reserve_stock($1,$2,$3,$4,$5)', [orderId, userId, productId, quantity, amount]
  )).rows[0], db);
}

async function reserveAndQueueSaldoFulfillment(input, delivery, deps = {}) {
  await (deps.debitSaldoReserveStock || debitSaldoReserveStock)(input, deps.db);
  await (deps.claimFulfillment || claimFulfillment)(input.orderId, deps.db);
  return (deps.queueFulfillmentDeliveries || queueFulfillmentDeliveries)(input.orderId,
    [{ ...delivery, dedupeKey: `${input.orderId}:account` }], deps.db);
}

async function assertSchemaReady(db = pool) {
  const required = ['001_p0_durability.sql', '002_p0_order_ledger.sql', '003_p0_zoom_ownership.sql', '004_p0_zoom_wallet.sql', '005_p0_release_blockers.sql', '006_static_qris_matching.sql'];
  const result = await db.query('SELECT version FROM schema_migrations WHERE version = ANY($1::text[])', [required]);
  const applied = new Set(result.rows.map(row => row.version));
  const missing = required.filter(version => !applied.has(version));
  if (missing.length) throw new Error(`Required migration missing: ${missing.join(', ')}`);
  const { assertBackfillReady, readLegacy } = require('../options/backfill-legacy-pending');
  await assertBackfillReady({ db, legacy: await readLegacy(db) });
  return true;
}

module.exports = {
  transaction, persistPaymentCorrelation, createQrisAfterPersist, allocateStaticPayment, claimStaticSettlement, confirmPaidOrder, claimFulfillment,
  enqueueDelivery, queueFulfillmentDeliveries, completeFulfillment, reserveZoomBooking,
  claimZoomCreate, finishZoomCreate, cancelOrder, debitSaldoReserveStock,
  claimDelivery, finishDelivery, runDeliveryOutboxOnce, reserveAndQueueSaldoFulfillment, assertSchemaReady
};
