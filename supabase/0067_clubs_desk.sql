-- Clubs desk: standalone dashboard, ops tables, migrate accounts:clubs grants.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- role + dashboard access

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'admissions', 'accounts', 'academics', 'library', 'store', 'clubs', 'officer', 'staff', 'parent', 'student'));

alter table public.dashboard_access drop constraint if exists dashboard_access_dashboard_check;
alter table public.dashboard_access add constraint dashboard_access_dashboard_check
  check (dashboard in ('admin', 'admissions', 'accounts', 'academics', 'library', 'store', 'clubs'));

create or replace function public.is_clubs_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.is_full_admin()
    or exists (
      select 1 from public.dashboard_grant_lookup
      where profile_id = auth.uid() and dashboard = 'clubs'
    )
    or exists (
      select 1 from public.profile_role_lookup
      where id = auth.uid() and role = 'clubs'
    );
end;
$$;

revoke all on function public.is_clubs_staff() from public;
grant execute on function public.is_clubs_staff() to authenticated, service_role;

-- ---------------------------------------------------------------- campus scope

alter table public.desk_staff_campus_scope drop constraint if exists desk_staff_campus_scope_dashboard_check;
alter table public.desk_staff_campus_scope
  add constraint desk_staff_campus_scope_dashboard_check
  check (dashboard in ('admin', 'admissions', 'accounts', 'academics', 'store', 'library', 'clubs'));

create or replace function public.campus_ids_for_desk(p_dashboard text)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ids text[];
  all_campuses text[] := array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[];
begin
  if public.is_full_admin() then
    return all_campuses;
  end if;
  if p_dashboard is null
     or p_dashboard not in ('admin', 'admissions', 'accounts', 'academics', 'store', 'library', 'clubs') then
    return all_campuses;
  end if;
  select campuses into ids
  from public.desk_staff_campus_scope
  where profile_id = auth.uid() and dashboard = p_dashboard;
  if ids is null or cardinality(ids) = 0 then
    if exists (
      select 1 from public.dashboard_grant_lookup
      where profile_id = auth.uid() and dashboard = p_dashboard
    ) then
      return all_campuses;
    end if;
    if exists (
      select 1 from public.profile_role_lookup
      where id = auth.uid() and role = p_dashboard
    ) then
      return all_campuses;
    end if;
    return array[]::text[];
  end if;
  return ids;
end;
$$;

create or replace function public.can_access_clubs_campus(p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_full_admin()
    or public.can_access_campus('clubs', p_campus);
$$;

revoke all on function public.can_access_clubs_campus(text) from public;
grant execute on function public.can_access_clubs_campus(text) to authenticated, service_role;

-- ---------------------------------------------------------------- migrate accounts:clubs → clubs desk

insert into public.dashboard_access (profile_id, dashboard, pages)
select
  da.profile_id,
  'clubs',
  '{}'::text[]
from public.dashboard_access da
where da.dashboard = 'accounts'
  and (
    cardinality(coalesce(da.pages, '{}'::text[])) = 0
    or 'clubs' = any (da.pages)
  )
on conflict (profile_id, dashboard) do nothing;

update public.dashboard_access
set pages = array_remove(pages, 'clubs')
where dashboard = 'accounts'
  and 'clubs' = any (pages);

insert into public.desk_staff_campus_scope (profile_id, dashboard, campuses)
select
  da.profile_id,
  'clubs',
  array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]
from public.dashboard_access da
where da.dashboard = 'clubs'
on conflict (profile_id, dashboard) do nothing;

insert into public.desk_staff_campus_scope (profile_id, dashboard, campuses)
select
  p.id,
  'clubs',
  array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]
from public.profiles p
where p.role = 'clubs'
  and not exists (
    select 1 from public.desk_staff_campus_scope s
    where s.profile_id = p.id and s.dashboard = 'clubs'
  )
on conflict (profile_id, dashboard) do nothing;

-- ---------------------------------------------------------------- ops tables

create table if not exists public.club_leaders (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'patron' check (role in ('patron', 'assistant')),
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists club_leaders_open_idx
  on public.club_leaders (club_id, profile_id)
  where active;

create index if not exists club_leaders_club_idx on public.club_leaders (club_id) where active;
create index if not exists club_leaders_profile_idx on public.club_leaders (profile_id) where active;

create table if not exists public.club_schedules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  venue text not null default '',
  campus text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_schedules_time_check check (end_time > start_time)
);

