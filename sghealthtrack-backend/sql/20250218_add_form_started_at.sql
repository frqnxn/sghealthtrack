-- Add form_started_at for appointment requirements
-- Run once in Supabase SQL editor.

alter table if exists appointment_requirements
  add column if not exists form_started_at timestamptz;
