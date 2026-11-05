-- Campus-scoped class identity: assignments, closures, timetable, schemes, assessments,
-- homework, resources, notices, class chat groups, and report-card snapshots.
-- Operational campuses: Kitante, Najjanankumbi, Makindye, Bunga.
-- Orphan backfill default: Kitante.
-- Run after 0063_desk_campus_scope.sql (safe to re-run).

begin;

-- ---------------------------------------------------------------- constants / helpers

create or replace function public.operational_campuses()
returns text[]
language sql
immutable
as $$
  select array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[];
$$;

comment on function public.operational_campuses() is
  'Geographic campuses used for pupil register and class-scoped academics.';

create or replace function public.majority_campus_for_class(p_class text, p_stream text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.campus
      from public.students s
      where s.status = 'active'
        and s.class_code is not null
        and s.class_code = p_class
        and coalesce(s.stream, '') = coalesce(p_stream, '')
        and coalesce(s.campus, '') <> ''
      group by s.campus
      order by count(*) desc, s.campus
      limit 1
    ),
    'Kitante'
  );
$$;

revoke all on function public.majority_campus_for_class(text, text) from public;
grant execute on function public.majority_campus_for_class(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- add campus columns

alter table public.class_teachers
  add column if not exists campus text not null default 'Kitante';

alter table public.subject_teachers
  add column if not exists campus text not null default 'Kitante';

alter table public.attendance_closures
  add column if not exists campus text not null default 'Kitante';

alter table public.timetable_slots
  add column if not exists campus text not null default 'Kitante';

alter table public.schemes
  add column if not exists campus text not null default 'Kitante';

alter table public.assessments
  add column if not exists campus text not null default 'Kitante';

alter table public.report_cards
  add column if not exists campus text not null default 'Kitante';

do $$
begin
  if to_regclass('public.homework_assignments') is not null then
    execute 'alter table public.homework_assignments add column if not exists campus text not null default ''Kitante''';
  end if;
  if to_regclass('public.class_resources') is not null then
    execute 'alter table public.class_resources add column if not exists campus text not null default ''Kitante''';
  end if;
  if to_regclass('public.class_notices') is not null then
    execute 'alter table public.class_notices add column if not exists campus text not null default ''Kitante''';
  end if;
  if to_regclass('public.student_conversations') is not null then
    execute 'alter table public.student_conversations add column if not exists campus text not null default ''Kitante''';
  end if;
end $$;

-- ---------------------------------------------------------------- backfill campus

update public.class_teachers ct
set campus = public.majority_campus_for_class(ct.class_code, ct.stream);

update public.subject_teachers st
set campus = public.majority_campus_for_class(st.class_code, st.stream);

update public.attendance_closures ac
set campus = public.majority_campus_for_class(ac.class_code, ac.stream);

update public.timetable_slots ts
set campus = public.majority_campus_for_class(ts.class_code, ts.stream);

update public.schemes s
set campus = public.majority_campus_for_class(s.class_code, s.stream);

-- assessments_teacher_guard only allows open→submitted for non-office sessions;
-- SQL editor / service backfill must skip it while setting campus.
alter table public.assessments disable trigger assessments_teacher_guard;
update public.assessments a
set campus = public.majority_campus_for_class(a.class_code, a.stream);
alter table public.assessments enable trigger assessments_teacher_guard;

update public.report_cards rc
set campus = coalesce(
  (select coalesce(nullif(btrim(s.campus), ''), 'Kitante') from public.students s where s.id = rc.student_id),
  'Kitante'
);

do $$
begin
  if to_regclass('public.homework_assignments') is not null then
    execute $sql$
      update public.homework_assignments h
      set campus = public.majority_campus_for_class(h.class_code, h.stream)
    $sql$;
  end if;
  if to_regclass('public.class_resources') is not null then
    execute $sql$
      update public.class_resources r
      set campus = public.majority_campus_for_class(r.class_code, r.stream)
    $sql$;
  end if;
  if to_regclass('public.class_notices') is not null then
    execute $sql$
      update public.class_notices n
      set campus = public.majority_campus_for_class(n.class_code, n.stream)
    $sql$;
  end if;
  if to_regclass('public.student_conversations') is not null then
    execute $sql$
      update public.student_conversations c
      set campus = public.majority_campus_for_class(c.class_code, c.stream)
      where c.kind = 'class_group'
        and c.class_code is not null
    $sql$;
  end if;
end $$;

-- Drop column defaults after backfill (new rows must set campus explicitly in app logic).
alter table public.class_teachers alter column campus drop default;
alter table public.subject_teachers alter column campus drop default;
alter table public.attendance_closures alter column campus drop default;
alter table public.timetable_slots alter column campus drop default;
alter table public.schemes alter column campus drop default;
alter table public.assessments alter column campus drop default;
alter table public.report_cards alter column campus drop default;

do $$
begin
  if to_regclass('public.homework_assignments') is not null then
    execute 'alter table public.homework_assignments alter column campus drop default';
  end if;
  if to_regclass('public.class_resources') is not null then
    execute 'alter table public.class_resources alter column campus drop default';
  end if;
  if to_regclass('public.class_notices') is not null then
    execute 'alter table public.class_notices alter column campus drop default';
  end if;
  if to_regclass('public.student_conversations') is not null then
    execute 'alter table public.student_conversations alter column campus drop default';
  end if;
end $$;

-- ---------------------------------------------------------------- campus check constraints

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'class_teachers', 'subject_teachers', 'attendance_closures', 'timetable_slots',
    'schemes', 'assessments', 'report_cards'
  ]
  loop
    execute format('alter table public.%I drop constraint if exists %I', tbl, tbl || '_campus_check');
    execute format(
      'alter table public.%I add constraint %I check (campus = any (public.operational_campuses()))',
      tbl, tbl || '_campus_check'
    );
  end loop;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['homework_assignments', 'class_resources', 'class_notices', 'student_conversations']
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I drop constraint if exists %I', tbl, tbl || '_campus_check');
      execute format(
        'alter table public.%I add constraint %I check (campus = any (public.operational_campuses()))',
        tbl, tbl || '_campus_check'
      );
    end if;
  end loop;
