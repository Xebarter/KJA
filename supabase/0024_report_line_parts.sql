-- Each assessment set on a report card, with the share of the subject total it is worth.
-- Midterm at 30 and end of term at 70 are stored as two parts of the same subject line.

create table if not exists public.report_line_parts (
  report_card_id uuid not null references public.report_cards (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  set_key text not null,
  label text not null,
  share numeric not null check (share >= 0 and share <= 100),
  score numeric,
  sort_order smallint not null default 0,
  primary key (report_card_id, subject_id, set_key)
);
create index if not exists report_line_parts_card_idx on public.report_line_parts (report_card_id);

alter table public.report_line_parts enable row level security;

drop policy if exists report_line_parts_staff on public.report_line_parts;
create policy report_line_parts_staff on public.report_line_parts for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists report_line_parts_teacher on public.report_line_parts;
create policy report_line_parts_teacher on public.report_line_parts for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_line_parts.report_card_id
        and public.teacher_sees_pupil(card.class_code, card.stream)
    )
  );

drop policy if exists report_line_parts_parent on public.report_line_parts;
create policy report_line_parts_parent on public.report_line_parts for select to authenticated
  using (
    exists (
      select 1 from public.report_cards card
      where card.id = report_line_parts.report_card_id
        and card.status = 'published'
        and card.student_id in (select public.my_student_ids())
    )
  );

grant select, insert, update, delete on public.report_line_parts to authenticated;
