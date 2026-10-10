'use strict';
const moment = require('moment-timezone');

async function insertQrisLedger(client, orderId, item) {
  if (!item || item.orderId !== orderId || !item.reffId || !item.id || !item.user_id ||
      !Number.isInteger(item.jumlah) || item.jumlah < 1 || !(item.totalBayar > 0) ||
      !Number.isFinite(item.price) || item.price <= 0 || item.metodeBayar !== 'QRIS' ||
      !moment.tz(item.date, 'YYYY-MM-DD HH:mm:ss', true, 'Asia/Jakarta').isValid()) {
    throw new TypeError('invalid QRIS ledger evidence');
  }
  const order = (await client.query('SELECT kind,user_id,amount,status FROM business_orders WHERE order_id=$1 FOR UPDATE', [orderId])).rows[0];
  if (!order || order.kind !== 'qris' || order.user_id !== item.user_id || Number(order.amount) !== item.totalBayar ||
      !['processing', 'delivery_pending', 'completed'].includes(order.status)) throw new Error('QRIS ledger order mismatch');
  const result = await client.query(
    `INSERT INTO transaksi(ref_id,user_id,amount,status,meta,created_at)
     VALUES($1,$2,$3,$4,$5,$6::timestamp AT TIME ZONE 'Asia/Jakarta')
     ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO UPDATE SET ref_id=EXCLUDED.ref_id
     WHERE transaksi.user_id=EXCLUDED.user_id AND transaksi.amount=EXCLUDED.amount
       AND transaksi.meta->>'orderId'=EXCLUDED.meta->>'orderId'
       AND transaksi.meta->>'id'=EXCLUDED.meta->>'id'
       AND transaksi.meta->>'jumlah'=EXCLUDED.meta->>'jumlah'
     RETURNING ref_id`,
    [item.reffId, item.user_id, item.totalBayar, item.status, JSON.stringify(item), item.date]);
  if (!result.rows[0]) throw new Error('QRIS ledger identity conflict');
  return item;
}

function qrisLedgerItem(order, userId, completedAt) {
  const total = Number(order.totalAmount);
  const quantity = Number(order.jumlah);
  const code = Number(order.uniqueCode);
  const snapshot = order.ledgerSnapshot || {};
  const price = snapshot.price == null ? (total - code) / quantity : Number(snapshot.price);
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(code) || code < 0 ||
      !Number.isFinite(price) || price <= 0 || price * quantity + code !== total ||
      !completedAt || !moment(completedAt).isValid()) throw new Error('Incomplete QRIS historical evidence');
  return { id: order.id, ...(snapshot.name ? { name: snapshot.name } : {}), price,
    ...(snapshot.profit != null ? { profit: snapshot.profit } : {}),
    ...(snapshot.userRole ? { userRole: snapshot.userRole } : {}),
    jumlah: quantity, user: userId.split('@')[0], user_id: userId,
    reffId: order.reffId, orderId: order.orderId, totalBayar: total,
    date: moment(completedAt).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
    status: 'completed', metodeBayar: 'QRIS' };
}

module.exports = { insertQrisLedger, qrisLedgerItem };
