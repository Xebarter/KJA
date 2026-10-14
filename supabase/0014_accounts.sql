-- Accounts office. Run after 0013_student_photos.sql (safe to re-run).
-- Adds the "accounts" role, fee setup, term invoices, payments, expenses and reminders.
-- Balances are always worked out from invoices and payments, never stored, so they can't drift.
-- Parents can read the issued invoices and payments of the children in their family.

begin;

-- ---------------------------------------------------------------- role

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'admissions', 'accounts', 'staff', 'parent'));

create or replace function public.is_accounts_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'accounts')
  );
$$;

-- ---------------------------------------------------------------- register access (read only)

do $$
declare
  tbl text;
begin
  foreach tbl in array array['school_classes', 'families', 'guardians', 'family_contacts', 'students']
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_accounts', tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_accounts_staff()))',
      tbl || '_accounts', tbl
    );
  end loop;
end $$;

drop policy if exists admission_payments_accounts on public.admission_payments;
create policy admission_payments_accounts on public.admission_payments for select to authenticated
  using ((select public.is_accounts_staff()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or ((select public.is_admissions_staff()) and role in ('admin', 'admissions'))
    or ((select public.is_accounts_staff()) and role in ('admin', 'accounts'))
  );

-- ---------------------------------------------------------------- parents and their families

-- The families a signed-in parent belongs to, through guardians.user_id.
create or replace function public.my_family_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct family_id from public.guardians where user_id = auth.uid();
$$;

create or replace function public.my_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.students s where s.family_id in (select public.my_family_ids());
$$;

-- Links the signed-in parent to every guardian record with the same confirmed email address.
create or replace function public.claim_guardian_links()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mail text;
  linked integer;
begin
  if uid is null then
    return 0;
  end if;
  select lower(email) into mail from auth.users where id = uid and email_confirmed_at is not null;
  if mail is null or mail = '' then
    return 0;
  end if;
  update public.guardians set user_id = uid where user_id is null and lower(email) = mail;
  get diagnostics linked = row_count;
  return linked;
end;
$$;

drop policy if exists students_parent_read on public.students;
create policy students_parent_read on public.students for select to authenticated
  using (family_id in (select public.my_family_ids()));

drop policy if exists families_parent_read on public.families;
create policy families_parent_read on public.families for select to authenticated
  using (id in (select public.my_family_ids()));

drop policy if exists guardians_parent_read on public.guardians;
create policy guardians_parent_read on public.guardians for select to authenticated
  using (family_id in (select public.my_family_ids()));

-- ---------------------------------------------------------------- document numbers

create table if not exists public.account_counters (
  kind text not null,
  year integer not null,
  value integer not null default 0,
  primary key (kind, year)
);
alter table public.account_counters enable row level security;

-- INV-2026-00001, RCT-2026-00001, EXP-2026-00001. Numbers restart every year.
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
  if p_kind not in ('INV', 'RCT', 'EXP') then
    raise exception 'Unknown document kind %', p_kind;
  end if;
  insert into public.account_counters (kind, year, value) values (p_kind, yr, 1)
  on conflict (kind, year) do update set value = public.account_counters.value + 1
  returning value into n;
  return p_kind || '-' || yr || '-' || lpad(n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------- fee setup

create table if not exists public.fee_terms (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  term smallint not null check (term between 1 and 3),
  label text not null,
  starts_on date,
  ends_on date,
  due_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (year, term)
);
create unique index if not exists fee_terms_one_current on public.fee_terms (is_current) where is_current;

create table if not exists public.fee_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'other' check (kind in ('tuition', 'admission', 'meals', 'transport', 'uniform', 'activity', 'other')),
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- What each class pays for each item in a term. An empty campus means every campus;
-- a campus-specific rate wins over the all-campus one.
create table if not exists public.fee_rates (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  item_id uuid not null references public.fee_items (id) on delete cascade,
  class_code text not null references public.school_classes (code) on update cascade on delete cascade,
  campus text not null default '',
  amount integer not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  unique (term_id, item_id, class_code, campus)
);
create index if not exists fee_rates_term_idx on public.fee_rates (term_id, class_code);

-- Sibling and staff rules apply automatically when invoices are generated. Bursary and other
-- rules are templates the office gives to individual students.
create table if not exists public.discount_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('sibling', 'staff', 'bursary', 'other')),
  method text not null default 'percent' check (method in ('percent', 'fixed')),
  value numeric(12, 2) not null check (value >= 0),
  sibling_from smallint not null default 2 check (sibling_from >= 2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (method <> 'percent' or value <= 100)
);

create table if not exists public.student_discounts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  rule_id uuid references public.discount_rules (id) on delete set null,
  label text not null,
  method text not null check (method in ('percent', 'fixed')),
  value numeric(12, 2) not null check (value >= 0),
  term_id uuid references public.fee_terms (id) on delete cascade,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (method <> 'percent' or value <= 100)
);
create index if not exists student_discounts_student_idx on public.student_discounts (student_id);

