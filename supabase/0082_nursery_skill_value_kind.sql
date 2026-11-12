-- Nursery skills may be scored with a progress code or a free whole number
-- (e.g. "writes numbers up to" → teacher enters 50).
-- Safe to re-run.

begin;

alter table public.developmental_skills
  add column if not exists value_kind text not null default 'progress_code';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'developmental_skills_value_kind_check'
      and conrelid = 'public.developmental_skills'::regclass
  ) then
    alter table public.developmental_skills
      add constraint developmental_skills_value_kind_check
      check (value_kind in ('progress_code', 'number'));
  end if;
end $$;

comment on column public.developmental_skills.value_kind is
  'progress_code = pick from the nursery scale; number = teacher enters a whole number.';

alter table public.skill_ratings
  add column if not exists numeric_value integer;

comment on column public.skill_ratings.numeric_value is
  'Whole-number score for skills with value_kind = number; null when a progress code is used.';

commit;
