'use strict'

const fs = require('fs')
const { depositSuccessText, finishDepositUx } = require('../../lib/deposit-payment')

const order = { from: '6282@s.whatsapp.net', baseAmount: 10000, uniqueCode: 79,
  balanceBefore: 5000, qrMessageKey: { id: 'QR-1' }, qrMessageId: 'QR-1' }
const result = { credited: true, balanceBefore: 5000, balanceAfter: 15079, item: { amount: 10079 } }

test('template memakai nominal, kode unik, dan saldo atomik', () => {
  expect(depositSuccessText(order, result)).toBe('✅ DEPOSIT BERHASIL\n\nNominal: Rp10.000\nKode unik: Rp79\nSaldo awal: Rp5.000\nBertambah: Rp10.079\nSaldo akhir: Rp15.079')
  expect(depositSuccessText({ ...order, uniqueCode: 0 }, result)).not.toContain('Kode unik:')
})

test('context QR dan saldo awal dipersist setelah send', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  expect(source).toMatch(/qrMessageKey: message\.key,[\s\S]*qrMessageId: message\.key && message\.key\.id,[\s\S]*balanceBefore: Number\(db\.data\.users\[sender\]\.saldo \|\| 0\)/)
  expect(source.indexOf('qrMessageKey: message.key')).toBeGreaterThan(source.indexOf('await nicola.sendMessage(\n              from,'))
})

test('hapus QR tepat sekali dan replay tidak mengirim atau menghapus', async () => {
  const client = { sendMessage: jest.fn(), deleteMessage: jest.fn() }
  await finishDepositUx(client, order, result)
  await finishDepositUx(client, order, { ...result, credited: false })
  expect(client.sendMessage).toHaveBeenCalledTimes(1)
  expect(client.deleteMessage).toHaveBeenCalledTimes(1)
  expect(client.deleteMessage).toHaveBeenCalledWith(order.from, 'QR-1')
})

test('kegagalan delete best-effort dan completion tetap selesai', async () => {
  const client = { sendMessage: jest.fn(), deleteMessage: jest.fn().mockRejectedValue(new Error('no')) }
  await expect(finishDepositUx(client, order, result)).resolves.toBeUndefined()
  expect(client.sendMessage).toHaveBeenCalledTimes(1)
  expect(client.deleteMessage).toHaveBeenCalledTimes(1)
})

test('context lama tanpa saldo/key tetap kompatibel', async () => {
  expect(depositSuccessText({ from: order.from, baseAmount: 10000 }, { credited: true, item: { amount: 10000 } }))
    .toContain('Saldo awal: Rp0')
  const client = { sendMessage: jest.fn(), deleteMessage: jest.fn() }
  await finishDepositUx(client, { from: order.from, baseAmount: 10000 }, { credited: true, item: { amount: 10000 } })
  expect(client.deleteMessage).not.toHaveBeenCalled()
})
