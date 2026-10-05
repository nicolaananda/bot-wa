const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')

const WIDTH = 1080
const HEIGHT = 1500
const QR_BOX = Object.freeze({ x: 130, y: 300, width: 820, height: 820 })

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

  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  background.addColorStop(0, '#f8fafc')
  background.addColorStop(1, '#eef2f7')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const header = ctx.createLinearGradient(70, 45, WIDTH - 70, 240)
  header.addColorStop(0, '#0b1220')
  header.addColorStop(1, '#172b4d')
  ctx.fillStyle = header
  roundedRect(ctx, 70, 45, WIDTH - 140, 200, 30)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText('GIHA SMART BOT', 120, 100)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 44px sans-serif'
  ctx.fillText(type === 'deposit' ? 'Deposit QRIS' : 'Pembayaran QRIS', 120, 158)
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '24px sans-serif'
  ctx.fillText('Pindai kode untuk menyelesaikan pembayaran', 120, 204)

  ctx.fillStyle = '#3b82f6'
  roundedRect(ctx, WIDTH - 168, 91, 48, 8, 4)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(15, 23, 42, 0.12)'
  ctx.shadowBlur = 32
  ctx.shadowOffsetY = 14
  ctx.fillRect(QR_BOX.x, QR_BOX.y, QR_BOX.width, QR_BOX.height)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  const quietZone = 40
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qrImage, QR_BOX.x + quietZone, QR_BOX.y + quietZone,
    QR_BOX.width - quietZone * 2, QR_BOX.height - quietZone * 2)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748b'
  ctx.font = '22px sans-serif'
  ctx.fillText('Total pembayaran', WIDTH / 2, 1184)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 60px sans-serif'
  ctx.fillText(`Rp${Number(amount).toLocaleString('id-ID')}`, WIDTH / 2, 1252)

  const expiryTime = expiry.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace('.', ':')
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(180, 1306)
  ctx.lineTo(WIDTH - 180, 1306)
  ctx.stroke()

  ctx.fillStyle = '#334155'
  ctx.font = '24px sans-serif'
  ctx.fillText(`Berlaku hingga ${expiryTime} WIB`, WIDTH / 2, 1362)
  ctx.fillStyle = '#64748b'
  ctx.font = '21px sans-serif'
  ctx.fillText('Pembayaran diverifikasi secara otomatis', WIDTH / 2, 1412)

  if (orderId) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '18px sans-serif'
    ctx.fillText(`ID Transaksi  •  ${String(orderId).slice(0, 52)}`, WIDTH / 2, 1460)
  }

  const buffer = canvas.toBuffer('image/png')
  if (outputPath) {
    await fs.promises.writeFile(outputPath, buffer)
    return outputPath
  }
  return buffer
}

module.exports = { createQrisCard, QRIS_CARD_LAYOUT: { width: WIDTH, height: HEIGHT, qrBox: QR_BOX } }
