const fs = require('fs')

test('Zoom forwarding uses configured group ID without unsupported group enumeration', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  expect(source).not.toContain('groupFetchAllParticipating')
  expect(source).toContain('let targetGroupId = global.adminGroupId')
  expect(source).toContain('await nicola.sendMessage(targetGroupId')
})

test('Telegram is silent and skips when credentials are incomplete', async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN
  const oldChat = process.env.TELEGRAM_CHAT_ID
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.TELEGRAM_CHAT_ID
  jest.resetModules()
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const { sendPaymentNotification } = require('../../lib/telegram-notifier')

  await expect(sendPaymentNotification({ amount: 1, phoneNumber: '1' })).resolves.toBe(false)
  expect(warn).not.toHaveBeenCalled()

  warn.mockRestore()
  if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN
  else process.env.TELEGRAM_BOT_TOKEN = oldToken
  if (oldChat === undefined) delete process.env.TELEGRAM_CHAT_ID
  else process.env.TELEGRAM_CHAT_ID = oldChat
})

test('PostgreSQL startup queries are concurrent, narrow, and individually profiled', () => {
  const source = fs.readFileSync(require.resolve('../../function/database'), 'utf8')
  expect(source).toContain("profile('transaksi', query('SELECT meta FROM transaksi ORDER BY id ASC'))")
  expect(source).toContain("profile('kv_store', query('SELECT key, value FROM kv_store WHERE key = ANY($1::text[])'")
  expect(source).not.toMatch(/SELECT \*/)
})