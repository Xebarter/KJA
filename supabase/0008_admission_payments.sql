-- Admission fee payments by mobile money. Run after 0004_admissions.sql (safe to re-run).
-- Payments are written only by the server (service role key), so the public cannot fake a paid application.

create table if not exists public.admission_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique,
  receipt_token text not null,
  application_id uuid references public.applications (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  campus text not null,
  amount integer not null check (amount > 0),
  currency text not null default 'UGX',
  phone text not null,
  network text,
  payer_name text,
  payer_email text,
  child_name text,
  application jsonb not null,
  status text not null default 'initiated',
  provider_ref text unique,
  transaction_ref text,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admission_payments drop constraint if exists admission_payments_status_check;
alter table public.admission_payments add constraint admission_payments_status_check
  check (status in ('initiated', 'pending', 'paid', 'failed'));

create index if not exists admission_payments_created_idx on public.admission_payments (created_at desc);
create index if not exists admission_payments_status_idx on public.admission_payments (status);
create index if not exists admission_payments_application_idx on public.admission_payments (application_id);

create or replace function public.touch_admission_payment()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists admission_payments_touch on public.admission_payments;
create trigger admission_payments_touch
  before update on public.admission_payments
  for each row execute function public.touch_admission_payment();

alter table public.admission_payments enable row level security;
drop policy if exists admission_payments_select on public.admission_payments;
create policy admission_payments_select on public.admission_payments for select to authenticated using (public.is_admin());

alter table public.applications add column if not exists payment_status text;
alter table public.applications add column if not exists payment_id uuid references public.admission_payments (id) on delete set null;
alter table public.applications add column if not exists admission_fee integer;
alter table public.applications drop constraint if exists applications_payment_status_check;
alter table public.applications add constraint applications_payment_status_check
  check (payment_status is null or payment_status = 'paid');
create index if not exists applications_payment_idx on public.applications (payment_status);
create unique index if not exists applications_payment_once on public.applications (payment_id) where payment_id is not null;

-- Applications are now created by the server once the admission fee is paid.
drop policy if exists applications_insert on public.applications;
drop policy if exists applications_own_insert on public.applications;
