#!/usr/bin/env node
require('dotenv').config();
const { query } = require('../config/postgres');

async function main() {
  try {
    const before = await query("SELECT COUNT(*)::int AS c, COUNT(DISTINCT ref_id) FILTER (WHERE ref_id IS NOT NULL)::int AS d FROM transaksi");
    console.log('[dedup] before:', before.rows[0]);

    // Remove duplicates by keeping the greatest id per ref_id
    await query(`
      WITH dups AS (
        SELECT id, ref_id,
               ROW_NUMBER() OVER (PARTITION BY ref_id ORDER BY id DESC) AS rn
        FROM transaksi
        WHERE ref_id IS NOT NULL
      )
      DELETE FROM transaksi t
      USING dups
      WHERE t.id = dups.id AND dups.rn > 1;
    `);

    const after = await query("SELECT COUNT(*)::int AS c, COUNT(DISTINCT ref_id) FILTER (WHERE ref_id IS NOT NULL)::int AS d FROM transaksi");
    console.log('[dedup] after:', after.rows[0]);

    // Create unique index if not exists
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_transaksi_ref_id'
        ) THEN
          CREATE UNIQUE INDEX uniq_transaksi_ref_id ON transaksi((ref_id)) WHERE ref_id IS NOT NULL;
        END IF;
      END $$;
    `);

    console.log('✅ Dedup complete and unique index ensured');
  } catch (e) {
    console.error('❌ Dedup failed:', e);
    process.exit(1);
  }
}

if (require.main === module) main();


