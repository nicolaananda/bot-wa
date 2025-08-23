const axios = require("axios");
const fetch = require('node-fetch');

async function hitCoda(body) {
  const response = await fetch('https://order-sg.codashop.com/initPayment.action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })
  return await response.json()
}

async function getToken(url) {
  try {
    const response = await axios.get(url);
    const cookies = response.headers["set-cookie"];
    const joinedCookies = cookies ? cookies.join("; ") : null;

    const csrfTokenMatch = response.data.match(/<meta name="csrf-token" content="(.*?)">/);
    const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

    if (!csrfToken || !joinedCookies) {
      throw new Error("Gagal mendapatkan CSRF token atau cookie.");
    }

    return { csrfToken, joinedCookies };
  } catch (error) {
    console.error("❌ Error fetching cookies or CSRF token:", error.message);
    throw error;
  }
}

exports.getUsernameMl = async(id, zoneId) => {
  return new Promise(async (resolve, reject) => {
    axios
    .post(
      'https://api.duniagames.co.id/api/transaction/v1/top-up/inquiry/store',
      new URLSearchParams(
        Object.entries({
          productId: '1',
          itemId: '2',
          catalogId: '57',
          paymentId: '352',
          gameId: id,
          zoneId: zoneId,
          product_ref: 'REG',
          product_ref_denom: 'AE',
        })
      ),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://www.duniagames.co.id/',
          Accept: 'application/json',
        },
      }
    )
    .then((response) => {
      resolve(response.data.data.gameDetail.userName)
    })
    .catch((err) => {
      resolve("User Id not found")
    })
  })
}

exports.getUsernameFf = async(id) => {
  return new Promise(async (resolve, reject) => {
    axios
    .post(
      'https://api.duniagames.co.id/api/transaction/v1/top-up/inquiry/store',
      new URLSearchParams(
        Object.entries({
          productId: 3,
          itemId: 11,
          catalogId: 66,
          paymentId: 750,
          gameId: id,
          product_ref: 'AE',
          product_ref_denom: 'AE',
        })
      ),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://www.duniagames.co.id/',
          Accept: 'application/json',
        },
      }
    )
    .then((response) => {
      resolve(response.data.data.gameDetail.userName)
    })
    .catch((err) => {
      resolve("User Id not found")
    })
  })
}

exports.getUsernameCod = async(id) => {
  return new Promise(async (resolve, reject) => {
    axios
    .post(
      'https://api.duniagames.co.id/api/transaction/v1/top-up/inquiry/store',
      new URLSearchParams(
        Object.entries({
          productId: 18,
          itemId: 88,
          catalogId: 144,
          paymentId: 828,
          gameId: id,
          product_ref: 'CMS',
          product_ref_denom: 'REG',
        })
      ),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://www.duniagames.co.id/',
          Accept: 'application/json',
        },
      }
    )
    .then((response) => {
      resolve(response.data.data.gameDetail.userName)
    })
    .catch((err) => {
      resolve("User Id not found")
    })
  })
}

