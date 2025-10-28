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
  return hex;
}

async function generateStyledQR(text, outPath, opts = {}) {
  const {
    colorDark = '#0F172Aff', // slate-900
    colorLight = '#FFFFFFFF',
    logoPath = pathModule.join(__dirname, '..', 'options', 'image', 'thumbnail.jpg'),
    size = 800,
    margin = 2
  } = opts;

  const canvas = createCanvas(size, size);
  await QRCode.toCanvas(canvas, text, {
    margin,
    width: size,
    color: { dark: colorDark, light: colorLight }
  });

  const ctx = canvas.getContext('2d');

  try {
    if (logoPath && fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoSize = Math.floor(size * 0.22);
      const x = Math.floor((size - logoSize) / 2);
      const y = Math.floor((size - logoSize) / 2);

      // Draw white rounded background for better contrast
      const radius = Math.floor(logoSize * 0.18);
      ctx.fillStyle = '#FFFFFFFF';
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + logoSize - radius, y);
      ctx.quadraticCurveTo(x + logoSize, y, x + logoSize, y + radius);
      ctx.lineTo(x + logoSize, y + logoSize - radius);
      ctx.quadraticCurveTo(x + logoSize, y + logoSize, x + logoSize - radius, y + logoSize);
      ctx.lineTo(x + radius, y + logoSize);
      ctx.quadraticCurveTo(x, y + logoSize, x, y + logoSize - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      // Draw logo
      ctx.drawImage(logo, x, y, logoSize, logoSize);
    }
  } catch (_) {
    // Ignore logo errors, still output QR
  }

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
  let uang = "54" + ("0" + nominal.length).slice(-2) + nominal + "5802ID";

  let output = pecahQris[0] + uang + pecahQris[1] + toCRC16(pecahQris[0] + uang + pecahQris[1])

  await generateStyledQR(output, outPath)
  return outPath
}

module.exports = { qrisDinamis }