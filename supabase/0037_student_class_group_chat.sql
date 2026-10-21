-- Class group chat: one shared conversation per class+stream (WhatsApp-style group).

alter table public.student_conversations
  add column if not exists kind text not null default 'dm';

alter table public.student_conversations
  add column if not exists class_code text;

alter table public.student_conversations
  add column if not exists stream text not null default '';

update public.student_conversations
set kind = 'dm'
where kind is null or kind = '';

alter table public.student_conversations
  drop constraint if exists student_conversations_check;

alter table public.student_conversations
  alter column student_low_id drop not null;

alter table public.student_conversations
  alter column student_high_id drop not null;

alter table public.student_conversations
  drop constraint if exists student_conversations_student_low_id_student_high_id_key;

drop index if exists public.student_conversations_dm_pair_uidx;
create unique index student_conversations_dm_pair_uidx
  on public.student_conversations (student_low_id, student_high_id)
  where kind = 'dm';

drop index if exists public.student_conversations_class_group_uidx;
create unique index student_conversations_class_group_uidx
  on public.student_conversations (class_code, stream)
  where kind = 'class_group';

alter table public.student_conversations
  drop constraint if exists student_conversations_kind_shape;

alter table public.student_conversations
  add constraint student_conversations_kind_shape check (
    (
      kind = 'dm'
      and student_low_id is not null
      and student_high_id is not null
      and student_low_id < student_high_id
      and class_code is null
    )
    or (
      kind = 'class_group'
      and class_code is not null
      and student_low_id is null
      and student_high_id is null
    )
  );

alter table public.student_conversations
  drop constraint if exists student_conversations_kind_check;

alter table public.student_conversations
  add constraint student_conversations_kind_check check (kind in ('dm', 'class_group'));

create or replace function public.is_class_group_member(p_class_code text, p_stream text)
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
          and public.is_class_group_member(c.class_code, c.stream)
        )
      )
  );
$$;

create or replace function public.student_conversations_classmate_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'class_group' then
    return new;
  end if;
  if new.student_low_id is null or new.student_high_id is null then
    raise exception 'Direct chats need two students';
  end if;
  if not public.are_classmates(new.student_low_id, new.student_high_id) then
    raise exception 'Students must be classmates to start a conversation';
  end if;
  return new;
end;
$$;

create or replace function public.student_messages_sender_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.my_student_id();
begin
  if (select public.is_academics_staff()) then
    return new;
  end if;
  if me is null or new.sender_student_id <> me then
    raise exception 'You can only send messages as yourself';
  end if;
  if not public.is_student_conversation_participant(new.conversation_id) then
    raise exception 'You are not part of this conversation';
  end if;
  return new;
end;
$$;

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
      and public.is_class_group_member(class_code, stream)
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
      and public.is_class_group_member(class_code, stream)
    )
  );

drop policy if exists student_messages_participant on public.student_messages;
create policy student_messages_participant on public.student_messages
  for select to authenticated
  using (
    (select public.is_academics_staff())
    or (
      not hidden
      and public.is_student_conversation_participant(conversation_id)
    )
  );

drop policy if exists student_messages_insert on public.student_messages;
create policy student_messages_insert on public.student_messages
  for insert to authenticated
  with check (
    sender_student_id = public.my_student_id()
    and public.is_student_conversation_participant(conversation_id)
  );

create or replace function public.ensure_my_class_group()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me_class text;
  me_stream text;
  cid uuid;
begin
  select class_code, coalesce(stream, '')
    into me_class, me_stream
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
  limit 1;

  if cid is not null then
    return cid;
  end if;

  begin
    insert into public.student_conversations (kind, class_code, stream, student_low_id, student_high_id)
    values ('class_group', me_class, me_stream, null, null)
    returning id into cid;
    return cid;
  exception
    when unique_violation then
      select id into cid
      from public.student_conversations
      where kind = 'class_group'
        and class_code = me_class
        and stream = me_stream
      limit 1;
      return cid;
  end;
end;
$$;

grant execute on function public.is_class_group_member(text, text) to authenticated;
grant execute on function public.is_student_conversation_participant(uuid) to authenticated;
grant execute on function public.ensure_my_class_group() to authenticated;
