-- 0002_facility_flow — patient-flow & bed board. Forward-only, additive
-- (ADR-0008). PHI: who is where. patient_location holds the CURRENT location
-- (one row per patient); location_movement is append-only transfer history.

CREATE TABLE IF NOT EXISTS facility.patient_location (
  patient_id       text PRIMARY KEY,
  location_node_id text NOT NULL,
  bed_id           text,
  status           text NOT NULL,
  since_at         timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS facility.location_movement (
  id          text PRIMARY KEY,
  patient_id  text NOT NULL,
  from_node_id text,
  to_node_id  text NOT NULL,
  bed_id      text,
  status      text NOT NULL,
  moved_by    text NOT NULL,
  occurred_at timestamptz NOT NULL,
  reason      text
);
CREATE INDEX IF NOT EXISTS location_movement_patient_idx ON facility.location_movement (patient_id);
