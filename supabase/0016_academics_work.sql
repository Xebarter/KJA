-- Academics timetable, schemes, approvals, interventions and the command centre.
-- Run after 0015_academics.sql (safe to re-run).
-- Terms stay in fee_terms. Office staff keep full access. A staff profile linked
-- on teaching_staff can work only on the classes and subjects assigned to them.

begin;

-- ---------------------------------------------------------------- helpers

create or replace function public.my_teaching_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.teaching_staff
  where profile_id = auth.uid() and active
  limit 1;
$$;

create or replace function public.is_linked_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.teaching_staff s on s.profile_id = p.id and s.active
    where p.id = auth.uid() and p.role = 'staff'
  );
$$;

create or replace function public.teaches_class(p_term uuid, p_class text, p_stream text)
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
    )
    or exists (
      select 1 from public.subject_teachers
      where staff_id = public.my_teaching_staff_id()
        and term_id = p_term
        and class_code = p_class
        and stream = coalesce(p_stream, '')
    )
  );
$$;

create or replace function public.is_class_teacher(p_term uuid, p_class text, p_stream text)
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
  );
$$;

create or replace function public.teaches_subject(p_term uuid, p_class text, p_stream text, p_subject uuid)
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
  );
$$;

create or replace function public.teacher_sees_pupil(p_class text, p_stream text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fee_terms t
    where t.is_current
      and public.teaches_class(t.id, p_class, p_stream)
  );
$$;

-- ---------------------------------------------------------------- markbooks and frozen reports

alter table public.assessments add column if not exists status text;
update public.assessments set status = 'open' where status is null;
alter table public.assessments alter column status set default 'open';
alter table public.assessments alter column status set not null;
alter table public.assessments drop constraint if exists assessments_status_check;
alter table public.assessments add constraint assessments_status_check check (status in ('open', 'submitted'));

do $$
declare
  cons text;
begin
  select c.conname into cons
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'report_cards' and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%';
  if cons is not null then
    execute format('alter table public.report_cards drop constraint %I', cons);
  end if;
end $$;

alter table public.report_cards add constraint report_cards_status_check check (status in ('draft', 'approved', 'published'));
alter table public.report_cards add column if not exists approved_at timestamptz;
alter table public.report_cards add column if not exists approved_by uuid references public.profiles (id) on delete set null;
alter table public.report_cards add column if not exists grade_rules jsonb;

-- Teachers may submit an open markbook, and nothing else on the paper.
create or replace function public.assessments_teacher_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_academics_staff() then
    return new;
  end if;
  if new.term_id is distinct from old.term_id
    or new.class_code is distinct from old.class_code
    or new.stream is distinct from old.stream
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

drop trigger if exists assessments_teacher_guard on public.assessments;
create trigger assessments_teacher_guard before update on public.assessments
  for each row execute function public.assessments_teacher_guard();

-- ---------------------------------------------------------------- timetable, schemes, calendar, interventions

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_code text not null,
  stream text not null default '',
  weekday smallint not null check (weekday between 1 and 5),
  period smallint not null check (period between 1 and 12),
  starts_at time,
  ends_at time,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  staff_id uuid references public.teaching_staff (id) on delete set null,
  room text,
  created_at timestamptz not null default now(),
  unique (term_id, class_code, stream, weekday, period)
);
create index if not exists timetable_slots_term_idx on public.timetable_slots (term_id, class_code, stream);
create index if not exists timetable_slots_staff_idx on public.timetable_slots (staff_id, term_id);

create table if not exists public.schemes (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_code text not null,
  stream text not null default '',
  subject_id uuid not null references public.subjects (id) on delete restrict,
  staff_id uuid references public.teaching_staff (id) on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term_id, class_code, stream, subject_id)
);
create index if not exists schemes_term_idx on public.schemes (term_id, status);

create table if not exists public.scheme_lessons (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references public.schemes (id) on delete cascade,
  week_number integer not null check (week_number between 1 and 20),
  topic text not null,
  objectives text,
  due_on date,
  taught_on date,
  sort_order integer not null default 0,
  unique (scheme_id, week_number)
);
create index if not exists scheme_lessons_scheme_idx on public.scheme_lessons (scheme_id, week_number);

create or replace function public.schemes_teacher_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_academics_staff() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.status is distinct from 'draft' or old.staff_id is distinct from public.my_teaching_staff_id() then
      raise exception 'Only a draft scheme of your own can be removed';
    end if;
    return old;
  end if;
  if new.staff_id is distinct from public.my_teaching_staff_id() then
    raise exception 'This scheme belongs to another teacher';
  end if;
  if tg_op = 'UPDATE' then
    if old.status is distinct from 'draft' then
      raise exception 'This scheme can no longer be edited';
    end if;
    if new.term_id is distinct from old.term_id
      or new.class_code is distinct from old.class_code
      or new.stream is distinct from old.stream
      or new.subject_id is distinct from old.subject_id
      or new.staff_id is distinct from old.staff_id
      or new.approved_at is not null
      or new.approved_by is not null
    then
      raise exception 'Teachers cannot reassign a scheme';
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'Teachers can submit a scheme, not approve it';
    end if;
  end if;
  if tg_op = 'INSERT' and new.status is distinct from 'draft' then
    raise exception 'A new scheme starts as a draft';
  end if;
  return new;
