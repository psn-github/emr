-- Time-lapse morphokinetic analytics (docs/01 §E4 P2): per-embryo annotation of
-- time-lapse timings with derived intervals, an optimal-range score, and exclusion
-- flags. Additive only (forward-only, docs/PATIENT-DATA.md): a config table + an
-- annotation table, no changes to existing tables.

CREATE TABLE IF NOT EXISTS embryology.morphokinetic_range (
  code        text PRIMARY KEY,
  name_ar     text NOT NULL,
  name_en     text NOT NULL,
  optimal_min numeric NOT NULL,
  optimal_max numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS embryology.morphokinetic_annotation (
  id           text PRIMARY KEY,
  embryo_id    text NOT NULL,
  source       text NOT NULL,
  events       jsonb NOT NULL DEFAULT '{}'::jsonb,
  intervals    jsonb NOT NULL DEFAULT '{}'::jsonb,
  in_range     jsonb NOT NULL DEFAULT '{}'::jsonb,
  score        integer NOT NULL,
  monitored    integer NOT NULL,
  flags        jsonb NOT NULL DEFAULT '[]'::jsonb,
  annotated_by text NOT NULL,
  annotated_at timestamptz NOT NULL,
  note         text
);
CREATE INDEX IF NOT EXISTS morphokinetic_annotation_embryo_idx ON embryology.morphokinetic_annotation (embryo_id);
