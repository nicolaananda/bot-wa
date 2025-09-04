require("../setting.js");
const QRCode = require('qrcode');

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

async function qrisDinamis(nominalOrQris, path) {
  // If first arg looks like a full EMV QR string, write it directly
  const isFullQrisString = typeof nominalOrQris === 'string' && /^(00\d{2}\d{2})/.test(nominalOrQris) && nominalOrQris.includes('6304');
  if (isFullQrisString) {
    await QRCode.toFile(path, nominalOrQris, { margin: 2, scale: 10 });
    return path;
  }

  // Backward-compatible: treat as amount and build from global.codeqr
  let qris = codeqr

  let qris2 = qris.slice(0, -4);
  let replaceQris = qris2.replace("010211", "010212");
  let pecahQris = replaceQris.split("5802ID");
  const nominal = String(nominalOrQris)
  let uang = "54" + ("0" + nominal.length).slice(-2) + nominal + "5802ID";

  let output = pecahQris[0] + uang + pecahQris[1] + toCRC16(pecahQris[0] + uang + pecahQris[1])

  await QRCode.toFile(path, output, { margin: 2, scale: 10 })
  return path
}

module.exports = { qrisDinamis }