end;
$$;

drop trigger if exists schemes_teacher_guard on public.schemes;
create trigger schemes_teacher_guard before insert or update or delete on public.schemes
  for each row execute function public.schemes_teacher_guard();

create or replace function public.scheme_lessons_teacher_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_scheme uuid;
  owner uuid;
  scheme_status text;
begin
  if public.is_academics_staff() then
    return coalesce(new, old);
  end if;
  row_scheme := case when tg_op = 'DELETE' then old.scheme_id else new.scheme_id end;
  select staff_id, status into owner, scheme_status from public.schemes where id = row_scheme;
  if owner is distinct from public.my_teaching_staff_id() then
    raise exception 'This scheme belongs to another teacher';
  end if;
  if tg_op = 'DELETE' then
    if scheme_status is distinct from 'draft' then
      raise exception 'Lesson plans can only be removed while the scheme is a draft';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if scheme_status is distinct from 'draft' then
      raise exception 'Lesson plans can only be added while the scheme is a draft';
    end if;
    return new;
  end if;
  if scheme_status = 'draft' then
    return new;
  end if;
  if new.scheme_id is distinct from old.scheme_id
    or new.week_number is distinct from old.week_number
    or new.topic is distinct from old.topic
    or new.objectives is distinct from old.objectives
    or new.due_on is distinct from old.due_on
    or new.sort_order is distinct from old.sort_order
  then
    raise exception 'Only the taught date can change after a scheme leaves draft';
  end if;
  return new;
end;
$$;

drop trigger if exists scheme_lessons_teacher_guard on public.scheme_lessons;
create trigger scheme_lessons_teacher_guard before insert or update or delete on public.scheme_lessons
  for each row execute function public.scheme_lessons_teacher_guard();

create table if not exists public.learner_interventions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  reason text not null check (reason in ('decline', 'absence', 'other')),
  note text not null,
  follow_up_on date,
  status text not null default 'open' check (status in ('open', 'done')),
  opened_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learner_interventions_term_idx on public.learner_interventions (term_id, status);
create index if not exists learner_interventions_student_idx on public.learner_interventions (student_id, created_at desc);

create table if not exists public.academic_dates (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('exam', 'deadline', 'meeting', 'reporting')),
  starts_on date not null,
  ends_on date,
  campus text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists academic_dates_term_idx on public.academic_dates (term_id, starts_on);

create table if not exists public.academic_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('marks', 'scheme', 'report', 'calendar', 'intervention', 'reminder', 'timetable', 'setup')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists academic_activity_created_idx on public.academic_activity (created_at desc);

create table if not exists public.academic_reminders (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.teaching_staff (id) on delete set null,
  sent_to text not null,
  topic text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists academic_reminders_sent_idx on public.academic_reminders (sent_at desc);

-- ---------------------------------------------------------------- access

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'timetable_slots', 'schemes', 'scheme_lessons', 'learner_interventions',
    'academic_dates', 'academic_activity', 'academic_reminders'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_staff', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_academics_staff())) with check ((select public.is_academics_staff()))',
      tbl || '_staff', tbl
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end $$;

drop policy if exists school_classes_teacher on public.school_classes;
create policy school_classes_teacher on public.school_classes for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists students_teacher on public.students;
create policy students_teacher on public.students for select to authenticated
  using ((select public.is_linked_teacher()) and public.teacher_sees_pupil(class_code, stream));

drop policy if exists subjects_teacher on public.subjects;
create policy subjects_teacher on public.subjects for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists grade_bands_teacher on public.grade_bands;
create policy grade_bands_teacher on public.grade_bands for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists teaching_staff_teacher on public.teaching_staff;
create policy teaching_staff_teacher on public.teaching_staff for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists class_teachers_teacher on public.class_teachers;
create policy class_teachers_teacher on public.class_teachers for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists subject_teachers_teacher on public.subject_teachers;
create policy subject_teachers_teacher on public.subject_teachers for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists assessments_teacher_read on public.assessments;
create policy assessments_teacher_read on public.assessments for select to authenticated
  using ((select public.is_linked_teacher()) and public.teaches_subject(term_id, class_code, stream, subject_id));

drop policy if exists assessments_teacher_submit on public.assessments;
create policy assessments_teacher_submit on public.assessments for update to authenticated
  using (
    (select public.is_linked_teacher())
    and status = 'open'
    and public.teaches_subject(term_id, class_code, stream, subject_id)
  )
  with check (
    (select public.is_linked_teacher())
    and status in ('open', 'submitted')
    and public.teaches_subject(term_id, class_code, stream, subject_id)
  );

drop policy if exists assessment_scores_teacher_read on public.assessment_scores;
create policy assessment_scores_teacher_read on public.assessment_scores for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and public.teaches_subject(paper.term_id, paper.class_code, paper.stream, paper.subject_id)
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
        and public.teaches_subject(paper.term_id, paper.class_code, paper.stream, paper.subject_id)
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and paper.status = 'open'
        and public.teaches_subject(paper.term_id, paper.class_code, paper.stream, paper.subject_id)
    )
  );

