-- Snapshot unit price on requisition lines (for PDF / ordering).
-- Safe to re-run.

begin;

alter table public.store_requisition_lines
  add column if not exists unit_price numeric(14, 2);

update public.store_requisition_lines
set unit_price = 0
where unit_price is null;

alter table public.store_requisition_lines
  alter column unit_price set default 0;

alter table public.store_requisition_lines
  alter column unit_price set not null;

do $$
begin
  alter table public.store_requisition_lines
    add constraint store_requisition_lines_unit_price_check check (unit_price >= 0);
exception
  when duplicate_object then null;
end $$;

-- Backfill from catalogue last cost where still zero.
update public.store_requisition_lines as line
set unit_price = item.unit_cost
from public.store_items as item
where line.item_id = item.id
  and coalesce(line.unit_price, 0) = 0
  and coalesce(item.unit_cost, 0) > 0;

commit;
