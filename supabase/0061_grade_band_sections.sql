-- Subject grade bands per school section: Nursery, Lower primary (P1–P3), Upper primary (P4–P7).
-- Legacy "primary" rows remain as a fallback until lower/upper are saved.

alter table public.grade_bands
  drop constraint if exists grade_bands_section_check;

alter table public.grade_bands
  add constraint grade_bands_section_check
  check (section in ('nursery', 'primary', 'lower', 'upper'));

comment on column public.grade_bands.section is
  'nursery = early years progress bands; lower = P1–P3; upper = P4–P7; primary = legacy shared primary scale used as fallback.';

-- Copy the shared primary scale into lower and upper when those sections are empty.
insert into public.grade_bands (section, label, min_score, max_score, points, sort_order)
select 'lower', label, min_score, max_score, points, sort_order
from public.grade_bands
where section = 'primary'
  and not exists (select 1 from public.grade_bands where section = 'lower')
on conflict (section, label) do nothing;

insert into public.grade_bands (section, label, min_score, max_score, points, sort_order)
select 'upper', label, min_score, max_score, points, sort_order
from public.grade_bands
where section = 'primary'
  and not exists (select 1 from public.grade_bands where section = 'upper')
on conflict (section, label) do nothing;
