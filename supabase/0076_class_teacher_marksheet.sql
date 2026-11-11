-- Class teachers (lead + assistant) may read all subject papers for their
-- stream and edit open assessment_scores across subjects on the class marksheet.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- assessments read

drop policy if exists assessments_teacher_read on public.assessments;

create policy assessments_teacher_read on public.assessments for select to authenticated
  using (
    (select public.is_linked_teacher())
    and (
      public.teaches_subject(term_id, class_code, stream, subject_id, campus)
      or public.is_class_teacher(term_id, class_code, stream, campus)
    )
  );

-- ---------------------------------------------------------------- scores read

drop policy if exists assessment_scores_teacher_read on public.assessment_scores;

create policy assessment_scores_teacher_read on public.assessment_scores for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and (
          public.teaches_subject(
            paper.term_id, paper.class_code, paper.stream, paper.subject_id, paper.campus
          )
          or public.is_class_teacher(
            paper.term_id, paper.class_code, paper.stream, paper.campus
          )
        )
    )
  );

-- ---------------------------------------------------------------- scores write (open papers only)

drop policy if exists assessment_scores_teacher_write on public.assessment_scores;

create policy assessment_scores_teacher_write on public.assessment_scores for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and paper.status = 'open'
        and (
          public.teaches_subject(
            paper.term_id, paper.class_code, paper.stream, paper.subject_id, paper.campus
          )
          or public.is_class_teacher(
            paper.term_id, paper.class_code, paper.stream, paper.campus
          )
        )
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.assessments paper
      where paper.id = assessment_scores.assessment_id
        and paper.status = 'open'
        and (
          public.teaches_subject(
            paper.term_id, paper.class_code, paper.stream, paper.subject_id, paper.campus
          )
          or public.is_class_teacher(
            paper.term_id, paper.class_code, paper.stream, paper.campus
          )
        )
    )
  );

commit;