drop policy if exists attendance_teacher_read on public.attendance;
create policy attendance_teacher_read on public.attendance for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      where pupil.id = attendance.student_id
        and public.teacher_sees_pupil(pupil.class_code, pupil.stream)
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
        and public.is_class_teacher(term.id, pupil.class_code, pupil.stream)
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      join public.fee_terms term on term.is_current
      where pupil.id = attendance.student_id
        and public.is_class_teacher(term.id, pupil.class_code, pupil.stream)
    )
  );

drop policy if exists report_cards_teacher on public.report_cards;
create policy report_cards_teacher on public.report_cards for select to authenticated
  using ((select public.is_linked_teacher()) and public.teacher_sees_pupil(class_code, stream));

drop policy if exists report_lines_teacher on public.report_lines;
create policy report_lines_teacher on public.report_lines for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_lines.report_card_id
        and public.teacher_sees_pupil(card.class_code, card.stream)
    )
  );

drop policy if exists timetable_slots_teacher on public.timetable_slots;
create policy timetable_slots_teacher on public.timetable_slots for select to authenticated
  using ((select public.is_linked_teacher()) and staff_id = public.my_teaching_staff_id());

drop policy if exists schemes_teacher_read on public.schemes;
create policy schemes_teacher_read on public.schemes for select to authenticated
  using ((select public.is_linked_teacher()) and staff_id = public.my_teaching_staff_id());

drop policy if exists schemes_teacher_insert on public.schemes;
create policy schemes_teacher_insert on public.schemes for insert to authenticated
  with check (
    (select public.is_linked_teacher())
    and staff_id = public.my_teaching_staff_id()
    and status = 'draft'
    and public.teaches_subject(term_id, class_code, stream, subject_id)
  );

drop policy if exists schemes_teacher_update on public.schemes;
create policy schemes_teacher_update on public.schemes for update to authenticated
  using (
    (select public.is_linked_teacher())
    and staff_id = public.my_teaching_staff_id()
    and status = 'draft'
  )
  with check (
    (select public.is_linked_teacher())
    and staff_id = public.my_teaching_staff_id()
    and status in ('draft', 'submitted')
  );

drop policy if exists schemes_teacher_delete on public.schemes;
create policy schemes_teacher_delete on public.schemes for delete to authenticated
  using (
    (select public.is_linked_teacher())
    and staff_id = public.my_teaching_staff_id()
    and status = 'draft'
  );

drop policy if exists scheme_lessons_teacher_read on public.scheme_lessons;
create policy scheme_lessons_teacher_read on public.scheme_lessons for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.schemes scheme
      where scheme.id = scheme_lessons.scheme_id
        and scheme.staff_id = public.my_teaching_staff_id()
    )
  );

drop policy if exists scheme_lessons_teacher_write on public.scheme_lessons;
create policy scheme_lessons_teacher_write on public.scheme_lessons for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.schemes scheme
      where scheme.id = scheme_lessons.scheme_id
        and scheme.staff_id = public.my_teaching_staff_id()
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.schemes scheme
      where scheme.id = scheme_lessons.scheme_id
        and scheme.staff_id = public.my_teaching_staff_id()
    )
  );

drop policy if exists learner_interventions_teacher on public.learner_interventions;
create policy learner_interventions_teacher on public.learner_interventions for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      where pupil.id = learner_interventions.student_id
        and public.teacher_sees_pupil(pupil.class_code, pupil.stream)
    )
  );

drop policy if exists academic_dates_teacher on public.academic_dates;
create policy academic_dates_teacher on public.academic_dates for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists academic_activity_teacher_read on public.academic_activity;
create policy academic_activity_teacher_read on public.academic_activity for select to authenticated
  using ((select public.is_linked_teacher()));

drop policy if exists academic_activity_teacher_write on public.academic_activity;
create policy academic_activity_teacher_write on public.academic_activity for insert to authenticated
  with check ((select public.is_linked_teacher()) and actor_id = auth.uid());

grant execute on function public.my_teaching_staff_id() to authenticated;
grant execute on function public.is_linked_teacher() to authenticated;
grant execute on function public.teaches_class(uuid, text, text) to authenticated;
grant execute on function public.is_class_teacher(uuid, text, text) to authenticated;
grant execute on function public.teaches_subject(uuid, text, text, uuid) to authenticated;
grant execute on function public.teacher_sees_pupil(text, text) to authenticated;

commit;
