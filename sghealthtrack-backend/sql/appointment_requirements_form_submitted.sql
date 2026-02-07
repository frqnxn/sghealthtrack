alter table if exists appointment_requirements
  add column if not exists form_submitted boolean default false,
  add column if not exists form_submitted_at timestamptz;
