-- Class teachers (lead + assistant) may edit full remarks on draft/approved
-- report cards for their stream, including subject lines and activities.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- report cards

drop policy if exists report_cards_class_teacher_update on public.report_cards;

create policy report_cards_class_teacher_update on public.report_cards
  for update to authenticated
  using (
    (select public.is_linked_teacher())
    and status in ('draft', 'approved')
    and public.is_class_teacher(
      term_id,
      class_code,
      coalesce(stream, ''),
      coalesce(nullif(btrim(campus), ''), 'Kitante')
    )
  )
  with check (
    (select public.is_linked_teacher())
    and status in ('draft', 'approved', 'published')
    and public.is_class_teacher(
      term_id,
      class_code,
      coalesce(stream, ''),
      coalesce(nullif(btrim(campus), ''), 'Kitante')
    )
  );

-- ---------------------------------------------------------------- report lines

drop policy if exists report_lines_class_teacher_write on public.report_lines;

create policy report_lines_class_teacher_write on public.report_lines
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1
      from public.report_cards card
      where card.id = report_lines.report_card_id
        and card.status in ('draft', 'approved')
        and public.is_class_teacher(
          card.term_id,
          card.class_code,
          coalesce(card.stream, ''),
          coalesce(nullif(btrim(card.campus), ''), 'Kitante')
        )
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1
      from public.report_cards card
      where card.id = report_lines.report_card_id
        and card.status in ('draft', 'approved', 'published')
        and public.is_class_teacher(
          card.term_id,
          card.class_code,
          coalesce(card.stream, ''),
          coalesce(nullif(btrim(card.campus), ''), 'Kitante')
        )
    )
  );

-- ---------------------------------------------------------------- activities

drop policy if exists report_card_activities_class_teacher_write on public.report_card_activities;

create policy report_card_activities_class_teacher_write on public.report_card_activities
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1
      from public.report_cards card
      where card.id = report_card_activities.report_card_id
        and card.status in ('draft', 'approved')
        and public.is_class_teacher(
          card.term_id,
          card.class_code,
          coalesce(card.stream, ''),
          coalesce(nullif(btrim(card.campus), ''), 'Kitante')
        )
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1
      from public.report_cards card
      where card.id = report_card_activities.report_card_id
        and card.status in ('draft', 'approved', 'published')
        and public.is_class_teacher(
          card.term_id,
          card.class_code,
          coalesce(card.stream, ''),
          coalesce(nullif(btrim(card.campus), ''), 'Kitante')
        )
    )
  );

commit;
