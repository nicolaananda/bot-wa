require("../setting.js");
const QRCode = require('qrcode');
const fs = require('fs');
const pathModule = require('path');
const { createCanvas, loadImage } = require('canvas');

function toCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Helper untuk membuat TLV (Tag-Length-Value)
function tlv(tag, value) {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

async function generateStyledQR(text, outPath, opts = {}) {
  const {
    colorDark = process.env.QR_COLOR_DARK || '#800000FF',
    colorLight = process.env.QR_COLOR_LIGHT || '#FFFFFFFF',
    logoPath = null,
    backgroundPath = null,
    showLogo = false,
    size = 800,
    margin = 2
  } = opts;

  // Always plain canvas (no background)
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Generate QR on an offscreen canvas for clean compositing
  const qrSize = Math.floor(Math.min(canvas.width, canvas.height) * 0.9);
  const qrCanvas = createCanvas(qrSize, qrSize);
  await QRCode.toCanvas(qrCanvas, text, {
    margin,
    width: qrSize,
    color: { dark: colorDark, light: colorLight }
  });

  const qrX = Math.floor((canvas.width - qrSize) / 2);
  const qrY = Math.floor((canvas.height - qrSize) / 2);
  ctx.drawImage(qrCanvas, qrX, qrY);

  // No logo drawing (explicitly disabled)

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buf);
  return outPath;
}

async function qrisDinamis(nominalOrQris, outPath) {
  // If first arg looks like a full EMV QR string, write it directly
  const isFullQrisString = typeof nominalOrQris === 'string' && /^(00\d{2}\d{2})/.test(nominalOrQris) && nominalOrQris.includes('6304');
  if (isFullQrisString) {
    await generateStyledQR(nominalOrQris, outPath);
    return outPath;
  }

  // Backward-compatible: treat as amount and build from global.codeqr
  if (!codeqr) {
    throw new Error("codeqr is not defined. Please set MIDTRANS_STATIC_QRIS in your .env file");
  }

  let baseQris = codeqr;
  
  // Ubah dari static (010211) ke dynamic (010212)
  baseQris = baseQris.replace("010211", "010212");

  // Buang CRC lama: cari "6304" (Tag 63 len 04)
  const idxCrc = baseQris.indexOf("6304");
  const withoutCRC = idxCrc > -1 ? baseQris.slice(0, idxCrc) : baseQris;

  // Bersihkan Tag 54 (Amount) & Tag 62 (Additional Data) lama jika ada
  let payload = withoutCRC
    .replace(/54\d{2}[\d.]+/g, "")      // amount
    .replace(/62\d{2}[0-9A-Za-z]+/g, ""); // additional data

  // Pastikan amount tanpa desimal (IDR) dan sebagai string
  const amountStr = String(Math.floor(Number(nominalOrQris)));

  // Build Tag 54 (Amount) dengan format TLV yang benar
  const tag54 = tlv("54", amountStr);

  // Build Tag 62 (Additional Data) untuk trigger notifikasi
  // Menggunakan timestamp + nominal sebagai reference ID untuk uniqueness
  const refId = Date.now().toString().slice(-10) + amountStr.slice(-3);
  const tag62Value = tlv("01", refId) + tlv("05", refId);
  const tag62 = tlv("62", tag62Value);

  // Sisipkan Tag 54 dan Tag 62 di akhir (sebelum CRC)
  payload = payload + tag54 + tag62;

  // Hitung CRC baru
  const withCrcHeader = payload + "6304";
  const crc = toCRC16(withCrcHeader);

  // Hasil final
  const output = withCrcHeader + crc;

  await generateStyledQR(output, outPath);
  return outPath;
}

module.exports = { qrisDinamis }