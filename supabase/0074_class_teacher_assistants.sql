-- Class teacher assistants: same portal powers as lead class teachers.
-- One lead + one assistant per stream; one leadership post per teacher per term.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- role column

alter table public.class_teachers
  add column if not exists role text;

update public.class_teachers
set role = 'lead'
where role is null or btrim(role) = '';

alter table public.class_teachers
  alter column role set default 'lead';

alter table public.class_teachers
  alter column role set not null;

alter table public.class_teachers
  drop constraint if exists class_teachers_role_check;

alter table public.class_teachers
  add constraint class_teachers_role_check
  check (role in ('lead', 'assistant'));

-- ---------------------------------------------------------------- dedupe before unique (term, staff)

-- Prefer keeping a lead over an assistant when the same teacher holds both (shouldn't exist yet).
-- Prefer the earliest campus/class/stream when a teacher leads multiple streams.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by term_id, staff_id
      order by
        case when role = 'lead' then 0 else 1 end,
        campus,
        class_code,
        stream,
        id
    ) as keep_rank
  from public.class_teachers
)
delete from public.class_teachers d
using ranked r
where d.ctid = r.ctid
  and r.keep_rank > 1;

-- One role per stream (drop any accidental duplicate leads from older data).
with ranked as (
  select
    ctid,
    row_number() over (
      partition by term_id, campus, class_code, stream, role
      order by id
    ) as keep_rank
  from public.class_teachers
)
delete from public.class_teachers d
using ranked r
where d.ctid = r.ctid
  and r.keep_rank > 1;

-- ---------------------------------------------------------------- uniqueness

alter table public.class_teachers
  drop constraint if exists class_teachers_term_campus_class_stream_key;

alter table public.class_teachers
  drop constraint if exists class_teachers_term_campus_class_stream_role_key;

alter table public.class_teachers
  add constraint class_teachers_term_campus_class_stream_role_key
  unique (term_id, campus, class_code, stream, role);

alter table public.class_teachers
  drop constraint if exists class_teachers_term_staff_key;

alter table public.class_teachers
  add constraint class_teachers_term_staff_key
  unique (term_id, staff_id);

create index if not exists class_teachers_stream_role_idx
  on public.class_teachers (term_id, campus, class_code, stream, role);

-- ---------------------------------------------------------------- my_class_teachers: expose lead vs assistant

drop function if exists public.my_class_teachers();

create or replace function public.my_class_teachers()
returns table (
  staff_id uuid,
  full_name text,
  title text,
  subject_id uuid,
  role text,
  photo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      s.class_code,
      coalesce(nullif(btrim(s.stream), ''), '') as stream,
      coalesce(nullif(btrim(s.campus), ''), 'Kitante') as campus
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
    case when ct.role = 'assistant' then 'assistant'::text else 'class'::text end as role,
    ts.photo_path
  from public.class_teachers ct
  join public.teaching_staff ts on ts.id = ct.staff_id and ts.active
  join me on me.class_code is not null
    and me.class_code = ct.class_code
    and coalesce(nullif(btrim(ct.stream), ''), '') = me.stream
    and ct.campus = me.campus
  join term on term.id = ct.term_id
  union all
  select
    st.staff_id,
    ts.full_name,
    ts.title,
    st.subject_id,
    'subject'::text as role,
    ts.photo_path
  from public.subject_teachers st
  join public.teaching_staff ts on ts.id = st.staff_id and ts.active
  join me on me.class_code is not null
    and me.class_code = st.class_code
    and coalesce(nullif(btrim(st.stream), ''), '') = me.stream
    and st.campus = me.campus
  join term on term.id = st.term_id;
$$;

revoke all on function public.my_class_teachers() from public;
grant execute on function public.my_class_teachers() to authenticated, service_role;

commit;
