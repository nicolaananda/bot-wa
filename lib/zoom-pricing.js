/**
 * Zoom meeting purchase pricing — per tier (100p, 300p, 500p, 1000p).
 *
 * Default rules (FLAT for all roles, override via env per-tier):
 *
 *   tier  | per-hour | per-day | day-threshold-hours
 *   100   |  2.000   |  8.000  | 4
 *   300   |  4.000   | 16.000  | 4
 *   500   |  6.000   | 24.000  | 4
 *   1000  | 10.000   | 40.000  | 4
 *
 * Pricing rule: kalau hours >= dayThresholdHours -> dihitung sebagai 1 hari
 * (atau N hari kalau >= 24 jam). Non-integer minute inputs di-round UP ke
 * jam terdekat (30 menit -> 1 jam, 90 menit -> 2 jam).
 *
 * Env override (per tier):
 *   ZOOM_<TIER>_PRICE_PER_HOUR     e.g. ZOOM_100_PRICE_PER_HOUR=2000
 *   ZOOM_<TIER>_PRICE_PER_DAY      e.g. ZOOM_100_PRICE_PER_DAY=8000
 *   ZOOM_<TIER>_DAY_THRESHOLD_H    e.g. ZOOM_100_DAY_THRESHOLD_H=4
 *
 * Legacy fallback (untuk kompatibilitas dengan tier 100 yang lama):
 *   ZOOM_BUY_PRICE_PER_HOUR / ZOOM_BUY_PRICE_PER_DAY / ZOOM_BUY_DAY_THRESHOLD_H
 */

const VALID_TIERS = [100, 300, 500, 1000]

const DEFAULTS = {
    100: { perHour: 2000, perDay: 8000, dayThresholdHours: 4 },
    300: { perHour: 4000, perDay: 16000, dayThresholdHours: 4 },
    500: { perHour: 6000, perDay: 24000, dayThresholdHours: 4 },
    1000: { perHour: 10000, perDay: 40000, dayThresholdHours: 4 },
}

function isValidTier(tier) {
    return VALID_TIERS.includes(Number(tier))
}

function readEnvNumber(key, fallback) {
    const raw = process.env[key]
    if (raw == null || String(raw).trim() === '') return fallback
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : fallback
}

function getConfig(tier = 100) {
    if (!isValidTier(tier)) {
        throw new Error(`Invalid pricing tier: ${tier}. Allowed: ${VALID_TIERS.join(', ')}`)
    }
    const t = Number(tier)
    const def = DEFAULTS[t]

    // Tier-specific env, then legacy env (only for tier 100), then default
    const legacyHour =
        t === 100 ? readEnvNumber('ZOOM_BUY_PRICE_PER_HOUR', def.perHour) : def.perHour
    const legacyDay =
        t === 100 ? readEnvNumber('ZOOM_BUY_PRICE_PER_DAY', def.perDay) : def.perDay
    const legacyThr =
        t === 100
            ? readEnvNumber('ZOOM_BUY_DAY_THRESHOLD_H', def.dayThresholdHours)
            : def.dayThresholdHours

    return {
        tier: t,
        perHour: readEnvNumber(`ZOOM_${t}_PRICE_PER_HOUR`, legacyHour),
        perDay: readEnvNumber(`ZOOM_${t}_PRICE_PER_DAY`, legacyDay),
        dayThresholdHours: readEnvNumber(`ZOOM_${t}_DAY_THRESHOLD_H`, legacyThr),
    }
}

/**
 * @param {number} durationMinutes
 * @param {boolean} [isFullDay]  hint when user's input used "hari" unit
 * @param {number}  [tier]       100|300|500|1000 (default 100)
 * @returns {{
 *   tier: number,
 *   price: number,
 *   billedUnit: 'hour' | 'day',
 *   billedQty: number,
 *   breakdown: string,
 * }}
 */
function calculatePrice(durationMinutes, isFullDay = false, tier = 100) {
    const cfg = getConfig(tier)
    const mins = Math.max(1, Math.round(Number(durationMinutes) || 0))

    const fmt = (n) => n.toLocaleString('id-ID')

    if (isFullDay) {
        const days = Math.max(1, Math.ceil(mins / (60 * 24)))
        const total = days * cfg.perDay
        return {
            tier: cfg.tier,
            price: total,
            billedUnit: 'day',
            billedQty: days,
            breakdown:
                days === 1
                    ? `1 hari x Rp ${fmt(cfg.perDay)} = Rp ${fmt(total)}`
                    : `${days} hari x Rp ${fmt(cfg.perDay)} = Rp ${fmt(total)}`,
        }
    }

    const hours = Math.max(1, Math.ceil(mins / 60))

    if (hours >= cfg.dayThresholdHours) {
        const asDays = hours >= 24 ? Math.ceil(hours / 24) : 1
        const total = asDays * cfg.perDay
        return {
            tier: cfg.tier,
            price: total,
            billedUnit: 'day',
            billedQty: asDays,
            breakdown:
                asDays === 1
                    ? `${hours} jam → dihitung 1 hari = Rp ${fmt(total)}`
                    : `${hours} jam → dihitung ${asDays} hari x Rp ${fmt(cfg.perDay)} = Rp ${fmt(total)}`,
        }
    }

    return {
        tier: cfg.tier,
        price: hours * cfg.perHour,
        billedUnit: 'hour',
        billedQty: hours,
        breakdown: `${hours} jam x Rp ${fmt(cfg.perHour)} = Rp ${fmt(hours * cfg.perHour)}`,
    }
}

function describeRates(tier = 100) {
    const cfg = getConfig(tier)
    const fmt = (n) => n.toLocaleString('id-ID')
    return {
        tier: cfg.tier,
        perHour: cfg.perHour,
        perDay: cfg.perDay,
        dayThresholdHours: cfg.dayThresholdHours,
        text:
            `• 1 jam = Rp ${fmt(cfg.perHour)}\n` +
            `• 2 jam = Rp ${fmt(2 * cfg.perHour)}\n` +
            `• 3 jam = Rp ${fmt(3 * cfg.perHour)}\n` +
            `• ${cfg.dayThresholdHours}+ jam (sampai 1 hari) = Rp ${fmt(cfg.perDay)}\n` +
            `• 1 hari = Rp ${fmt(cfg.perDay)}`,
    }
}

module.exports = {
    VALID_TIERS,
    isValidTier,
    calculatePrice,
    describeRates,
    getConfig,
}
