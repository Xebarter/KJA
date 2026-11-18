-- Class teachers may write persistent nursery / primary comment stores for classes they lead.
-- App code still blocks published report cards. Safe to re-run.

begin;

-- ---------------------------------------------------------------- nursery class remarks
drop policy if exists nursery_class_comments_teacher_write on public.nursery_class_comments;
create policy nursery_class_comments_teacher_write on public.nursery_class_comments
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  )
  with check (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

-- ---------------------------------------------------------------- primary class remarks
drop policy if exists primary_class_comments_teacher_write on public.primary_class_comments;
create policy primary_class_comments_teacher_write on public.primary_class_comments
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  )
  with check (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

-- ---------------------------------------------------------------- primary subject remarks
drop policy if exists primary_subject_comments_teacher_write on public.primary_subject_comments;
create policy primary_subject_comments_teacher_write on public.primary_subject_comments
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  )
  with check (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

-- ---------------------------------------------------------------- primary activity remarks
drop policy if exists primary_activity_comments_teacher_write on public.primary_activity_comments;
create policy primary_activity_comments_teacher_write on public.primary_activity_comments
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  )
  with check (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

commit;
