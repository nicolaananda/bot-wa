CREATE TABLE IF NOT EXISTS business_orders (
  order_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('saldo','qris','zoom','deposit')),
  user_id TEXT NOT NULL,
  product_id TEXT,
  quantity INTEGER CHECK (quantity IS NULL OR quantity > 0),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('awaiting_payment','pending','processing','delivery_pending','completed','cancelled','expired','manual_review')),
  provider_order_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES business_orders(order_id),
  user_id TEXT NOT NULL, amount NUMERIC(18,2) NOT NULL CHECK (amount <> 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stock_reservations (
  order_id TEXT PRIMARY KEY REFERENCES business_orders(order_id), product_id TEXT NOT NULL,
  items JSONB NOT NULL CHECK (jsonb_typeof(items)='array'), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE delivery_outbox DROP CONSTRAINT IF EXISTS delivery_outbox_status_check;
ALTER TABLE delivery_outbox ADD CONSTRAINT delivery_outbox_status_check CHECK (status IN ('pending','sending','sent','failed','manual_review'));

CREATE OR REPLACE FUNCTION debit_saldo_reserve_stock(
  p_order_id TEXT, p_user_id TEXT, p_product_id TEXT, p_quantity INTEGER, p_amount NUMERIC
) RETURNS TABLE(new_saldo NUMERIC, new_stock INTEGER, reserved_items JSONB) LANGUAGE plpgsql AS $$
DECLARE v_product JSONB; v_stock JSONB;
BEGIN
  IF p_quantity < 1 OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid purchase' USING ERRCODE='22023'; END IF;
  INSERT INTO business_orders(order_id,kind,user_id,product_id,quantity,amount,status)
  VALUES(p_order_id,'saldo',p_user_id,p_product_id,p_quantity,p_amount,'processing') ON CONFLICT (order_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT u.saldo, p.stock, r.items FROM business_orders o
      JOIN users u ON u.user_id=o.user_id JOIN produk p ON p.id=o.product_id
      JOIN stock_reservations r ON r.order_id=o.order_id
      WHERE o.order_id=p_order_id AND o.user_id=p_user_id AND o.product_id=p_product_id
        AND o.quantity=p_quantity AND o.amount=p_amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'order idempotency conflict' USING ERRCODE='23505'; END IF;
    RETURN;
  END IF;
  PERFORM 1 FROM users WHERE user_id=p_user_id FOR UPDATE;
  SELECT COALESCE(data,'{}'::jsonb) INTO v_product FROM produk WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient stock' USING ERRCODE='P0001'; END IF;
  v_stock := COALESCE(v_product->'stok','[]'::jsonb);
  IF jsonb_typeof(v_stock) <> 'array' OR jsonb_array_length(v_stock) < p_quantity THEN RAISE EXCEPTION 'insufficient stock' USING ERRCODE='P0001'; END IF;
  UPDATE users SET saldo=saldo-p_amount WHERE user_id=p_user_id AND saldo >= p_amount RETURNING saldo INTO new_saldo;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance' USING ERRCODE='P0001'; END IF;
  SELECT jsonb_agg(value ORDER BY ord) INTO reserved_items FROM jsonb_array_elements(v_stock) WITH ORDINALITY s(value,ord) WHERE ord <= p_quantity;
  SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO v_stock FROM jsonb_array_elements(v_stock) WITH ORDINALITY s(value,ord) WHERE ord > p_quantity;
  new_stock := jsonb_array_length(v_stock);
  v_product := jsonb_set(jsonb_set(v_product,'{stok}',v_stock),'{terjual}',to_jsonb(COALESCE((v_product->>'terjual')::integer,0)+p_quantity));
  UPDATE produk SET data=v_product,stock=new_stock,updated_at=now() WHERE id=p_product_id;
  INSERT INTO wallet_ledger(order_id,user_id,amount) VALUES(p_order_id,p_user_id,-p_amount);
  INSERT INTO stock_reservations(order_id,product_id,items) VALUES(p_order_id,p_product_id,reserved_items);
  UPDATE business_orders SET status='delivery_pending',updated_at=now() WHERE order_id=p_order_id;
  RETURN NEXT;
END $$;
