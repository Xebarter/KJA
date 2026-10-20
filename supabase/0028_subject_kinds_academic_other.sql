-- Subject catalogue: Academic (report marks table) or Other (co-curricular table).
-- Legacy kind 'other' was an academic elective; fold it into Academic.

update public.subjects
set kind = 'core'
where kind = 'other';

alter table public.subjects
  drop constraint if exists subjects_kind_check;
alter table public.subjects
  add constraint subjects_kind_check check (kind in ('core', 'cocurricular'));

comment on column public.subjects.kind is
  'core = Academic (marks table on the report); cocurricular = Other (co-curricular table on the report).';
