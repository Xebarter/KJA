-- Dashboard grants. Run after 0047_teacher_photo_read.sql (safe to re-run).
-- One person can open more than one dashboard, and can be limited to pages inside a dashboard.
-- An empty pages array means every page of that dashboard.
-- profiles.role = admin still means every dashboard. officer is a person with grants who is not a single-office role.

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'admissions', 'accounts', 'academics', 'officer', 'staff', 'parent', 'student'));

create table if not exists public.dashboard_access (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  dashboard text not null check (dashboard in ('admin', 'admissions', 'accounts', 'academics')),
  pages text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (profile_id, dashboard)
);

create index if not exists dashboard_access_dashboard_idx on public.dashboard_access (dashboard);

alter table public.dashboard_access enable row level security;

-- Policies must not query profiles or dashboard_access directly. A profile
-- policy that reads dashboard_access, whose policy reads profiles, loops:
-- "infinite recursion detected in policy for relation profiles".
-- These views run as their owner, so the underlying row policies are not re-entered.
-- They are not granted to the API roles.
create or replace view public.profile_role_lookup
with (security_invoker = false) as
select id, role
from public.profiles;

create or replace view public.dashboard_grant_lookup
with (security_invoker = false) as
select profile_id, dashboard
from public.dashboard_access;

revoke all on table public.profile_role_lookup from public, anon, authenticated, service_role;
revoke all on table public.dashboard_grant_lookup from public, anon, authenticated, service_role;

-- A grant for a dashboard opens that dashboard's existing policies.
-- role = admin still opens every office, which is what a full administrator is.
-- plpgsql so Postgres does not inline these into the calling policy.

create or replace function public.is_full_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profile_role_lookup
    where id = auth.uid() and role = 'admin'
  );
end;
$$;

create or replace function public.is_admin()
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
      where profile_id = auth.uid() and dashboard = 'admin'
    );
end;
$$;

create or replace function public.is_admissions_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profile_role_lookup
    where id = auth.uid() and role in ('admin', 'admissions')
  ) or exists (
    select 1 from public.dashboard_grant_lookup
    where profile_id = auth.uid() and dashboard = 'admissions'
  );
end;
$$;

create or replace function public.is_accounts_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profile_role_lookup
    where id = auth.uid() and role in ('admin', 'accounts')
  ) or exists (
    select 1 from public.dashboard_grant_lookup
    where profile_id = auth.uid() and dashboard = 'accounts'
  );
end;
$$;

create or replace function public.is_academics_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profile_role_lookup
    where id = auth.uid() and role in ('admin', 'academics')
  ) or exists (
    select 1 from public.dashboard_grant_lookup
    where profile_id = auth.uid() and dashboard = 'academics'
  );
end;
$$;

create or replace function public.profile_has_dashboard(target uuid, office text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.dashboard_grant_lookup
    where profile_id = target and dashboard = office
  );
end;
$$;

drop policy if exists dashboard_access_select on public.dashboard_access;
create policy dashboard_access_select on public.dashboard_access
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_full_admin())
  );

-- Colleagues who share a dashboard stay visible to that office, including officer accounts.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (
      (select public.is_admissions_staff())
      and (
        role in ('admin', 'admissions')
        or public.profile_has_dashboard(id, 'admissions')
      )
    )
    or (
      (select public.is_accounts_staff())
      and (
        role in ('admin', 'accounts')
        or public.profile_has_dashboard(id, 'accounts')
      )
    )
    or (
      (select public.is_academics_staff())
      and (
        role in ('admin', 'academics')
        or public.profile_has_dashboard(id, 'academics')
      )
    )
  );

-- is_admin() is now true for any admin-dashboard grant. Role changes stay with a full
-- administrator (profiles.role = admin) or a service-role session, and the last admin remains.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_admin boolean;
begin
  full_admin := (select auth.uid()) is null or public.is_full_admin();
  if tg_op = 'INSERT' then
    if new.role <> 'parent' and not full_admin then
      new.role := 'parent';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role then
    if not full_admin then
      raise exception 'Only an administrator can change a role.';
    end if;
    if old.role = 'admin' and (select count(*) from public.profile_role_lookup where role = 'admin') <= 1 then
      raise exception 'Keep at least one admin.';
    end if;
  end if;
  return new;
end;
$$;

-- Editing someone else's profile stays with a full administrator.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_full_admin())
  )
  with check (
    id = (select auth.uid())
    or (select public.is_full_admin())
  );

-- Current team: admins already open every office. Officers keep the one office they have.
insert into public.dashboard_access (profile_id, dashboard, pages)
select id, dashboard, '{}'
from public.profiles
cross join (
  values ('admin'), ('admissions'), ('accounts'), ('academics')
) as offices (dashboard)
where role = 'admin'
on conflict (profile_id, dashboard) do nothing;

insert into public.dashboard_access (profile_id, dashboard, pages)
select id, role, '{}'
from public.profiles
where role in ('admissions', 'accounts', 'academics')
on conflict (profile_id, dashboard) do nothing;

grant select on public.dashboard_access to authenticated;
grant execute on function public.is_full_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admissions_staff() to authenticated;
grant execute on function public.is_accounts_staff() to authenticated;
grant execute on function public.is_academics_staff() to authenticated;
grant execute on function public.profile_has_dashboard(uuid, text) to authenticated;

commit;
