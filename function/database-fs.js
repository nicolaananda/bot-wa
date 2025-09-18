const path = require('path')
const _fs = require('fs')
const { promises: fs } = _fs

class DatabaseFS {
  constructor(filepath, ...args) {
    this.file = path.resolve(filepath)
    this.logger = console
    this._jsonargs = args
    this._state = false
    this._queue = []
    this._isWriting = false
    this._lastWriteMs = 0
    this._load()
    this._interval = setInterval(async () => {
      if (!this._state && this._queue && this._queue[0]) {
        this._state = true
        await this[this._queue.shift()]().catch(this.logger.error)
        this._state = false
      }
    }, 1000)
    try {
      _fs.watchFile(this.file, { interval: 1000 }, (curr, prev) => {
        if (curr && prev && curr.mtimeMs !== prev.mtimeMs) {
          if (Date.now() - this._lastWriteMs < 1500 || this._isWriting) return
          try {
            const fresh = _fs.existsSync(this.file) ? JSON.parse(_fs.readFileSync(this.file)) : {}
            this._data = fresh
            if (this.logger && this.logger.info) this.logger.info('[Database] Reloaded after external change:', this.file)
            try { process.emit && process.emit('database:reloaded'); } catch {}
          } catch (e) {
            this.logger.error('[Database] Failed to reload after external change:', e)
          }
        }
      })
      this._unwatch = () => _fs.unwatchFile(this.file)
    } catch (e) {
      this.logger.error('[Database] Failed to start file watcher:', e)
      this._unwatch = () => {}
    }
  }

  get data() {
    return this._data
  }

  set data(value) {
    this._data = value
    this.save()
  }

  load() { this._queue.push('_load') }
  save() { this._queue.push('_save') }

  _load() {
    try {
      return this._data = _fs.existsSync(this.file) ? JSON.parse(_fs.readFileSync(this.file)) : {}
    } catch (e) {
      this.logger.error(e)
      return this._data = {}
    }
  }

  async _save() {
    let dirname = path.dirname(this.file)
    if (!_fs.existsSync(dirname)) await fs.mkdir(dirname, { recursive: true })
    try {
      this._isWriting = true
      await fs.writeFile(this.file, JSON.stringify(this._data, ...this._jsonargs))
      this._lastWriteMs = Date.now()
    } finally {
      setTimeout(() => { this._isWriting = false }, 200)
    }
    return this.file
  }

  destroy() {
    if (this._interval) clearInterval(this._interval)
    if (this._unwatch) this._unwatch()
  }
}

module.exports = DatabaseFS


