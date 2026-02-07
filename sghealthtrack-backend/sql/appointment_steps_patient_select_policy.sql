-- Allow patients to read their own appointment_steps rows
alter table public.appointment_steps enable row level security;

drop policy if exists "patient_can_read_own_appointment_steps" on public.appointment_steps;

create policy "patient_can_read_own_appointment_steps"
on public.appointment_steps
for select
using (
  appointment_id in (
    select id from public.appointments where patient_id = auth.uid()
  )
);
