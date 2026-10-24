-- Soft-archive teachers so homework, resources, schemes, and markbooks stay on the system.
-- Run after 0043_teacher_initials.sql (safe to re-run).

begin;

alter table public.teaching_staff
  add column if not exists deleted_at timestamptz;

comment on column public.teaching_staff.deleted_at is
  'When set, the teacher is removed from the staff roll but their past work remains.';

create index if not exists teaching_staff_active_idx
  on public.teaching_staff (full_name)
  where deleted_at is null and active;

commit;
