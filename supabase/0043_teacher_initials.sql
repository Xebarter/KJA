-- Teacher initials for the report-card Initials column.
-- Run after 0015_academics.sql (safe to re-run).

begin;

alter table public.teaching_staff
  add column if not exists initials text;

comment on column public.teaching_staff.initials is
  'Short mark (e.g. GN) shown in the Initials column on pupil report cards.';

-- Backfill empty initials from first + last name letters.
update public.teaching_staff
set initials = upper(
  left(regexp_replace(split_part(btrim(full_name), ' ', 1), '[^A-Za-z]', '', 'g'), 1)
  || left(
    regexp_replace(
      coalesce(
        nullif(regexp_replace(btrim(full_name), '^.*\s+', ''), ''),
        split_part(btrim(full_name), ' ', 1)
      ),
      '[^A-Za-z]',
      '',
      'g'
    ),
    1
  )
)
where coalesce(btrim(initials), '') = ''
  and coalesce(btrim(full_name), '') <> '';

commit;
