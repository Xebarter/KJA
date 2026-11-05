-- Unified Accounts payment register: charge products (PLE / tours / other),
-- desk fields on admission_payments, and a read model across all money-in ledgers.
-- Run after 0065. Safe to re-run.

begin;

-- ---------------------------------------------------------------- receipt numbers (CHG)

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
  if p_kind not in ('INV', 'RCT', 'EXP', 'CLB', 'CHG') then
    raise exception 'Unknown document kind %', p_kind;
  end if;
  insert into public.account_counters (kind, year, value) values (p_kind, yr, 1)
  on conflict (kind, year) do update set value = public.account_counters.value + 1
  returning value into n;
  return p_kind || '-' || yr || '-' || lpad(n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------- admission desk fields

alter table public.admission_payments
  add column if not exists method text,
  add column if not exists source text not null default 'online',
  add column if not exists reference text,
  add column if not exists received_by uuid references public.profiles (id) on delete set null,
  add column if not exists notes text;

alter table public.admission_payments drop constraint if exists admission_payments_method_check;
alter table public.admission_payments
  add constraint admission_payments_method_check
  check (method is null or method in ('cash', 'bank', 'mobile_money', 'schoolpay', 'cheque', 'other'));

alter table public.admission_payments drop constraint if exists admission_payments_source_check;
alter table public.admission_payments
  add constraint admission_payments_source_check
  check (source in ('manual', 'online'));

-- Desk cash / bank may not have a MoMo phone.
alter table public.admission_payments alter column phone set default '';
update public.admission_payments set phone = coalesce(phone, '') where phone is null;
alter table public.admission_payments alter column phone set not null;

drop policy if exists admission_payments_accounts_write on public.admission_payments;
create policy admission_payments_accounts_write on public.admission_payments for insert to authenticated
  with check ((select public.is_accounts_staff()));

drop policy if exists admission_payments_accounts_update on public.admission_payments;
create policy admission_payments_accounts_update on public.admission_payments for update to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

grant insert, update on public.admission_payments to authenticated;

-- ---------------------------------------------------------------- charge products (PLE / tours / other)

create table if not exists public.charge_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('ple', 'tour', 'admission', 'other')),
  default_amount integer not null default 0 check (default_amount >= 0),
  description text,
  active boolean not null default true,
  online_eligible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists charge_products_name_idx on public.charge_products (lower(name));
create index if not exists charge_products_kind_idx on public.charge_products (kind, active, sort_order);

insert into public.charge_products (name, kind, default_amount, description, online_eligible, sort_order)
select v.name, v.kind, v.default_amount, v.description, v.online_eligible, v.sort_order
from (values
  ('PLE Registration', 'ple', 0, 'Primary Leaving Examination registration fee.', true, 10),
  ('Study Tour', 'tour', 0, 'Study tour or school trip contribution.', true, 20),
  ('Other charge', 'other', 0, 'Miscellaneous school payment.', true, 90)
) as v(name, kind, default_amount, description, online_eligible, sort_order)
where not exists (
  select 1 from public.charge_products p where lower(p.name) = lower(v.name)
);

-- ---------------------------------------------------------------- charge collections (online MoMo intents)

create table if not exists public.charge_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  student_id uuid references public.students (id) on delete restrict,
  product_id uuid not null references public.charge_products (id) on delete restrict,
  term_id uuid references public.fee_terms (id) on delete restrict,
  child_name text not null default '',
  product_name text not null,
  product_kind text not null,
  term_label text,
  amount integer not null check (amount > 0),
  currency text not null default 'UGX',
  phone text not null,
  network text,
  payer_name text,
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'paid', 'failed')),
  provider_ref text,
  transaction_ref text,
  payment_id uuid,
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists charge_collections_user_idx on public.charge_collections (user_id, created_at desc);
create index if not exists charge_collections_provider_idx on public.charge_collections (provider_ref);
create unique index if not exists charge_collections_provider_once
  on public.charge_collections (provider_ref) where provider_ref is not null;

-- ---------------------------------------------------------------- charge payments (settled ledger)

create table if not exists public.charge_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique default public.next_account_number('CHG'),
  student_id uuid references public.students (id) on delete restrict,
  family_id uuid references public.families (id) on delete set null,
  product_id uuid not null references public.charge_products (id) on delete restrict,
  term_id uuid references public.fee_terms (id) on delete restrict,
  application_id uuid references public.applications (id) on delete set null,
  amount integer not null check (amount > 0),
  method text not null check (method in ('cash', 'bank', 'mobile_money', 'schoolpay', 'cheque', 'other')),
  reference text,
  paid_on date not null default ((now() at time zone 'Africa/Kampala')::date),
  payer_name text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'online')),
  received_by uuid references public.profiles (id) on delete set null,
  collection_id uuid unique references public.charge_collections (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);
create index if not exists charge_payments_paid_idx on public.charge_payments (paid_on desc, created_at desc);
create index if not exists charge_payments_product_idx on public.charge_payments (product_id, paid_on desc);
create index if not exists charge_payments_student_idx on public.charge_payments (student_id) where student_id is not null;
create unique index if not exists charge_payments_reference_once on public.charge_payments (method, lower(reference))
  where reference is not null and voided_at is null and method in ('bank', 'mobile_money', 'schoolpay', 'cheque');

