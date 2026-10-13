-- Admissions dashboard. Run after 0001_schema.sql and 0003_parent_portal.sql (safe to re-run).

alter table public.applications add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.applications add column if not exists status text not null default 'received';
alter table public.applications add column if not exists grade text;
alter table public.applications add column if not exists child_dob date;
alter table public.applications add column if not exists assigned_to uuid references public.profiles (id) on delete set null;
alter table public.applications add column if not exists visit_at timestamptz;
alter table public.applications add column if not exists updated_at timestamptz not null default now();
alter table public.applications add column if not exists updated_by uuid references public.profiles (id) on delete set null;

update public.applications set status = 'received'
where status not in ('received', 'reviewing', 'visit_scheduled', 'offered', 'enrolled', 'waitlisted', 'declined', 'withdrawn');
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('received', 'reviewing', 'visit_scheduled', 'offered', 'enrolled', 'waitlisted', 'declined', 'withdrawn'));

create index if not exists applications_created_idx on public.applications (created_at desc);
create index if not exists applications_status_idx on public.applications (status);
create index if not exists applications_assigned_idx on public.applications (assigned_to);

create or replace function public.touch_application()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'read' - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'read' - 'updated_at' - 'updated_by') then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch
  before update on public.applications
  for each row execute function public.touch_application();

-- Shared timeline of notes and changes, so every admin sees who did what.
create table if not exists public.application_activity (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'status', 'assign', 'visit')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists application_activity_app_idx on public.application_activity (application_id, created_at desc);
alter table public.application_activity enable row level security;

drop policy if exists activity_select on public.application_activity;
create policy activity_select on public.application_activity for select to authenticated using (public.is_admin());
drop policy if exists activity_insert on public.application_activity;
create policy activity_insert on public.application_activity for insert to authenticated
  with check (public.is_admin() and actor_id = auth.uid());
drop policy if exists activity_delete on public.application_activity;
create policy activity_delete on public.application_activity for delete to authenticated
  using (public.is_admin() and actor_id = auth.uid() and kind = 'note');

-- The public form may only create fresh applications.
drop policy if exists applications_insert on public.applications;
drop policy if exists applications_own_insert on public.applications;
create policy applications_insert on public.applications for insert to anon, authenticated
  with check (
    status = 'received' and assigned_to is null and visit_at is null
    and (user_id is null or user_id = auth.uid())
  );

-- Only admins may change roles, and the last admin cannot be removed.
-- SQL editor and service-role sessions (no auth.uid()) are allowed, so the first admin can be set up.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'parent' and auth.uid() is not null and not public.is_admin() then
      new.role := 'parent';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only admins can change roles.';
    end if;
    if old.role = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Keep at least one admin.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role();
