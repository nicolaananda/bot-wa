const fs = require('fs');
const chalk = require('chalk')

function uncache(module = '.') {
  return new Promise((resolve, reject) => {
    try {
      delete require.cache[require.resolve(module)]
      resolve()
    } catch (e) {
      reject(e)
    }
  })
}

function nocache(module, cb = () => { }) {
  // console.log(chalk.greenBright(`Module ${module} di pantau oleh Ronzz YT`))
  fs.watchFile(require.resolve(module), async () => {
    await uncache(require.resolve(module))
    cb(module)
  })
}

module.exports = { nocache, uncache }