-- Admissions officers may generate and download nursery developmental report cards.
-- Write path prefers the service role from the desk action; these policies cover
-- authenticated reads/writes when a service key is unavailable.

-- Developmental sittings (nursery only): admissions may read.
drop policy if exists developmental_assessments_admissions_read on public.developmental_assessments;
create policy developmental_assessments_admissions_read on public.developmental_assessments
  for select to authenticated
  using (
    (select public.is_admissions_staff())
    and class_code in ('RC', 'C2', 'C3', 'C4')
  );

drop policy if exists skill_ratings_admissions_read on public.skill_ratings;
create policy skill_ratings_admissions_read on public.skill_ratings
  for select to authenticated
  using (
    (select public.is_admissions_staff())
    and exists (
      select 1
      from public.developmental_assessments paper
      where paper.id = skill_ratings.assessment_id
        and paper.class_code in ('RC', 'C2', 'C3', 'C4')
    )
  );

-- Report cards for nursery streams: read + draft prepare (no parent publish from admissions).
drop policy if exists report_cards_admissions_nursery_read on public.report_cards;
create policy report_cards_admissions_nursery_read on public.report_cards
  for select to authenticated
  using (
    (select public.is_admissions_staff())
    and class_code in ('RC', 'C2', 'C3', 'C4')
  );

drop policy if exists report_cards_admissions_nursery_write on public.report_cards;
create policy report_cards_admissions_nursery_write on public.report_cards
  for all to authenticated
  using (
    (select public.is_admissions_staff())
    and class_code in ('RC', 'C2', 'C3', 'C4')
    and coalesce(status, 'draft') in ('draft', 'approved')
  )
  with check (
    (select public.is_admissions_staff())
    and class_code in ('RC', 'C2', 'C3', 'C4')
    and coalesce(status, 'draft') in ('draft', 'approved')
  );

drop policy if exists report_skill_lines_admissions_nursery on public.report_skill_lines;
create policy report_skill_lines_admissions_nursery on public.report_skill_lines
  for all to authenticated
  using (
    (select public.is_admissions_staff())
    and exists (
      select 1
      from public.report_cards card
      where card.id = report_skill_lines.report_card_id
        and card.class_code in ('RC', 'C2', 'C3', 'C4')
    )
  )
  with check (
    (select public.is_admissions_staff())
    and exists (
      select 1
      from public.report_cards card
      where card.id = report_skill_lines.report_card_id
        and card.class_code in ('RC', 'C2', 'C3', 'C4')
    )
  );