-- ---------------------------------------------------------------- invoices

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default public.next_account_number('INV'),
  student_id uuid not null references public.students (id) on delete restrict,
  family_id uuid references public.families (id) on delete set null,
  term_id uuid not null references public.fee_terms (id) on delete restrict,
  kind text not null default 'term' check (kind in ('term', 'extra')),
  status text not null default 'issued' check (status in ('draft', 'issued', 'void')),
  class_code text,
  campus text,
  issued_on date not null default ((now() at time zone 'Africa/Kampala')::date),
  due_on date,
  total integer not null default 0,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);
create index if not exists invoices_student_idx on public.invoices (student_id, term_id);
create index if not exists invoices_term_idx on public.invoices (term_id, status);
create index if not exists invoices_family_idx on public.invoices (family_id);
-- One term bill per pupil per term; extras (uniform, trips) can be added any time.
create unique index if not exists invoices_one_term_bill on public.invoices (student_id, term_id) where kind = 'term' and status <> 'void';

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  item_id uuid references public.fee_items (id) on delete set null,
  kind text not null default 'charge' check (kind in ('charge', 'discount')),
  description text not null,
  amount integer not null,
  position smallint not null default 0
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

create or replace function public.sync_invoice_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    update public.invoices set total = coalesce((select sum(amount) from public.invoice_lines where invoice_id = old.invoice_id), 0)
    where id = old.invoice_id;
  end if;
  if tg_op <> 'DELETE' then
    update public.invoices set total = coalesce((select sum(amount) from public.invoice_lines where invoice_id = new.invoice_id), 0)
    where id = new.invoice_id;
  end if;
  return null;
end;
$$;

drop trigger if exists invoice_lines_total on public.invoice_lines;
create trigger invoice_lines_total
  after insert or update or delete on public.invoice_lines
  for each row execute function public.sync_invoice_total();

-- ---------------------------------------------------------------- payments

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique default public.next_account_number('RCT'),
  student_id uuid not null references public.students (id) on delete restrict,
  family_id uuid references public.families (id) on delete set null,
  term_id uuid not null references public.fee_terms (id) on delete restrict,
  invoice_id uuid references public.invoices (id) on delete set null,
  amount integer not null check (amount > 0),
  method text not null check (method in ('cash', 'bank', 'mobile_money', 'schoolpay', 'cheque', 'other')),
  reference text,
  paid_on date not null default ((now() at time zone 'Africa/Kampala')::date),
  payer_name text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'online')),
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);
create index if not exists payments_student_idx on public.payments (student_id, term_id);
create index if not exists payments_paid_idx on public.payments (paid_on desc);
create index if not exists payments_family_idx on public.payments (family_id);
-- The same bank slip or mobile money transaction can't be recorded twice.
create unique index if not exists payments_reference_once on public.payments (method, lower(reference))
  where reference is not null and voided_at is null and method in ('bank', 'mobile_money', 'schoolpay', 'cheque');

