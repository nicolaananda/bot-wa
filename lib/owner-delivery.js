'use strict';
function content(value) {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (Array.isArray(value)) return value.map(content).filter(Boolean).join('\n\n') || null;
  if (value && typeof value === 'object' && Object.keys(value).length) return JSON.stringify(value, null, 2);
  return null;
}
async function resolveDelivery(row, db, pg, getReceipt) {
  const m = row.meta || row, ref = row.ref_id || m.ref_id || m.reffId;
  const rawUser = String(row.user_id || m.user_id || m.user || '').replace(/@s\.whatsapp\.net$/, '');
  const user = /^\d{6,20}$/.test(rawUser) ? `${rawUser}@s.whatsapp.net` : null;
  const orderId = m.orderId || m.order_id;
  let result = { content: content(m.akun), source: 'transaction.akun', status: 'unknown', sentAt: null, lookupFailed: false };
  if (orderId && user) {
    try {
      const evidence = (await pg.query(`SELECT r.items,d.payload->>'text' AS message,d.status,d.sent_at
        FROM business_orders o
        LEFT JOIN stock_reservations r ON r.order_id=o.order_id AND r.product_id=$3
        LEFT JOIN delivery_outbox d ON d.order_id=o.order_id AND d.dedupe_key=o.order_id||':account'
        WHERE o.order_id=$1 AND o.user_id=$2`, [orderId,user,m.product_id || m.kode || m.id || null])).rows[0];
      if (evidence) {
        result.status = evidence.status || 'unknown'; result.sentAt = evidence.sent_at || null;
        if (!result.content && content(evidence.items)) { result.content=content(evidence.items);result.source='stock_reservations'; }
        if (!result.content && content(evidence.message)) { result.content=content(evidence.message);result.source='delivery_outbox'; }
      }
    } catch { result.lookupFailed=true; }
    const saved = db.order?.[user] || db.order?.[rawUser];
    if (!result.content && saved && saved.orderId===orderId && saved.reffId===ref && saved.id===(m.product_id || m.kode || m.id) && content(saved.fulfillmentReservation)) {
      result.content=content(saved.fulfillmentReservation);result.source='order.fulfillmentReservation';
    }
  }
  if (!result.content && /^[A-Za-z0-9_-]{1,120}$/.test(ref || '')) {
    try { const receipt=await getReceipt(ref);if(receipt.success && content(receipt.content)){result.content=content(receipt.content);result.source=`receipt.${receipt.storage==='r2'?'r2':'local'}`;} }
    catch { result.lookupFailed=true; }
  }
  if (!result.content) result.source='unavailable';
  return result;
}
module.exports={resolveDelivery};