alter table public.charge_collections
  drop constraint if exists charge_collections_payment_id_fkey;
alter table public.charge_collections
  add constraint charge_collections_payment_id_fkey
  foreign key (payment_id) references public.charge_payments (id) on delete set null;

-- ---------------------------------------------------------------- access

alter table public.charge_products enable row level security;
alter table public.charge_collections enable row level security;
alter table public.charge_payments enable row level security;

drop policy if exists charge_products_select on public.charge_products;
create policy charge_products_select on public.charge_products for select to authenticated
  using (active or (select public.is_accounts_staff()));

drop policy if exists charge_products_accounts on public.charge_products;
create policy charge_products_accounts on public.charge_products for all to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

drop policy if exists charge_collections_parent on public.charge_collections;
create policy charge_collections_parent on public.charge_collections for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists charge_collections_accounts on public.charge_collections;
create policy charge_collections_accounts on public.charge_collections for select to authenticated
  using ((select public.is_accounts_staff()));

drop policy if exists charge_payments_parent on public.charge_payments;
create policy charge_payments_parent on public.charge_payments for select to authenticated
  using (
    voided_at is null
    and (
      student_id in (select public.my_student_ids())
      or (student_id is null and received_by = (select auth.uid()))
    )
  );

drop policy if exists charge_payments_accounts on public.charge_payments;
create policy charge_payments_accounts on public.charge_payments for all to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

grant select on public.charge_products to authenticated;
grant select, insert, update on public.charge_products to authenticated;
grant select on public.charge_collections to authenticated;
grant select, insert, update on public.charge_payments to authenticated;

-- ---------------------------------------------------------------- unified register view

create or replace view public.accounts_payment_register
with (security_invoker = true)
as
-- School fees
select
  p.id as entry_id,
  'school_fees'::text as category,
  p.receipt_no,
  p.amount,
  p.paid_on,
  p.method,
  null::text as network,
  p.source,
  p.payer_name,
  coalesce(s.full_name, 'Unknown pupil') as party_name,
  s.student_number as party_ref,
  s.class_code,
  s.campus,
  p.student_id,
  p.term_id,
  p.voided_at,
  p.created_at,
  p.reference,
  'fee'::text as detail_kind,
  p.id as detail_id,
  null::text as subtitle
from public.payments p
left join public.students s on s.id = p.student_id

union all

-- Online + desk admission
select
  a.id as entry_id,
  'admission'::text as category,
  coalesce(a.receipt_no, 'Admission') as receipt_no,
  a.amount,
  ((coalesce(a.paid_at, a.created_at) at time zone 'Africa/Kampala')::date) as paid_on,
  coalesce(a.method, case when a.source = 'online' or a.network is not null then 'mobile_money' else null end) as method,
  a.network,
  coalesce(nullif(a.source, ''), 'online') as source,
  a.payer_name,
  coalesce(a.child_name, 'Admission applicant') as party_name,
  null::text as party_ref,
  null::text as class_code,
  a.campus,
  null::uuid as student_id,
  null::uuid as term_id,
  null::timestamptz as voided_at,
  a.created_at,
  coalesce(a.reference, a.transaction_ref) as reference,
  'admission'::text as detail_kind,
  a.id as detail_id,
  'Admission fee'::text as subtitle
from public.admission_payments a
where a.status = 'paid'

union all

-- Clubs
select
  cp.id as entry_id,
  'clubs'::text as category,
  cp.receipt_no,
  cp.amount,
  cp.paid_on,
  cp.method,
  null::text as network,
  cp.source,
  cp.payer_name,
  coalesce(s.full_name, 'Unknown pupil') as party_name,
  s.student_number as party_ref,
  s.class_code,
  s.campus,
  cp.student_id,
  cp.term_id,
  cp.voided_at,
  cp.created_at,
  cp.reference,
  'club'::text as detail_kind,
  cp.id as detail_id,
  c.title as subtitle
from public.club_payments cp
left join public.students s on s.id = cp.student_id
left join public.clubs c on c.id = cp.club_id

union all

-- PLE / tours / other charges
select
  ch.id as entry_id,
  case pr.kind
    when 'ple' then 'ple'
    when 'tour' then 'tour'
    when 'admission' then 'admission'
    else 'other'
  end as category,
  ch.receipt_no,
  ch.amount,
  ch.paid_on,
  ch.method,
  null::text as network,
  ch.source,
  ch.payer_name,
  coalesce(s.full_name, coalesce(ch.payer_name, pr.name)) as party_name,
  s.student_number as party_ref,
  s.class_code,
  s.campus,
  ch.student_id,
  ch.term_id,
  ch.voided_at,
  ch.created_at,
  ch.reference,
  'charge'::text as detail_kind,
  ch.id as detail_id,
  pr.name as subtitle
from public.charge_payments ch
join public.charge_products pr on pr.id = ch.product_id
left join public.students s on s.id = ch.student_id;

grant select on public.accounts_payment_register to authenticated;

commit;
