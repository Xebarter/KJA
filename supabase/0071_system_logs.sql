-- School-wide activity trail for the admin Logs desk.
-- Lean append-only rows; domain *_activity tables stay as the desk-local timelines.

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  source text not null
    check (source in (
      'accounts', 'admissions', 'academics', 'applications', 'jobs',
      'store', 'library', 'clubs', 'cms', 'team', 'portal', 'system'
    )),
  kind text not null default 'note',
  severity text not null default 'info'
    check (severity in ('info', 'notice', 'sensitive')),
  body text not null,
  entity_type text,
  entity_id uuid,
  student_id uuid references public.students (id) on delete set null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists system_logs_created_idx on public.system_logs (created_at desc);
create index if not exists system_logs_source_created_idx on public.system_logs (source, created_at desc);
create index if not exists system_logs_actor_created_idx on public.system_logs (actor_id, created_at desc);
create index if not exists system_logs_severity_created_idx on public.system_logs (severity, created_at desc)
  where severity = 'sensitive';
create index if not exists system_logs_student_created_idx on public.system_logs (student_id, created_at desc)
  where student_id is not null;

alter table public.system_logs enable row level security;

drop policy if exists system_logs_select on public.system_logs;
create policy system_logs_select on public.system_logs
  for select to authenticated
  using ((select public.is_full_admin()));

drop policy if exists system_logs_insert on public.system_logs;
create policy system_logs_insert on public.system_logs
  for insert to authenticated
  with check (actor_id is null or actor_id = auth.uid() or (select public.is_full_admin()));

drop policy if exists system_logs_delete on public.system_logs;
create policy system_logs_delete on public.system_logs
  for delete to authenticated
  using ((select public.is_full_admin()));

grant select, insert, delete on public.system_logs to authenticated;
grant all on public.system_logs to service_role;

create or replace function public.purge_system_logs(days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if days is null or days < 30 then
    raise exception 'purge_system_logs: days must be at least 30';
  end if;
  delete from public.system_logs
  where created_at < now() - make_interval(days => days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_system_logs(integer) from public, anon, authenticated;
grant execute on function public.purge_system_logs(integer) to service_role;

-- One-time backfill: last 365 days from existing domain trails.
do $$
declare
  since timestamptz := now() - interval '365 days';
begin
  insert into public.system_logs (id, created_at, actor_id, source, kind, severity, body, entity_type, entity_id, student_id)
  select
    a.id,
    a.created_at,
    a.actor_id,
    'accounts',
    a.kind,
    case when a.kind in ('void', 'discount') then 'sensitive' else 'info' end,
    left(a.body, 2000),
    a.entity,
    a.entity_id,
    a.student_id
  from public.account_activity a
  where a.created_at >= since
  on conflict (id) do nothing;

  insert into public.system_logs (id, created_at, actor_id, source, kind, severity, body, entity_type, entity_id, student_id)
  select
    s.id,
    s.created_at,
    s.actor_id,
    'admissions',
    s.kind,
    case when s.kind in ('enrol', 'status', 'promotion') then 'notice' else 'info' end,
    left(s.body, 2000),
    'student',
    s.student_id,
    s.student_id
  from public.student_activity s
  where s.created_at >= since
  on conflict (id) do nothing;

  insert into public.system_logs (id, created_at, actor_id, source, kind, severity, body, entity_type, entity_id)
  select
    a.id,
    a.created_at,
    a.actor_id,
    'applications',
    a.kind,
    case when a.kind in ('status', 'assign') then 'notice' else 'info' end,
    left(a.body, 2000),
    'application',
    a.application_id
  from public.application_activity a
  where a.created_at >= since
  on conflict (id) do nothing;

  insert into public.system_logs (id, created_at, actor_id, source, kind, severity, body, entity_type, entity_id)
  select
    j.id,
    j.created_at,
    j.actor_id,
    'jobs',
    j.kind,
    case when j.kind in ('status', 'assign') then 'notice' else 'info' end,
    left(j.body, 2000),
    'job_application',
    j.application_id
  from public.job_application_activity j
  where j.created_at >= since
  on conflict (id) do nothing;

  insert into public.system_logs (id, created_at, actor_id, source, kind, severity, body)
  select
    a.id,
    a.created_at,
    a.actor_id,
    'academics',
    a.kind,
    'info',
    left(a.body, 2000)
  from public.academic_activity a
  where a.created_at >= since
  on conflict (id) do nothing;

  if to_regclass('public.store_stock_movements') is not null then
    insert into public.system_logs (id, created_at, actor_id, source, kind, severity, body, entity_type, entity_id)
    select
      m.id,
      m.created_at,
      m.created_by,
      'store',
      m.kind,
      case when m.kind = 'void' then 'sensitive' else 'info' end,
      left(
        coalesce(nullif(m.note, ''), initcap(replace(m.kind, '_', ' ')) || ' stock movement')
          || ' (' || trim(to_char(m.qty_delta, 'FM999999990.999')) || ')',
        2000
      ),
      coalesce(nullif(m.ref_table, ''), 'store_item'),
      coalesce(m.ref_id, m.item_id)
    from public.store_stock_movements m
    where m.created_at >= since
    on conflict (id) do nothing;
  end if;
end $$;
