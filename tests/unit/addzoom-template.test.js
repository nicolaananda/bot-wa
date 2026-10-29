'use strict'

const fs = require('fs')
const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8')
const block = source.slice(source.indexOf("case 'addzoom100':"), source.indexOf('// ===== ADMIN: HAPUS HOST DARI POOL'))

test('addzoom template includes one expiry and persisted hostKey', () => {
  expect((block.match(/`exp=12\/07\/2026\\n`/g) || [])).toHaveLength(1)
  expect(block).toMatch(/`hostKey=123456\\n`/)
  expect(block).toMatch(/hostKey: pick\('hostKey', 'hostkey', 'host_key'\)/)
  expect(block).toMatch(/hostKey harus tepat 6 digit/)
})
