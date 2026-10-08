'use strict'

const fs = require('fs')
const source = fs.readFileSync(require.resolve('../../index'), 'utf8')

test('buy and buynow require a positive integer quantity', () => {
  expect(source.match(/if \(!Number\.isInteger\(jumlah\) \|\| jumlah <= 0\)/g)).toHaveLength(2)
})

test('addsaldo rejects non-positive and fractional amounts', () => {
  const block = source.slice(source.indexOf("case 'addsaldo':"), source.indexOf("case 'minsaldo':"))
  expect(block).toMatch(/if \(!Number\.isInteger\(nominal\) \|\| nominal <= 0\)/)
})

test('delstok and pick commit through atomic database methods', () => {
  expect(source).toMatch(/await db\.clearProductStock\(idDelStok\)/)
  expect(source).toMatch(/await db\.pickProductStock\([\s\S]*?idProdukPick,[\s\S]*?nomorList/)
})

test('cek and rekap read PostgreSQL instead of RAM snapshots', () => {
  const cek = source.slice(source.indexOf("case 'cek':"), source.indexOf("case 'pick':"))
  const rekap = source.slice(source.indexOf("case 'rekap':"), source.indexOf('// ====== CONFIG & IMPORT ======'))
  expect(cek).toMatch(/await pg\.query\([\s\S]*?FROM produk[\s\S]*?WHERE id = \$1/)
  expect(cek).not.toMatch(/db\.data\.produk/)
  expect(rekap).toMatch(/await pg\.query\([\s\S]*?FROM transaksi/)
  expect(rekap).not.toMatch(/db\.data\.transaksi/)
})