exception when others then
  raise notice 'optional campus check skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------- dedupe then rebuild uniques / PKs
-- When several rows share the new key, keep one row — prefer the majority campus for that
-- class/stream, then the lowest id.

do $$
declare
  c name;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'class_teachers'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) not like '%campus%'
  loop
    execute format('alter table public.class_teachers drop constraint if exists %I', c);
  end loop;
end $$;

with ranked as (
  select
    ct.id,
    row_number() over (
      partition by ct.term_id, ct.campus, ct.class_code, ct.stream
      order by
        case when ct.campus = public.majority_campus_for_class(ct.class_code, ct.stream) then 0 else 1 end,
        ct.id
    ) as rn
  from public.class_teachers ct
)
delete from public.class_teachers d
using ranked r
where d.id = r.id and r.rn > 1;

alter table public.class_teachers drop constraint if exists class_teachers_term_campus_class_stream_key;
alter table public.class_teachers
  add constraint class_teachers_term_campus_class_stream_key
  unique (term_id, campus, class_code, stream);

do $$
declare
  c name;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'subject_teachers'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) not like '%campus%'
  loop
    execute format('alter table public.subject_teachers drop constraint if exists %I', c);
  end loop;
end $$;

with ranked as (
  select
    st.id,
    row_number() over (
      partition by st.term_id, st.campus, st.class_code, st.stream, st.subject_id
      order by
        case when st.campus = public.majority_campus_for_class(st.class_code, st.stream) then 0 else 1 end,
        st.id
    ) as rn
  from public.subject_teachers st
)
delete from public.subject_teachers d
using ranked r
where d.id = r.id and r.rn > 1;

alter table public.subject_teachers drop constraint if exists subject_teachers_term_campus_class_stream_subject_key;
alter table public.subject_teachers
  add constraint subject_teachers_term_campus_class_stream_subject_key
  unique (term_id, campus, class_code, stream, subject_id);

alter table public.attendance_closures drop constraint if exists attendance_closures_pkey;

with ranked as (
  select
    ac.attended_on,
    ac.campus,
    ac.class_code,
    ac.stream,
    row_number() over (
      partition by ac.attended_on, ac.campus, ac.class_code, ac.stream
      order by
        case when ac.campus = public.majority_campus_for_class(ac.class_code, ac.stream) then 0 else 1 end,
        ac.closed_at
    ) as rn
  from public.attendance_closures ac
)
delete from public.attendance_closures d
using ranked r
where d.attended_on = r.attended_on
  and d.campus = r.campus
  and d.class_code = r.class_code
  and d.stream = r.stream
  and r.rn > 1;

alter table public.attendance_closures
  add constraint attendance_closures_pkey
  primary key (attended_on, campus, class_code, stream);

do $$
declare
  c name;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'timetable_slots'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) not like '%campus%'
  loop
    execute format('alter table public.timetable_slots drop constraint if exists %I', c);
  end loop;
end $$;

delete from public.timetable_slots d
using public.timetable_slots x
where d.id > x.id
  and d.term_id = x.term_id
  and d.campus = x.campus
  and d.class_code = x.class_code
  and d.stream = x.stream
  and d.weekday = x.weekday
  and d.period = x.period;

alter table public.timetable_slots drop constraint if exists timetable_slots_term_campus_class_stream_weekday_period_key;
alter table public.timetable_slots
  add constraint timetable_slots_term_campus_class_stream_weekday_period_key
  unique (term_id, campus, class_code, stream, weekday, period);

do $$
declare
  c name;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'schemes'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) not like '%campus%'
  loop
    execute format('alter table public.schemes drop constraint if exists %I', c);
  end loop;
end $$;

delete from public.schemes d
using public.schemes x
where d.id > x.id
  and d.term_id = x.term_id
  and d.campus = x.campus
  and d.class_code = x.class_code
  and d.stream = x.stream
  and d.subject_id = x.subject_id;

