-- Store desk: catalogue, stock, issues, suppliers, purchases, requisitions.
-- Safe to re-run.

begin;

-- Allow store as a single-desk profiles.role (Team → roleForGrants).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'admissions', 'accounts', 'academics', 'library', 'store', 'officer', 'staff', 'parent', 'student'));

-- Widen dashboard_access check to include store.
alter table public.dashboard_access drop constraint if exists dashboard_access_dashboard_check;
alter table public.dashboard_access add constraint dashboard_access_dashboard_check
  check (dashboard in ('admin', 'admissions', 'accounts', 'academics', 'library', 'store'));

create or replace function public.is_store_staff()
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
      where profile_id = auth.uid() and dashboard = 'store'
    )
    or exists (
      select 1 from public.profile_role_lookup
      where id = auth.uid() and role = 'store'
    );
end;
$$;

revoke all on function public.is_store_staff() from public;
grant execute on function public.is_store_staff() to authenticated, service_role;

create table if not exists public.store_settings (
  id int primary key default 1 check (id = 1),
  default_reorder_level numeric(12, 3) not null default 5 check (default_reorder_level >= 0),
  issue_prefix text not null default 'ISS',
  issue_next int not null default 1 check (issue_next >= 1),
  requisition_prefix text not null default 'REQ',
  requisition_next int not null default 1 check (requisition_next >= 1),
  purchase_prefix text not null default 'GRN',
  purchase_next int not null default 1 check (purchase_next >= 1),
  currency_label text not null default 'UGX',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_categories_name_uniq
  on public.store_categories (lower(name));

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  category_id uuid references public.store_categories (id) on delete set null,
  unit text not null default 'pcs',
  qty_on_hand numeric(14, 3) not null default 0,
  reorder_level numeric(14, 3) not null default 5 check (reorder_level >= 0),
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  barcode text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_items_qty_check check (qty_on_hand >= 0)
);

create unique index if not exists store_items_sku_uniq on public.store_items (lower(sku));
create index if not exists store_items_name_idx on public.store_items (lower(name));
create index if not exists store_items_active_idx on public.store_items (active);
create index if not exists store_items_low_idx on public.store_items (active)
  where active and qty_on_hand <= reorder_level;

create table if not exists public.store_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_suppliers_name_idx on public.store_suppliers (lower(name));

