const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')

const WIDTH = 1080
const HEIGHT = 1500
const QR_BOX = Object.freeze({ x: 130, y: 330, width: 820, height: 820 })

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

async function createQrisCard({ qr, amount, orderId = '', expiresAt, type = 'deposit', outputPath }) {
  if (!qr) throw new TypeError('qr wajib diisi')
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new TypeError('amount harus lebih dari 0')
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) throw new TypeError('expiresAt tidak valid')

  const source = Buffer.isBuffer(qr) ? qr : await fs.promises.readFile(qr)
  const qrImage = await loadImage(source)
  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  background.addColorStop(0, '#e8f7ff')
  background.addColorStop(0.45, '#f4ecff')
  background.addColorStop(1, '#fff1dc')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const header = ctx.createLinearGradient(70, 45, WIDTH - 70, 250)
  header.addColorStop(0, '#2563eb')
  header.addColorStop(0.5, '#7c3aed')
  header.addColorStop(1, '#ec4899')
  ctx.fillStyle = header
  roundedRect(ctx, 70, 45, WIDTH - 140, 230, 44)
  ctx.fill()

  ctx.fillStyle = '#22d3ee'
  ctx.beginPath(); ctx.arc(72, 360, 42, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath(); ctx.arc(1010, 1080, 54, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fb7185'
  ctx.beginPath(); ctx.arc(60, 1270, 28, 0, Math.PI * 2); ctx.fill()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 54px sans-serif'
  ctx.fillText('GiHa Smart Bot', WIDTH / 2, 105)
  ctx.fillStyle = '#fde68a'
  ctx.font = 'bold 38px sans-serif'
  ctx.fillText(type === 'deposit' ? 'Deposit QRIS' : 'Payment QRIS', WIDTH / 2, 165)
  ctx.fillStyle = '#ede9fe'
  ctx.font = '26px sans-serif'
  ctx.fillText('Pindai kode untuk menyelesaikan pembayaran', WIDTH / 2, 225)

  ctx.fillStyle = '#fff'
  ctx.shadowColor = 'rgba(49, 46, 129, 0.18)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 12
  ctx.fillRect(QR_BOX.x, QR_BOX.y, QR_BOX.width, QR_BOX.height)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const quietZone = 40
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qrImage, QR_BOX.x + quietZone, QR_BOX.y + quietZone,
    QR_BOX.width - quietZone * 2, QR_BOX.height - quietZone * 2)

  ctx.fillStyle = '#555'
  ctx.font = '24px sans-serif'
  ctx.fillText('TOTAL TRANSFER', WIDTH / 2, 1215)
  ctx.fillStyle = '#171717'
  ctx.font = 'bold 58px sans-serif'
  ctx.fillText(`Rp${Number(amount).toLocaleString('id-ID')}`, WIDTH / 2, 1280)

  const expiryTime = expiry.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':')
  const expiryText = `Berlaku sampai pukul ${expiryTime} WIB`
  ctx.font = 'bold 25px sans-serif'
  const badgeWidth = Math.max(390, ctx.measureText(expiryText).width + 64)
  const badge = ctx.createLinearGradient((WIDTH - badgeWidth) / 2, 1320, (WIDTH + badgeWidth) / 2, 1374)
  badge.addColorStop(0, '#dbeafe')
  badge.addColorStop(0.5, '#ede9fe')
  badge.addColorStop(1, '#fce7f3')
  ctx.fillStyle = badge
  roundedRect(ctx, (WIDTH - badgeWidth) / 2, 1320, badgeWidth, 54, 27)
  ctx.fill()
  ctx.fillStyle = '#6d28d9'
  ctx.fillText(expiryText, WIDTH / 2, 1356)

  ctx.fillStyle = '#555'
  ctx.font = '23px sans-serif'
  ctx.fillText('Pembayaran terdeteksi otomatis', WIDTH / 2, 1430)
  if (orderId) {
    ctx.fillStyle = '#777'
    ctx.font = '18px sans-serif'
    ctx.fillText(`Order ${String(orderId).slice(0, 52)}`, WIDTH / 2, 1466)
  }

  const buffer = canvas.toBuffer('image/png')
  if (outputPath) {
    await fs.promises.writeFile(outputPath, buffer)
    return outputPath
  }
  return buffer
}

module.exports = { createQrisCard, QRIS_CARD_LAYOUT: { width: WIDTH, height: HEIGHT, qrBox: QR_BOX } }
