-- Allow patients to read their own appointment_requirements rows
alter table public.appointment_requirements enable row level security;

drop policy if exists "patient_can_read_own_appointment_requirements" on public.appointment_requirements;

create policy "patient_can_read_own_appointment_requirements"
on public.appointment_requirements
for select
using (
  appointment_id in (
    select id from public.appointments where patient_id = auth.uid()
  )
);
