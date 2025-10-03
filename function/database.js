require('dotenv').config()
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true'

if (!usePg) {
    module.exports = require('./database-fs')
} else {
    const { query } = require('../config/postgres')
    const UPSERT_CHUNK = Math.max(1, Number(process.env.PG_UPSERT_CHUNK || 100))

    class DatabasePG {
        constructor() {
            this.logger = console
            this._data = {}
        }

        get data() { return this._data }
        set data(value) { this._data = value }

        async load() {
            // Assemble a snapshot similar to JSON db for backward compatibility
            const snapshot = {}

            // Kick off queries in parallel to reduce cold start latency
            const usersPromise = query('SELECT user_id, saldo, role, data FROM users')
            const transaksiPromise = query('SELECT meta FROM transaksi ORDER BY id ASC')
            const produkPromise = query('SELECT id, data FROM produk')
            const settingsPromise = query('SELECT key, value FROM settings')

            // users
            const users = await usersPromise
            snapshot.users = {}
            for (const row of users.rows) {
                const merged = (row.data && typeof row.data === 'object') ? { ...row.data } : {}
                // Always prefer authoritative columns for saldo and role
                merged.saldo = Number(row.saldo || 0)
                merged.role = row.role || merged.role || 'bronze'
                snapshot.users[row.user_id] = merged
            }

            // transaksi
            const tr = await transaksiPromise
            const transaksiArray = tr.rows.map(r => r.meta)
            // Intercept pushes to persist to Postgres transparently
            const originalPush = transaksiArray.push
            transaksiArray.push = function(...items) {
                try {
                    for (const item of items) {
                        // Fire-and-forget insert; do not block caller
                        query('INSERT INTO transaksi(ref_id, user_id, amount, status, meta) VALUES ($1,$2,$3,$4,$5)', [
                            item && (item.ref_id || item.reffId) || null,
                            item && (item.user_id || item.userId || item.user) || null,
                            item && (Number(item.amount || item.totalBayar || (item.price * (item.jumlah || 1)) || 0)) || 0,
                            item && (item.status || null),
                            JSON.stringify(item)
                        ]).catch(e => { try { console.error('[DBPG] insert transaksi failed:', e.message) } catch {} })
                    }
                } catch {}
                return originalPush.apply(this, items)
            }
            snapshot.transaksi = transaksiArray

            // produk
            const produk = await produkPromise
            snapshot.produk = {}
            for (const row of produk.rows) snapshot.produk[row.id] = row.data

            // settings
            const settings = await settingsPromise
            snapshot.setting = {}
            for (const row of settings.rows) snapshot.setting[row.key] = row.value

            // dynamic tables made by migration (arrays as item, objects as k/v)
            // We won't eagerly load all to keep startup fast.
            this._data = snapshot
            return this._data
        }

        async save() {
            try {
				// Persist users (bulk upsert)
				if (this._data && this._data.users) {
					const entries = Object.entries(this._data.users)
					const chunkSize = UPSERT_CHUNK
					for (let i = 0; i < entries.length; i += chunkSize) {
						const chunk = entries.slice(i, i + chunkSize)
						if (chunk.length === 0) continue
						const values = []
						const params = []
						let paramIndex = 1
						for (const [userId, u] of chunk) {
							const saldo = Number(u && u.saldo || 0)
							const role = (u && u.role) || 'bronze'
							values.push(`($${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++})`)
							params.push(userId, saldo, role, JSON.stringify(u || {}))
						}
						const sql = `INSERT INTO users(user_id, saldo, role, data) VALUES ${values.join(',')} ON CONFLICT (user_id) DO UPDATE SET saldo=EXCLUDED.saldo, role=EXCLUDED.role, data=EXCLUDED.data`
						await query(sql, params)
					}
				}
				// Persist produk (bulk upsert)
				if (this._data && this._data.produk) {
					const entries = Object.entries(this._data.produk)
					const chunkSize = UPSERT_CHUNK
					for (let i = 0; i < entries.length; i += chunkSize) {
						const chunk = entries.slice(i, i + chunkSize)
						if (chunk.length === 0) continue
						const values = []
						const params = []
						let paramIndex = 1
						for (const [id, p] of chunk) {
							const name = (p && (p.name || p.nama)) || null
							const price = Number(p && (p.price || p.harga) || 0)
							const stock = Number(p && (p.stock || (p.stok ? p.stok.length : 0)) || 0)
							values.push(`($${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++})`)
							params.push(id, name, price, stock, JSON.stringify(p || {}))
						}
						const sql = `INSERT INTO produk(id, name, price, stock, data) VALUES ${values.join(',')} ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, stock=EXCLUDED.stock, data=EXCLUDED.data`
						await query(sql, params)
					}
				}
            } catch (e) {
                try { console.error('[DBPG] save sync failed:', e.message) } catch {}
            }
            return true
        }
    }

    module.exports = DatabasePG
}