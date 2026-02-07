-- Allow patients to insert/update their own appointment_requirements rows.
-- Run this in Supabase SQL editor.

-- Ensure RLS is enabled
alter table public.appointment_requirements enable row level security;

-- Allow insert when the appointment belongs to the authenticated patient
create policy "appointment_requirements_insert_own"
on public.appointment_requirements
for insert
with check (
  exists (
    select 1
    from public.appointments a
    where a.id = appointment_requirements.appointment_id
      and a.patient_id = auth.uid()
  )
);

-- Allow update when the appointment belongs to the authenticated patient
create policy "appointment_requirements_update_own"
on public.appointment_requirements
for update
using (
  exists (
    select 1
    from public.appointments a
    where a.id = appointment_requirements.appointment_id
      and a.patient_id = auth.uid()
  )
);
