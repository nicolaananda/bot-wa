const { summarizeQris } = require('../../lib/qris-summary')

test('memisahkan penjualan QRIS, deposit QRIS, dan mengabaikan non-QRIS/status gagal', () => {
  const rows = [
    { reffId: 'SALE-1', metodeBayar: 'QRIS', status: 'completed', totalBayar: 10000, date: '2026-03-20 10:00:00' },
    { reffId: 'DEP-1', type: 'deposit', metodeBayar: 'Deposit', payment_method: 'QRIS', status: 'completed', amount: 20000, date: '2026-03-20 11:00:00' },
    { reffId: 'BANK-1', type: 'deposit', metodeBayar: 'Deposit', payment_method: 'BANK_TRANSFER', status: 'completed', totalBayar: 30000, date: '2026-03-20 12:00:00' },
    { reffId: 'SALE-2', metodeBayar: 'QRIS', status: 'pending', totalBayar: 40000, date: '2026-03-20 13:00:00' },
    { reffId: 'DEP-2', type: 'deposit', payment_method: 'QRIS', status: 'failed', totalBayar: 50000, date: '2026-03-20 14:00:00' },
  ]
  expect(summarizeQris(rows, '2026-03-20')).toEqual({
    salesCount: 1, salesAmount: 10000, depositCount: 1, depositAmount: 20000,
    totalCount: 2, totalAmount: 30000,
  })
})

test('mendukung deposit QRIS legacy DEP-* tetapi bukan deposit non-QRIS tanpa metode', () => {
  const rows = [
    { reffId: 'DEP-LEGACY', type: 'deposit', metodeBayar: 'Deposit', status: 'completed', price: 15000, date: '2026-03-20 10:00:00' },
    { reffId: 'MANUAL-1', type: 'deposit', metodeBayar: 'Deposit', status: 'completed', price: 9000, date: '2026-03-20 10:00:00' },
  ]
  expect(summarizeQris(rows, '2026-03-20').depositAmount).toBe(15000)
})

test('batas hari memakai WIB untuk timestamp ber-offset dan rentang inklusif', () => {
  const rows = [
    { reffId: 'A', metodeBayar: 'QRIS', status: 'settlement', amount: 1, date: '2026-03-19T17:00:00.000Z' },
    { reffId: 'B', metodeBayar: 'QRIS', status: 'paid', amount: 2, date: '2026-03-20 23:59:59' },
    { reffId: 'C', metodeBayar: 'QRIS', status: 'paid', amount: 4, date: '2026-03-21 00:00:00' },
  ]
  expect(summarizeQris(rows, '2026-03-20').salesAmount).toBe(3)
  expect(summarizeQris(rows, '2026-03-20', '2026-03-21').salesAmount).toBe(7)
})

test('reffId sama tidak dihitung ganda', () => {
  const row = { reffId: 'SAME', metodeBayar: 'QRIS', status: 'completed', totalBayar: 100, date: '2026-03-20' }
  expect(summarizeQris([row, { ...row }], '2026-03-20').totalAmount).toBe(100)
})
