-- Parents can read academic calendar dates for their children's classes
-- plus school-wide / academics-office dates (class_code is null).
-- Run after 0041_teacher_dashboard.sql (safe to re-run).

begin;

drop policy if exists academic_dates_parent on public.academic_dates;
create policy academic_dates_parent on public.academic_dates
  for select to authenticated
  using (
    exists (
      select 1 from public.fee_terms t
      where t.id = academic_dates.term_id and t.is_current
    )
    and exists (select 1 from public.my_student_ids())
    and (
      class_code is null
      or exists (
        select 1 from public.students s
        where s.id in (select public.my_student_ids())
          and s.class_code = academic_dates.class_code
          and coalesce(s.stream, '') = coalesce(academic_dates.stream, '')
      )
    )
  );

commit;
