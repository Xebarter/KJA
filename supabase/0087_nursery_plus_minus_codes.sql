-- Split nursery "+/-" into separate "+" (Stronger) and "-" (Weaker) progress codes.
-- Existing skill_ratings that pointed at "+/-" become null (FK on delete set null).

do $$
declare
  nursery_id uuid;
begin
  select id into nursery_id from public.progress_scales where key = 'nursery';
  if nursery_id is null then
    raise exception 'Canonical progress scale nursery is missing';
  end if;

  -- Remove the combined indicator first so unique (scale_id, code) stays clean.
  delete from public.progress_codes
  where scale_id = nursery_id and code in ('+/-', '+/−', '±');

  insert into public.progress_codes (scale_id, code, label, sort_order)
  values
    (nursery_id, '+', 'Stronger', 5),
    (nursery_id, '-', 'Weaker', 6)
  on conflict (scale_id, code) do update
    set label = excluded.label,
        sort_order = excluded.sort_order;

  -- Keep the rest of the catalogue ordered after + / -
  update public.progress_codes set sort_order = 7, label = coalesce(nullif(label, ''), 'Progressing')
  where scale_id = nursery_id and code = 'P';
  update public.progress_codes set sort_order = 8, label = coalesce(nullif(label, ''), 'Area needs growth')
  where scale_id = nursery_id and code = 'A';
  update public.progress_codes set sort_order = 9, label = coalesce(nullif(label, ''), 'Improving')
  where scale_id = nursery_id and code = 'I';
  update public.progress_codes set sort_order = 10, label = coalesce(nullif(label, ''), 'Not applicable')
  where scale_id = nursery_id and code = 'NA';
  update public.progress_codes set sort_order = 11, label = coalesce(nullif(label, ''), 'Not taught')
  where scale_id = nursery_id and code = 'NT';
end $$;
