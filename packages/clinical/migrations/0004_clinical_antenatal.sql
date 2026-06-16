-- Antenatal record / obstetric continuum (docs/01 §E2 P1): a dated pregnancy with
-- booking data + EDD, and serial antenatal visits with derived risk flags.
-- Additive only (forward-only, docs/PATIENT-DATA.md): two new tables.

CREATE TABLE IF NOT EXISTS clinical.pregnancy (
  id           text PRIMARY KEY,
  patient_id   text NOT NULL,
  lmp          date NOT NULL,
  edd          date NOT NULL,
  gravida      integer NOT NULL,
  para         integer NOT NULL,
  risk_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       text NOT NULL DEFAULT 'active',
  booked_by    text NOT NULL,
  booked_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS pregnancy_patient_idx ON clinical.pregnancy (patient_id);

CREATE TABLE IF NOT EXISTS clinical.antenatal_visit (
  id              text PRIMARY KEY,
  pregnancy_id    text NOT NULL,
  patient_id      text NOT NULL,
  visit_at        timestamptz NOT NULL,
  gestation_weeks integer NOT NULL,
  bp_systolic     integer NOT NULL,
  bp_diastolic    integer NOT NULL,
  fundal_height_cm numeric,
  proteinuria     boolean NOT NULL DEFAULT false,
  presentation    text,
  fetal_heart_rate integer,
  risk_flags      jsonb NOT NULL DEFAULT '[]'::jsonb,
  note            text,
  recorded_by     text NOT NULL
);
CREATE INDEX IF NOT EXISTS antenatal_visit_pregnancy_idx ON clinical.antenatal_visit (pregnancy_id);
