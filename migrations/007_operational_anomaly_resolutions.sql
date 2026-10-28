CREATE TABLE IF NOT EXISTS operational_anomaly_resolutions (
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('delivery_outbox','midtrans_webhook')),
  anomaly_id BIGINT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('owner_closed_unverified','verified_external','verified_delivered')),
  note TEXT NOT NULL,
  resolved_by TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anomaly_type, anomaly_id)
);

CREATE OR REPLACE FUNCTION protect_operational_anomaly_resolution() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'operational anomaly resolutions are append-only' USING ERRCODE='55000';
END $$;

DROP TRIGGER IF EXISTS operational_anomaly_resolutions_append_only ON operational_anomaly_resolutions;
CREATE TRIGGER operational_anomaly_resolutions_append_only
BEFORE UPDATE OR DELETE ON operational_anomaly_resolutions
FOR EACH ROW EXECUTE FUNCTION protect_operational_anomaly_resolution();
