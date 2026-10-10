jest.mock('../../config/postgres', () => ({ pool: {} }));
const { queueFulfillmentDeliveries } = require('../../lib/p0-store');
const item = { id: 'p1', name: 'Historical product', price: 100, jumlah: 2,
  user: '123', user_id: '123@s.whatsapp.net', reffId: 'REF1', orderId: 'o1',
  totalBayar: 201, date: '2026-10-09 23:59:00', status: 'completed', metodeBayar: 'QRIS' };
function database(failLedger = false) {
  const calls = [];
  const client = { query: async (sql, args) => {
    calls.push([sql, args]);
    if (sql.includes('INSERT INTO transaksi') && failLedger) throw new Error('ledger unavailable');
    return { rows: [{ ref_id: 'REF1', status: 'processing', kind: 'qris', user_id: item.user_id, amount: 201 }], rowCount: 1 };
  }, release: jest.fn() };
  return { connect: async () => client, calls };
}
test('ledger metadata uses captured quote and historical completion, never current catalogue', () => {
  const { qrisLedgerItem } = require('../../lib/qris-ledger');
  const order = { orderId: 'o1', reffId: 'REF1', id: 'p1', jumlah: 2, totalAmount: 201, uniqueCode: 1,
    ledgerSnapshot: { name: 'Historical product', price: 100, profit: 9, userRole: 'gold' } };
  expect(qrisLedgerItem(order, item.user_id, new Date('2026-10-09T16:59:00Z'))).toMatchObject(item);
  expect(() => qrisLedgerItem({ ...order, uniqueCode: undefined, ledgerSnapshot: undefined }, item.user_id, new Date())).toThrow();
});
test('QRIS ledger and durable delivery are committed atomically', async () => {
  const db = database();
  await queueFulfillmentDeliveries('o1', [{ destination: item.user_id, payload: { text: 'private' }, dedupeKey: 'o1:account' }], db, item);
  const ledger = db.calls.find(([sql]) => sql.includes('INSERT INTO transaksi'));
  expect(ledger).toBeDefined();
  expect(ledger[0]).toMatch(/ON CONFLICT.*ref_id/s);
  expect(ledger[1]).toContain('REF1');
  expect(db.calls[0][0]).toBe('BEGIN');
  expect(db.calls.at(-1)[0]).toBe('COMMIT');
});
test('ledger failure rolls back delivery intent', async () => {
  const db = database(true);
  await expect(queueFulfillmentDeliveries('o1', [{ destination: item.user_id, payload: { text: 'private' }, dedupeKey: 'o1:account' }], db, item)).rejects.toThrow('ledger unavailable');
  expect(db.calls.at(-1)[0]).toBe('ROLLBACK');
  expect(db.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
});
