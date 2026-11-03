-- Requisitions are draft or submitted only.
-- Safe to re-run.

begin;

update public.store_requisitions
set status = 'draft',
    updated_at = now()
where status in ('cancelled');

update public.store_requisitions
set status = 'submitted',
    submitted_at = coalesce(submitted_at, now()),
    updated_at = now()
where status not in ('draft', 'submitted');

alter table public.store_requisitions drop constraint if exists store_requisitions_status_check;

alter table public.store_requisitions
  add constraint store_requisitions_status_check
  check (status in ('draft', 'submitted'));

commit;
