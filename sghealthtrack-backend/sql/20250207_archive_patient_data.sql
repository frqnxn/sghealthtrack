-- Add archive markers for patient data retention (5 years)
-- Run once in Supabase SQL editor.

alter table if exists profiles add column if not exists archived_at timestamptz;
alter table if exists patient_profiles add column if not exists archived_at timestamptz;
alter table if exists appointments add column if not exists archived_at timestamptz;
alter table if exists appointment_steps add column if not exists archived_at timestamptz;
alter table if exists appointment_requirements add column if not exists archived_at timestamptz;
alter table if exists appointment_notes add column if not exists archived_at timestamptz;
alter table if exists appointment_triage add column if not exists archived_at timestamptz;
alter table if exists vitals add column if not exists archived_at timestamptz;
alter table if exists lab_results add column if not exists archived_at timestamptz;
alter table if exists xray_results add column if not exists archived_at timestamptz;
alter table if exists doctor_reports add column if not exists archived_at timestamptz;
alter table if exists payments add column if not exists archived_at timestamptz;
alter table if exists notifications add column if not exists archived_at timestamptz;
-- admin_patient_summary is a view in Supabase, so it cannot be altered.
alter table if exists activity_logs add column if not exists archived_at timestamptz;