create table if not exists public.store_requisitions (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted')),
  source text not null default 'manual'
    check (source in ('low_stock', 'manual')),
  supplier_id uuid references public.store_suppliers (id) on delete set null,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  ordered_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_requisitions_number_uniq on public.store_requisitions (number);
create index if not exists store_requisitions_status_idx on public.store_requisitions (status, created_at desc);

create table if not exists public.store_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.store_requisitions (id) on delete cascade,
  item_id uuid references public.store_items (id) on delete set null,
  description text not null default '',
  qty_requested numeric(14, 3) not null check (qty_requested > 0),
  qty_ordered numeric(14, 3) not null default 0 check (qty_ordered >= 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  notes text not null default '',
  sort_order int not null default 0
);

create index if not exists store_requisition_lines_req_idx on public.store_requisition_lines (requisition_id);

create table if not exists public.store_purchases (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  supplier_id uuid references public.store_suppliers (id) on delete set null,
  requisition_id uuid references public.store_requisitions (id) on delete set null,
  reference text not null default '',
  received_on date not null default (timezone('Africa/Kampala', now()))::date,
  notes text not null default '',
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_purchases_number_uniq on public.store_purchases (number);
create index if not exists store_purchases_received_idx on public.store_purchases (received_on desc);

create table if not exists public.store_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.store_purchases (id) on delete cascade,
  item_id uuid not null references public.store_items (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0)
);

create index if not exists store_purchase_lines_purchase_idx on public.store_purchase_lines (purchase_id);

create table if not exists public.store_issues (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  recipient_kind text not null check (recipient_kind in ('teacher', 'pupil')),
  student_id uuid references public.students (id) on delete restrict,
  teacher_id uuid references public.teaching_staff (id) on delete restrict,
  issued_at timestamptz not null default now(),
  payment_method text not null default 'complimentary'
    check (payment_method in ('complimentary', 'cash', 'mobile_money', 'bank', 'on_account')),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  notes text not null default '',
  issued_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint store_issues_recipient_check check (
    (recipient_kind = 'pupil' and student_id is not null and teacher_id is null)
    or (recipient_kind = 'teacher' and teacher_id is not null and student_id is null)
  )
);

create unique index if not exists store_issues_number_uniq on public.store_issues (number);
create index if not exists store_issues_issued_idx on public.store_issues (issued_at desc) where voided_at is null;
create index if not exists store_issues_student_idx on public.store_issues (student_id) where student_id is not null;
create index if not exists store_issues_teacher_idx on public.store_issues (teacher_id) where teacher_id is not null;

create table if not exists public.store_issue_lines (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.store_issues (id) on delete cascade,
  item_id uuid not null references public.store_items (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0)
);

create index if not exists store_issue_lines_issue_idx on public.store_issue_lines (issue_id);

create table if not exists public.store_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.store_items (id) on delete restrict,
  qty_delta numeric(14, 3) not null check (qty_delta <> 0),
  reason text not null default 'other'
    check (reason in ('damage', 'count', 'return_in', 'other')),
  notes text not null default '',
  adjusted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists store_adjustments_item_idx on public.store_adjustments (item_id, created_at desc);

create table if not exists public.store_stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.store_items (id) on delete restrict,
  kind text not null check (kind in ('purchase', 'issue', 'adjust', 'return', 'void')),
  qty_delta numeric(14, 3) not null check (qty_delta <> 0),
  balance_after numeric(14, 3) not null,
  ref_table text not null default '',
  ref_id uuid,
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists store_stock_movements_item_idx
  on public.store_stock_movements (item_id, created_at desc);
create index if not exists store_stock_movements_created_idx
  on public.store_stock_movements (created_at desc);

-- Next document number (locks settings row).
create or replace function public.store_next_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.store_settings%rowtype;
  n int;
  prefix text;
begin
  if not public.is_store_staff() then
    raise exception 'not authorized';
  end if;
  select * into s from public.store_settings where id = 1 for update;
  if not found then
    insert into public.store_settings (id) values (1);
    select * into s from public.store_settings where id = 1 for update;
  end if;
  if p_kind = 'issue' then
    n := s.issue_next;
    prefix := s.issue_prefix;
    update public.store_settings set issue_next = n + 1, updated_at = now() where id = 1;
  elsif p_kind = 'requisition' then
    n := s.requisition_next;
    prefix := s.requisition_prefix;
    update public.store_settings set requisition_next = n + 1, updated_at = now() where id = 1;
  elsif p_kind = 'purchase' then
    n := s.purchase_next;
    prefix := s.purchase_prefix;
    update public.store_settings set purchase_next = n + 1, updated_at = now() where id = 1;
  else
    raise exception 'unknown number kind %', p_kind;
  end if;
  return prefix || '-' || lpad(n::text, 5, '0');
end;
$$;

revoke all on function public.store_next_number(text) from public;
grant execute on function public.store_next_number(text) to authenticated, service_role;

-- Apply a stock change + movement in one go.
create or replace function public.store_apply_stock(
  p_item_id uuid,
  p_qty_delta numeric,
  p_kind text,
  p_ref_table text default '',
  p_ref_id uuid default null,
  p_note text default ''
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric(14, 3);
begin
  if not public.is_store_staff() then
    raise exception 'not authorized';
  end if;
  if p_qty_delta = 0 then
    raise exception 'qty delta cannot be zero';
  end if;
  if p_kind not in ('purchase', 'issue', 'adjust', 'return', 'void') then
    raise exception 'invalid movement kind';
  end if;

  update public.store_items
  set
    qty_on_hand = qty_on_hand + p_qty_delta,
    updated_at = now()
  where id = p_item_id
  returning qty_on_hand into bal;

  if not found then
    raise exception 'item not found';
  end if;
  if bal < 0 then
    raise exception 'insufficient stock';
  end if;

  insert into public.store_stock_movements (
    item_id, kind, qty_delta, balance_after, ref_table, ref_id, note, created_by
  ) values (
    p_item_id, p_kind, p_qty_delta, bal, coalesce(p_ref_table, ''), p_ref_id, coalesce(p_note, ''), auth.uid()
  );

  return bal;
end;
$$;

revoke all on function public.store_apply_stock(uuid, numeric, text, text, uuid, text) from public;
grant execute on function public.store_apply_stock(uuid, numeric, text, text, uuid, text) to authenticated, service_role;

create or replace function public.store_item_is_low(p_item public.store_items)
returns boolean
language sql
immutable
as $$
  select p_item.active and p_item.qty_on_hand <= p_item.reorder_level;
$$;

revoke all on function public.store_item_is_low(public.store_items) from public;
grant execute on function public.store_item_is_low(public.store_items) to authenticated, service_role;

-- RLS
alter table public.store_settings enable row level security;
alter table public.store_categories enable row level security;
alter table public.store_items enable row level security;
alter table public.store_suppliers enable row level security;
alter table public.store_requisitions enable row level security;
alter table public.store_requisition_lines enable row level security;
alter table public.store_purchases enable row level security;
alter table public.store_purchase_lines enable row level security;
alter table public.store_issues enable row level security;
alter table public.store_issue_lines enable row level security;
alter table public.store_adjustments enable row level security;
alter table public.store_stock_movements enable row level security;

drop policy if exists store_settings_all on public.store_settings;
create policy store_settings_all on public.store_settings
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_categories_all on public.store_categories;
create policy store_categories_all on public.store_categories
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_items_all on public.store_items;
create policy store_items_all on public.store_items
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_suppliers_all on public.store_suppliers;
create policy store_suppliers_all on public.store_suppliers
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_requisitions_all on public.store_requisitions;
create policy store_requisitions_all on public.store_requisitions
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_requisition_lines_all on public.store_requisition_lines;
create policy store_requisition_lines_all on public.store_requisition_lines
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_purchases_all on public.store_purchases;
create policy store_purchases_all on public.store_purchases
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_purchase_lines_all on public.store_purchase_lines;
create policy store_purchase_lines_all on public.store_purchase_lines
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_issues_all on public.store_issues;
create policy store_issues_all on public.store_issues
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_issue_lines_all on public.store_issue_lines;
create policy store_issue_lines_all on public.store_issue_lines
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_adjustments_all on public.store_adjustments;
create policy store_adjustments_all on public.store_adjustments
  for all to authenticated
  using (public.is_store_staff())
  with check (public.is_store_staff());

drop policy if exists store_stock_movements_select on public.store_stock_movements;
create policy store_stock_movements_select on public.store_stock_movements
  for select to authenticated
  using (public.is_store_staff());

-- Movements are written via store_apply_stock (security definer).
drop policy if exists store_stock_movements_insert on public.store_stock_movements;
create policy store_stock_movements_insert on public.store_stock_movements
  for insert to authenticated
  with check (public.is_store_staff());

-- Starter categories
insert into public.store_categories (name, sort_order)
select v.name, v.sort_order
from (values
  ('Uniforms', 1),
  ('Stationery', 2),
  ('Books & materials', 3),
  ('Cleaning & hygiene', 4),
  ('Sports', 5),
  ('Other', 99)
) as v(name, sort_order)
where not exists (
  select 1 from public.store_categories c where lower(c.name) = lower(v.name)
);

commit;