-- ---------------------------------------------------------------- expenses

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default 'fa-receipt',
  monthly_budget integer check (monthly_budget is null or monthly_budget >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_account_number('EXP'),
  category_id uuid references public.expense_categories (id) on delete set null,
  payee text not null,
  description text not null,
  amount integer not null check (amount > 0),
  campus text,
  spent_on date not null default ((now() at time zone 'Africa/Kampala')::date),
  method text check (method is null or method in ('cash', 'bank', 'mobile_money', 'schoolpay', 'cheque', 'other')),
  reference text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  receipt_path text,
  requested_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  paid_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_status_idx on public.expenses (status, spent_on desc);
create index if not exists expenses_spent_idx on public.expenses (spent_on desc);

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_register_row();

-- ---------------------------------------------------------------- audit trail and reminders

create table if not exists public.account_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'payment', 'invoice', 'expense', 'setup', 'reminder', 'void', 'discount')),
  entity text check (entity in ('student', 'invoice', 'payment', 'expense', 'term', 'family')),
  entity_id uuid,
  student_id uuid references public.students (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists account_activity_created_idx on public.account_activity (created_at desc);
create index if not exists account_activity_student_idx on public.account_activity (student_id, created_at desc);

create table if not exists public.fee_reminders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students (id) on delete cascade,
  family_id uuid references public.families (id) on delete cascade,
  channel text not null default 'email' check (channel in ('email')),
  sent_to text not null,
  amount integer not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists fee_reminders_family_idx on public.fee_reminders (family_id, sent_at desc);

-- ---------------------------------------------------------------- row level security

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'fee_terms', 'fee_items', 'fee_rates', 'discount_rules', 'student_discounts', 'invoice_lines',
    'expense_categories', 'expenses', 'account_activity', 'fee_reminders'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_accounts', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_accounts_staff())) with check ((select public.is_accounts_staff()))',
      tbl || '_accounts', tbl
    );
  end loop;
end $$;

-- Invoices and payments are never deleted, only voided, so there is no delete policy.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['invoices', 'payments']
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_accounts_select', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_accounts_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_accounts_update', tbl);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_accounts_staff()))', tbl || '_accounts_select', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_accounts_staff()))', tbl || '_accounts_insert', tbl);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_accounts_staff())) with check ((select public.is_accounts_staff()))',
      tbl || '_accounts_update', tbl
    );
  end loop;
end $$;

drop policy if exists fee_terms_read on public.fee_terms;
create policy fee_terms_read on public.fee_terms for select to authenticated using (true);

drop policy if exists invoices_parent on public.invoices;
create policy invoices_parent on public.invoices for select to authenticated
  using (status = 'issued' and student_id in (select public.my_student_ids()));

drop policy if exists invoice_lines_parent on public.invoice_lines;
create policy invoice_lines_parent on public.invoice_lines for select to authenticated
  using (invoice_id in (select i.id from public.invoices i where i.status = 'issued' and i.student_id in (select public.my_student_ids())));

drop policy if exists payments_parent on public.payments;
create policy payments_parent on public.payments for select to authenticated
  using (voided_at is null and student_id in (select public.my_student_ids()));

-- ---------------------------------------------------------------- balances

-- Issued invoices less valid payments, for each pupil in each term.
create or replace view public.student_term_balances with (security_invoker = true) as
with inv as (
  select student_id, term_id, sum(total)::bigint as invoiced, max(due_on) as due_on, count(*)::integer as invoices
  from public.invoices
  where status = 'issued'
  group by student_id, term_id
), pay as (
  select student_id, term_id, sum(amount)::bigint as paid, max(paid_on) as last_paid_on, count(*)::integer as payments
  from public.payments
  where voided_at is null
  group by student_id, term_id
)
select
  coalesce(inv.student_id, pay.student_id) as student_id,
  coalesce(inv.term_id, pay.term_id) as term_id,
  coalesce(inv.invoiced, 0)::bigint as invoiced,
  coalesce(pay.paid, 0)::bigint as paid,
  (coalesce(inv.invoiced, 0) - coalesce(pay.paid, 0))::bigint as balance,
  inv.due_on,
  pay.last_paid_on,
  coalesce(inv.invoices, 0) as invoices,
  coalesce(pay.payments, 0) as payments
