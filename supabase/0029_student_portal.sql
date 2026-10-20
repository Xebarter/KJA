-- Student portal: student role, classmate chat, homework, notify helper.
-- Run after 0028_subject_kinds_academic_other.sql (safe to re-run).

begin;

-- ---------------------------------------------------------------- role

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'admissions', 'accounts', 'academics', 'staff', 'parent', 'student'));

alter table public.students
  add column if not exists profile_id uuid unique references public.profiles (id) on delete set null;

create index if not exists students_profile_idx on public.students (profile_id)
  where profile_id is not null;

-- ---------------------------------------------------------------- helpers

create or replace function public.is_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'student'
  );
$$;

create or replace function public.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.students s where s.profile_id = auth.uid() limit 1;
$$;

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
  );
$$;

-- ---------------------------------------------------------------- notifications kind + writer

alter table public.notifications
  add column if not exists kind text;

create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_kind text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
begin
  if p_user_id is null or coalesce(trim(p_title), '') = '' then
    return null;
  end if;
  insert into public.notifications (user_id, title, body, href, kind)
  values (p_user_id, trim(p_title), nullif(trim(coalesce(p_body, '')), ''), nullif(trim(coalesce(p_href, '')), ''), nullif(trim(coalesce(p_kind, '')), ''))
  returning id into nid;
  return nid;
end;
$$;

grant execute on function public.notify_user(uuid, text, text, text, text) to authenticated;

drop policy if exists notifications_insert_self_service on public.notifications;
-- Inserts go through notify_user (security definer); keep admin insert and own select/update.

-- ---------------------------------------------------------------- classmate chat

create table if not exists public.student_conversations (
  id uuid primary key default gen_random_uuid(),
  student_low_id uuid not null references public.students (id) on delete cascade,
  student_high_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (student_low_id < student_high_id),
  unique (student_low_id, student_high_id)
);

create index if not exists student_conversations_low_idx on public.student_conversations (student_low_id);
create index if not exists student_conversations_high_idx on public.student_conversations (student_high_id);

create table if not exists public.student_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.student_conversations (id) on delete cascade,
  sender_student_id uuid not null references public.students (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  flagged boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists student_messages_conversation_idx
  on public.student_messages (conversation_id, created_at desc);
create index if not exists student_messages_flagged_idx
  on public.student_messages (flagged) where flagged and not hidden;

create or replace function public.student_conversations_classmate_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.are_classmates(new.student_low_id, new.student_high_id) then
    raise exception 'Students must be classmates to start a conversation';
  end if;
  return new;
end;
$$;

drop trigger if exists student_conversations_classmate_guard on public.student_conversations;
create trigger student_conversations_classmate_guard
  before insert on public.student_conversations
  for each row execute function public.student_conversations_classmate_guard();

create or replace function public.student_messages_sender_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.my_student_id();
  low uuid;
  high uuid;
begin
  if (select public.is_academics_staff()) then
    return new;
  end if;
  if me is null or new.sender_student_id <> me then
    raise exception 'You can only send messages as yourself';
  end if;
  select student_low_id, student_high_id into low, high
  from public.student_conversations where id = new.conversation_id;
  if low is null or (me <> low and me <> high) then
    raise exception 'You are not part of this conversation';
  end if;
  return new;
end;
$$;

drop trigger if exists student_messages_sender_guard on public.student_messages;
create trigger student_messages_sender_guard
  before insert on public.student_messages
  for each row execute function public.student_messages_sender_guard();

alter table public.student_conversations enable row level security;
alter table public.student_messages enable row level security;

drop policy if exists student_conversations_participant on public.student_conversations;
create policy student_conversations_participant on public.student_conversations
  for select to authenticated
  using (
    (select public.is_academics_staff())
    or public.my_student_id() in (student_low_id, student_high_id)
  );

drop policy if exists student_conversations_insert on public.student_conversations;
create policy student_conversations_insert on public.student_conversations
  for insert to authenticated
  with check (
    public.my_student_id() in (student_low_id, student_high_id)
    and public.are_classmates(student_low_id, student_high_id)
  );

drop policy if exists student_messages_participant on public.student_messages;
create policy student_messages_participant on public.student_messages
  for select to authenticated
  using (
    (select public.is_academics_staff())
    or (
      not hidden
      and exists (
        select 1 from public.student_conversations c
        where c.id = conversation_id
          and public.my_student_id() in (c.student_low_id, c.student_high_id)
      )
    )
  );

drop policy if exists student_messages_insert on public.student_messages;
create policy student_messages_insert on public.student_messages
  for insert to authenticated
  with check (
    sender_student_id = public.my_student_id()
    and exists (
      select 1 from public.student_conversations c
      where c.id = conversation_id
        and public.my_student_id() in (c.student_low_id, c.student_high_id)
    )
  );

drop policy if exists student_messages_staff_update on public.student_messages;
create policy student_messages_staff_update on public.student_messages
  for update to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

-- ---------------------------------------------------------------- homework

create table if not exists public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_code text not null,
  stream text not null default '',
  subject_id uuid not null references public.subjects (id) on delete restrict,
  title text not null,
  instructions text,
  due_on date not null,
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists homework_assignments_class_idx
  on public.homework_assignments (term_id, class_code, stream, due_on);
create index if not exists homework_assignments_published_idx
  on public.homework_assignments (published_at) where published_at is not null;

create table if not exists public.homework_completions (
  assignment_id uuid not null references public.homework_assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  done_at timestamptz not null default now(),
  note text,
  primary key (assignment_id, student_id)
);

alter table public.homework_assignments enable row level security;
alter table public.homework_completions enable row level security;

drop policy if exists homework_assignments_staff on public.homework_assignments;
create policy homework_assignments_staff on public.homework_assignments
  for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists homework_assignments_teacher on public.homework_assignments;
create policy homework_assignments_teacher on public.homework_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  );

