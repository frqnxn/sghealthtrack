-- Add pricing totals for appointment requirements form slip
-- Run once in Supabase SQL editor.

alter table if exists appointment_requirements
  add column if not exists package_code text,
  add column if not exists package_price numeric,
  add column if not exists standard_total numeric,
  add column if not exists extra_standard_total numeric,
  add column if not exists total_estimate numeric;
