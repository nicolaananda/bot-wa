'use strict'

const fs = require('fs')
const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8')

test('customer Zoom empty and paid failure paths point to manual support', () => {
  expect(source).toContain("const ZOOM_MANUAL_SUPPORT = 'Kalau tetap kosong atau bermasalah, chat admin: wa.me/6287887842985 agar pesanan diproses manual.'")
  expect(source.match(/ZOOM_MANUAL_SUPPORT/g).length).toBeGreaterThanOrEqual(7)
  expect(source).toMatch(/failed_no_host[\s\S]*Pesanan tetap disimpan untuk proses manual[\s\S]*ZOOM_MANUAL_SUPPORT/)
  expect(source).toMatch(/failed_create_meeting[\s\S]*Pesanan tetap disimpan untuk proses manual[\s\S]*ZOOM_MANUAL_SUPPORT/)
})