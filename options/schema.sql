-- Core tables derived from the legacy JSON schema structure
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  saldo NUMERIC(18,2) NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'bronze',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaksi (
  id SERIAL PRIMARY KEY,
  ref_id TEXT,
  user_id TEXT,
  amount NUMERIC(18,2),
  status TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure ref_id uniqueness to prevent duplicate imports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_transaksi_ref_id'
  ) THEN
    CREATE UNIQUE INDEX uniq_transaksi_ref_id ON transaksi((ref_id)) WHERE ref_id IS NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS produk (
  id TEXT PRIMARY KEY,
  name TEXT,
  price NUMERIC(18,2),
  stock INTEGER,
  data JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Generic key-value catch-all for other top-level maps
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers to maintain updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS produk_updated_at ON produk;
CREATE TRIGGER produk_updated_at BEFORE UPDATE ON produk
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Midtrans Webhook Notifications table
CREATE TABLE IF NOT EXISTS midtrans_webhooks (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  transaction_id TEXT,
  transaction_status TEXT NOT NULL,
  payment_type TEXT,
  gross_amount NUMERIC(18,2) NOT NULL,
  settlement_time TIMESTAMPTZ,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  webhook_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index untuk query yang cepat
CREATE INDEX IF NOT EXISTS idx_midtrans_webhooks_processed ON midtrans_webhooks(processed, created_at);
CREATE INDEX IF NOT EXISTS idx_midtrans_webhooks_order_id ON midtrans_webhooks(order_id);
CREATE INDEX IF NOT EXISTS idx_midtrans_webhooks_gross_amount ON midtrans_webhooks(gross_amount);

-- Web POS PIN table
CREATE TABLE IF NOT EXISTS web_pos_pin (
  user_id TEXT PRIMARY KEY,
  pin TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS web_pos_pin_updated_at ON web_pos_pin;
CREATE TRIGGER web_pos_pin_updated_at BEFORE UPDATE ON web_pos_pin
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


