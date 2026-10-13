-- Lets admins mark an unpaid admission application as followed up. Run after 0008_admission_payments.sql (safe to re-run).
-- Writes go through the server (service role key), so no new policies are needed.

alter table public.admission_payments add column if not exists followed_up_at timestamptz;
alter table public.admission_payments add column if not exists followed_up_by uuid references public.profiles (id) on delete set null;
