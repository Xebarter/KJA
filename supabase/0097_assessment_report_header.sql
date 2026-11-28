-- Optional custom column header label for how an assessment appears
-- in the Academic Record table on primary report cards (e.g. "BOT", "MID", "CA 1").

alter table public.assessments
  add column if not exists report_header text;

alter table public.report_line_parts
  add column if not exists report_header text;