alter table public.schemes drop constraint if exists schemes_term_campus_class_stream_subject_key;
alter table public.schemes
  add constraint schemes_term_campus_class_stream_subject_key
  unique (term_id, campus, class_code, stream, subject_id);

do $$
begin
  if to_regclass('public.student_conversations') is not null then
    execute 'drop index if exists public.student_conversations_class_group_uidx';
    execute $sql$
      with ranked as (
        select
          c.id,
          row_number() over (
            partition by c.campus, c.class_code, c.stream
            order by
              case when c.campus = public.majority_campus_for_class(c.class_code, c.stream) then 0 else 1 end,
              c.created_at,
              c.id
          ) as rn
        from public.student_conversations c
        where c.kind = 'class_group'
          and c.class_code is not null
      )
      delete from public.student_conversations d
      using ranked r
      where d.id = r.id and r.rn > 1
    $sql$;
    execute $sql$
      create unique index if not exists student_conversations_class_group_uidx
        on public.student_conversations (campus, class_code, stream)
        where kind = 'class_group'
    $sql$;
  end if;
exception when others then
  raise notice 'student_conversations class group index skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------- campus-aware teacher helpers (replace old signatures)

-- Policies (and some RPCs) still reference the 3-arg helpers — drop them first.
drop policy if exists students_teacher on public.students;
drop policy if exists assessments_teacher_read on public.assessments;
drop policy if exists assessments_teacher_submit on public.assessments;
drop policy if exists assessment_scores_teacher_read on public.assessment_scores;
drop policy if exists assessment_scores_teacher_write on public.assessment_scores;
drop policy if exists attendance_teacher_read on public.attendance;
drop policy if exists attendance_teacher_write on public.attendance;
drop policy if exists attendance_closures_teacher on public.attendance_closures;
drop policy if exists report_cards_teacher on public.report_cards;
drop policy if exists report_lines_teacher on public.report_lines;
drop policy if exists report_line_parts_teacher on public.report_line_parts;
drop policy if exists report_card_activities_teacher on public.report_card_activities;
drop policy if exists schemes_teacher_insert on public.schemes;
drop policy if exists learner_interventions_teacher on public.learner_interventions;
drop policy if exists point_awards_teacher on public.point_awards;
drop policy if exists class_notices_teacher on public.class_notices;
drop policy if exists academic_dates_teacher on public.academic_dates;
drop policy if exists academic_dates_class_teacher_write on public.academic_dates;
drop policy if exists class_teachers_student on public.class_teachers;
drop policy if exists subject_teachers_student on public.subject_teachers;
drop policy if exists teaching_staff_student on public.teaching_staff;
drop policy if exists timetable_slots_student on public.timetable_slots;
drop policy if exists class_resources_student on public.class_resources;
drop policy if exists student_conversations_participant on public.student_conversations;
drop policy if exists student_conversations_insert on public.student_conversations;

-- Catch any other policies that still pin the old signatures (pg_get_expr in pg_policy).
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name, p.polname as policy_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        pg_get_expr(p.polqual, p.polrelid) ~ 'is_class_teacher\([^)]*\)'
        or pg_get_expr(p.polwithcheck, p.polrelid) ~ 'is_class_teacher\([^)]*\)'
        or pg_get_expr(p.polqual, p.polrelid) ~ 'teaches_class\([^)]*\)'
        or pg_get_expr(p.polwithcheck, p.polrelid) ~ 'teaches_class\([^)]*\)'
        or pg_get_expr(p.polqual, p.polrelid) ~ 'teaches_subject\([^)]*\)'
        or pg_get_expr(p.polwithcheck, p.polrelid) ~ 'teaches_subject\([^)]*\)'
        or pg_get_expr(p.polqual, p.polrelid) ~ 'teacher_sees_pupil\([^)]*\)'
        or pg_get_expr(p.polwithcheck, p.polrelid) ~ 'teacher_sees_pupil\([^)]*\)'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policy_name, r.schema_name, r.table_name);
  end loop;
end $$;

drop function if exists public.teaches_class(uuid, text, text) cascade;
drop function if exists public.is_class_teacher(uuid, text, text) cascade;
drop function if exists public.teaches_subject(uuid, text, text, uuid) cascade;
drop function if exists public.teacher_sees_pupil(text, text) cascade;

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
    exists (
      select 1 from public.class_teachers
      where staff_id = public.my_teaching_staff_id()
        and term_id = p_term
        and class_code = p_class
        and stream = coalesce(p_stream, '')
        and campus = coalesce(nullif(btrim(p_campus), ''), 'Kitante')
    )
    or exists (
      select 1 from public.subject_teachers
      where staff_id = public.my_teaching_staff_id()
        and term_id = p_term
        and class_code = p_class
        and stream = coalesce(p_stream, '')
        and campus = coalesce(nullif(btrim(p_campus), ''), 'Kitante')
    )
  );
$$;

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
      and campus = coalesce(nullif(btrim(p_campus), ''), 'Kitante')
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
      and campus = coalesce(nullif(btrim(p_campus), ''), 'Kitante')
  );
$$;

