-- Allow admins to read appointment_requirements (Form Slip status + tests)
-- Run in Supabase SQL editor.
alter table public.appointment_requirements enable row level security;

drop policy if exists "admin_can_read_appointment_requirements" on public.appointment_requirements;

create policy "admin_can_read_appointment_requirements"
on public.appointment_requirements
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);