from inv
full join pay on pay.student_id = inv.student_id and pay.term_id = inv.term_id;

-- One row per pupil with totals across every term and who to contact about fees.
create or replace view public.student_balances with (security_invoker = true) as
select
  s.id as student_id,
  s.student_number,
  s.full_name,
  s.class_code,
  c.name as class_name,
  c.sort_order as class_order,
  s.stream,
  s.campus,
  s.status,
  s.staff_child,
  s.family_id,
  f.family_code,
  f.mailing_name,
  pc.full_name as contact_name,
  pc.phone as contact_phone,
  pc.email as contact_email,
  coalesce(t.invoiced, 0)::bigint as invoiced,
  coalesce(t.paid, 0)::bigint as paid,
  coalesce(t.balance, 0)::bigint as balance,
  t.oldest_due,
  t.last_paid_on,
  coalesce(t.terms_owing, 0)::integer as terms_owing
from public.students s
left join public.school_classes c on c.code = s.class_code
left join public.families f on f.id = s.family_id
left join lateral (
  select g.full_name, g.phone, g.email
  from public.guardians g
  where g.family_id = s.family_id
  order by g.is_primary desc, (g.email is null), (g.relationship = 'guardian'), g.relationship desc
  limit 1
) pc on true
left join (
  select
    student_id,
    sum(invoiced) as invoiced,
    sum(paid) as paid,
    sum(balance) as balance,
    min(due_on) filter (where balance > 0) as oldest_due,
    max(last_paid_on) as last_paid_on,
    count(*) filter (where balance > 0) as terms_owing
  from public.student_term_balances
  group by student_id
) t on t.student_id = s.id;

create or replace view public.family_balances with (security_invoker = true) as
select
  b.family_id,
  max(b.family_code) as family_code,
  max(b.mailing_name) as mailing_name,
  max(b.contact_name) as contact_name,
  max(b.contact_phone) as contact_phone,
  max(b.contact_email) as contact_email,
  count(*) filter (where b.status = 'active')::integer as children,
  sum(b.invoiced)::bigint as invoiced,
  sum(b.paid)::bigint as paid,
  sum(b.balance)::bigint as balance,
  min(b.oldest_due) as oldest_due,
  max(b.last_paid_on) as last_paid_on
from public.student_balances b
where b.family_id is not null
group by b.family_id;

-- ---------------------------------------------------------------- term invoices

-- Bills every active pupil (or only the classes in p_classes) for a term from the fee rates.
-- Sibling and staff rules and each pupil's own discounts come off the tuition lines.
-- Pupils who already have a term bill are skipped. With p_dry_run nothing is written.
drop function if exists public.generate_term_invoices(uuid, text[], boolean, text);
create or replace function public.generate_term_invoices(
  p_term uuid,
  p_classes text[] default null,
  p_dry_run boolean default true,
  p_status text default 'issued'
)
returns table (class_code text, pupils integer, to_bill integer, already_billed integer, no_rates integer, gross bigint, discounts bigint, net bigint)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  actor uuid := auth.uid();
  t record;
  pupil record;
  new_id uuid;
  made integer := 0;
