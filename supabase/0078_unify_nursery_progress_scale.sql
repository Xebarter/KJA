-- Unify nursery progress scales into one shared catalogue.
-- Safe to re-run. Prefer updating scale_id on codes so skill_ratings FKs stay valid.

-- Canonical scale
insert into public.progress_scales (key, name, sort_order)
values ('nursery', 'Progress codes', 1)
on conflict (key) do update set name = excluded.name, sort_order = excluded.sort_order;

-- If an older install still has scale_1 and no nursery row was needed beyond insert above,
-- fold scale_1 into nursery when nursery was just created empty and scale_1 still exists.
do $$
declare
  nursery_id uuid;
  scale1_id uuid;
  scale2_id uuid;
begin
  select id into nursery_id from public.progress_scales where key = 'nursery';
  select id into scale1_id from public.progress_scales where key = 'scale_1';
  select id into scale2_id from public.progress_scales where key = 'scale_2';

  if nursery_id is null then
    raise exception 'Canonical progress scale nursery is missing';
  end if;

  -- Move any codes still on scale_1 / scale_2 onto nursery (skip duplicate codes).
  if scale1_id is not null then
    update public.progress_codes c
    set scale_id = nursery_id
    where c.scale_id = scale1_id
      and not exists (
        select 1 from public.progress_codes x
        where x.scale_id = nursery_id and x.code = c.code
      );
  end if;

  if scale2_id is not null then
    update public.progress_codes c
    set scale_id = nursery_id
    where c.scale_id = scale2_id
      and not exists (
        select 1 from public.progress_codes x
        where x.scale_id = nursery_id and x.code = c.code
      );
  end if;

  -- Remap ratings that still point at duplicate leftover codes on old scales.
  if scale1_id is not null then
    update public.skill_ratings r
    set progress_code_id = keep.id
    from public.progress_codes old
    join public.progress_codes keep
      on keep.scale_id = nursery_id and keep.code = old.code
    where r.progress_code_id = old.id
      and old.scale_id = scale1_id
      and old.id <> keep.id;
  end if;

  if scale2_id is not null then
    update public.skill_ratings r
    set progress_code_id = keep.id
    from public.progress_codes old
    join public.progress_codes keep
      on keep.scale_id = nursery_id and keep.code = old.code
    where r.progress_code_id = old.id
      and old.scale_id = scale2_id
      and old.id <> keep.id;
  end if;

  -- Drop leftover codes on obsolete scales, then the scales themselves.
  if scale1_id is not null then
    delete from public.progress_codes where scale_id = scale1_id;
    delete from public.progress_scales where id = scale1_id;
  end if;

  if scale2_id is not null then
    delete from public.progress_codes where scale_id = scale2_id;
    delete from public.progress_scales where id = scale2_id;
  end if;

  -- Ensure the full ten-code catalogue exists on nursery.
  insert into public.progress_codes (scale_id, code, label, sort_order)
  select nursery_id, v.code, v.label, v.sort_order
  from (
    values
      ('M', 'Strong mastery', 1),
      ('S', 'Satisfactory Progress', 2),
      ('D', 'Developing', 3),
      ('NP', 'Needs more practice', 4),
      ('+/-', 'Stronger / weaker', 5),
      ('P', 'Progressing', 6),
      ('A', 'Area needs growth', 7),
      ('I', 'Improving', 8),
      ('NA', 'Not applicable', 9),
      ('NT', 'Not taught', 10)
  ) as v(code, label, sort_order)
  on conflict (scale_id, code) do update
    set label = excluded.label,
        sort_order = excluded.sort_order;

  update public.nursery_divisions
  set progress_scale_id = nursery_id;
end $$;
