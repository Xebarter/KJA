-- Student portal extras: attendance, clubs, teachers, academic calendar.
-- Run after 0029_student_portal.sql (safe to re-run).

begin;

-- ---------------------------------------------------------------- attendance (own rows only)

drop policy if exists attendance_student on public.attendance;
create policy attendance_student on public.attendance
  for select to authenticated
  using (student_id = public.my_student_id());

-- ---------------------------------------------------------------- clubs (read-only for the linked pupil)

drop policy if exists club_consents_student on public.club_consents;
create policy club_consents_student on public.club_consents
  for select to authenticated
  using (student_id = public.my_student_id() and withdrawn_at is null);

drop policy if exists club_payments_student on public.club_payments;
create policy club_payments_student on public.club_payments
  for select to authenticated
  using (voided_at is null and student_id = public.my_student_id());

-- ---------------------------------------------------------------- teachers for the pupil's class / stream

drop policy if exists class_teachers_student on public.class_teachers;
create policy class_teachers_student on public.class_teachers
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.profile_id = auth.uid()
        and s.status = 'active'
        and s.class_code = class_teachers.class_code
        and coalesce(s.stream, '') = coalesce(class_teachers.stream, '')
    )
  );

drop policy if exists subject_teachers_student on public.subject_teachers;
create policy subject_teachers_student on public.subject_teachers
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.profile_id = auth.uid()
        and s.status = 'active'
        and s.class_code = subject_teachers.class_code
        and coalesce(s.stream, '') = coalesce(subject_teachers.stream, '')
    )
  );

drop policy if exists teaching_staff_student on public.teaching_staff;
create policy teaching_staff_student on public.teaching_staff
  for select to authenticated
  using (
    active
    and (select public.is_student())
    and (
      exists (
        select 1
        from public.class_teachers ct
        join public.students s on s.profile_id = auth.uid()
        where ct.staff_id = teaching_staff.id
          and s.status = 'active'
          and s.class_code = ct.class_code
          and coalesce(s.stream, '') = coalesce(ct.stream, '')
      )
      or exists (
        select 1
        from public.subject_teachers st
        join public.students s on s.profile_id = auth.uid()
        where st.staff_id = teaching_staff.id
          and s.status = 'active'
          and s.class_code = st.class_code
          and coalesce(s.stream, '') = coalesce(st.stream, '')
      )
    )
  );

-- ---------------------------------------------------------------- term academic calendar

drop policy if exists academic_dates_student on public.academic_dates;
create policy academic_dates_student on public.academic_dates
  for select to authenticated
  using (
    (select public.is_student())
    and exists (
      select 1 from public.fee_terms t
      where t.id = academic_dates.term_id and t.is_current
    )
  );

commit;
