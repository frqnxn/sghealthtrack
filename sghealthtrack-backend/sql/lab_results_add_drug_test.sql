-- Add missing lab_results columns used by the updated form slip
alter table public.lab_results
  add column if not exists drug_test text;
