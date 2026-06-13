-- 0001_messaging — secure patient↔clinic messaging (docs/01 §E13). Threads belong
-- to a patient; messages are append-only. Content stays behind authentication
-- (never in notifications). Forward-only, additive (ADR-0008); IF NOT EXISTS
-- keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS messaging;

CREATE TABLE IF NOT EXISTS messaging.message_thread (
  id              text PRIMARY KEY,
  patient_id      text NOT NULL,
  subject         text NOT NULL,
  created_at      timestamptz NOT NULL,
  last_message_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS message_thread_patient_idx ON messaging.message_thread (patient_id);

CREATE TABLE IF NOT EXISTS messaging.message (
  id          text PRIMARY KEY,
  thread_id   text NOT NULL,
  sender_kind text NOT NULL,
  sender_id   text NOT NULL,
  body        text NOT NULL,
  sent_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS message_thread_idx ON messaging.message (thread_id);
