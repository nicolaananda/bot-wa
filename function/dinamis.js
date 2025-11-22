require("../setting.js");
const QRCode = require('qrcode');
const fs = require('fs');
const pathModule = require('path');
const { createCanvas, loadImage } = require('canvas');

function toCRC16(str) {
  function charCodeAt(str, i) {
    let get = str.substr(i, 1)
    return get.charCodeAt()
  }

  let crc = 0xFFFF;
  let strlen = str.length;
  for (let c = 0; c < strlen; c++) {
    crc ^= charCodeAt(str, c) << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  hex = crc & 0xFFFF;
  hex = hex.toString(16);
  hex = hex.toUpperCase();
  if (hex.length == 3) {
    hex = "0" + hex;
  }
  if (hex.length == 2) {
    hex = "00" + hex;
  }
  if (hex.length == 1) {
    hex = "000" + hex;
  }
  return hex;
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
  let qris = codeqr

  let qris2 = qris.slice(0, -4);
  let replaceQris = qris2.replace("010211", "010212");
  let pecahQris = replaceQris.split("5802ID");
  const nominal = String(nominalOrQris)
  
  // Pastikan panjang field selalu 2 digit menggunakan slice(-2) seperti kode asli
  // Ini memastikan format konsisten untuk semua nominal (termasuk 10+ digit)
  let uang = "54" + ("0" + nominal.length).slice(-2) + nominal + "5802ID";

  let output = pecahQris[0] + uang + pecahQris[1] + toCRC16(pecahQris[0] + uang + pecahQris[1])

  await generateStyledQR(output, outPath)
  return outPath
}

module.exports = { qrisDinamis }