drop policy if exists homework_assignments_teacher_write on public.homework_assignments;
create policy homework_assignments_teacher_write on public.homework_assignments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  );

drop policy if exists homework_assignments_teacher_update on public.homework_assignments;
create policy homework_assignments_teacher_update on public.homework_assignments
  for update to authenticated
  using (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  )
  with check (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  );

drop policy if exists homework_assignments_student on public.homework_assignments;
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
    )
  );

drop policy if exists homework_completions_staff on public.homework_completions;
create policy homework_completions_staff on public.homework_completions
  for select to authenticated
  using ((select public.is_academics_staff()) or exists (
    select 1 from public.teaching_staff t where t.profile_id = auth.uid() and t.active
  ));

drop policy if exists homework_completions_student_select on public.homework_completions;
create policy homework_completions_student_select on public.homework_completions
  for select to authenticated
  using (student_id = public.my_student_id());

drop policy if exists homework_completions_student_write on public.homework_completions;
create policy homework_completions_student_write on public.homework_completions
  for insert to authenticated
  with check (student_id = public.my_student_id());

drop policy if exists homework_completions_student_update on public.homework_completions;
create policy homework_completions_student_update on public.homework_completions
  for update to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());

drop policy if exists homework_completions_student_delete on public.homework_completions;
create policy homework_completions_student_delete on public.homework_completions
  for delete to authenticated
  using (student_id = public.my_student_id());

-- ---------------------------------------------------------------- student read access to own register row + classmates + timetable + reports

drop policy if exists students_self_read on public.students;
create policy students_self_read on public.students
  for select to authenticated
  using (
    profile_id = auth.uid()
    or id in (select public.classmate_ids())
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
    )
  );

drop policy if exists subjects_student_read on public.subjects;
create policy subjects_student_read on public.subjects
  for select to authenticated
  using ((select public.is_student()));

drop policy if exists fee_terms_student_read on public.fee_terms;
create policy fee_terms_student_read on public.fee_terms
  for select to authenticated
  using ((select public.is_student()));

drop policy if exists report_cards_student on public.report_cards;
create policy report_cards_student on public.report_cards
  for select to authenticated
  using (
    published_at is not null
    and student_id = public.my_student_id()
  );

drop policy if exists report_lines_student on public.report_lines;
create policy report_lines_student on public.report_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.report_cards c
      where c.id = report_id
        and c.published_at is not null
        and c.student_id = public.my_student_id()
    )
  );

-- Admissions may set profile_id when issuing login
drop policy if exists students_admissions_profile on public.students;
create policy students_admissions_profile on public.students
  for update to authenticated
  using ((select public.is_admissions_staff()) or (select public.is_admin()))
  with check ((select public.is_admissions_staff()) or (select public.is_admin()));

commit;
