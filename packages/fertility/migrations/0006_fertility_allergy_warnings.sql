-- Prescribe-time allergy advisory (docs/01 §E8, ADR-0060). Additive, forward-only.
-- Each stimulation day records the advisory warnings raised when it was charted
-- (drugs whose class matched a recorded patient allergy). Advisory only — never a
-- block. Defaults to an empty array for existing rows.
ALTER TABLE fertility.stim_day ADD COLUMN IF NOT EXISTS allergy_warnings jsonb NOT NULL DEFAULT '[]';
