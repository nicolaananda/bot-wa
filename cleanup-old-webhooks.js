require('dotenv').config();

/**
 * One-time cleanup script to mark old unprocessed webhooks as processed
 * This prevents old webhooks from matching new deposit/purchase orders
 */

const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';

async function cleanupOldWebhooks() {
    console.log('🧹 Starting webhook cleanup...');
    console.log(`Mode: ${usePg ? 'PostgreSQL' : 'JSON Database'}`);

    if (usePg) {
        // PostgreSQL cleanup
        const pg = require('./config/postgres');

        try {
            // Mark all webhooks older than 1 hour as processed
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

            const result = await pg.query(
                `UPDATE midtrans_webhooks 
         SET processed = true, 
             processed_at = now(),
             webhook_data = jsonb_set(
               COALESCE(webhook_data, '{}'::jsonb),
               '{cleanup_note}',
               '"Auto-processed by cleanup script"'::jsonb
             )
         WHERE processed = false 
           AND created_at < $1
         RETURNING id, order_id, gross_amount, created_at`,
                [oneHourAgo]
            );

            console.log(`✅ Cleaned up ${result.rows.length} old webhooks from PostgreSQL`);

            if (result.rows.length > 0) {
                console.log('\nCleaned webhooks:');
                result.rows.forEach(row => {
                    console.log(`  - Order: ${row.order_id}, Amount: Rp${row.gross_amount}, Created: ${row.created_at}`);
                });
            }
        } catch (error) {
            console.error('❌ Error cleaning up PostgreSQL webhooks:', error.message);
            process.exit(1);
        }
    } else {
        // JSON Database cleanup
        const DatabaseClass = require('./function/database');
        const db = new DatabaseClass();

        try {
            await db.load();

            if (!db.data.midtransWebhooks || !Array.isArray(db.data.midtransWebhooks)) {
                console.log('ℹ️  No webhooks found in JSON database');
                return;
            }

            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            let cleanedCount = 0;

            db.data.midtransWebhooks = db.data.midtransWebhooks.map(webhook => {
                if (!webhook.processed && webhook.timestamp && webhook.timestamp < oneHourAgo) {
                    cleanedCount++;
                    console.log(`  - Order: ${webhook.orderId}, Amount: Rp${webhook.gross_amount}, Timestamp: ${new Date(webhook.timestamp).toISOString()}`);
                    return {
                        ...webhook,
                        processed: true,
                        processedAt: Date.now(),
                        cleanupNote: 'Auto-processed by cleanup script'
                    };
                }
                return webhook;
            });

            if (cleanedCount > 0) {
                await db.save();
                console.log(`✅ Cleaned up ${cleanedCount} old webhooks from JSON database`);
            } else {
                console.log('ℹ️  No old unprocessed webhooks found');
            }
        } catch (error) {
            console.error('❌ Error cleaning up JSON database webhooks:', error.message);
            process.exit(1);
        }
    }

    console.log('\n✅ Cleanup completed successfully!');
}

// Run cleanup
cleanupOldWebhooks()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    });