begin
  if not public.is_accounts_staff() then
    raise exception 'Only accounts staff can generate invoices.';
  end if;
  if p_status not in ('draft', 'issued') then
    raise exception 'Invoices can only be generated as drafts or issued.';
  end if;
  select * into t from public.fee_terms ft where ft.id = p_term;
  if not found then
    raise exception 'That term no longer exists.';
  end if;

  drop table if exists inv_pupils;
  drop table if exists inv_lines;
  drop table if exists inv_found;
  drop table if exists inv_discounts;

  -- Eldest first within each family, so younger siblings get the sibling discount.
  create temporary table inv_pupils on commit drop as
  with ranked as (
    select
      s.id,
      s.family_id,
      s.class_code,
      coalesce(s.campus, '') as campus,
      s.staff_child,
      row_number() over (partition by coalesce(s.family_id, s.id) order by c.sort_order desc, s.date_of_birth nulls last, s.id) as sib_pos
    from public.students s
    join public.school_classes c on c.code = s.class_code
    where s.status = 'active'
  )
  select
    r.*,
    exists (
      select 1 from public.invoices i
      where i.student_id = r.id and i.term_id = p_term and i.kind = 'term' and i.status <> 'void'
    ) as billed
  from ranked r
  where p_classes is null or cardinality(p_classes) = 0 or r.class_code = any (p_classes);

  create temporary table inv_lines on commit drop as
  select distinct on (p.id, r.item_id)
    p.id as student_id,
    r.item_id,
    i.name,
    i.kind as item_kind,
    i.sort_order,
    r.amount
  from inv_pupils p
  join public.fee_rates r on r.term_id = p_term and r.class_code = p.class_code and (r.campus = '' or lower(r.campus) = lower(p.campus))
  join public.fee_items i on i.id = r.item_id and i.active
  where not p.billed and r.amount > 0
  order by p.id, r.item_id, (r.campus = '');

  create temporary table inv_found on commit drop as
  select p.id as student_id, d.name as label, d.method, d.value
  from inv_pupils p
  join public.discount_rules d on d.active and (
    (d.kind = 'sibling' and p.family_id is not null and p.sib_pos >= d.sibling_from)
    or (d.kind = 'staff' and p.staff_child)
  )
  where not p.billed
  union all
  select sd.student_id, sd.label, sd.method, sd.value
  from public.student_discounts sd
  join inv_pupils p on p.id = sd.student_id and not p.billed
  where sd.term_id is null or sd.term_id = p_term;

  -- Discounts come off tuition only and never take it below zero.
  create temporary table inv_discounts on commit drop as
  with tuition as (
    select l.student_id, sum(l.amount)::bigint as base from inv_lines l where l.item_kind = 'tuition' group by l.student_id
  ), raw as (
    select
      f.student_id,
      f.label,
      tu.base,
      (case when f.method = 'percent' then round(tu.base * f.value / 100) else f.value end)::bigint as wanted
    from inv_found f
    join tuition tu on tu.student_id = f.student_id
    where tu.base > 0
  ), capped as (
    select
      raw.*,
      greatest(0, least(raw.wanted, raw.base - coalesce(sum(raw.wanted) over (partition by raw.student_id order by raw.label rows between unbounded preceding and 1 preceding), 0))) as amount
    from raw
  )
  select student_id, label, amount::integer as amount from capped where amount > 0;

  if not p_dry_run then
    for pupil in
      select p.* from inv_pupils p
      where not p.billed and exists (select 1 from inv_lines l where l.student_id = p.id)
    loop
      insert into public.invoices (student_id, family_id, term_id, kind, status, class_code, campus, due_on, created_by)
      values (pupil.id, pupil.family_id, p_term, 'term', p_status, pupil.class_code, nullif(pupil.campus, ''), t.due_on, actor)
      returning id into new_id;

      insert into public.invoice_lines (invoice_id, item_id, kind, description, amount, position)
      select new_id, l.item_id, 'charge', l.name, l.amount, (row_number() over (order by l.sort_order, l.name))::smallint
      from inv_lines l where l.student_id = pupil.id;

      insert into public.invoice_lines (invoice_id, kind, description, amount, position)
      select new_id, 'discount', d.label, -d.amount, (100 + row_number() over (order by d.label))::smallint
      from inv_discounts d where d.student_id = pupil.id;

      made := made + 1;
    end loop;

    if made > 0 then
      insert into public.account_activity (actor_id, kind, entity, entity_id, body)
      values (actor, 'invoice', 'term', p_term, 'Generated ' || made || ' term invoice' || case when made = 1 then '' else 's' end || ' for ' || t.label
        || case when p_status = 'draft' then ' as drafts' else '' end);
    end if;
  end if;

  return query
  select
    p.class_code,
    count(*)::integer,
    (count(*) filter (where not p.billed and l.total is not null))::integer,
    (count(*) filter (where p.billed))::integer,
    (count(*) filter (where not p.billed and l.total is null))::integer,
    coalesce(sum(l.total) filter (where not p.billed), 0)::bigint,
    coalesce(sum(d.total) filter (where not p.billed), 0)::bigint,
    (coalesce(sum(l.total) filter (where not p.billed), 0) - coalesce(sum(d.total) filter (where not p.billed), 0))::bigint
  from inv_pupils p
  join public.school_classes c on c.code = p.class_code
  left join (select student_id, sum(amount) as total from inv_lines group by student_id) l on l.student_id = p.id
  left join (select student_id, sum(amount) as total from inv_discounts group by student_id) d on d.student_id = p.id
  group by p.class_code, c.sort_order
  order by c.sort_order;
