require('dotenv').config()
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true'

if (!usePg) {
    throw new Error('Filesystem database mode has been removed. Please set USE_PG=true.')
}

const { query } = require('../config/postgres')

function toPositiveInt(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

const UPSERT_CHUNK = toPositiveInt(process.env.PG_UPSERT_CHUNK || 100, 100)
const ORDER_TTL_MS = 60 * 60 * 1000
const KV_SYNC_KEYS = ['order', 'zoomFlow', 'zoomBookings', 'promo']
const KV_DEFAULTS = {
    order: {},
    zoomFlow: {},
    zoomBookings: [],
    promo: {
        enabled: false,
        groupId: '',
        groupName: '',
        groups: [],
        text: '',
        time: '08:00',
        timezone: 'Asia/Jakarta',
        lastSentDate: '',
        lastSentAt: 0
    }
}

function removeExpiredOrders(orders, now = Date.now()) {
    if (!orders || typeof orders !== 'object' || Array.isArray(orders)) return 0

    let removed = 0
    for (const [userId, order] of Object.entries(orders)) {
        const createdAt = Number(order && (order.createdAt || order.startedAt))
        if (Number.isFinite(createdAt) && now - createdAt > ORDER_TTL_MS) {
            delete orders[userId]
            removed++
        }
    }
    return removed
}

function cloneJson(value) {
    if (value === null || typeof value !== 'object') return value
    try {
        return JSON.parse(JSON.stringify(value))
    } catch {
        if (Array.isArray(value)) return value.map((item) => cloneJson(item))
        return { ...value }
    }
}

function resolveTransactionRefId(item) {
    return item && (item.ref_id || item.reffId || item.order_id || item.orderId) || null
}

function normalizeTransactionRecord(item) {
    const payload = item || {}
    const refId = resolveTransactionRefId(payload)
    return {
        refId,
        userId: payload && (payload.user_id || payload.userId || payload.user) || null,
        amount: payload && (Number(payload.amount || payload.totalBayar || (payload.price * (payload.jumlah || 1)) || 0)) || 0,
        status: payload && (payload.status || null),
        meta: payload,
    }
}

function chunkArray(items, size) {
    const out = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

class DatabasePG {
    constructor() {
        this.logger = console
        this._data = {}
        this._persisted = {
            users: new Map(),
            produk: new Map(),
            kv: new Map(),
        }
        this._savePromise = null
    }

    get data() { return this._data }
    set data(value) { this._data = value }

    async persistTransactions(items, executor = query) {
        const sourceItems = Array.isArray(items) ? items : [items]
        const normalized = sourceItems
            .map((item) => normalizeTransactionRecord(item))
            .filter((item) => item && item.refId)

        if (!normalized.length) return { ok: true, inserted: 0, skipped: sourceItems.length }

        let inserted = 0
        for (const chunk of chunkArray(normalized, UPSERT_CHUNK)) {
            const placeholders = []
            const params = []
            let paramIndex = 1

            for (const item of chunk) {
                placeholders.push(`($${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++})`)
                params.push(item.refId, item.userId, item.amount, item.status, JSON.stringify(item.meta || {}))
            }

            const sql = `INSERT INTO transaksi(ref_id, user_id, amount, status, meta) VALUES ${placeholders.join(',')} ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING`
            const result = await executor(sql, params)
            inserted += Number(result && result.rowCount || 0)
        }

        return { ok: true, inserted, skipped: sourceItems.length - normalized.length }
    }

    async appendTransaction(item, { persist = true } = {}) {
        const normalized = normalizeTransactionRecord(item)
        if (!normalized.refId) {
            throw new Error('Transaction refId is required for persistence')
        }

        if (persist) {
            await this.persistTransactions([item])
        }

        if (!Array.isArray(this._data.transaksi)) this._data.transaksi = []
        const nextItem = cloneJson(item)
        const existingIndex = this._data.transaksi.findIndex(
            (entry) => resolveTransactionRefId(entry) === normalized.refId
        )
        if (existingIndex >= 0) {
            this._data.transaksi[existingIndex] = nextItem
        } else {
            this._data.transaksi.push(nextItem)
        }

        return nextItem
    }

    async load() {
        const snapshot = {}

        const usersPromise = query('SELECT user_id, saldo, role, data FROM users')
        const transaksiPromise = query('SELECT meta FROM transaksi ORDER BY id ASC')
        const produkPromise = query('SELECT id, data FROM produk')
        const settingsPromise = query('SELECT key, value FROM settings')
        const kvPromise = KV_SYNC_KEYS.length
            ? query('SELECT key, value FROM kv_store WHERE key = ANY($1::text[])', [KV_SYNC_KEYS])
            : Promise.resolve({ rows: [] })

        const users = await usersPromise
        snapshot.users = {}
        for (const row of users.rows) {
            const merged = (row.data && typeof row.data === 'object') ? { ...row.data } : {}
            merged.saldo = Number(row.saldo || 0)
            merged.role = row.role || merged.role || 'bronze'
            snapshot.users[row.user_id] = merged
        }

        const tr = await transaksiPromise
        snapshot.transaksi = tr.rows.map(r => r.meta)

        // produk
        const produk = await produkPromise
        snapshot.produk = {}
        for (const row of produk.rows) snapshot.produk[row.id] = row.data

        // settings
        const settings = await settingsPromise
        snapshot.setting = {}
        for (const row of settings.rows) snapshot.setting[row.key] = row.value

        if (KV_SYNC_KEYS.length) {
            try {
                const kvRows = await kvPromise
                for (const row of kvRows.rows) {
                    if (!row || !row.key) continue
                    const storedValue = typeof row.value === 'undefined' ? KV_DEFAULTS[row.key] : row.value
                    if (typeof storedValue !== 'undefined') {
                        snapshot[row.key] = cloneJson(storedValue)
                    }
                }
            } catch (e) {
                try { console.error('[DBPG] Failed loading kv_store keys:', e.message) } catch {}
            }

            for (const key of KV_SYNC_KEYS) {
                if (typeof snapshot[key] === 'undefined' && typeof KV_DEFAULTS[key] !== 'undefined') {
                    snapshot[key] = cloneJson(KV_DEFAULTS[key])
                }
            }
        }

        this._data = snapshot
        this._resetPersistedState()
        await this.cleanupExpiredOrders()

        // dynamic tables made by migration (arrays as item, objects as k/v)
        // We won't eagerly load all to keep startup fast.
        return this._data
    }

    async cleanupExpiredOrders() {
        const removedOrders = removeExpiredOrders(this._data && this._data.order)
        if (!removedOrders) return 0

        await query(
            'INSERT INTO kv_store(key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()',
            ['order', JSON.stringify(this._data.order)]
        )
        this.logger.log(`[DBPG] Removed ${removedOrders} expired pending order(s)`)
        return removedOrders
    }

    _resetPersistedState() {
        this._persisted.users = new Map(Object.entries(this._data.users || {}).map(([id, value]) => [id, JSON.stringify(value || {})]))
        this._persisted.produk = new Map(Object.entries(this._data.produk || {}).map(([id, value]) => [id, JSON.stringify(value || {})]))
        this._persisted.kv = new Map(KV_SYNC_KEYS.map((key) => [key, JSON.stringify(
            this._data && typeof this._data[key] !== 'undefined' ? this._data[key] : KV_DEFAULTS[key]
        )]))
    }

    async save() {
        if (this._savePromise) return this._savePromise
        this._savePromise = this._saveDirty()
        try {
            return await this._savePromise
        } finally {
            this._savePromise = null
        }
    }

    async _saveDirty() {
        let hadError = false
        const domains = [
            {
                name: 'users',
                entries: Object.entries(this._data.users || {}),
                sql: (values) => `INSERT INTO users(user_id, saldo, role, data) VALUES ${values.join(',')} ON CONFLICT (user_id) DO UPDATE SET saldo=EXCLUDED.saldo, role=EXCLUDED.role, data=EXCLUDED.data`,
                row: ([id, value], index) => ({
                    values: `($${index},$${index + 1},$${index + 2},$${index + 3})`,
                    params: [id, Number(value && value.saldo || 0), (value && value.role) || 'bronze', JSON.stringify(value || {})],
                }),
            },
            {
                name: 'produk',
                entries: Object.entries(this._data.produk || {}),
                sql: (values) => `INSERT INTO produk(id, name, price, stock, data) VALUES ${values.join(',')} ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, stock=EXCLUDED.stock, data=EXCLUDED.data`,
                row: ([id, value], index) => ({
                    values: `($${index},$${index + 1},$${index + 2},$${index + 3},$${index + 4})`,
                    params: [id, (value && (value.name || value.nama)) || null, Number(value && (value.price || value.harga) || 0), Number(value && (value.stock || (value.stok ? value.stok.length : 0)) || 0), JSON.stringify(value || {})],
                }),
            },
        ]

        for (const domain of domains) {
            const dirty = domain.entries
                .map(([id, value]) => ({ id, value, serialized: JSON.stringify(value || {}) }))
                .filter(({ id, serialized }) => this._persisted[domain.name].get(id) !== serialized)
            for (const chunk of chunkArray(dirty, UPSERT_CHUNK)) {
                const values = []
                const params = []
                let index = 1
                for (const { id, value } of chunk) {
                    const row = domain.row([id, value], index)
                    values.push(row.values)
                    params.push(...row.params)
                    index += row.params.length
                }
                try {
                    await query(domain.sql(values), params)
                    for (const { id, serialized } of chunk) this._persisted[domain.name].set(id, serialized)
                } catch (e) {
                    hadError = true
                    try { console.error(`[DBPG] Failed to persist ${domain.name}:`, e.message) } catch {}
                }
            }
        }

        for (const key of KV_SYNC_KEYS) {
            const value = this._data && typeof this._data[key] !== 'undefined' ? this._data[key] : KV_DEFAULTS[key]
            const serialized = JSON.stringify(value)
            if (this._persisted.kv.get(key) === serialized) continue
            try {
                await query(
                    'INSERT INTO kv_store(key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()',
                    [key, serialized]
                )
                this._persisted.kv.set(key, serialized)
            } catch (e) {
                hadError = true
                try { console.error('[DBPG] Failed to persist kv_store key:', e.message) } catch {}
            }
        }

        return !hadError
    }
}

module.exports = DatabasePG