exports.getUsernameGi = async(id) => {
  return new Promise(async (resolve, reject) => {
    let sn = ''
    let sv = ''
    const idStr = id.toString()
    switch (idStr[0]) {
      case '6':
        sn = 'America'
        sv = 'os_usa'
        break
      case '7':
        sn = 'Europe'
        sv = 'os_euro'
        break
      case '8':
        sn = 'Asia'
        sv = 'os_asia'
        break
      case '9':
        sn = 'SAR (Taiwan, Hong Kong, Macao)'
        sv = 'os_cht'
        break
      default:
        return {
          success: false,
          message: 'Not found'
        }
    }
    const body = `voucherPricePoint.id=116054&voucherPricePoint.price=16500&voucherPricePoint.variablePrice=0&user.userId=${id}&user.zoneId=${sv}&voucherTypeName=GENSHIN_IMPACT&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.confirmationFields.username) {
      resolve(data.confirmationFields.username)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernameSus = async(id) => {
  const url = 'https://api.vocagame.com/v1/order/prepare/SUPER_SUS'
  return await fetchGameData(url, id)
}

exports.getUsernameHok = async(id) => {
  const url = 'https://api.vocagame.com/v1/order/prepare/HOK'
  return await fetchGameData(url, id)
}

exports.getUsernamePubg = async(id) => {
  const url = 'https://api.vocagame.com/v1/order/prepare/PUBGM'
  return await fetchGameData(url, id)
}

exports.getUsernameHsr = async(id) => {
  return new Promise(async (resolve, reject) => {
    let sn = ''
    let sv = ''
    const idStr = id.toString()
    switch (idStr[0]) {
      case '6':
        sn = 'America'
        sv = 'prod_official_usa'
        break
      case '7':
        sn = 'Europe'
        sv = 'prod_official_eur'
        break
      case '8':
        sn = 'Asia'
        sv = 'prod_official_asia'
        break
      case '9':
        sn = 'SAR (Taiwan, Hong Kong, Macao)'
        sv = 'prod_official_cht'
        break
      default:
        return {
          success: false,
          message: 'Not found',
        }
    }
    const body = `voucherPricePoint.id=855316&voucherPricePoint.price=16000&voucherPricePoint.variablePrice=0&user.userId=${id}&user.zoneId=${sv}&voucherTypeName=HONKAI_STAR_RAIL&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.confirmationFields.username) {
      resolve(data.confirmationFields.username)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernameHi = async(id) => {
  return new Promise(async (resolve, reject) => {
    const body = `voucherPricePoint.id=48250&voucherPricePoint.price=16500&voucherPricePoint.variablePrice=0&user.userId=${id}&user.zoneId=&voucherTypeName=HONKAI_IMPACT&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.confirmationFields.username) {
      resolve(data.confirmationFields.username)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernamePb = async(id) => {
  return new Promise(async (resolve, reject) => {
    const body = `voucherPricePoint.id=54700&voucherPricePoint.price=11000&voucherPricePoint.variablePrice=0&user.userId=${id}&user.zoneId=&voucherTypeName=POINT_BLANK&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.confirmationFields.username) {
      resolve(data.confirmationFields.username)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernameSm = async(id) => {
  return new Promise(async (resolve, reject) => {
    const body = `voucherPricePoint.id=256513&voucherPricePoint.price=16000&voucherPricePoint.variablePrice=0&user.userId=${id}&user.zoneId=global-release&voucherTypeName=SAUSAGE_MAN&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.confirmationFields.username) {
      resolve(data.confirmationFields.username)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernameValo = async(id) => {
  return new Promise(async (resolve, reject) => {
    const body = `voucherPricePoint.id=973634&voucherPricePoint.price=56000&voucherPricePoint.variablePrice=0&user.userId=${id}&voucherTypeName=VALORANT&voucherTypeId=109&gvtId=139&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.success) {
      resolve(data.confirmationFields.username)
    } else if (data.errorCode === -200) {
      resolve(id)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernamePgr = async(id, zone) => {
  return new Promise(async (resolve, reject) => {
    let sn = ''   
    let sv = ''
    switch (zone.toLowerCase()) {
      case 'ap':
        sn = 'Asia-Pacific'
        sv = '5000'
        break
      case 'eu':
        sn = 'Europe'
        sv = '5001'
        break
      case 'na':
        sn = 'North America'
        sv = '5002'
        break
      default:
        return {
          success: false,
          message: 'Bad request',
        }
    }
    const body = `voucherPricePoint.id=259947&voucherPricePoint.price=15000&voucherPricePoint.variablePrice=0&user.userId=${id}&user.zoneId=${sv}&voucherTypeName=PUNISHING_GRAY_RAVEN&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.confirmationFields.username) {
      resolve(data.confirmationFields.username)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernameZzz = async(id) => {
  return new Promise(async (resolve, reject) => {
    let sn = ''
    let sv = ''
    const idStr = id.toString().substring(0, 2)
    switch (idStr) {
      case '10':
        sn = 'America'
        sv = 'prod_gf_us'
        break
      case '13':
        sn = 'Asia'
        sv = 'prod_gf_jp'
        break
      case '15':
        sn = 'Europe'
        sv = 'prod_gf_eu'
        break
      case '17':
        sn = 'SAR (Taiwan, Hong Kong, Macao)'
        sv = 'prod_gf_sg'
        break
      default:
        return {
          success: false,
          message: 'Bad request'
        }
    }
    const body = `voucherPricePoint.id=946399&voucherPricePoint.price=16000&voucherPricePoint.variablePrice=0&user.userId=${id}&user.zoneId=${sv}&voucherTypeName=ZENLESS_ZONE_ZERO&shopLang=id_ID`
    const data = await hitCoda(body)
      
    if (data.confirmationFields.username) {
      resolve(data.confirmationFields.username)
    } else {
      resolve("User Id not found")
    }
  })
}

exports.getUsernameAov = async(id) => {
  const data = fetch(`https://cek-username.onrender.com/game/arenaofvalor?uid=${id}`)
  const result = data.json()
  return result.data || "User Id not found"
}