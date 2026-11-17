-- Class teacher signatures for nursery report cards (and other signed sheets).
-- Stored on teaching_staff; uploaded from Academics Staff when assigning lead.
-- Reuses the teacher-photos bucket. Run after 0091. Safe to re-run.

begin;

alter table public.teaching_staff
  add column if not exists signature_path text;

comment on column public.teaching_staff.signature_path is
  'Private storage object path in the teacher-photos bucket (sig-… under staff folder).';

-- Path lookup for the /teacher-signature proxy (office, self, or pupil of their class).
create or replace function public.readable_teacher_signature_path(p_staff uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ts.signature_path
  from public.teaching_staff ts
  where ts.id = p_staff
    and ts.active
    and coalesce(btrim(ts.signature_path), '') <> ''
    and (
      (select public.is_academics_staff())
      or ts.id = (select public.my_teaching_staff_id())
      or exists (
        select 1
        from public.my_class_teachers() t
        where t.staff_id = p_staff
      )
    )
  limit 1;
$$;

comment on function public.readable_teacher_signature_path(uuid) is
  'Returns signature_path when the caller may see that teacher (office, self, or pupil of their class).';

revoke all on function public.readable_teacher_signature_path(uuid) from public;
grant execute on function public.readable_teacher_signature_path(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