create index if not exists club_schedules_club_idx
  on public.club_schedules (club_id)
  where active;

create table if not exists public.club_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  held_on date not null,
  schedule_id uuid references public.club_schedules (id) on delete set null,
  term_id uuid references public.fee_terms (id) on delete set null,
  venue text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists club_sessions_club_day_idx on public.club_sessions (club_id, held_on desc);
create index if not exists club_sessions_term_idx on public.club_sessions (term_id);

create table if not exists public.club_attendance (
  session_id uuid not null references public.club_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  note text not null default '',
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create index if not exists club_attendance_student_idx on public.club_attendance (student_id);

-- ---------------------------------------------------------------- RLS existing tables (clubs staff + accounts)

drop policy if exists clubs_accounts on public.clubs;
create policy clubs_accounts on public.clubs for all to authenticated
  using ((select public.is_accounts_staff()) or (select public.is_clubs_staff()))
  with check ((select public.is_accounts_staff()) or (select public.is_clubs_staff()));

drop policy if exists club_consents_accounts on public.club_consents;
create policy club_consents_accounts on public.club_consents for select to authenticated
  using ((select public.is_accounts_staff()) or (select public.is_clubs_staff()));

drop policy if exists club_consents_clubs_write on public.club_consents;
create policy club_consents_clubs_write on public.club_consents for insert to authenticated
  with check ((select public.is_clubs_staff()));

drop policy if exists club_consents_clubs_update on public.club_consents;
create policy club_consents_clubs_update on public.club_consents for update to authenticated
  using ((select public.is_clubs_staff()))
  with check ((select public.is_clubs_staff()));

drop policy if exists club_collections_accounts on public.club_collections;
create policy club_collections_accounts on public.club_collections for select to authenticated
  using ((select public.is_accounts_staff()) or (select public.is_clubs_staff()));

drop policy if exists club_collection_items_accounts on public.club_collection_items;
do $$
begin
  if to_regclass('public.club_collection_items') is not null then
    execute 'drop policy if exists club_collection_items_accounts on public.club_collection_items';
    execute $pol$
      create policy club_collection_items_accounts on public.club_collection_items for select to authenticated
        using ((select public.is_accounts_staff()) or (select public.is_clubs_staff()))
    $pol$;
  end if;
exception when others then
  raise notice 'club_collection_items policy skipped: %', sqlerrm;
end $$;

drop policy if exists club_payments_accounts on public.club_payments;
create policy club_payments_accounts on public.club_payments for all to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

drop policy if exists club_payments_clubs_select on public.club_payments;
create policy club_payments_clubs_select on public.club_payments for select to authenticated
  using ((select public.is_clubs_staff()));

-- ---------------------------------------------------------------- RLS new ops tables

alter table public.club_leaders enable row level security;
alter table public.club_schedules enable row level security;
alter table public.club_sessions enable row level security;
alter table public.club_attendance enable row level security;

drop policy if exists club_leaders_clubs on public.club_leaders;
create policy club_leaders_clubs on public.club_leaders for all to authenticated
  using ((select public.is_clubs_staff()) or (select public.is_accounts_staff()))
  with check ((select public.is_clubs_staff()));

drop policy if exists club_schedules_clubs on public.club_schedules;
create policy club_schedules_clubs on public.club_schedules for all to authenticated
  using ((select public.is_clubs_staff()) or (select public.is_accounts_staff()))
  with check ((select public.is_clubs_staff()));

drop policy if exists club_sessions_clubs on public.club_sessions;
create policy club_sessions_clubs on public.club_sessions for all to authenticated
  using ((select public.is_clubs_staff()) or (select public.is_accounts_staff()))
  with check ((select public.is_clubs_staff()));

drop policy if exists club_attendance_clubs on public.club_attendance;
create policy club_attendance_clubs on public.club_attendance for all to authenticated
  using ((select public.is_clubs_staff()) or (select public.is_accounts_staff()))
  with check ((select public.is_clubs_staff()));

grant select, insert, update, delete on public.club_leaders to authenticated;
grant select, insert, update, delete on public.club_schedules to authenticated;
grant select, insert, update, delete on public.club_sessions to authenticated;
grant select, insert, update, delete on public.club_attendance to authenticated;

commit;
