-- Deduplicate appointment_steps and enforce one row per appointment.
-- Run once in Supabase SQL editor.

with ranked as (
  select
    ctid,
    appointment_id,
    row_number() over (
      partition by appointment_id
      order by updated_at desc nulls last, done_at desc nulls last, created_at desc nulls last, ctid desc
    ) as rn
  from appointment_steps
)
delete from appointment_steps t
using ranked r
where t.ctid = r.ctid
  and r.appointment_id is not null
  and r.rn > 1;

create unique index if not exists appointment_steps_appointment_id_unique
  on appointment_steps (appointment_id);
