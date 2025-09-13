const fs = require('fs')

function nocache(module, cb = () => {}) {
  fs.watchFile(require.resolve(module), async () => {
    await uncache(require.resolve(module))
    cb(module)
  })
}

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

module.exports = { nocache, uncache } 