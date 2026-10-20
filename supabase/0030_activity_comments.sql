-- Per-activity co-curricular comments on the printed report card.

alter table public.report_card_activities
  add column if not exists comment text;

comment on column public.report_card_activities.comment is
  'One-sentence remark for this activity, from skills and mark; shown on the report instead of a percentage.';
