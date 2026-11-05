-- Library: add Nursery section; make inventory campus-scoped.
-- Team assigns sections (nursery/lower/upper) and campuses (via desk_staff_campus_scope).
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- nursery section

alter table public.libraries drop constraint if exists libraries_id_check;
alter table public.libraries
  add constraint libraries_id_check check (id in ('nursery', 'lower', 'upper'));

insert into public.libraries (id, label, sort_order) values
  ('nursery', 'Nursery', 0),
  ('lower', 'Lower Primary', 1),
  ('upper', 'Upper Primary', 2)
on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.library_settings (library_id) values ('nursery'), ('lower'), ('upper')
on conflict (library_id) do nothing;

alter table public.library_staff_scope drop constraint if exists library_staff_scope_libraries_check;
alter table public.library_staff_scope
  add constraint library_staff_scope_libraries_check
  check (
    cardinality(libraries) >= 1
    and libraries <@ array['nursery', 'lower', 'upper']::text[]
  );

create or replace function public.library_ids_for_me()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ids text[];
  all_libs text[] := array['nursery', 'lower', 'upper']::text[];
begin
  if public.is_full_admin() then
    return all_libs;
  end if;
  select libraries into ids from public.library_staff_scope where profile_id = auth.uid();
  if ids is null or cardinality(ids) = 0 then
    if public.is_library_staff() then
      return all_libs;
    end if;
    return array[]::text[];
  end if;
  return ids;
end;
$$;

-- ---------------------------------------------------------------- campus on library operational tables

alter table public.library_items
  add column if not exists campus text not null default 'Kitante';

alter table public.library_loans
  add column if not exists campus text not null default 'Kitante';

alter table public.library_reservations
  add column if not exists campus text not null default 'Kitante';

alter table public.library_fines
  add column if not exists campus text not null default 'Kitante';

alter table public.library_stock_counts
  add column if not exists campus text not null default 'Kitante';

do $$
begin
  alter table public.library_items drop constraint if exists library_items_campus_check;
  alter table public.library_items
    add constraint library_items_campus_check
    check (campus = any (array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]));
  alter table public.library_loans drop constraint if exists library_loans_campus_check;
  alter table public.library_loans
    add constraint library_loans_campus_check
    check (campus = any (array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]));
  alter table public.library_reservations drop constraint if exists library_reservations_campus_check;
  alter table public.library_reservations
    add constraint library_reservations_campus_check
    check (campus = any (array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]));
  alter table public.library_fines drop constraint if exists library_fines_campus_check;
  alter table public.library_fines
    add constraint library_fines_campus_check
    check (campus = any (array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]));
  alter table public.library_stock_counts drop constraint if exists library_stock_counts_campus_check;
  alter table public.library_stock_counts
    add constraint library_stock_counts_campus_check
    check (campus = any (array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]));
end $$;

-- Accession unique per campus + section
drop index if exists public.library_items_accession_uniq;
create unique index library_items_accession_uniq
  on public.library_items (campus, library_id, accession)
  where accession <> '';

drop index if exists public.library_items_barcode_idx;
create index library_items_barcode_idx
  on public.library_items (campus, library_id, barcode)
  where barcode <> '';

drop index if exists public.library_items_library_idx;
create index library_items_library_idx
  on public.library_items (campus, library_id, status);

drop index if exists public.library_loans_open_idx;
create index library_loans_open_idx
  on public.library_loans (campus, library_id)
  where returned_at is null;

drop index if exists public.library_reservations_open_idx;
create index library_reservations_open_idx
  on public.library_reservations (campus, library_id, status)
  where status in ('queued', 'ready');

drop index if exists public.library_fines_unpaid_idx;
create index library_fines_unpaid_idx
  on public.library_fines (campus, library_id)
  where paid_at is null and waived_at is null;

drop index if exists public.library_stock_counts_library_idx;
create index library_stock_counts_library_idx
  on public.library_stock_counts (campus, library_id, counted_at desc);

-- ---------------------------------------------------------------- desk campus scope includes library

alter table public.desk_staff_campus_scope drop constraint if exists desk_staff_campus_scope_dashboard_check;
alter table public.desk_staff_campus_scope
  add constraint desk_staff_campus_scope_dashboard_check
  check (dashboard in ('admin', 'admissions', 'accounts', 'academics', 'store', 'library'));

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
     or p_dashboard not in ('admin', 'admissions', 'accounts', 'academics', 'store', 'library') then
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

insert into public.desk_staff_campus_scope (profile_id, dashboard, campuses)
select
  da.profile_id,
  'library',
  array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]
from public.dashboard_access da
where da.dashboard = 'library'
on conflict (profile_id, dashboard) do nothing;

insert into public.desk_staff_campus_scope (profile_id, dashboard, campuses)
select
  p.id,
  'library',
  array['Kitante', 'Najjanankumbi', 'Makindye', 'Bunga']::text[]
from public.profiles p
where p.role = 'library'
  and not exists (
    select 1 from public.desk_staff_campus_scope s
    where s.profile_id = p.id and s.dashboard = 'library'
  )
on conflict (profile_id, dashboard) do nothing;

-- ---------------------------------------------------------------- helpers + RLS

create or replace function public.can_manage_library_site(p_library text, p_campus text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_library(p_library)
    and (
      public.is_full_admin()
      or public.can_access_campus('library', p_campus)
    );
$$;

revoke all on function public.can_manage_library_site(text, text) from public;
grant execute on function public.can_manage_library_site(text, text) to authenticated, service_role;

drop policy if exists library_items_all on public.library_items;
create policy library_items_all on public.library_items
  for all to authenticated
  using (public.can_manage_library_site(library_id, campus))
  with check (public.can_manage_library_site(library_id, campus));

drop policy if exists library_loans_all on public.library_loans;
create policy library_loans_all on public.library_loans
  for all to authenticated
  using (public.can_manage_library_site(library_id, campus))
  with check (public.can_manage_library_site(library_id, campus));

drop policy if exists library_reservations_all on public.library_reservations;
create policy library_reservations_all on public.library_reservations
  for all to authenticated
  using (public.can_manage_library_site(library_id, campus))
  with check (public.can_manage_library_site(library_id, campus));

drop policy if exists library_fines_all on public.library_fines;
create policy library_fines_all on public.library_fines
  for all to authenticated
  using (public.can_manage_library_site(library_id, campus))
  with check (public.can_manage_library_site(library_id, campus));

drop policy if exists library_stock_counts_all on public.library_stock_counts;
create policy library_stock_counts_all on public.library_stock_counts
  for all to authenticated
  using (public.can_manage_library_site(library_id, campus))
  with check (public.can_manage_library_site(library_id, campus));

drop policy if exists library_stock_lines_all on public.library_stock_lines;
create policy library_stock_lines_all on public.library_stock_lines
  for all to authenticated
  using (
    exists (
      select 1 from public.library_stock_counts c
      where c.id = count_id and public.can_manage_library_site(c.library_id, c.campus)
    )
  )
  with check (
    exists (
      select 1 from public.library_stock_counts c
      where c.id = count_id and public.can_manage_library_site(c.library_id, c.campus)
    )
  );

commit;