create or replace function public.teacher_sees_pupil(p_class text, p_stream text, p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fee_terms t
    where t.is_current
      and public.teaches_class(
        t.id,
        p_class,
        p_stream,
        coalesce(nullif(btrim(p_campus), ''), 'Kitante')
      )
  );
$$;

revoke all on function public.teaches_class(uuid, text, text, text) from public;
revoke all on function public.is_class_teacher(uuid, text, text, text) from public;
revoke all on function public.teaches_subject(uuid, text, text, uuid, text) from public;
revoke all on function public.teacher_sees_pupil(text, text, text) from public;
grant execute on function public.teaches_class(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.is_class_teacher(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.teaches_subject(uuid, text, text, uuid, text) to authenticated, service_role;
grant execute on function public.teacher_sees_pupil(text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- classmate helpers (campus-scoped)

create or replace function public.classmate_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.students me
  join public.students c
    on c.id <> me.id
   and c.status = 'active'
   and c.class_code is not null
   and c.class_code = me.class_code
   and coalesce(c.stream, '') = coalesce(me.stream, '')
   and coalesce(c.campus, '') = coalesce(me.campus, '')
  where me.profile_id = auth.uid()
    and me.status = 'active';
$$;

create or replace function public.are_classmates(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students x
    join public.students y on x.id = a and y.id = b
    where x.status = 'active'
      and y.status = 'active'
      and x.class_code is not null
      and x.class_code = y.class_code
      and coalesce(x.stream, '') = coalesce(y.stream, '')
      and coalesce(x.campus, '') = coalesce(y.campus, '')
  );
$$;

grant execute on function public.classmate_ids() to authenticated, service_role;
grant execute on function public.are_classmates(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- class group chat helpers

create or replace function public.is_class_group_member(p_class_code text, p_stream text, p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students me
    where me.profile_id = auth.uid()
      and me.status = 'active'
      and me.class_code is not null
      and me.class_code = p_class_code
      and coalesce(me.stream, '') = coalesce(p_stream, '')
      and coalesce(me.campus, '') = coalesce(nullif(btrim(p_campus), ''), 'Kitante')
  );
$$;

create or replace function public.is_student_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_conversations c
    where c.id = p_conversation_id
      and (
        (
          c.kind = 'dm'
          and public.my_student_id() in (c.student_low_id, c.student_high_id)
        )
        or (
          c.kind = 'class_group'
          and public.is_class_group_member(c.class_code, c.stream, c.campus)
        )
      )
  );
$$;

create or replace function public.ensure_my_class_group()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me_class text;
  me_stream text;
  me_campus text;
  cid uuid;
begin
  select class_code, coalesce(stream, ''), coalesce(campus, 'Kitante')
    into me_class, me_stream, me_campus
  from public.students
  where profile_id = auth.uid()
    and status = 'active'
  limit 1;

  if me_class is null or trim(me_class) = '' then
    return null;
  end if;

  select id into cid
  from public.student_conversations
  where kind = 'class_group'
    and class_code = me_class
    and stream = me_stream
    and campus = me_campus
  limit 1;

  if cid is not null then
    return cid;
  end if;

  begin
    insert into public.student_conversations (kind, class_code, stream, campus, student_low_id, student_high_id)
    values ('class_group', me_class, me_stream, me_campus, null, null)
    returning id into cid;
    return cid;
  exception
    when unique_violation then
      select id into cid
      from public.student_conversations
      where kind = 'class_group'
        and class_code = me_class
        and stream = me_stream
        and campus = me_campus
      limit 1;
      return cid;
  end;
end;
$$;

create or replace function public.class_teacher_sees_conversation(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_conversations c
    join public.fee_terms t on t.is_current
    where c.id = p_conversation
      and (
        (
          c.kind = 'class_group'
          and c.class_code is not null
          and public.is_class_teacher(t.id, c.class_code, coalesce(c.stream, ''), coalesce(c.campus, 'Kitante'))
        )
        or (
          c.kind = 'dm'
          and exists (
            select 1
            from public.students low_pupil
            join public.students high_pupil on high_pupil.id = c.student_high_id
            where low_pupil.id = c.student_low_id
              and low_pupil.class_code is not null
              and low_pupil.class_code = high_pupil.class_code
              and coalesce(low_pupil.stream, '') = coalesce(high_pupil.stream, '')
              and coalesce(low_pupil.campus, '') = coalesce(high_pupil.campus, '')
              and public.is_class_teacher(
                t.id,
                low_pupil.class_code,
                coalesce(low_pupil.stream, ''),
                coalesce(low_pupil.campus, 'Kitante')
              )
          )
        )
      )
  );
$$;

revoke all on function public.is_class_group_member(text, text, text) from public;
grant execute on function public.is_class_group_member(text, text, text) to authenticated, service_role;
grant execute on function public.is_student_conversation_participant(uuid) to authenticated, service_role;
grant execute on function public.ensure_my_class_group() to authenticated, service_role;
grant execute on function public.class_teacher_sees_conversation(uuid) to authenticated, service_role;

drop function if exists public.is_class_group_member(text, text);

-- ---------------------------------------------------------------- my_class_teachers (campus-scoped)

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
    'class'::text as role,
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

-- ---------------------------------------------------------------- RPC / guards using teacher helpers

create or replace function public.can_read_student_photo(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  folder text;
  stem text;
begin
  if object_name is null or btrim(object_name) = '' then
    return false;
  end if;

  folder := split_part(btrim(object_name, '/'), '/', 1);

  begin
    owner_id := folder::uuid;
  exception
    when others then
      stem := split_part(folder, '.', 1);
      begin
        owner_id := stem::uuid;
      exception
        when others then
          return false;
      end;
  end;

  if public.is_admissions_staff() then
    return true;
  end if;

  if owner_id = public.my_student_id() then
    return true;
  end if;

  if owner_id in (select public.classmate_ids()) then
    return true;
  end if;

  return exists (
    select 1
    from public.students s
    where s.id = owner_id
      and public.teacher_sees_pupil(s.class_code, s.stream, coalesce(s.campus, ''))
  );
end;
$$;

grant execute on function public.can_read_student_photo(text) to authenticated, service_role;

create or replace function public.can_read_class_resource_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_academics_staff()
    or exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
    or exists (
      select 1
      from public.class_resources r
      join public.students s on s.profile_id = auth.uid() and s.status = 'active'
      where r.published_at is not null
        and s.class_code = r.class_code
        and coalesce(s.stream, '') = coalesce(r.stream, '')
        and coalesce(s.campus, '') = coalesce(r.campus, '')
        and (
          r.file_path = object_name
          or (
            object_name like 'inline/%'
            and (
              position(object_name in coalesce(r.body, '')) > 0
              or position(replace(object_name, '/', '%2F') in coalesce(r.body, '')) > 0
            )
          )
        )
    );
$$;

grant execute on function public.can_read_class_resource_file(text) to authenticated, service_role;

drop function if exists public.notify_class_parents(text, text, text, text, text, text);

create or replace function public.notify_class_parents(
  p_class_code text,
  p_stream text,
  p_title text,
  p_body text default null,
  p_href text default '/account/notifications',
  p_kind text default 'school',
  p_campus text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 160);
  v_body text := nullif(left(trim(coalesce(p_body, '')), 2000), '');
  v_href text := nullif(left(trim(coalesce(p_href, '')), 400), '');
  v_kind text := nullif(left(trim(coalesce(p_kind, '')), 40), '');
  v_stream text := coalesce(p_stream, '');
  v_campus text := nullif(btrim(coalesce(p_campus, '')), '');
  v_count integer := 0;
begin
  if v_title = '' or coalesce(trim(p_class_code), '') = '' then
    return 0;
  end if;

  with class_pupils as (
    select s.id, s.family_id, public.pupil_first_name(s.full_name) as first_name
    from public.students s
    where s.status = 'active'
      and s.class_code = p_class_code
      and coalesce(s.stream, '') = v_stream
      and (v_campus is null or coalesce(s.campus, '') = v_campus)
      and s.family_id is not null
  ),
  parent_kids as (
    select
      g.user_id,
      string_agg(distinct cp.first_name, ', ' order by cp.first_name)
        filter (where cp.first_name is not null) as kid_names
    from public.guardians g
    join class_pupils cp on cp.family_id = g.family_id
    where g.user_id is not null
    group by g.user_id
  ),
  inserted as (
    insert into public.notifications (user_id, title, body, href, kind)
    select
      pk.user_id,
      case
        when pk.kid_names is null or pk.kid_names = '' then v_title
        else left(v_title || ' · ' || pk.kid_names, 160)
      end,
      v_body,
      coalesce(v_href, '/account/notifications'),
      v_kind
    from parent_kids pk
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end;
$$;

grant execute on function public.notify_class_parents(text, text, text, text, text, text, text) to authenticated, service_role;

create or replace function public.notify_my_class(
  p_class_code text,
  p_stream text,
  p_title text,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term uuid;
  v_notice uuid;
  v_title text;
  v_body text;
  v_stream text;
  v_campus text;
  v_staff uuid;
begin
  v_title := left(trim(coalesce(p_title, '')), 160);
  if v_title = '' then
    raise exception 'Write a title.';
  end if;
  v_body := nullif(left(trim(coalesce(p_body, '')), 2000), '');
  v_stream := coalesce(p_stream, '');
  v_staff := public.my_teaching_staff_id();

  select id into v_term from public.fee_terms where is_current limit 1;
  if v_term is null then
    raise exception 'Set a current term first.';
  end if;

  select ct.campus into v_campus
  from public.class_teachers ct
  where ct.term_id = v_term
    and ct.class_code = p_class_code
    and ct.stream = v_stream
    and ct.staff_id = v_staff
  limit 1;

  if v_campus is null or not public.is_class_teacher(v_term, p_class_code, v_stream, v_campus) then
    raise exception 'Only the class teacher can notify this class.';
  end if;

  insert into public.class_notices (term_id, class_code, stream, campus, title, body, created_by)
  values (v_term, p_class_code, v_stream, v_campus, v_title, v_body, auth.uid())
  returning id into v_notice;

  insert into public.notifications (user_id, title, body, href, kind)
  select pupil.profile_id, v_title, v_body, '/student/notifications', 'school'
  from public.students pupil
  where pupil.status = 'active'
    and pupil.class_code = p_class_code
    and coalesce(pupil.stream, '') = v_stream
    and coalesce(pupil.campus, '') = v_campus
    and pupil.profile_id is not null;

  perform public.notify_class_parents(
    p_class_code,
    v_stream,
    v_title,
    v_body,
    '/account/notifications',
    'school',
    v_campus
  );

  return v_notice;
end;
$$;

grant execute on function public.notify_my_class(text, text, text, text) to authenticated, service_role;

-- award_pupil_points: campus-aware pupil check
create or replace function public.award_pupil_points(p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_name text;
  v_term uuid;
  v_count integer := 0;
  v_entry jsonb;
  v_student uuid;
  v_points integer;
  v_reason uuid;
  v_pupil public.students%rowtype;
  v_label text;
  v_polarity text;
  v_active boolean;
  v_title text;
  v_body text;
  v_word text;
begin
  if auth.uid() is null or not public.is_linked_teacher() then
    raise exception 'Only a linked teacher can award points.';
  end if;
  v_staff := public.my_teaching_staff_id();
  if v_staff is null then
    raise exception 'Only a linked teacher can award points.';
  end if;
  select full_name into v_name from public.teaching_staff where id = v_staff;
  v_name := coalesce(nullif(trim(v_name), ''), 'Your teacher');
  select id into v_term from public.fee_terms where is_current limit 1;
  if v_term is null then
    raise exception 'Set a current term before awarding points.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Choose at least one pupil.';
  end if;
  if jsonb_array_length(p_entries) > 200 then
    raise exception 'That is too many pupils at once.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    if coalesce(v_entry->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Choose a pupil.';
    end if;
    if coalesce(v_entry->>'reason_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Choose a reason from the list.';
    end if;
    if coalesce(v_entry->>'points', '') !~ '^-?[0-9]+$' then
      raise exception 'Points must be from 1 to 10, or from -1 to -10.';
    end if;
    v_student := (v_entry->>'student_id')::uuid;
    v_reason := (v_entry->>'reason_id')::uuid;
    v_points := (v_entry->>'points')::integer;
    if v_points = 0 or v_points < -10 or v_points > 10 then
      raise exception 'Points must be from 1 to 10, or from -1 to -10.';
    end if;

    select * into v_pupil from public.students where id = v_student and status = 'active';
    if not found then
      raise exception 'That pupil is not on the active roll.';
    end if;
    if not public.teacher_sees_pupil(v_pupil.class_code, v_pupil.stream, coalesce(v_pupil.campus, '')) then
      raise exception 'You can only award pupils in a class you teach.';
    end if;

    select label, polarity, active into v_label, v_polarity, v_active
    from public.point_reasons where id = v_reason;
    if not found or v_active is not true then
      raise exception 'Choose a reason from the list.';
    end if;
    if (v_points > 0 and v_polarity <> 'positive') or (v_points < 0 and v_polarity <> 'negative') then
      raise exception 'Choose a reason that matches the points.';
    end if;

    insert into public.point_awards (student_id, term_id, staff_id, teacher_name, points, reason_id, reason_label)
    values (v_student, v_term, v_staff, v_name, v_points, v_reason, v_label);

    v_word := case when abs(v_points) = 1 then 'point' else 'points' end;
    v_title := case when v_points > 0 then '+' else '' end || v_points::text || ' ' || v_word;
    v_body := v_name || ' gave ' || v_points::text || ' ' || v_word || ' for ' || v_label || '.';
    if v_pupil.profile_id is not null then
      perform public.notify_user(v_pupil.profile_id, v_title, v_body, '/student/points', 'points');
    end if;
    perform public.notify_student_parents(
      array[v_student],
      v_title,
      v_body,
      '/account/points?child=' || v_student::text,
      'points'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.award_pupil_points(jsonb) to authenticated, service_role;

create or replace function public.assessments_teacher_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Office staff, or no JWT (SQL editor / service role migrations).
  if public.is_academics_staff() or auth.uid() is null then
    return new;
  end if;
  if new.term_id is distinct from old.term_id
    or new.class_code is distinct from old.class_code
    or new.stream is distinct from old.stream
    or new.campus is distinct from old.campus
    or new.subject_id is distinct from old.subject_id
    or new.name is distinct from old.name
    or new.kind is distinct from old.kind
    or new.max_score is distinct from old.max_score
    or new.weight is distinct from old.weight
    or new.held_on is distinct from old.held_on
    or new.created_by is distinct from old.created_by
  then
    raise exception 'Teachers can only submit a markbook';
  end if;
  if old.status is distinct from 'open' or new.status is distinct from 'submitted' then
    raise exception 'Teachers can only submit an open markbook';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- RLS: teacher / student class access (campus-aware)

drop policy if exists students_teacher on public.students;
create policy students_teacher on public.students for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.teacher_sees_pupil(class_code, stream, coalesce(campus, ''))
  );

drop policy if exists assessments_teacher_read on public.assessments;
create policy assessments_teacher_read on public.assessments for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.teaches_subject(term_id, class_code, stream, subject_id, campus)
  );

drop policy if exists assessments_teacher_submit on public.assessments;
create policy assessments_teacher_submit on public.assessments for update to authenticated
  using (
    (select public.is_linked_teacher())
    and status = 'open'
    and public.teaches_subject(term_id, class_code, stream, subject_id, campus)
  )
  with check (
    (select public.is_linked_teacher())
    and status in ('open', 'submitted')
    and public.teaches_subject(term_id, class_code, stream, subject_id, campus)
  );

drop policy if exists assessment_scores_teacher_read on public.assessment_scores;
create policy assessment_scores_teacher_read on public.assessment_scores for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and public.teaches_subject(
          paper.term_id, paper.class_code, paper.stream, paper.subject_id, paper.campus
        )
    )
  );

drop policy if exists assessment_scores_teacher_write on public.assessment_scores;
create policy assessment_scores_teacher_write on public.assessment_scores for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and paper.status = 'open'
        and public.teaches_subject(
          paper.term_id, paper.class_code, paper.stream, paper.subject_id, paper.campus
        )
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and paper.status = 'open'
        and public.teaches_subject(
          paper.term_id, paper.class_code, paper.stream, paper.subject_id, paper.campus
        )
    )
  );

drop policy if exists attendance_teacher_read on public.attendance;
create policy attendance_teacher_read on public.attendance for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      where pupil.id = attendance.student_id
        and public.teacher_sees_pupil(pupil.class_code, pupil.stream, coalesce(pupil.campus, ''))
    )
  );

drop policy if exists attendance_teacher_write on public.attendance;
create policy attendance_teacher_write on public.attendance for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      join public.fee_terms term on term.is_current
      where pupil.id = attendance.student_id
        and public.is_class_teacher(
          term.id, pupil.class_code, pupil.stream, coalesce(pupil.campus, 'Kitante')
        )
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      join public.fee_terms term on term.is_current
      where pupil.id = attendance.student_id
        and public.is_class_teacher(
          term.id, pupil.class_code, pupil.stream, coalesce(pupil.campus, 'Kitante')
        )
    )
  );

