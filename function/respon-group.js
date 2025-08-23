const moment = require('moment');

exports.groupResponseRemove = async (ronzz, update) => {
  const metadata = await ronzz.groupMetadata(update.id)
  for (let num of update.participants) {
    try {
      try {
        ppuser = await ronzz.profilePictureUrl(num, 'image')
      } catch {
        ppuser = 'https://telegra.ph/file/265c672094dfa87caea19.jpg'
      }
      if (update.action == 'remove') {
        ronzz.fetchStatus(num).then(async bio => {
          await ronzz.sendMessage(update.id, { image: { url: ppuser }, caption: `*Leave From Grup ${metadata.subject}*\n\n📛 : _@${num.split("@")[0]}_\n🔢 : _${num.split("@")[0]}_\n💌 : _${bio.status ? bio.status : '-'}_\n🏅 : _${metadata.participants.length ? metadata.participants.length : "Undefined"}_\n📆 : _${moment.tz('Asia/Jakarta').format('dddd')}, ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}_\n⏰ : _${moment.tz('Asia/Jakarta').format('HH:mm:ss')} *WIB*_\n\n*┗━━ ❑ GoodBye👋*`, mentions: [num] })
        }).catch(async err => {
          await ronzz.sendMessage(update.id, { image: { url: ppuser }, caption: `*Leave From Grup ${metadata.subject}*\n\n📛 : _@${num.split("@")[0]}_\n🔢 : _${num.split("@")[0]}_\n💌 : _-_\n🏅 : _${metadata.participants.length ? metadata.participants.length : "Undefined"}_\n📆 : _${moment.tz('Asia/Jakarta').format('dddd')}, ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}_\n⏰ : _${moment.tz('Asia/Jakarta').format('HH:mm:ss')} *WIB*_\n\n*┗━━ ❑ GoodBye👋*`, mentions: [num] })
        })
      }
    } catch (err) {
      console.log(err)
    }
  }
}

exports.groupResponseWelcome = async (ronzz, update) => {
  const metadata = await ronzz.groupMetadata(update.id)
  for (let num of update.participants) {
    try {
      try {
        ppuser = await ronzz.profilePictureUrl(num, 'image')
      } catch {
        ppuser = 'https://telegra.ph/file/265c672094dfa87caea19.jpg'
      }
      if (update.action == 'add') {
        ronzz.fetchStatus(num).then(async bio => {
          await ronzz.sendMessage(update.id, { image: { url: ppuser }, caption: `*Welcome To ${metadata.subject}*\n\n📛 : _@${num.split("@")[0]}_\n🔢 : _${num.split("@")[0]}_\n💌 : _${bio.status ? bio.status : '-'}_\n🏅 : _${metadata.participants.length ? metadata.participants.length : "Undefined"}_\n📆 : _${moment.tz('Asia/Jakarta').format('dddd')}, ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}_\n⏰ : _${moment.tz('Asia/Jakarta').format('HH:mm:ss')} *WIB*_\n\n📄 *Deskripsi :*\n${metadata.desc ? metadata.desc : 'Tidak ada deskripsi'}`, mentions: [num] })
        }).catch(async err => {
          await ronzz.sendMessage(update.id, { image: { url: ppuser }, caption: `*Welcome To ${metadata.subject}*\n\n📛 : _@${num.split("@")[0]}_\n🔢 : _${num.split("@")[0]}_\n💌 : _-_\n🏅 : _${metadata.participants.length ? metadata.participants.length : "Undefined"}_\n📆 : _${moment.tz('Asia/Jakarta').format('dddd')}, ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}_\n⏰ : _${moment.tz('Asia/Jakarta').format('HH:mm:ss')} *WIB*_\n\n📄 *Deskripsi :*\n${metadata.desc ? metadata.desc : 'Tidak ada deskripsi'}`, mentions: [num] })
        })
      }
    } catch (err) {
      console.log(err)
    }
  }
}

exports.groupResponsePromote = async (ronzz, update) => {
  const metadata = await ronzz.groupMetadata(update.id)
  for (let num of update.participants) {
    try {
      if (update.action == 'promote') {
        await ronzz.sendMessage(update.id, { text: `*@${num.split("@")[0]} Promote From ${metadata.subject}*`, mentions: [num] })
      }
    } catch (err) {
      console.log(err)
    }
  }
}

exports.groupResponseDemote = async (ronzz, update) => {
  const metadata = await ronzz.groupMetadata(update.id)
  for (let num of update.participants) {
    try {
      if (update.action == 'demote') {
        await ronzz.sendMessage(update.id, { text: `*@${num.split("@")[0]} Demote From ${metadata.subject}*`, mentions: [num] })
      }
    } catch (err) {
      console.log(err)
    }
  }
}