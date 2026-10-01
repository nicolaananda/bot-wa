const fs = require('fs')
const path = require('path')

test('Zoom API allows slow create responses without retrying POST', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../lib/zoom-client.js'), 'utf8')
  expect(source).toMatch(/const ZOOM_API_TIMEOUT_MS = 60000/)
  expect(source).toMatch(/timeout: ZOOM_API_TIMEOUT_MS/)
  expect(source).not.toMatch(/axiosRetry|axios-retry/)
})