drop policy if exists attendance_closures_teacher on public.attendance_closures;
create policy attendance_closures_teacher on public.attendance_closures
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.fee_terms term
      where term.is_current
        and public.is_class_teacher(term.id, class_code, stream, campus)
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.fee_terms term
      where term.is_current
        and public.is_class_teacher(term.id, class_code, stream, campus)
    )
  );

drop policy if exists report_cards_teacher on public.report_cards;
create policy report_cards_teacher on public.report_cards for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.teacher_sees_pupil(class_code, stream, coalesce(campus, ''))
  );

drop policy if exists report_lines_teacher on public.report_lines;
create policy report_lines_teacher on public.report_lines for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_lines.report_card_id
        and public.teacher_sees_pupil(card.class_code, card.stream, coalesce(card.campus, ''))
    )
  );

drop policy if exists report_line_parts_teacher on public.report_line_parts;
create policy report_line_parts_teacher on public.report_line_parts for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_line_parts.report_card_id
        and public.teacher_sees_pupil(card.class_code, card.stream, coalesce(card.campus, ''))
    )
  );

drop policy if exists report_card_activities_teacher on public.report_card_activities;
create policy report_card_activities_teacher on public.report_card_activities for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_card_activities.report_card_id
        and public.teacher_sees_pupil(card.class_code, card.stream, coalesce(card.campus, ''))
    )
  );

