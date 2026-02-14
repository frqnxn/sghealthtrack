-- Enforce unique OR numbers for completed payments
-- Run once in Supabase SQL editor.

create unique index if not exists payments_or_number_unique
  on payments (or_number)
  where or_number is not null;
