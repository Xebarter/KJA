-- Term clubs list on report cards (comma-separated, collected via the marks/behavior workbook
-- or the report remarks editor) and read access to active club_consents for auto-prefill.
-- Safe to re-run.

begin;

alter table public.report_cards
  add column if not exists clubs text;

-- Last class-teacher / principal text written by the comment engine (AI or template).
-- If the office or teacher edits a remark by hand it no longer matches these columns,
-- so "Generate report cards" leaves manual remarks alone and only rewrites engine text.
alter table public.report_cards
  add column if not exists ai_class_comment text,
  add column if not exists ai_head_comment text;

comment on column public.report_cards.clubs is
  'Comma-separated list of school clubs the learner actively participated in this term; used in AI class-teacher comments.';

do $$
begin
  if to_regclass('public.club_consents') is not null then
    execute 'drop policy if exists club_consents_academics_read on public.club_consents';
    execute $policy$
      create policy club_consents_academics_read on public.club_consents
        for select to authenticated
        using (
          (select public.is_academics_staff())
          or (
            (select public.is_linked_teacher())
            and exists (
              select 1 from public.students s
              where s.id = club_consents.student_id
                and public.teacher_sees_pupil(s.class_code, s.stream)
            )
          )
        )
    $policy$;
  end if;
end $$;

commit;