drop policy if exists schemes_teacher_insert on public.schemes;
create policy schemes_teacher_insert on public.schemes for insert to authenticated
  with check (
    (select public.is_linked_teacher())
    and staff_id = public.my_teaching_staff_id()
    and status = 'draft'
    and public.teaches_subject(term_id, class_code, stream, subject_id, campus)
  );

drop policy if exists learner_interventions_teacher on public.learner_interventions;
create policy learner_interventions_teacher on public.learner_interventions for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      where pupil.id = learner_interventions.student_id
        and public.teacher_sees_pupil(pupil.class_code, pupil.stream, coalesce(pupil.campus, ''))
    )
  );

drop policy if exists point_awards_teacher on public.point_awards;
create policy point_awards_teacher on public.point_awards
  for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      where pupil.id = point_awards.student_id
        and public.teacher_sees_pupil(pupil.class_code, pupil.stream, coalesce(pupil.campus, ''))
    )
  );

-- class_notices / academic_dates (class teacher)

drop policy if exists class_notices_teacher on public.class_notices;
create policy class_notices_teacher on public.class_notices
  for select to authenticated
  using (
    exists (
      select 1 from public.fee_terms t
      where t.id = class_notices.term_id
        and public.is_class_teacher(
          t.id, class_notices.class_code, class_notices.stream, class_notices.campus
        )
    )
  );

