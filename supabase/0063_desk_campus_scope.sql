-- Per-desk geographic campus grants for Team access.
-- Campuses: Kitante, Najjanankumbi, Makindye, Bunga.
-- Library keeps lower/upper via library_staff_scope (not geographic).
-- Safe to re-run.

begin;

create table if not exists public.desk_staff_campus_scope (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  dashboard text not null
    check (dashboard in ('admin', 'admissions', 'accounts', 'academics', 'store')),
  campuses text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, dashboard),
  constraint desk_staff_campus_scope_campuses_check
    check (
      cardinality(campuses) >= 1
      and campuses <@ array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]
    )
);

alter table public.desk_staff_campus_scope enable row level security;

drop policy if exists desk_staff_campus_scope_select on public.desk_staff_campus_scope;
create policy desk_staff_campus_scope_select on public.desk_staff_campus_scope
  for select to authenticated
  using (profile_id = auth.uid() or public.is_full_admin());

-- No insert/update/delete for authenticated — service role only (Team save).

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
  if p_dashboard is null or p_dashboard not in ('admin', 'admissions', 'accounts', 'academics', 'store') then
    return all_campuses;
  end if;
  select campuses into ids
  from public.desk_staff_campus_scope
  where profile_id = auth.uid() and dashboard = p_dashboard;
  if ids is null or cardinality(ids) = 0 then
    -- Desk grant without a scope row: treat as all campuses until Team assigns.
    if exists (
      select 1 from public.dashboard_grant_lookup
      where profile_id = auth.uid() and dashboard = p_dashboard
    ) then
      return all_campuses;
    end if;
    -- Legacy single-desk role without dashboard_access row.
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

revoke all on function public.campus_ids_for_desk(text) from public;
grant execute on function public.campus_ids_for_desk(text) to authenticated, service_role;

create or replace function public.can_access_campus(p_dashboard text, p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p_campus, '') <> ''
    and p_campus = any (public.campus_ids_for_desk(p_dashboard));
$$;

revoke all on function public.can_access_campus(text, text) from public;
grant execute on function public.can_access_campus(text, text) to authenticated, service_role;

-- Admissions staff may see a row if its campus is in their admissions or admin desk scope.
create or replace function public.can_access_admissions_campus(p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_full_admin()
    or public.can_access_campus('admissions', p_campus)
    or public.can_access_campus('admin', p_campus);
$$;

revoke all on function public.can_access_admissions_campus(text) from public;
grant execute on function public.can_access_admissions_campus(text) to authenticated, service_role;

create or replace function public.can_access_accounts_campus(p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_full_admin()
    or public.can_access_campus('accounts', p_campus);
$$;

revoke all on function public.can_access_accounts_campus(text) from public;
grant execute on function public.can_access_accounts_campus(text) to authenticated, service_role;

create or replace function public.can_access_academics_campus(p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_full_admin()
    or public.can_access_campus('academics', p_campus);
$$;

revoke all on function public.can_access_academics_campus(text) from public;
grant execute on function public.can_access_academics_campus(text) to authenticated, service_role;

-- Backfill: existing desk grants get all four campuses so nothing locks out overnight.
insert into public.desk_staff_campus_scope (profile_id, dashboard, campuses)
select
  da.profile_id,
  da.dashboard,
  array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]
from public.dashboard_access da
where da.dashboard in ('admin', 'admissions', 'accounts', 'academics', 'store')
on conflict (profile_id, dashboard) do nothing;

insert into public.desk_staff_campus_scope (profile_id, dashboard, campuses)
select
  p.id,
  p.role,
  array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]
from public.profiles p
where p.role in ('admin', 'admissions', 'accounts', 'academics', 'store')
  and not exists (
    select 1 from public.desk_staff_campus_scope s
    where s.profile_id = p.id and s.dashboard = p.role
  )
on conflict (profile_id, dashboard) do nothing;

-- Applications: staff select/update/delete limited by campus scope.
drop policy if exists applications_admin on public.applications;
create policy applications_admin on public.applications for select to authenticated
  using (
    (select public.is_admissions_staff())
    and (select public.can_access_admissions_campus(campus))
  );

drop policy if exists applications_own_read on public.applications;
create policy applications_own_read on public.applications for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select public.is_admissions_staff())
      and (select public.can_access_admissions_campus(campus))
    )
  );

drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications for update to authenticated
  using (
    (select public.is_admissions_staff())
    and (select public.can_access_admissions_campus(campus))
  )
  with check (
    (select public.is_admissions_staff())
    and (select public.can_access_admissions_campus(campus))
  );

drop policy if exists applications_delete on public.applications;
create policy applications_delete on public.applications for delete to authenticated
  using (
    (select public.is_admissions_staff())
    and (select public.can_access_admissions_campus(campus))
  );

-- Expenses: accounts staff limited by campus when campus is set; blank campus stays visible to accounts staff.
do $$
begin
  if to_regclass('public.expenses') is not null then
    execute 'drop policy if exists expenses_staff_all on public.expenses';
    execute $pol$
      create policy expenses_staff_all on public.expenses for all to authenticated
        using (
          (select public.is_accounts_staff())
          and (
            coalesce(campus, '') = ''
            or (select public.can_access_accounts_campus(campus))
          )
        )
        with check (
          (select public.is_accounts_staff())
          and (
            coalesce(campus, '') = ''
            or (select public.can_access_accounts_campus(campus))
          )
        )
    $pol$;
  end if;
exception when others then
  raise notice 'expenses campus policy skipped: %', sqlerrm;
end $$;

commit;
