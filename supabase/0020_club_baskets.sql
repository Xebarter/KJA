-- One mobile-money prompt can pay several club fees for the same child.
-- Each club still gets its own receipt. Run after 0019_clubs.sql (safe to re-run).

begin;

create table if not exists public.club_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.club_collections (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  club_title text not null,
  amount integer not null check (amount > 0),
  payment_id uuid references public.club_payments (id) on delete set null,
  unique (collection_id, club_id)
);

create index if not exists club_collection_items_collection_idx on public.club_collection_items (collection_id);

alter table public.club_payments drop constraint if exists club_payments_collection_id_key;
drop index if exists public.club_payments_collection_id_key;

create unique index if not exists club_payments_collection_club_idx
  on public.club_payments (collection_id, club_id)
  where collection_id is not null;

alter table public.club_collection_items enable row level security;

drop policy if exists club_collection_items_parent on public.club_collection_items;
create policy club_collection_items_parent on public.club_collection_items
  for select to authenticated
  using (
    collection_id in (
      select id from public.club_collections where user_id = (select auth.uid())
    )
  );

drop policy if exists club_collection_items_accounts on public.club_collection_items;
create policy club_collection_items_accounts on public.club_collection_items
  for select to authenticated
  using ((select public.is_accounts_staff()));

grant select on public.club_collection_items to authenticated;

commit;