drop policy if exists academic_dates_teacher on public.academic_dates;
create policy academic_dates_teacher on public.academic_dates
  for select to authenticated
  using (
    (select public.is_linked_teacher())
    and (
      class_code is null
      or exists (
        select 1 from public.fee_terms t
        where t.id = academic_dates.term_id
          and public.is_class_teacher(
            t.id,
            academic_dates.class_code,
            coalesce(academic_dates.stream, ''),
            coalesce(
              academic_dates.campus,
              public.majority_campus_for_class(academic_dates.class_code, coalesce(academic_dates.stream, ''))
            )
          )
      )
    )
  );

drop policy if exists academic_dates_class_teacher_write on public.academic_dates;
create policy academic_dates_class_teacher_write on public.academic_dates
  for all to authenticated
  using (
    class_code is not null
    and exists (
      select 1 from public.fee_terms t
      where t.id = academic_dates.term_id
        and t.is_current
        and public.is_class_teacher(
          t.id,
          academic_dates.class_code,
          coalesce(academic_dates.stream, ''),
          coalesce(
            academic_dates.campus,
            public.majority_campus_for_class(academic_dates.class_code, coalesce(academic_dates.stream, ''))
          )
        )
    )
  )
  with check (
    class_code is not null
    and exists (
      select 1 from public.fee_terms t
      where t.id = academic_dates.term_id
        and t.is_current
        and public.is_class_teacher(
          t.id,
          academic_dates.class_code,
          coalesce(academic_dates.stream, ''),
          coalesce(
            academic_dates.campus,
            public.majority_campus_for_class(academic_dates.class_code, coalesce(academic_dates.stream, ''))
          )
        )
    )
  );

