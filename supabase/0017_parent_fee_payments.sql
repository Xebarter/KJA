-- School-fee payments started by a parent. The row exists before the phone prompt.
-- It becomes a receipt in public.payments only after the gateway confirms the money.

create table if not exists public.fee_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  term_id uuid not null references public.fee_terms (id) on delete restrict,
  child_name text not null,
  term_label text not null,
  amount integer not null check (amount > 0),
  currency text not null default 'UGX',
  phone text not null,
  network text,
  payer_name text,
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'paid', 'failed')),
  provider_ref text,
  transaction_ref text,
  payment_id uuid references public.payments (id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists fee_collections_user_idx on public.fee_collections (user_id, created_at desc);
create index if not exists fee_collections_provider_idx on public.fee_collections (provider_ref);

alter table public.fee_collections enable row level security;

drop policy if exists fee_collections_parent on public.fee_collections;
create policy fee_collections_parent on public.fee_collections
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists fee_collections_accounts on public.fee_collections;
create policy fee_collections_accounts on public.fee_collections
  for select to authenticated
  using ((select public.is_accounts_staff()));
