/**
 * Zoom 100p purchase pricing.
 *
 * Rules (flat for all roles):
 *   - 1 jam  -> Rp 2.000
 *   - 2 jam  -> Rp 4.000
 *   - 3 jam  -> Rp 6.000
 *   - >=4 jam -> Rp 8.000 (dihitung 1 hari)
 *   - 1 hari+ -> Rp 8.000 per hari
 *
 * Non-integer minute inputs are rounded UP to the nearest hour, so 30 menit
 * = 1 jam (2k) and 90 menit = 2 jam (4k).
 *
 * Env overrides:
 *   ZOOM_BUY_PRICE_PER_HOUR   default 2000
 *   ZOOM_BUY_PRICE_PER_DAY    default 8000
 *   ZOOM_BUY_DAY_THRESHOLD_H  default 4   (jam ke berapa mulai counted as 1 day)
 */

const DEFAULT_PRICE_PER_HOUR = 2000
const DEFAULT_PRICE_PER_DAY = 8000
const DEFAULT_DAY_THRESHOLD_HOURS = 4

function getConfig() {
    const perHour = Number(process.env.ZOOM_BUY_PRICE_PER_HOUR || DEFAULT_PRICE_PER_HOUR) || DEFAULT_PRICE_PER_HOUR
    const perDay = Number(process.env.ZOOM_BUY_PRICE_PER_DAY || DEFAULT_PRICE_PER_DAY) || DEFAULT_PRICE_PER_DAY
    const dayThresholdHours = Number(process.env.ZOOM_BUY_DAY_THRESHOLD_H || DEFAULT_DAY_THRESHOLD_HOURS) || DEFAULT_DAY_THRESHOLD_HOURS
    return { perHour, perDay, dayThresholdHours }
}

/**
 * @param {number} durationMinutes
 * @param {boolean} [isFullDay]  hint from parser when user used "hari" unit
 * @returns {{
 *   price: number,
 *   billedUnit: 'hour' | 'day',
 *   billedQty: number,        // jumlah jam atau jumlah hari yang ditagih
 *   breakdown: string,        // e.g. "2 jam x Rp 2.000 = Rp 4.000"
 * }}
 */
function calculatePrice(durationMinutes, isFullDay = false) {
    const cfg = getConfig()
    const mins = Math.max(1, Math.round(Number(durationMinutes) || 0))

    // Kalau user eksplisit pakai satuan hari -> langsung hitung per hari
    if (isFullDay) {
        const days = Math.max(1, Math.ceil(mins / (60 * 24)))
        return {
            price: days * cfg.perDay,
            billedUnit: 'day',
            billedQty: days,
            breakdown:
                days === 1
                    ? `1 hari x Rp ${cfg.perDay.toLocaleString('id-ID')} = Rp ${(days * cfg.perDay).toLocaleString('id-ID')}`
                    : `${days} hari x Rp ${cfg.perDay.toLocaleString('id-ID')} = Rp ${(days * cfg.perDay).toLocaleString('id-ID')}`,
        }
    }

    // Duration dalam jam (round up)
    const hours = Math.max(1, Math.ceil(mins / 60))

    // Kalau >= threshold (default 4 jam) -> counted as 1 hari
    if (hours >= cfg.dayThresholdHours) {
        // Kalau sangat lama (misal 30 jam), hitung per 24 jam
        const asDays = hours >= 24 ? Math.ceil(hours / 24) : 1
        return {
            price: asDays * cfg.perDay,
            billedUnit: 'day',
            billedQty: asDays,
            breakdown:
                asDays === 1
                    ? `${hours} jam → dihitung 1 hari = Rp ${cfg.perDay.toLocaleString('id-ID')}`
                    : `${hours} jam → dihitung ${asDays} hari x Rp ${cfg.perDay.toLocaleString('id-ID')} = Rp ${(asDays * cfg.perDay).toLocaleString('id-ID')}`,
        }
    }

    return {
        price: hours * cfg.perHour,
        billedUnit: 'hour',
        billedQty: hours,
        breakdown: `${hours} jam x Rp ${cfg.perHour.toLocaleString('id-ID')} = Rp ${(hours * cfg.perHour).toLocaleString('id-ID')}`,
    }
}

function describeRates() {
    const cfg = getConfig()
    return {
        perHour: cfg.perHour,
        perDay: cfg.perDay,
        dayThresholdHours: cfg.dayThresholdHours,
        text:
            `• 1 jam = Rp ${cfg.perHour.toLocaleString('id-ID')}\n` +
            `• 2 jam = Rp ${(2 * cfg.perHour).toLocaleString('id-ID')}\n` +
            `• 3 jam = Rp ${(3 * cfg.perHour).toLocaleString('id-ID')}\n` +
            `• ${cfg.dayThresholdHours}+ jam (sampai 1 hari) = Rp ${cfg.perDay.toLocaleString('id-ID')}\n` +
            `• 1 hari = Rp ${cfg.perDay.toLocaleString('id-ID')}`,
    }
}

module.exports = {
    calculatePrice,
    describeRates,
    getConfig,
}
