const fs = require('fs')

const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
const buy = source.slice(source.indexOf("case 'buy':"), source.indexOf("case 'batal':"))

test('queued saldo delivery reports pending, while an actual send failure reports failure', () => {
  expect(buy).toMatch(/customerDeliveryState = 'queued'/)
  expect(buy).toMatch(/else if \(customerDeliveryState === 'queued'\)[\s\S]*?sedang diproses untuk dikirim ke chat pribadi/)
  expect(buy).toMatch(/else \{[\s\S]*?terjadi masalah saat mengirim detail akun/)
  expect(buy).not.toMatch(/customerMessageSent/)
})
