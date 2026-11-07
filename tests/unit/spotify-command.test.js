const fs = require('fs')

test('spotify command filters the existing product catalogue', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')

  expect(source).toMatch(/case 'spotify':\s*case 'stok':/)
  expect(source).toMatch(/command === 'spotify'[\s\S]*includes\('spotify'\)/)
  expect(source).toMatch(/Produk Spotify belum tersedia/)
})