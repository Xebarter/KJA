-- Office approval of a class marksheet. Teachers still submit an open markbook.
-- Approved marks are locked for report cards until the office unlocks them.

alter table public.assessments drop constraint if exists assessments_status_check;
alter table public.assessments
  add constraint assessments_status_check check (status in ('open', 'submitted', 'approved'));