end;
$$;

-- ---------------------------------------------------------------- expense receipts

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880, array['application/pdf', 'image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_receipts_read on storage.objects;
create policy expense_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and (select public.is_accounts_staff()));
drop policy if exists expense_receipts_insert on storage.objects;
create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and (select public.is_accounts_staff()));
drop policy if exists expense_receipts_update on storage.objects;
create policy expense_receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'expense-receipts' and (select public.is_accounts_staff()));
drop policy if exists expense_receipts_delete on storage.objects;
create policy expense_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and (select public.is_accounts_staff()));

-- ---------------------------------------------------------------- starting data

insert into public.fee_items (name, kind, sort_order) values
  ('Tuition', 'tuition', 1),
  ('Lunch', 'meals', 2),
  ('Transport', 'transport', 3),
  ('Admission fee', 'admission', 9)
on conflict (name) do nothing;

-- Off until the office sets the real percentages on the Setup page.
insert into public.discount_rules (name, kind, method, value, sibling_from, active) values
  ('Sibling discount', 'sibling', 'percent', 10, 2, false),
  ('Staff child discount', 'staff', 'percent', 50, 2, false),
  ('Bursary', 'bursary', 'percent', 25, 2, true)
on conflict (name) do nothing;

insert into public.expense_categories (name, icon) values
  ('Salaries and wages', 'fa-people-group'),
  ('Utilities', 'fa-bolt'),
  ('Repairs and maintenance', 'fa-screwdriver-wrench'),
  ('Teaching materials', 'fa-book-open'),
  ('Food and catering', 'fa-utensils'),
  ('Transport and fuel', 'fa-bus'),
  ('Stationery and printing', 'fa-print'),
  ('Events and activities', 'fa-masks-theater'),
  ('Bank charges', 'fa-building-columns'),
  ('Other', 'fa-receipt')
on conflict (name) do nothing;

-- This year's three terms with typical dates; the office can change them on the Setup page.
insert into public.fee_terms (year, term, label, starts_on, ends_on, due_on)
select yr.y, v.t, yr.y || ' Term ' || v.t, make_date(yr.y, v.sm, v.sd), make_date(yr.y, v.em, v.ed), make_date(yr.y, v.sm, v.sd) + 14
from (select extract(year from (now() at time zone 'Africa/Kampala'))::integer as y) yr
cross join (values (1, 2, 2, 4, 30), (2, 5, 25, 8, 14), (3, 9, 7, 12, 4)) as v(t, sm, sd, em, ed)
on conflict (year, term) do nothing;

update public.fee_terms set is_current = true
where id = (
  select id from public.fee_terms
  where ends_on >= (now() at time zone 'Africa/Kampala')::date
  order by year, term
  limit 1
)
and not exists (select 1 from public.fee_terms where is_current);

-- ---------------------------------------------------------------- grants

revoke all on function public.next_account_number(text) from public, anon;
grant execute on function public.next_account_number(text) to authenticated;
grant execute on function public.is_accounts_staff() to authenticated;
grant execute on function public.my_family_ids() to authenticated;
grant execute on function public.my_student_ids() to authenticated;
grant execute on function public.claim_guardian_links() to authenticated;
grant execute on function public.generate_term_invoices(uuid, text[], boolean, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Check it worked: this should return your terms.
--   select label, is_current from public.fee_terms order by year, term;

-- Give someone the accounts role from the admin Team page, or here:
--   update public.profiles set role = 'accounts' where lower(email) = lower('bursar@example.com');
