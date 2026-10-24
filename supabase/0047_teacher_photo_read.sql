-- Reliable teacher photo path lookup for the /teacher-photo proxy.
-- Run after 0046_teacher_photos.sql (safe to re-run).

begin;

create or replace function public.readable_teacher_photo_path(p_staff uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ts.photo_path
  from public.teaching_staff ts
  where ts.id = p_staff
    and ts.active
    and coalesce(btrim(ts.photo_path), '') <> ''
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

comment on function public.readable_teacher_photo_path(uuid) is
  'Returns photo_path when the caller may see that teacher (office, self, or pupil of their class).';

revoke all on function public.readable_teacher_photo_path(uuid) from public;
grant execute on function public.readable_teacher_photo_path(uuid) to authenticated;

commit;
