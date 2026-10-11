# Snapshot persistence fixes — staged only

Base: 954d2ac. No schema migration, profit calculation change, or historical repair.

## Root causes and scope

- `DatabasePG.load()` replaces the snapshot without `sewa`; main initializes it only after its initial async load. The expiry timer and later reloads therefore encounter a missing map. Publish/preserve the runtime map and make both sewa readers tolerate unavailable snapshots without resetting rental state.
- The `index.js` saldo buy path calls `debitSaldoReserveStock()` (transactional SQL debit/reservation), then assigned `new_saldo` to RAM and sliced RAM stock. Neither persistence baseline advanced. Dirty save therefore applies another wallet delta and attempts inventory CAS against pre-purchase SQL JSON. The wallet trigger correctly rejects a second debit when available funds would be violated; with enough funds the same defect can double-debit. Remove the post-commit wallet assignment, matching the existing `options/db-helper.js` SQL-writer contract. Read authoritative product JSON and adopt it only if no local edit intervened. Do not replay the purchase or infer remaining accounts from stale RAM. Cache-read failure does not block committed delivery.
- Load normalizes legacy price fields but previously used normalized JSON as the SQL CAS baseline. Retain exact raw JSON separately until a confirmed write replaces it. A chunk can update some products while rejecting another; `RETURNING p.id` advances only confirmed rows before raising the conflict. Genuine conflicts remain errors, never overwrite newer SQL state.

Writer audit: `reserveProductStock`, `pickProductStock`, `addProductStock`, and `clearProductStock` already advance product baselines after SQL commit; raw baseline is now invalidated there too. Owner legacy product edits still use CAS. Dashboard product mutations operate in SQL. `updateUserSaldo` intentionally does not copy SQL balances into dirty RAM. Legacy service wallet mutators were not called from the command directory. The old deposit RAM-credit listener remains in source but is not registered and polling is disabled (existing source regression verifies this); no deposit rewrite included.

This prevents new poisoning. It does NOT reconcile already-dirty live memory, refund possible past double-debits, repair ambiguous transactions, or make stale owner edits safe to replay. Timestamp-free logs cannot establish which historical purchases were affected. No live business rows were queried or changed for this artifact.

## Verified checks

- Baseline: 42 unit suites, 201 tests passed.
- Green: 44 unit suites, 208 tests passed.
- `node node_modules/jest/bin/jest.js tests/unit --runInBand --testPathIgnorePatterns midtrans-charge.test.js`
- `node lib/otp-wallet.js --self-test`: passed, including ambiguous-write no-retry checks.
- `node tests/snapshot-persistence.pg.js`: passed against local PostgreSQL using only session TEMP tables, `search_path=pg_temp`, BEGIN/ROLLBACK. No application credentials loaded. Requires local peer access as postgres; when launched as root the fixture drops its uid before connecting.
- Existing `midtrans-charge.test.js` is a standalone script, not a Jest suite; intentionally excluded. Baseline and green emit the same Node localStorage warning and expected negative payment-service logs.

## Deployment gate — do not restart blindly

There is no verified built-in ingress drain in this revision. `options/graceful-shutdown.js` cancels timeouts, flushes snapshots, closes Redis and exits after at most five seconds; it does not wait for handlers/delivery workers. PM2 id 0 is a launcher, not the bot child. A PM2 restart or graceful signal is NOT a quiescence mechanism, and flushing poisoned pre-fix wallet RAM can cause another debit attempt.

Deployment remains blocked until an operator establishes a controlled maintenance window or a separately tested ingress gate:

1. Suspend NEW purchase/deposit commands and owner wallet/catalog mutations at the upstream command ingress; keep verified payment callbacks and existing fulfillment processing running. Confirm the gate on the actual transport; no assumed maintenance flag exists here. Do not drop/ACK callbacks without durable storage.
2. Read aggregate counts and inspect unresolved orders privately: business_orders awaiting_payment/pending/processing/delivery_pending/manual_review; legacy kv_store order/orderDeposit; payment webhook work; delivery outbox pending/sending/uncertain; OTP purchasing/uncertain; Zoom create claims. Wait for legitimate orders and workers to settle. Expired or manual-review rows need explicit operator decisions, never auto-cancel/backfill/resend as deployment cleanup.
3. Require zero active command handlers over a sustained interval (child `[PERF] active`, not launcher metrics), no in-flight provider calls or delivery claims, and either no pending orders or verified durable restart representation. Existing `p0Store.assertSchemaReady()` / `assertBackfillReady()` reads can validate representation; do NOT invoke backfill with `--apply`. These checks do not themselves pause ingress/workers.
4. Resolve how to stop the OLD process without replaying poisoned wallet deltas. Ordinary shutdown calls `db.save()`. Reconcile pending legacy RAM deltas against durable evidence before any flush; do not copy RAM balances to SQL, reset wallet baselines blindly, or force-kill active work. If safe shutdown cannot be established, postpone deployment and build a separately reviewed drain/stop mechanism.
5. After explicit deployment authorization and proven quiescence, install this commit, start exactly one bot child, verify startup schema/readiness and fresh baseline load, then reopen ingress. Observe fresh timestamped persistence errors and aggregate order/outbox progress. Do not resend accounts to verify.

No restart, push, production source edit, balance adjustment, backfill, or real message send was performed. Actual active-order counts were not sampled; deployment readiness is not asserted.
