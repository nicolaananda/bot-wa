ALTER TABLE delivery_outbox ADD COLUMN IF NOT EXISTS provider_receipt JSONB;
ALTER TABLE delivery_outbox ADD COLUMN IF NOT EXISTS error_class TEXT;
ALTER TABLE delivery_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

UPDATE delivery_outbox SET status='manual_review',claim_token=NULL,
  last_error='ambiguous_send_timeout',error_class='ambiguous'
WHERE status='sending' AND claimed_at < now()-interval '5 minutes';

UPDATE delivery_outbox SET payload='{}'::jsonb WHERE status='sent' AND payload <> '{}'::jsonb;

CREATE TABLE IF NOT EXISTS legacy_pending_backfill (
  legacy_kind TEXT NOT NULL, legacy_key TEXT NOT NULL, order_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('imported','conflict','insufficient_identity')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (legacy_kind,legacy_key)
);

CREATE TABLE IF NOT EXISTS legacy_pending_backfill_runs (
  fingerprint TEXT PRIMARY KEY,
  eligible_count INTEGER NOT NULL CHECK (eligible_count >= 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
