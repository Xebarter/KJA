-- Multi-child club cart: each collection line belongs to a pupil.
-- Run after 0020_club_baskets.sql (safe to re-run).

begin;

alter table public.club_collection_items
  add column if not exists student_id uuid references public.students (id) on delete restrict;

update public.club_collection_items i
set student_id = c.student_id
from public.club_collections c
where i.collection_id = c.id
  and i.student_id is null;

delete from public.club_collection_items where student_id is null;

alter table public.club_collection_items
  alter column student_id set not null;

alter table public.club_collection_items
  drop constraint if exists club_collection_items_collection_id_club_id_key;

create unique index if not exists club_collection_items_collection_student_club_idx
  on public.club_collection_items (collection_id, student_id, club_id);

create index if not exists club_collection_items_student_idx
  on public.club_collection_items (student_id);

-- Same club for two children in one collection needs a wider unique key.
drop index if exists public.club_payments_collection_club_idx;
create unique index if not exists club_payments_collection_student_club_idx
  on public.club_payments (collection_id, student_id, club_id)
  where collection_id is not null;

commit;
