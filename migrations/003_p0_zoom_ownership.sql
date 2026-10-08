ALTER TABLE zoom_bookings ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE zoom_bookings ADD COLUMN IF NOT EXISTS meeting JSONB;
ALTER TABLE zoom_bookings ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE zoom_bookings DROP CONSTRAINT IF EXISTS zoom_bookings_status_check;
ALTER TABLE zoom_bookings ADD CONSTRAINT zoom_bookings_status_check
  CHECK (status IN ('reserved','creating','created','manual_review','cancelled','expired'));

CREATE OR REPLACE FUNCTION claim_zoom_create(
  p_order_id TEXT, p_user_id TEXT, p_host_id TEXT,
  p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ,
  p_capacity INTEGER, p_token UUID
) RETURNS zoom_bookings LANGUAGE plpgsql AS $$
DECLARE v_used INTEGER; v_booking zoom_bookings;
BEGIN
  IF p_capacity < 1 OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid zoom create claim' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('zoom:' || p_host_id, 0));
  SELECT * INTO v_booking FROM zoom_bookings WHERE booking_ref=p_order_id FOR UPDATE;
  IF FOUND THEN
    IF v_booking.user_id <> p_user_id THEN RAISE EXCEPTION 'zoom order ownership conflict' USING ERRCODE='23505'; END IF;
    RETURN v_booking;
  END IF;
  SELECT COALESCE(SUM(capacity_units),0) INTO v_used FROM zoom_bookings
    WHERE host_id=p_host_id AND status IN ('reserved','creating','created')
      AND starts_at < p_ends_at AND ends_at > p_starts_at;
  IF v_used + 1 > p_capacity THEN RAISE EXCEPTION 'zoom host capacity exceeded' USING ERRCODE='P0001'; END IF;
  INSERT INTO zoom_bookings(booking_ref,user_id,host_id,starts_at,ends_at,status,claim_token)
    VALUES(p_order_id,p_user_id,p_host_id,p_starts_at,p_ends_at,'creating',p_token)
    RETURNING * INTO v_booking;
  RETURN v_booking;
END $$;
