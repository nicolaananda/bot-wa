ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS entry_kind TEXT NOT NULL DEFAULT 'debit'
  CHECK (entry_kind IN ('debit','refund'));
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_order_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_order_entry_kind_key ON wallet_ledger(order_id,entry_kind);

CREATE OR REPLACE FUNCTION claim_zoom_create(
  p_order_id TEXT, p_user_id TEXT, p_host_id TEXT,
  p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ,
  p_capacity INTEGER, p_token UUID, p_amount NUMERIC
) RETURNS zoom_bookings LANGUAGE plpgsql AS $$
DECLARE v_used INTEGER; v_booking zoom_bookings; v_order business_orders;
BEGIN
  IF p_capacity < 1 OR p_ends_at <= p_starts_at OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid zoom create claim' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('zoom:' || p_host_id, 0));
  SELECT * INTO v_booking FROM zoom_bookings WHERE booking_ref=p_order_id FOR UPDATE;
  IF FOUND THEN
    IF v_booking.user_id <> p_user_id THEN RAISE EXCEPTION 'zoom order ownership conflict' USING ERRCODE='23505'; END IF;
    RETURN v_booking;
  END IF;
  INSERT INTO business_orders(order_id,kind,user_id,amount,status)
    VALUES(p_order_id,'zoom',p_user_id,p_amount,'processing') ON CONFLICT (order_id) DO NOTHING;
  SELECT * INTO v_order FROM business_orders WHERE order_id=p_order_id FOR UPDATE;
  IF v_order.user_id <> p_user_id OR v_order.kind <> 'zoom' OR v_order.amount <> p_amount THEN
    RAISE EXCEPTION 'order idempotency conflict' USING ERRCODE='23505';
  END IF;
  IF v_order.status <> 'processing' THEN RETURN NULL; END IF;
  UPDATE users SET saldo=saldo-p_amount WHERE user_id=p_user_id AND saldo >= p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance' USING ERRCODE='P0001'; END IF;
  INSERT INTO wallet_ledger(order_id,user_id,amount,entry_kind)
    VALUES(p_order_id,p_user_id,-p_amount,'debit') ON CONFLICT (order_id,entry_kind) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'zoom debit replay conflict' USING ERRCODE='23505'; END IF;
  SELECT COALESCE(SUM(capacity_units),0) INTO v_used FROM zoom_bookings
    WHERE host_id=p_host_id AND status IN ('reserved','creating','created')
      AND starts_at < p_ends_at AND ends_at > p_starts_at;
  IF v_used + 1 > p_capacity THEN RAISE EXCEPTION 'zoom host capacity exceeded' USING ERRCODE='P0001'; END IF;
  INSERT INTO zoom_bookings(booking_ref,user_id,host_id,starts_at,ends_at,status,claim_token)
    VALUES(p_order_id,p_user_id,p_host_id,p_starts_at,p_ends_at,'creating',p_token)
    RETURNING * INTO v_booking;
  RETURN v_booking;
END $$;