-- pupil read policies on assignments / resources / homework / timetable

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
        and coalesce(nullif(btrim(s.campus), ''), 'Kitante') = class_teachers.campus
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
        and coalesce(nullif(btrim(s.campus), ''), 'Kitante') = subject_teachers.campus
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
          and coalesce(nullif(btrim(s.campus), ''), 'Kitante') = ct.campus
      )
      or exists (
        select 1
        from public.subject_teachers st
        join public.students s on s.profile_id = auth.uid()
        where st.staff_id = teaching_staff.id
          and s.status = 'active'
          and s.class_code = st.class_code
          and coalesce(nullif(btrim(s.stream), ''), '') = coalesce(nullif(btrim(st.stream), ''), '')
          and coalesce(nullif(btrim(s.campus), ''), 'Kitante') = st.campus
      )
    )
  );

drop policy if exists timetable_slots_student on public.timetable_slots;
create policy timetable_slots_student on public.timetable_slots
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.profile_id = auth.uid()
        and s.status = 'active'
        and s.class_code = timetable_slots.class_code
        and coalesce(s.stream, '') = coalesce(timetable_slots.stream, '')
        and coalesce(s.campus, '') = coalesce(timetable_slots.campus, '')
    )
  );

drop policy if exists class_resources_student on public.class_resources;
create policy class_resources_student on public.class_resources
  for select to authenticated
  using (
    published_at is not null
    and exists (
      select 1 from public.students s
      where s.profile_id = auth.uid()
        and s.status = 'active'
        and s.class_code = class_resources.class_code
        and coalesce(s.stream, '') = coalesce(class_resources.stream, '')
        and coalesce(s.campus, '') = coalesce(class_resources.campus, '')
    )
  );

do $$
begin
  if to_regclass('public.homework_assignments') is not null then
    execute 'drop policy if exists homework_assignments_student on public.homework_assignments';
    execute $pol$
      create policy homework_assignments_student on public.homework_assignments
        for select to authenticated
        using (
          published_at is not null
          and exists (
            select 1 from public.students s
            where s.profile_id = auth.uid()
              and s.status = 'active'
              and s.class_code = homework_assignments.class_code
              and coalesce(s.stream, '') = coalesce(homework_assignments.stream, '')
              and coalesce(s.campus, '') = coalesce(homework_assignments.campus, '')
          )
        )
    $pol$;
  end if;
exception when others then
  raise notice 'homework_assignments_student policy skipped: %', sqlerrm;
end $$;

-- class group chat policies (campus in member check)

drop policy if exists student_conversations_participant on public.student_conversations;
create policy student_conversations_participant on public.student_conversations
  for select to authenticated
  using (
    (select public.is_academics_staff())
    or (
      kind = 'dm'
      and public.my_student_id() in (student_low_id, student_high_id)
    )
    or (
      kind = 'class_group'
      and public.is_class_group_member(class_code, stream, campus)
    )
  );

drop policy if exists student_conversations_insert on public.student_conversations;
create policy student_conversations_insert on public.student_conversations
  for insert to authenticated
  with check (
    (
      kind = 'dm'
      and public.my_student_id() in (student_low_id, student_high_id)
      and public.are_classmates(student_low_id, student_high_id)
    )
    or (
      kind = 'class_group'
      and public.is_class_group_member(class_code, stream, campus)
    )
  );

commit;
