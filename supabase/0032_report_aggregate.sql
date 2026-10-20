-- Aggregate (sum of subject points) and overall grade (1–4 or U) on report cards.
-- Division cutoffs are editable in Academics → Grading.

alter table public.report_cards
  add column if not exists overall_aggregate smallint,
  add column if not exists overall_grade text;

comment on column public.report_cards.overall_aggregate is
  'Sum of academic subject points (AGG) at prepare time.';
comment on column public.report_cards.overall_grade is
  'Division from aggregate: 1, 2, 3, 4, or U.';

create table if not exists public.division_bands (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('upper', 'lower')),
  label text not null,
  max_aggregate smallint,
  sort_order integer not null default 0,
  unique (track, label),
  check (max_aggregate is null or max_aggregate >= 0)
);

comment on table public.division_bands is
  'Maps total AGG to GRADE. Upper track = four academic subjects; lower = more than four.';
comment on column public.division_bands.max_aggregate is
  'Inclusive ceiling for this grade. Null is the catch-all (usually U).';

alter table public.division_bands enable row level security;

drop policy if exists division_bands_staff on public.division_bands;
create policy division_bands_staff on public.division_bands for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists division_bands_read on public.division_bands;
create policy division_bands_read on public.division_bands for select to authenticated
  using (true);

grant select, insert, update, delete on public.division_bands to authenticated;

-- Upper primary (4 subjects): Ugandan PLE-style divisions.
-- Lower primary (more than 4): schools often use wider AGG ceilings.
insert into public.division_bands (track, label, max_aggregate, sort_order) values
  ('upper', '1', 12, 1),
  ('upper', '2', 23, 2),
  ('upper', '3', 29, 3),
  ('upper', '4', 34, 4),
  ('upper', 'U', null, 5),
  ('lower', '1', 18, 1),
  ('lower', '2', 36, 2),
  ('lower', '3', 42, 3),
  ('lower', '4', 58, 4),
  ('lower', 'U', null, 5)
on conflict (track, label) do nothing;
