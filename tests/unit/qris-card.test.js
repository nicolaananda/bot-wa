const fs = require('fs')
const QRCode = require('qrcode')
const { createCanvas, loadImage } = require('canvas')
const { createQrisCard, QRIS_CARD_LAYOUT } = require('../../lib/qris-card')

test('kartu portrait mempertahankan QR dan ornamen di luar bounding box', async () => {
  const payload = '00020101021226670016COM.NOBUBANK.WWW011893600503000008791402147081180359290303UMI51440014ID.CO.QRIS.WWW0215ID10200211863350303UMI5204481253033605405100005802ID5911GIHA SMART6007JAKARTA6105123406304B70A'
  const raw = await QRCode.toBuffer(payload, { width: 800, margin: 4, color: { dark: '#000000', light: '#ffffff' } })
  const card = await createQrisCard({ qr: raw, amount: 10000, orderId: 'DEP-TEST', expiresAt: Date.now() + 1800000 })
  const image = await loadImage(card)
  expect([image.width, image.height]).toEqual([1080, 1500])

  const { qrBox } = QRIS_CARD_LAYOUT
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const border = ctx.getImageData(qrBox.x, qrBox.y, qrBox.width, qrBox.height).data
  let borderIsWhite = true
  for (let x = 0; x < qrBox.width; x += 10) {
    for (const y of [0, qrBox.height - 1]) {
      const offset = (y * qrBox.width + x) * 4
      borderIsWhite = borderIsWhite && border[offset] === 255 && border[offset + 1] === 255 && border[offset + 2] === 255
    }
  }
  expect(borderIsWhite).toBe(true)

  // qrcode library is encoder-only; exact source pixels prove the payload-bearing QR was not modified.
  const rendered = ctx.getImageData(qrBox.x + 40, qrBox.y + 40, 740, 740).data
  const sourceCanvas = createCanvas(740, 740)
  const sourceCtx = sourceCanvas.getContext('2d')
  sourceCtx.imageSmoothingEnabled = false
  sourceCtx.drawImage(await loadImage(raw), 0, 0, 740, 740)
  expect(Buffer.from(rendered)).toEqual(Buffer.from(sourceCtx.getImageData(0, 0, 740, 740).data))
  expect(fs.existsSync(require.resolve('qrcode'))).toBe(true)
}, 30000)

test('deposit dan buynow memakai kartu QRIS in-memory yang sama', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  const deposit = source.slice(source.indexOf("case 'deposit':"), source.indexOf("case 'buynow':"))
  const buynow = source.slice(source.indexOf("case 'buynow':"))
  expect(deposit).toMatch(/createQrisCard\(\{[\s\S]*?type: 'deposit'/)
  expect(buynow).toMatch(/createQrisCard\(\{[\s\S]*?type: 'payment'/)
  expect(deposit).not.toMatch(/options\/sticker\/qris(?:-card)?\.(?:jpg|png)/)
  expect(buynow).not.toMatch(/options\/sticker\/qris(?:-card)?\.(?:jpg|png)/)
})