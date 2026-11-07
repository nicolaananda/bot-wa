const fs = require('fs')

test('buy aliases route zoom100 into the existing Zoom flows', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')

  expect(source).toMatch(/command === 'buynow'.*args\[0\].*'zoom100'[\s\S]*command = 'zoom100qris'/)
  expect(source).toMatch(/command === 'buy'.*args\[0\].*'zoom100'[\s\S]*command = 'zoom100'/)
  expect(source).toMatch(/q = args\.slice\(1\)\.join\(' '\)/)
})