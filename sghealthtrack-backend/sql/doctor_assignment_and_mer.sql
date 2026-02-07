-- Doctor assignment + MER enforcement
-- Run in Supabase SQL editor (review before applying).

-- === Profiles: doctor metadata ===
alter table public.profiles
  add column if not exists prc_license_no text,
  add column if not exists is_active boolean default true;

-- === Appointments: doctor assignment fields ===
alter table public.appointments
  add column if not exists assigned_doctor_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by_admin_id uuid references public.profiles(id);

create index if not exists appointments_assigned_doctor_id_idx
  on public.appointments(assigned_doctor_id);

-- === Doctor reports (MER) additions ===
alter table public.doctor_reports
  add column if not exists report_status text default 'draft',
  add column if not exists released_at timestamptz;

-- Enforce doctor_reports.doctor_id == appointments.assigned_doctor_id
create or replace function public.enforce_doctor_report_assignment()
returns trigger
language plpgsql
as $$
declare
  appt_doctor uuid;
begin
  select assigned_doctor_id
    into appt_doctor
  from public.appointments
  where id = new.appointment_id;

  if new.doctor_id is null then
    raise exception 'Doctor report must include doctor_id';
  end if;

  if appt_doctor is not null and new.doctor_id <> appt_doctor then
    raise exception 'Doctor report doctor_id must match appointment assigned_doctor_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_doctor_report_assignment on public.doctor_reports;
create trigger trg_doctor_report_assignment
before insert or update on public.doctor_reports
for each row execute function public.enforce_doctor_report_assignment();

-- === RLS policies (enable if using RLS) ===
alter table public.appointments enable row level security;
alter table public.doctor_reports enable row level security;
alter table public.appointment_steps enable row level security;
alter table public.lab_results enable row level security;
alter table public.xray_results enable row level security;
alter table public.appointment_triage enable row level security;
alter table public.vitals enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "admin_all_appointments" on public.appointments;
create policy "admin_all_appointments"
on public.appointments
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "doctor_read_assigned_appointments" on public.appointments;
create policy "doctor_read_assigned_appointments"
on public.appointments
for select
using (assigned_doctor_id = auth.uid() or assigned_doctor_id is null);

drop policy if exists "doctor_reports_doctor_select" on public.doctor_reports;
create policy "doctor_reports_doctor_select"
on public.doctor_reports
for select
using (doctor_id = auth.uid());

drop policy if exists "doctor_reports_doctor_write" on public.doctor_reports;
create policy "doctor_reports_doctor_write"
on public.doctor_reports
for insert
with check (
  doctor_id = auth.uid()
  and exists (
    select 1 from public.appointments a
    where a.id = doctor_reports.appointment_id
      and (a.assigned_doctor_id = auth.uid() or a.assigned_doctor_id is null)
  )
);

drop policy if exists "doctor_reports_doctor_update" on public.doctor_reports;
create policy "doctor_reports_doctor_update"
on public.doctor_reports
for update
using (doctor_id = auth.uid())
with check (doctor_id = auth.uid());

drop policy if exists "doctor_steps_assigned_select" on public.appointment_steps;
create policy "doctor_steps_assigned_select"
on public.appointment_steps
for select
using (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_steps.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
);

drop policy if exists "doctor_steps_assigned_update" on public.appointment_steps;
create policy "doctor_steps_assigned_update"
on public.appointment_steps
for update
using (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_steps.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_steps.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
);

drop policy if exists "doctor_lab_assigned_select" on public.lab_results;
create policy "doctor_lab_assigned_select"
on public.lab_results
for select
using (
  exists (
    select 1 from public.appointments a
    where a.id = lab_results.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
);

drop policy if exists "doctor_lab_assigned_update" on public.lab_results;
create policy "doctor_lab_assigned_update"
on public.lab_results
for update
using (
  exists (
    select 1 from public.appointments a
    where a.id = lab_results.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.appointments a
    where a.id = lab_results.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
);

drop policy if exists "doctor_xray_assigned_select" on public.xray_results;
create policy "doctor_xray_assigned_select"
on public.xray_results
for select
using (
  exists (
    select 1 from public.appointments a
    where a.id = xray_results.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
);

drop policy if exists "doctor_triage_assigned_select" on public.appointment_triage;
create policy "doctor_triage_assigned_select"
on public.appointment_triage
for select
using (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_triage.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
);

drop policy if exists "doctor_vitals_assigned_select" on public.vitals;
create policy "doctor_vitals_assigned_select"
on public.vitals
for select
using (
  exists (
    select 1 from public.appointments a
    where a.id = vitals.appointment_id
      and a.assigned_doctor_id = auth.uid()
  )
);

drop policy if exists "admin_can_read_profiles" on public.profiles;
create policy "admin_can_read_profiles"
on public.profiles
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "doctor_can_read_own_profile" on public.profiles;
create policy "doctor_can_read_own_profile"
on public.profiles
for select
using (id = auth.uid());

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
on public.profiles
for select
using (
  id = auth.uid()
  or email = (auth.jwt() ->> 'email')
);

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert"
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());
