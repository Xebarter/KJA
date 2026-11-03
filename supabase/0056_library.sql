-- Library desk: Lower / Upper Primary catalogues, loans, reservations, fines, stock.
-- Safe to re-run.

begin;

-- Allow library as a single-desk profiles.role (Team → roleForGrants).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'admissions', 'accounts', 'academics', 'library', 'officer', 'staff', 'parent', 'student'));

-- Widen dashboard_access check to include library.
alter table public.dashboard_access drop constraint if exists dashboard_access_dashboard_check;
alter table public.dashboard_access add constraint dashboard_access_dashboard_check
  check (dashboard in ('admin', 'admissions', 'accounts', 'academics', 'library'));

create or replace function public.is_library_staff()
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
      where profile_id = auth.uid() and dashboard = 'library'
    )
    or exists (
      select 1 from public.profile_role_lookup
      where id = auth.uid() and role = 'library'
    );
end;
$$;

revoke all on function public.is_library_staff() from public;
grant execute on function public.is_library_staff() to authenticated, service_role;

-- Which physical libraries a staffer may manage (lower / upper).
create table if not exists public.library_staff_scope (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  libraries text[] not null default '{lower}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_staff_scope_libraries_check
    check (
      cardinality(libraries) >= 1
      and libraries <@ array['lower', 'upper']::text[]
    )
);

alter table public.library_staff_scope enable row level security;

drop policy if exists library_staff_scope_select on public.library_staff_scope;
create policy library_staff_scope_select on public.library_staff_scope
  for select to authenticated
  using (profile_id = auth.uid() or public.is_full_admin());

-- No insert/update/delete for authenticated - service role only (Team save).

create table if not exists public.libraries (
  id text primary key check (id in ('lower', 'upper')),
  label text not null,
  sort_order int not null default 0
);

insert into public.libraries (id, label, sort_order) values
  ('lower', 'Lower Primary', 1),
  ('upper', 'Upper Primary', 2)
on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order;

create table if not exists public.library_settings (
  library_id text primary key references public.libraries (id) on delete cascade,
  loan_days int not null default 14 check (loan_days between 1 and 90),
  max_loans_pupil int not null default 3 check (max_loans_pupil between 1 and 20),
  max_loans_teacher int not null default 5 check (max_loans_teacher between 1 and 30),
  fine_per_day numeric(12, 2) not null default 500 check (fine_per_day >= 0),
  reservation_hold_days int not null default 3 check (reservation_hold_days between 1 and 30),
  updated_at timestamptz not null default now()
);

insert into public.library_settings (library_id) values ('lower'), ('upper')
on conflict (library_id) do nothing;

create table if not exists public.library_titles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authors text not null default '',
  isbn text not null default '',
  category text not null default '',
  audience text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_titles_title_idx on public.library_titles (lower(title));
create index if not exists library_titles_isbn_idx on public.library_titles (isbn) where isbn <> '';

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references public.libraries (id) on delete restrict,
  title_id uuid not null references public.library_titles (id) on delete cascade,
  accession text not null default '',
  barcode text not null default '',
  status text not null default 'available'
    check (status in ('available', 'on_loan', 'reserved', 'missing', 'withdrawn')),
  location_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_items_library_idx on public.library_items (library_id, status);
create index if not exists library_items_title_idx on public.library_items (title_id);
create index if not exists library_items_barcode_idx on public.library_items (library_id, barcode) where barcode <> '';
create unique index if not exists library_items_accession_uniq
  on public.library_items (library_id, accession) where accession <> '';

create table if not exists public.library_loans (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references public.libraries (id) on delete restrict,
  item_id uuid not null references public.library_items (id) on delete restrict,
  borrower_kind text not null check (borrower_kind in ('pupil', 'teacher')),
  student_id uuid references public.students (id) on delete restrict,
  teacher_id uuid references public.teaching_staff (id) on delete restrict,
  issued_at timestamptz not null default now(),
  due_at date not null,
  returned_at timestamptz,
  issued_by uuid references public.profiles (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint library_loans_borrower_check check (
    (borrower_kind = 'pupil' and student_id is not null and teacher_id is null)
    or (borrower_kind = 'teacher' and teacher_id is not null and student_id is null)
  )
);

create index if not exists library_loans_open_idx on public.library_loans (library_id) where returned_at is null;
create index if not exists library_loans_item_idx on public.library_loans (item_id);
create index if not exists library_loans_student_idx on public.library_loans (student_id) where student_id is not null;
create index if not exists library_loans_teacher_idx on public.library_loans (teacher_id) where teacher_id is not null;

create table if not exists public.library_reservations (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references public.libraries (id) on delete restrict,
  title_id uuid not null references public.library_titles (id) on delete cascade,
  item_id uuid references public.library_items (id) on delete set null,
  borrower_kind text not null check (borrower_kind in ('pupil', 'teacher')),
  student_id uuid references public.students (id) on delete restrict,
  teacher_id uuid references public.teaching_staff (id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'ready', 'cancelled', 'fulfilled')),
  queued_at timestamptz not null default now(),
  ready_at timestamptz,
  cancelled_at timestamptz,
  fulfilled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  note text not null default '',
  constraint library_reservations_borrower_check check (
    (borrower_kind = 'pupil' and student_id is not null and teacher_id is null)
    or (borrower_kind = 'teacher' and teacher_id is not null and student_id is null)
  )
);

