-- Class teachers may keep editing skill_ratings while a developmental sitting is
-- open or submitted. Only office-approved sittings stay locked.
-- Also re-align campus labels so is_class_teacher matches (legacy "main" → Kitante).
-- Safe to re-run. Run after 0077 (+ 0081 / 0082 if those were never applied).

begin;

-- Ensure operational campus helper exists (no-op if 0081 already created it).
create or replace function public.operational_campus(p_campus text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(nullif(btrim(p_campus), ''), '') = any (public.operational_campuses())
      then nullif(btrim(p_campus), '')
    else 'Kitante'
  end;
$$;

revoke all on function public.operational_campus(text) from public;
grant execute on function public.operational_campus(text) to authenticated, service_role;

update public.developmental_assessments
set campus = public.operational_campus(campus)
where campus is distinct from public.operational_campus(campus);

create or replace function public.is_class_teacher(
  p_term uuid,
  p_class text,
  p_stream text,
  p_campus text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_teachers
    where staff_id = public.my_teaching_staff_id()
      and term_id = p_term
      and class_code = p_class
      and stream = coalesce(p_stream, '')
      and public.operational_campus(campus) = public.operational_campus(p_campus)
  );
$$;

revoke all on function public.is_class_teacher(uuid, text, text, text) from public;
grant execute on function public.is_class_teacher(uuid, text, text, text) to authenticated, service_role;

-- Match app rules: submitted remains editable; approved is frozen.
drop policy if exists skill_ratings_teacher_write on public.skill_ratings;
create policy skill_ratings_teacher_write on public.skill_ratings for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.developmental_assessments paper
      where paper.id = skill_ratings.assessment_id
        and paper.status in ('open', 'submitted')
        and public.is_class_teacher(paper.term_id, paper.class_code, paper.stream, paper.campus)
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.developmental_assessments paper
      where paper.id = skill_ratings.assessment_id
        and paper.status in ('open', 'submitted')
        and public.is_class_teacher(paper.term_id, paper.class_code, paper.stream, paper.campus)
    )
  );

-- Keep developmental paper updates aligned (teachers can leave open ↔ submitted).
drop policy if exists developmental_assessments_teacher_update on public.developmental_assessments;
create policy developmental_assessments_teacher_update on public.developmental_assessments for update to authenticated
  using (
    (select public.is_linked_teacher())
    and status in ('open', 'submitted')
    and public.is_class_teacher(term_id, class_code, stream, campus)
  )
  with check (
    (select public.is_linked_teacher())
    and status in ('open', 'submitted')
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

commit;
