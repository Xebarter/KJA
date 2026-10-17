-- Club consent and term payments. Run after 0018_parent_applications (safe to re-run).
-- Parents consent for a pupil the admissions office assigned to them, then pay that club's
-- fee for the current term. Club receipts stay out of public.payments so they cannot
-- reduce a school-fee balance.

begin;

-- ---------------------------------------------------------------- receipt numbers

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
  if p_kind not in ('INV', 'RCT', 'EXP', 'CLB') then
    raise exception 'Unknown document kind %', p_kind;
  end if;
  insert into public.account_counters (kind, year, value) values (p_kind, yr, 1)
  on conflict (kind, year) do update set value = public.account_counters.value + 1
  returning value into n;
  return p_kind || '-' || yr || '-' || lpad(n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------- catalogue

alter table public.clubs add column if not exists guide_no integer;
alter table public.clubs add column if not exists category text not null default '';
alter table public.clubs add column if not exists fee_amount integer not null default 0;
alter table public.clubs add column if not exists section text not null default 'both';
alter table public.clubs add column if not exists sort_order integer not null default 0;
alter table public.clubs add column if not exists active boolean not null default true;

alter table public.clubs drop constraint if exists clubs_fee_amount_check;
alter table public.clubs add constraint clubs_fee_amount_check check (fee_amount >= 0);
alter table public.clubs drop constraint if exists clubs_section_check;
alter table public.clubs add constraint clubs_section_check check (section in ('nursery', 'primary', 'both'));
create unique index if not exists clubs_guide_no_idx on public.clubs (guide_no) where guide_no is not null;

-- The official guide. Matching an existing title keeps its id; later runs update by guide number.
do $$
declare
  row record;
begin
  for row in
    select *
    from (values
      (1, 'Badminton', 'Games and Sports', 50000, 'both'),
      (2, 'Soccer - Talent Extra', 'Games and Sports', 70000, 'both'),
      (3, 'Swimming', 'Games and Sports', 90000, 'both'),
      (4, 'Chess Club', 'Games and Sports', 40000, 'both'),
      (5, 'Piano', 'Art and Entertainment', 60000, 'both'),
      (6, 'Guitar', 'Art and Entertainment', 60000, 'both'),
      (7, 'Ballet', 'Art and Entertainment', 50000, 'both'),
      (8, 'Dance for Fitness', 'Art and Entertainment', 40000, 'both'),
      (9, 'Art Club', 'Art and Entertainment', 40000, 'both'),
      (10, 'Home Management', 'Science and Technology', 40000, 'both'),
      (11, 'Computer Club', 'Science and Technology', 40000, 'both'),
      (12, 'Scouts and Girl Guides', 'Travel and Adventure', 40000, 'both'),
      (13, 'French Club', 'Information and Language', 40000, 'both'),
      (14, 'Chinese', 'Information and Language', 40000, 'both'),
      (15, 'Sanyu Readers (Nursery)', 'Information and Language', 30000, 'nursery'),
      (16, 'Readers Quora (Primary)', 'Information and Language', 30000, 'primary'),
      (17, 'Religious Affairs Catholics', 'Religion', 50000, 'both'),
      (18, 'Religious Affairs Anglicans', 'Religion', 50000, 'both'),
      (19, 'Religious Affairs Islam', 'Religion', 50000, 'both')
    ) as guide(guide_no, title, category, fee_amount, section)
  loop
    update public.clubs
      set title = row.title,
          category = row.category,
          fee_amount = row.fee_amount,
          section = row.section,
          sort_order = row.guide_no,
          active = true,
          published = true
      where guide_no = row.guide_no;
    if not found then
      update public.clubs
        set guide_no = row.guide_no,
            category = row.category,
            fee_amount = row.fee_amount,
            section = row.section,
            sort_order = row.guide_no,
            active = true,
            published = true
        where title = row.title and guide_no is null;
    end if;
    if not found then
      insert into public.clubs (guide_no, title, category, fee_amount, section, sort_order, active, published)
      values (row.guide_no, row.title, row.category, row.fee_amount, row.section, row.guide_no, true, true);
    end if;
  end loop;
end $$;

update public.clubs set active = false, published = false where guide_no is null;

-- ---------------------------------------------------------------- consent

create table if not exists public.club_consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create unique index if not exists club_consents_open_idx on public.club_consents (student_id, club_id) where withdrawn_at is null;
create index if not exists club_consents_student_idx on public.club_consents (student_id);

-- ---------------------------------------------------------------- phone prompt

create table if not exists public.club_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  club_id uuid not null references public.clubs (id) on delete restrict,
  term_id uuid not null references public.fee_terms (id) on delete restrict,
  child_name text not null,
  club_title text not null,
  term_label text not null,
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
create index if not exists club_collections_user_idx on public.club_collections (user_id, created_at desc);
create index if not exists club_collections_provider_idx on public.club_collections (provider_ref);

-- ---------------------------------------------------------------- receipts

create table if not exists public.club_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique default public.next_account_number('CLB'),
  student_id uuid not null references public.students (id) on delete restrict,
  family_id uuid references public.families (id) on delete set null,
  club_id uuid not null references public.clubs (id) on delete restrict,
  term_id uuid not null references public.fee_terms (id) on delete restrict,
  amount integer not null check (amount > 0),
  method text not null check (method in ('cash', 'bank', 'mobile_money', 'schoolpay', 'cheque', 'other')),
  reference text,
  paid_on date not null default ((now() at time zone 'Africa/Kampala')::date),
  payer_name text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'online')),
  received_by uuid references public.profiles (id) on delete set null,
  collection_id uuid unique references public.club_collections (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);
