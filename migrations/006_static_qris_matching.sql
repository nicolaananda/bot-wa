CREATE TABLE static_payment_orders (
  order_id TEXT PRIMARY KEY REFERENCES business_orders(order_id),
  user_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0 AND amount = trunc(amount)),
  marker UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','settled','expired','cancelled','manual_review')),
  expires_at TIMESTAMPTZ NOT NULL,
  settlement_event_key TEXT UNIQUE,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX static_payment_active_amount_unique ON static_payment_orders(amount) WHERE status='awaiting_payment';
CREATE INDEX static_payment_match_idx ON static_payment_orders(amount,expires_at) WHERE status='awaiting_payment';
