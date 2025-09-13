const fs = require('fs')

class Database {
  constructor(filename, logger = console, space = 2) {
    this.filename = filename
    this.logger = logger
    this.space = space
    this.data = {}
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.filename)) {
        this.data = JSON.parse(fs.readFileSync(this.filename, 'utf-8'))
      } else {
        this.data = {}
        this.save()
      }
    } catch (e) {
      this.logger.error('Failed to load database:', e)
      this.data = {}
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filename, JSON.stringify(this.data, null, this.space))
      return true
    } catch (e) {
      this.logger.error('Failed to save database:', e)
      return false
    }
  }
}

module.exports = Database 