create index if not exists library_reservations_open_idx
  on public.library_reservations (library_id, status)
  where status in ('queued', 'ready');

create table if not exists public.library_fines (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references public.libraries (id) on delete restrict,
  loan_id uuid not null references public.library_loans (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  reason text not null default 'Overdue',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  waived_at timestamptz,
  waived_by uuid references public.profiles (id) on delete set null,
  note text not null default ''
);

create index if not exists library_fines_unpaid_idx
  on public.library_fines (library_id)
  where paid_at is null and waived_at is null;

create table if not exists public.library_stock_counts (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references public.libraries (id) on delete restrict,
  counted_at timestamptz not null default now(),
  counted_by uuid references public.profiles (id) on delete set null,
  notes text not null default '',
  closed_at timestamptz
);

create table if not exists public.library_stock_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.library_stock_counts (id) on delete cascade,
  item_id uuid not null references public.library_items (id) on delete cascade,
  expected_status text not null,
  observed_status text not null,
  unique (count_id, item_id)
);

create index if not exists library_stock_counts_library_idx on public.library_stock_counts (library_id, counted_at desc);

-- Scope helper: full admin → both; else libraries from library_staff_scope.
create or replace function public.library_ids_for_me()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ids text[];
begin
  if public.is_full_admin() then
    return array['lower', 'upper']::text[];
  end if;
  select libraries into ids from public.library_staff_scope where profile_id = auth.uid();
  if ids is null or cardinality(ids) = 0 then
    -- Library grant without a scope row: treat as both so desk is usable until Team assigns.
    if public.is_library_staff() then
      return array['lower', 'upper']::text[];
    end if;
    return array[]::text[];
  end if;
  return ids;
end;
$$;

revoke all on function public.library_ids_for_me() from public;
grant execute on function public.library_ids_for_me() to authenticated, service_role;

create or replace function public.can_manage_library(p_library text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_library = any (public.library_ids_for_me());
$$;

revoke all on function public.can_manage_library(text) from public;
grant execute on function public.can_manage_library(text) to authenticated, service_role;

-- RLS
alter table public.libraries enable row level security;
alter table public.library_settings enable row level security;
alter table public.library_titles enable row level security;
alter table public.library_items enable row level security;
alter table public.library_loans enable row level security;
alter table public.library_reservations enable row level security;
alter table public.library_fines enable row level security;
alter table public.library_stock_counts enable row level security;
alter table public.library_stock_lines enable row level security;

drop policy if exists libraries_select on public.libraries;
create policy libraries_select on public.libraries
  for select to authenticated
  using (public.is_library_staff());

drop policy if exists library_settings_all on public.library_settings;
create policy library_settings_all on public.library_settings
  for all to authenticated
  using (public.can_manage_library(library_id))
  with check (public.can_manage_library(library_id));

drop policy if exists library_titles_select on public.library_titles;
create policy library_titles_select on public.library_titles
  for select to authenticated
  using (public.is_library_staff());

drop policy if exists library_titles_write on public.library_titles;
create policy library_titles_write on public.library_titles
  for all to authenticated
  using (public.is_library_staff())
  with check (public.is_library_staff());

drop policy if exists library_items_all on public.library_items;
create policy library_items_all on public.library_items
  for all to authenticated
  using (public.can_manage_library(library_id))
  with check (public.can_manage_library(library_id));

drop policy if exists library_loans_all on public.library_loans;
create policy library_loans_all on public.library_loans
  for all to authenticated
  using (public.can_manage_library(library_id))
  with check (public.can_manage_library(library_id));

drop policy if exists library_reservations_all on public.library_reservations;
create policy library_reservations_all on public.library_reservations
  for all to authenticated
  using (public.can_manage_library(library_id))
  with check (public.can_manage_library(library_id));

drop policy if exists library_fines_all on public.library_fines;
create policy library_fines_all on public.library_fines
  for all to authenticated
  using (public.can_manage_library(library_id))
  with check (public.can_manage_library(library_id));

drop policy if exists library_stock_counts_all on public.library_stock_counts;
create policy library_stock_counts_all on public.library_stock_counts
  for all to authenticated
  using (public.can_manage_library(library_id))
  with check (public.can_manage_library(library_id));

drop policy if exists library_stock_lines_all on public.library_stock_lines;
create policy library_stock_lines_all on public.library_stock_lines
  for all to authenticated
  using (
    exists (
      select 1 from public.library_stock_counts c
      where c.id = count_id and public.can_manage_library(c.library_id)
    )
  )
  with check (
    exists (
      select 1 from public.library_stock_counts c
      where c.id = count_id and public.can_manage_library(c.library_id)
    )
  );

commit;
