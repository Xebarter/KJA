-- Printed heading on each report card (e.g. End of Term Report).

alter table public.report_cards
  add column if not exists report_title text;

comment on column public.report_cards.report_title is
  'Heading printed on the card, set when generating; shown in uppercase on the sheet.';
