-- Family fee payments: one bank slip / cash amount split across siblings, one receipt.
-- Child rows still land in public.payments so each pupil's balance updates as usual.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- batches

create table if not exists public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique default public.next_account_number('RCT'),
  family_id uuid not null references public.families (id) on delete restrict,
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

create index if not exists payment_batches_family_idx on public.payment_batches (family_id, paid_on desc);
create index if not exists payment_batches_paid_idx on public.payment_batches (paid_on desc);

-- One bank / MoMo / SchoolPay / cheque reference per open batch.
create unique index if not exists payment_batches_reference_once
  on public.payment_batches (method, lower(reference))
  where reference is not null
    and voided_at is null
    and method in ('bank', 'mobile_money', 'schoolpay', 'cheque');

alter table public.payment_batches enable row level security;

drop policy if exists payment_batches_accounts_select on public.payment_batches;
drop policy if exists payment_batches_accounts_insert on public.payment_batches;
drop policy if exists payment_batches_accounts_update on public.payment_batches;
create policy payment_batches_accounts_select on public.payment_batches
  for select to authenticated using ((select public.is_accounts_staff()));
create policy payment_batches_accounts_insert on public.payment_batches
  for insert to authenticated with check ((select public.is_accounts_staff()));
create policy payment_batches_accounts_update on public.payment_batches
  for update to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

-- Parents can see batches for their own family.
drop policy if exists payment_batches_parent on public.payment_batches;
create policy payment_batches_parent on public.payment_batches
  for select to authenticated
  using (family_id in (select public.my_family_ids()));

-- ---------------------------------------------------------------- link child payments

alter table public.payments
  add column if not exists batch_id uuid references public.payment_batches (id) on delete restrict;

create index if not exists payments_batch_idx on public.payments (batch_id)
  where batch_id is not null;

-- The same slip may appear on every sibling line in a batch; uniqueness is on the batch.
drop index if exists public.payments_reference_once;
create unique index payments_reference_once on public.payments (method, lower(reference))
  where reference is not null
    and voided_at is null
    and batch_id is null
    and method in ('bank', 'mobile_money', 'schoolpay', 'cheque');

grant select, insert, update on public.payment_batches to authenticated;

commit;
