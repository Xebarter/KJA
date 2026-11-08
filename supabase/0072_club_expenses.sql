-- Club expenses: Clubs-desk spending ledger, isolated from Accounts expenses.
-- Safe to re-run. Apply after 0071.

begin;

-- ---------------------------------------------------------------- document numbers (CEX)

create or replace function public.next_account_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yr integer := extract(year from (now() at time zone 'Africa/Kampala'))::integer;
  n integer;
begin
  if p_kind not in ('INV', 'RCT', 'EXP', 'CLB', 'CHG', 'CEX') then
    raise exception 'Unknown document kind %', p_kind;
  end if;
  insert into public.account_counters (kind, year, value) values (p_kind, yr, 1)
  on conflict (kind, year) do update set value = public.account_counters.value + 1
  returning value into n;
  return p_kind || '-' || yr || '-' || lpad(n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------- categories

create table if not exists public.club_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default 'fa-receipt',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_expense_categories_active_idx
  on public.club_expense_categories (active, sort_order, name);

insert into public.club_expense_categories (name, icon, sort_order)
values
  ('Equipment', 'fa-screwdriver-wrench', 10),
  ('Transport', 'fa-bus', 20),
  ('Refreshments', 'fa-mug-hot', 30),
  ('Materials', 'fa-box-open', 40),
  ('Other', 'fa-ellipsis', 90)
on conflict (name) do nothing;

-- ---------------------------------------------------------------- expenses

create table if not exists public.club_expenses (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_account_number('CEX'),
  club_id uuid not null references public.clubs (id) on delete restrict,
  term_id uuid not null references public.fee_terms (id) on delete restrict,
  category_id uuid references public.club_expense_categories (id) on delete set null,
  payee text not null,
  description text not null,
  amount integer not null check (amount > 0),
  spent_on date not null default ((now() at time zone 'Africa/Kampala')::date),
  method text check (method is null or method in ('cash', 'bank', 'mobile_money', 'schoolpay', 'cheque', 'other')),
  reference text,
  notes text not null default '',
  recorded_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_expenses_club_term_idx
  on public.club_expenses (club_id, term_id);

create index if not exists club_expenses_spent_idx
  on public.club_expenses (spent_on desc);

create index if not exists club_expenses_term_open_idx
  on public.club_expenses (term_id, spent_on desc)
  where voided_at is null;

create index if not exists club_expenses_category_idx
  on public.club_expenses (category_id)
  where voided_at is null;

drop trigger if exists club_expenses_touch on public.club_expenses;
do $$
begin
  if to_regprocedure('public.touch_register_row()') is not null then
    execute $trg$
      create trigger club_expenses_touch before update on public.club_expenses
        for each row execute function public.touch_register_row()
    $trg$;
  end if;
exception when others then
  raise notice 'club_expenses touch trigger skipped: %', sqlerrm;
end $$;

drop trigger if exists club_expense_categories_touch on public.club_expense_categories;
do $$
begin
  if to_regprocedure('public.touch_register_row()') is not null then
    execute $trg$
      create trigger club_expense_categories_touch before update on public.club_expense_categories
        for each row execute function public.touch_register_row()
    $trg$;
  end if;
exception when others then
  raise notice 'club_expense_categories touch trigger skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------- RLS (Clubs desk only — not Accounts)

alter table public.club_expense_categories enable row level security;
alter table public.club_expenses enable row level security;

drop policy if exists club_expense_categories_clubs on public.club_expense_categories;
create policy club_expense_categories_clubs on public.club_expense_categories for all to authenticated
  using ((select public.is_clubs_staff()) or (select public.is_full_admin()))
  with check ((select public.is_clubs_staff()) or (select public.is_full_admin()));

drop policy if exists club_expenses_clubs_select on public.club_expenses;
create policy club_expenses_clubs_select on public.club_expenses for select to authenticated
  using ((select public.is_clubs_staff()) or (select public.is_full_admin()));

drop policy if exists club_expenses_clubs_insert on public.club_expenses;
create policy club_expenses_clubs_insert on public.club_expenses for insert to authenticated
  with check ((select public.is_clubs_staff()) or (select public.is_full_admin()));

drop policy if exists club_expenses_clubs_update on public.club_expenses;
create policy club_expenses_clubs_update on public.club_expenses for update to authenticated
  using ((select public.is_clubs_staff()) or (select public.is_full_admin()))
  with check ((select public.is_clubs_staff()) or (select public.is_full_admin()));

grant select, insert, update, delete on public.club_expense_categories to authenticated;
grant select, insert, update on public.club_expenses to authenticated;

-- Migrate restricted grants that listed "receipts" → "accounts"
update public.dashboard_access
set pages = array(
  select distinct case when p = 'receipts' then 'accounts' else p end
  from unnest(pages) as p
)
where dashboard = 'clubs'
  and 'receipts' = any (pages);

commit;
