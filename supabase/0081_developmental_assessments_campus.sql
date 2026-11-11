-- Align developmental_assessments.campus with operational campus names
-- (Kitante, Najjanankumbi, Makindye, Bunga). Legacy default was "main",
-- which blocked class-teacher RLS (exact campus match on class_teachers).
-- Safe to re-run.

begin;

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

comment on function public.operational_campus(text) is
  'Maps blank or legacy campus labels (e.g. main) to an operational campus.';

revoke all on function public.operational_campus(text) from public;
grant execute on function public.operational_campus(text) to authenticated, service_role;

-- Backfill papers created with the old default or other non-operational labels.
update public.developmental_assessments
set campus = public.operational_campus(campus)
where campus is distinct from public.operational_campus(campus);

update public.assessments
set campus = public.operational_campus(campus)
where campus is distinct from public.operational_campus(campus);

alter table public.developmental_assessments
  alter column campus set default 'Kitante';

-- Teacher RLS helpers: compare using the same operational campus mapping.
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

create or replace function public.teaches_subject(
  p_term uuid,
  p_class text,
  p_stream text,
  p_subject uuid,
  p_campus text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subject_teachers
    where staff_id = public.my_teaching_staff_id()
      and term_id = p_term
      and class_code = p_class
      and stream = coalesce(p_stream, '')
      and subject_id = p_subject
      and public.operational_campus(campus) = public.operational_campus(p_campus)
  );
$$;

create or replace function public.teaches_class(
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
  select public.my_teaching_staff_id() is not null and (
    public.is_class_teacher(p_term, p_class, p_stream, p_campus)
    or exists (
      select 1 from public.subject_teachers
      where staff_id = public.my_teaching_staff_id()
        and term_id = p_term
        and class_code = p_class
        and stream = coalesce(p_stream, '')
        and public.operational_campus(campus) = public.operational_campus(p_campus)
    )
  );
$$;

revoke all on function public.is_class_teacher(uuid, text, text, text) from public;
revoke all on function public.teaches_subject(uuid, text, text, uuid, text) from public;
revoke all on function public.teaches_class(uuid, text, text, text) from public;
grant execute on function public.is_class_teacher(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.teaches_subject(uuid, text, text, uuid, text) to authenticated, service_role;
grant execute on function public.teaches_class(uuid, text, text, text) to authenticated, service_role;

commit;
