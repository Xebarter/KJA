-- Parent ↔ school Communications: threaded parent_messages + notify helper.

alter table public.parent_messages
  add column if not exists thread_id uuid,
  add column if not exists family_id uuid references public.families (id) on delete set null,
  add column if not exists audience text not null default 'direct',
  add column if not exists created_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'parent_messages_audience_check'
      and conrelid = 'public.parent_messages'::regclass
  ) then
    alter table public.parent_messages
      add constraint parent_messages_audience_check
      check (audience in ('direct', 'family', 'broadcast'));
  end if;
end $$;

-- Backfill thread_id: one uuid per (user_id, cleaned subject), matching lib/messages.ts.
with keys as (
  select distinct
    user_id,
    coalesce(
      lower(regexp_replace(
        nullif(trim(regexp_replace(subject, '^\s*((re|fw|fwd)\s*:\s*)+', 'i')), ''),
        '\s+', ' ', 'g'
      )),
      'no subject'
    ) as subject_key
  from public.parent_messages
  where thread_id is null
),
mapped as (
  select user_id, subject_key, gen_random_uuid() as tid
  from keys
)
update public.parent_messages pm
set thread_id = mapped.tid
from mapped
where pm.thread_id is null
  and pm.user_id = mapped.user_id
  and coalesce(
    lower(regexp_replace(
      nullif(trim(regexp_replace(pm.subject, '^\s*((re|fw|fwd)\s*:\s*)+', 'i')), ''),
      '\s+', ' ', 'g'
    )),
    'no subject'
  ) = mapped.subject_key;

update public.parent_messages
set thread_id = gen_random_uuid()
where thread_id is null;

alter table public.parent_messages
  alter column thread_id set default gen_random_uuid(),
  alter column thread_id set not null;

create index if not exists parent_messages_user_created_idx
  on public.parent_messages (user_id, created_at desc);

create index if not exists parent_messages_thread_created_idx
  on public.parent_messages (thread_id, created_at);

create index if not exists parent_messages_family_idx
  on public.parent_messages (family_id)
  where family_id is not null;

create index if not exists parent_messages_out_unread_idx
  on public.parent_messages (created_at desc)
  where direction = 'out' and read = false;

-- Ensure parents still only insert outbound; admins can insert any direction.
drop policy if exists pmsg_select on public.parent_messages;
create policy pmsg_select on public.parent_messages
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists pmsg_insert on public.parent_messages;
create policy pmsg_insert on public.parent_messages
  for insert to authenticated
  with check ((user_id = auth.uid() and direction = 'out') or public.is_admin());

drop policy if exists pmsg_update on public.parent_messages;
create policy pmsg_update on public.parent_messages
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists pmsg_delete on public.parent_messages;
create policy pmsg_delete on public.parent_messages
  for delete to authenticated
  using (public.is_admin());