create unique index if not exists club_payments_once on public.club_payments (student_id, club_id, term_id) where voided_at is null;
create index if not exists club_payments_term_idx on public.club_payments (term_id, paid_on desc);
create unique index if not exists club_payments_reference_once on public.club_payments (method, lower(reference))
  where reference is not null and voided_at is null and method in ('bank', 'mobile_money', 'schoolpay', 'cheque');

alter table public.club_collections
  drop constraint if exists club_collections_payment_id_fkey;
alter table public.club_collections
  add constraint club_collections_payment_id_fkey
  foreign key (payment_id) references public.club_payments (id) on delete set null;

-- ---------------------------------------------------------------- access

alter table public.club_consents enable row level security;
alter table public.club_collections enable row level security;
alter table public.club_payments enable row level security;

drop policy if exists clubs_accounts on public.clubs;
create policy clubs_accounts on public.clubs for all to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

drop policy if exists club_consents_parent_select on public.club_consents;
create policy club_consents_parent_select on public.club_consents for select to authenticated
  using (student_id in (select public.my_student_ids()));

drop policy if exists club_consents_parent_insert on public.club_consents;
create policy club_consents_parent_insert on public.club_consents for insert to authenticated
  with check (user_id = (select auth.uid()) and student_id in (select public.my_student_ids()) and withdrawn_at is null);

drop policy if exists club_consents_parent_update on public.club_consents;
create policy club_consents_parent_update on public.club_consents for update to authenticated
  using (student_id in (select public.my_student_ids()))
  with check (student_id in (select public.my_student_ids()));

drop policy if exists club_consents_accounts on public.club_consents;
create policy club_consents_accounts on public.club_consents for select to authenticated
  using ((select public.is_accounts_staff()));

drop policy if exists club_collections_parent on public.club_collections;
create policy club_collections_parent on public.club_collections for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists club_collections_accounts on public.club_collections;
create policy club_collections_accounts on public.club_collections for select to authenticated
  using ((select public.is_accounts_staff()));

drop policy if exists club_payments_parent on public.club_payments;
create policy club_payments_parent on public.club_payments for select to authenticated
  using (voided_at is null and student_id in (select public.my_student_ids()));

drop policy if exists club_payments_accounts on public.club_payments;
create policy club_payments_accounts on public.club_payments for all to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

grant select, update on public.clubs to authenticated;
grant select, insert, update on public.club_consents to authenticated;
grant select on public.club_collections to authenticated;
grant select, insert on public.club_payments to authenticated;

commit;
