-- Teacher dashboard: class calendar dates, class notices, and class-teacher chat review.
-- Run after 0037_student_class_group_chat.sql and 0040_class_resources.sql (safe to re-run).

begin;

-- ---------------------------------------------------------------- class-scoped calendar dates

alter table public.academic_dates
  add column if not exists class_code text,
  add column if not exists stream text;

alter table public.academic_dates
  drop constraint if exists academic_dates_class_scope;

alter table public.academic_dates
  add constraint academic_dates_class_scope check (
    (class_code is null and stream is null)
    or (class_code is not null and stream is not null)
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
          and public.is_class_teacher(t.id, academic_dates.class_code, coalesce(academic_dates.stream, ''))
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
        and public.is_class_teacher(t.id, academic_dates.class_code, coalesce(academic_dates.stream, ''))
    )
  )
  with check (
    class_code is not null
    and exists (
      select 1 from public.fee_terms t
      where t.id = academic_dates.term_id
        and t.is_current
        and public.is_class_teacher(t.id, academic_dates.class_code, coalesce(academic_dates.stream, ''))
    )
  );

drop policy if exists academic_dates_student on public.academic_dates;
create policy academic_dates_student on public.academic_dates
  for select to authenticated
  using (
    (select public.is_student())
    and exists (
      select 1 from public.fee_terms t
      where t.id = academic_dates.term_id and t.is_current
    )
    and (
      class_code is null
      or exists (
        select 1 from public.students me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.class_code = academic_dates.class_code
          and coalesce(me.stream, '') = coalesce(academic_dates.stream, '')
      )
    )
  );

-- ---------------------------------------------------------------- class notices

create table if not exists public.class_notices (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_code text not null,
  stream text not null default '',
  title text not null,
  body text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.class_notices enable row level security;

drop policy if exists class_notices_office on public.class_notices;
create policy class_notices_office on public.class_notices
  for select to authenticated
  using ((select public.is_academics_staff()));

drop policy if exists class_notices_teacher on public.class_notices;
create policy class_notices_teacher on public.class_notices
  for select to authenticated
  using (
    exists (
      select 1 from public.fee_terms t
      where t.id = class_notices.term_id
        and public.is_class_teacher(t.id, class_notices.class_code, class_notices.stream)
    )
  );

grant select on public.class_notices to authenticated;

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
begin
  v_title := left(trim(coalesce(p_title, '')), 160);
  if v_title = '' then
    raise exception 'Write a title.';
  end if;
  v_body := nullif(left(trim(coalesce(p_body, '')), 2000), '');
  v_stream := coalesce(p_stream, '');

  select id into v_term from public.fee_terms where is_current limit 1;
  if v_term is null then
    raise exception 'Set a current term first.';
  end if;
  if not public.is_class_teacher(v_term, p_class_code, v_stream) then
    raise exception 'Only the class teacher can notify this class.';
  end if;

  insert into public.class_notices (term_id, class_code, stream, title, body, created_by)
  values (v_term, p_class_code, v_stream, v_title, v_body, auth.uid())
  returning id into v_notice;

  insert into public.notifications (user_id, title, body, href, kind)
  select pupil.profile_id, v_title, v_body, '/student/notifications', 'school'
  from public.students pupil
  where pupil.status = 'active'
    and pupil.class_code = p_class_code
    and coalesce(pupil.stream, '') = v_stream
    and pupil.profile_id is not null;

  return v_notice;
end;
$$;

grant execute on function public.notify_my_class(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- class-teacher chat review

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
          and public.is_class_teacher(t.id, c.class_code, coalesce(c.stream, ''))
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
              and public.is_class_teacher(t.id, low_pupil.class_code, coalesce(low_pupil.stream, ''))
          )
        )
      )
  );
$$;

grant execute on function public.class_teacher_sees_conversation(uuid) to authenticated;

drop policy if exists student_conversations_class_teacher on public.student_conversations;
create policy student_conversations_class_teacher on public.student_conversations
  for select to authenticated
  using (public.class_teacher_sees_conversation(id));

drop policy if exists student_messages_participant on public.student_messages;
create policy student_messages_participant on public.student_messages
  for select to authenticated
  using (
    (select public.is_academics_staff())
    or public.class_teacher_sees_conversation(conversation_id)
    or (
      not hidden
      and public.is_student_conversation_participant(conversation_id)
    )
  );

drop policy if exists student_messages_staff_update on public.student_messages;
create policy student_messages_staff_update on public.student_messages
  for update to authenticated
  using (
    (select public.is_academics_staff())
    or public.class_teacher_sees_conversation(conversation_id)
  )
  with check (
    (select public.is_academics_staff())
    or public.class_teacher_sees_conversation(conversation_id)
  );

create or replace function public.student_messages_teacher_hide_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select public.is_academics_staff()) then
    return new;
  end if;
  if new.hidden is not true
     or new.body is distinct from old.body
     or new.flagged is distinct from old.flagged
     or new.sender_student_id is distinct from old.sender_student_id
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Teachers can only hide a message.';
  end if;
  return new;
end;
$$;

drop trigger if exists student_messages_teacher_hide_guard on public.student_messages;
create trigger student_messages_teacher_hide_guard
  before update on public.student_messages
  for each row execute function public.student_messages_teacher_hide_only();

commit;
