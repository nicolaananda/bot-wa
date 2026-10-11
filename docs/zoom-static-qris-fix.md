# Zoom static QRIS fix — isolated, not deployed

Base: 954d2ac4db2e59b8e0629bad63a195b81ae2ce47.

New Zoom QRIS orders now use the existing durable static allocation (unique amount,
marker and database expiry). Context is saved before QR generation. Updating only
message key after send preserves marker and concurrent settlement state. Before-send
failure cancels its allocation; ambiguous send failure retains payable context.
The old timeout stops when a different order replaces its subject.

No migrations, historical repair, webhook replay, production file edits, runtime
reload/restart or business-database access were performed. Manually fulfilled and
cancelled historical orders must not be replayed, marked payable or backfilled.

## Checks

- `node tests/zoom-static-qris.check.js`: exact QRIS caller slice in VM with synthetic
  transport/store only; initial missing-marker regression observed red, then green.
  Covers allocation/save ordering, preserved marker/amount, failed/throwing save,
  rendering failure, missing store, failed allocation, ambiguous send, settlement
  during send, replacement timer, expiry and rejected cancellation.
- `NODE_PATH=/root/me/bot-wa/node_modules node /root/me/bot-wa/node_modules/jest/bin/jest.js --runInBand tests/unit/p0-hardening.test.js tests/unit/midtrans-webhook.test.js`:
  45 passed / 2 suites. Node emits an existing experimental localStorage warning.
- `node --check index.js`; `git diff --check`: passed.

Review performed locally against base, both specification and conventions; no
independent reviewer tool was available. Settlement authentication, strict marker
binding, event uniqueness, time bounds and legacy confirmation remain unchanged.
Shared cancelOrder keeps static allocation reserved until expiry, but its business
status excludes cancelled orders from settlement. Deliberately unchanged shared
behaviour: ambiguous send retains context for payment/manual cancellation; no
post-send timeout is installed on a thrown send. No live DB or provider integration
claim is made by these synthetic tests.

## Deployment gates — do not restart to deploy this patch yet

1. Obtain explicit deployment authorization and pin/review the combined release.
   Snapshot fixes be10a9f/fcbcb63 are separate; this commit does not include them.
   The maintenance worktree at 28aa07e is incomplete, not a deployment mechanism.
2. Prove ingress retention/replay upstream before pausing subscribers. Redis
   pub/sub plus HTTP ACK is not durable buffering. Quiesce command, webhook,
   background and outbox writers; verify in-flight work is drained.
3. Capture a supported coherent export of the OLD process RAM plus dirty baselines.
   Reconcile legitimate unsaved wallet/stock edits separately from SQL-committed
   cache copies. A restart/shutdown that flushes poisoned snapshots can replay
   balances. A new-release drain cannot protect the old process. If export and
   reconciliation cannot be proven, deployment remains blocked.
4. Verify PostgreSQL durability and existing static-QRIS schema readiness without
   running historical backfill/replay. Validate snapshot fixes and startup against
   the exact combined release in an isolated environment first.
5. Only after those gates, perform an authorized controlled replacement, not an
   index.js hot edit/module-cache injection (old closures/workers can survive).
   Verify only a NEW controlled order end-to-end; never reuse historical payments.
