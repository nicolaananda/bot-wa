# OTP Activation

The implementation is offline-tested, not production-activated. No migration or provider purchase is performed by the tests.

## Deployment Gate

1. Stop all bot, dashboard, worker, and other wallet writers. Flush successful pending saves before stopping. If a wallet save outcome is unknown, reconcile SQL against transactions first; do not replay its delta.
2. Back up PostgreSQL and verify restoration in an isolated database. Reconcile bare-number and `@s.whatsapp.net` user records manually. OTP spends only the canonical WhatsApp row; never sum duplicate balances blindly.
3. Test the OTP DDL from `options/schema.sql` in an isolated database, then apply only the `otp_orders`, active-user unique index, `protect_otp_wallet_debit`, and `users_otp_wallet_debit` definitions inside one explicit transaction with all writers stopped. Do not blindly run the entire schema: it contains unrelated webhook updates and deletion. Existing conflicting orders or schema definitions require inspection, not automatic repair.
4. Verify the unique index is valid and has the expected active-state predicate, and the enabled trigger uses the expected function. Test concurrent reservation and wallet debit transactions on the isolated database. Runtime schema checks only check installation markers, not the full schema definition.
5. Deploy all wallet writers together. Never run the old absolute snapshot saver alongside the new delta saver. Confirm PostgreSQL mode (`USE_PG=true`), canonical balances, wallet reads, and successful database loading before accepting purchases.
6. Set `OTPCEPAT_API_KEY` to a newly issued, non-leaked key through the deployment secret mechanism. It is the only OTP credential source. Restart the bot and verify polling health. No live purchase is part of activation verification here.

## Commands

- `#buy otp id gopay`: cheapest exact matching service, immediate purchase without confirmation.
- `#otp` or `#otp menu`: countries and usage.
- `#otp <country>`: service list and prices.
- `#otp cek`, `#otp resend`, `#otp batal`, `#otp selesai`: manage the current order in private chat.
- `#ceksaldo`: existing WhatsApp wallet available balance, excluding unresolved purchase reservations.
- `#getBalance`: provider OTPCepat balance, owner-only in private chat; never includes email or API key.

## Recovery Limits

- Unknown purchase outcomes retain the reservation and block another OTP order. Never retry `get_order`. Without a provider order ID, manual provider reconciliation is required; automatic deadline cancellation is impossible.
- Known orders are polled from persisted state every 15 seconds. At 20 minutes without OTP, cancellation is requested; outages or a busy sequential poll can delay it. Resend never changes the deadline. Refund requires confirmed `Cancel` and no previously observed OTP.
- Number and price are persisted before the atomic debit. A price increase or invalid provider price requests cancellation and never debits above the reserved quote. If OTP already arrived, no refund is issued; provider price differences require admin reconciliation.
- SMS delivery is at-least-once: a crash after WhatsApp delivery but before notice acknowledgment can duplicate the notification, not the debit or refund.
- Regular buy and Zoom debit reconciliation records use `type=wallet_reconciliation` and separate `-DEBIT` references in `transaksi`. They are evidence, not an atomic debit ledger. Pending/unconfirmed records need manual review; no automatic replay or refund. Reports should exclude these zero-accounting-amount records from sales counts. A Zoom meeting may remain allocated when debit is unconfirmed; its identifiers are retained for cleanup.
- Other legacy snapshot consumers may display stale balances. New spending paths must use conditional SQL debits before delivery, not snapshot checks. Direct SQL hold changes, user deletion, disabled triggers, and old processes are outside the safety contract.

## Offline Checks

```sh
node lib/otp-self-test.js
node lib/otp-wallet.js --self-test
node tests/unit/index-wallet-regression.test.js
./node_modules/.bin/jest --runInBand tests/unit/database-dirty-save.test.js tests/unit/index-wallet-regression.test.js
git diff --check
```

The checks use mocks and do not establish real PostgreSQL concurrency correctness or provider availability.
