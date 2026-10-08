CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_fulfillments (
  order_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('order','deposit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivery_pending','completed','failed')),
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_fulfillments_claim_idx ON order_fulfillments(status, claimed_at);

CREATE TABLE delivery_outbox (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES order_fulfillments(order_id),
  destination TEXT NOT NULL,
  payload JSONB NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX delivery_outbox_claim_idx ON delivery_outbox(status, claimed_at, id);

CREATE TABLE payment_correlations (
  provider_order_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('order','deposit')),
  subject_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, subject_id)
);

CREATE TABLE zoom_bookings (
  id BIGSERIAL PRIMARY KEY,
  booking_ref TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity_units INTEGER NOT NULL DEFAULT 1 CHECK (capacity_units > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','confirmed','cancelled','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX zoom_bookings_capacity_idx ON zoom_bookings(host_id, starts_at, ends_at)
  WHERE status IN ('reserved','confirmed');

CREATE OR REPLACE FUNCTION reserve_zoom_booking(
  p_booking_ref TEXT, p_user_id TEXT, p_host_id TEXT,
  p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ,
  p_capacity INTEGER, p_units INTEGER DEFAULT 1
) RETURNS zoom_bookings LANGUAGE plpgsql AS $$
DECLARE v_used INTEGER; v_booking zoom_bookings;
BEGIN
  IF p_capacity < 1 OR p_units < 1 OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid booking reservation' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('zoom:' || p_host_id, 0));
  SELECT COALESCE(SUM(capacity_units), 0) INTO v_used FROM zoom_bookings
   WHERE host_id = p_host_id AND status IN ('reserved','confirmed')
     AND starts_at < p_ends_at AND ends_at > p_starts_at;
  IF v_used + p_units > p_capacity THEN
    RAISE EXCEPTION 'zoom host capacity exceeded' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO zoom_bookings(booking_ref,user_id,host_id,starts_at,ends_at,capacity_units)
  VALUES(p_booking_ref,p_user_id,p_host_id,p_starts_at,p_ends_at,p_units)
  RETURNING * INTO v_booking;
  RETURN v_booking;
END $$;

CREATE OR REPLACE FUNCTION protect_fulfillment_terminal_state() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('processing','delivery_pending','completed')
     AND NEW.status NOT IN ('processing','delivery_pending','completed') THEN
    RAISE EXCEPTION 'protected fulfillment cannot be cancelled or expired' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_fulfillments_protect BEFORE UPDATE OF status ON order_fulfillments
FOR EACH ROW EXECUTE FUNCTION protect_fulfillment_terminal_state();

CREATE OR REPLACE FUNCTION debit_saldo_reserve_stock(
  p_user_id TEXT, p_product_id TEXT, p_quantity INTEGER, p_amount NUMERIC
) RETURNS TABLE(new_saldo NUMERIC, new_stock INTEGER, reserved_items JSONB) LANGUAGE plpgsql AS $$
DECLARE v_product JSONB; v_stock JSONB;
BEGIN
  IF p_quantity < 1 OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid purchase' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM users WHERE user_id=p_user_id FOR UPDATE;
  SELECT COALESCE(data,'{}'::jsonb) INTO v_product FROM produk WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient stock' USING ERRCODE='P0001'; END IF;
  v_stock := COALESCE(v_product->'stok','[]'::jsonb);
  IF jsonb_typeof(v_stock) <> 'array' OR jsonb_array_length(v_stock) < p_quantity THEN
    RAISE EXCEPTION 'insufficient stock' USING ERRCODE='P0001';
  END IF;
  UPDATE users SET saldo=saldo-p_amount WHERE user_id=p_user_id AND saldo >= p_amount RETURNING saldo INTO new_saldo;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance' USING ERRCODE='P0001'; END IF;
  SELECT jsonb_agg(value ORDER BY ord) INTO reserved_items FROM jsonb_array_elements(v_stock) WITH ORDINALITY s(value,ord) WHERE ord <= p_quantity;
  SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO v_stock FROM jsonb_array_elements(v_stock) WITH ORDINALITY s(value,ord) WHERE ord > p_quantity;
  new_stock := jsonb_array_length(v_stock);
  v_product := jsonb_set(v_product,'{stok}',v_stock);
  v_product := jsonb_set(v_product,'{terjual}',to_jsonb(COALESCE((v_product->>'terjual')::integer,0)+p_quantity));
  UPDATE produk SET data=v_product,stock=new_stock,updated_at=now() WHERE id=p_product_id;
  RETURN NEXT;
END $$;
