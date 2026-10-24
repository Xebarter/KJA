-- Pupil portal: read class / subject teachers for the linked pupil's stream.
-- Security-definer so stream matching is not blocked by nested RLS.
-- Run after 0030_student_portal_extras.sql (safe to re-run).

begin;

grant execute on function public.is_student() to authenticated;
grant execute on function public.my_student_id() to authenticated;

create or replace function public.my_class_teachers()
returns table (
  staff_id uuid,
  full_name text,
  title text,
  subject_id uuid,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      s.class_code,
      coalesce(nullif(btrim(s.stream), ''), '') as stream
    from public.students s
    where s.profile_id = auth.uid()
      and s.status = 'active'
    limit 1
  ),
  term as (
    select t.id
    from public.fee_terms t
    where t.is_current
    limit 1
  )
  select
    ct.staff_id,
    ts.full_name,
    ts.title,
    null::uuid as subject_id,
    'class'::text as role
  from public.class_teachers ct
  join public.teaching_staff ts on ts.id = ct.staff_id and ts.active
  join me on me.class_code is not null
    and me.class_code = ct.class_code
    and coalesce(nullif(btrim(ct.stream), ''), '') = me.stream
  join term on term.id = ct.term_id
  union all
  select
    st.staff_id,
    ts.full_name,
    ts.title,
    st.subject_id,
    'subject'::text as role
  from public.subject_teachers st
  join public.teaching_staff ts on ts.id = st.staff_id and ts.active
  join me on me.class_code is not null
    and me.class_code = st.class_code
    and coalesce(nullif(btrim(st.stream), ''), '') = me.stream
  join term on term.id = st.term_id;
$$;

comment on function public.my_class_teachers() is
  'Class teacher and subject teachers for the signed-in pupil''s current class stream.';

revoke all on function public.my_class_teachers() from public;
grant execute on function public.my_class_teachers() to authenticated;

-- Keep direct table policies in sync (trim stream; same class/stream rules).
drop policy if exists class_teachers_student on public.class_teachers;
create policy class_teachers_student on public.class_teachers
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.profile_id = auth.uid()
        and s.status = 'active'
        and s.class_code = class_teachers.class_code
        and coalesce(nullif(btrim(s.stream), ''), '') = coalesce(nullif(btrim(class_teachers.stream), ''), '')
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
        and coalesce(nullif(btrim(s.stream), ''), '') = coalesce(nullif(btrim(subject_teachers.stream), ''), '')
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
          and coalesce(nullif(btrim(s.stream), ''), '') = coalesce(nullif(btrim(ct.stream), ''), '')
      )
      or exists (
        select 1
        from public.subject_teachers st
        join public.students s on s.profile_id = auth.uid()
        where st.staff_id = teaching_staff.id
          and s.status = 'active'
          and s.class_code = st.class_code
          and coalesce(nullif(btrim(s.stream), ''), '') = coalesce(nullif(btrim(st.stream), ''), '')
      )
    )
  );

commit;
