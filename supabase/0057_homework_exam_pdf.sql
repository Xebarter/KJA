-- Homework exam PDFs: Word-formatted instructions rendered to PDF for the Pupils App.
-- Stored in the private class-resources bucket under homework/{assignment_id}.pdf.
-- Safe to re-run.

begin;

alter table public.homework_assignments
  add column if not exists exam_pdf_path text,
  add column if not exists exam_pdf_size integer;

comment on column public.homework_assignments.exam_pdf_path is
  'Storage object in class-resources bucket (homework/{id}.pdf) for the exam paper PDF.';
comment on column public.homework_assignments.exam_pdf_size is
  'Byte size of the generated exam PDF.';

create index if not exists homework_assignments_exam_pdf_idx
  on public.homework_assignments (exam_pdf_path)
  where exam_pdf_path is not null;

-- Pupils/teachers/staff may read homework exam PDFs and inline images referenced from instructions.
create or replace function public.can_read_class_resource_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_academics_staff()
    or exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
    or exists (
      select 1
      from public.class_resources r
      join public.students s on s.profile_id = auth.uid() and s.status = 'active'
      where r.published_at is not null
        and s.class_code = r.class_code
        and coalesce(s.stream, '') = coalesce(r.stream, '')
        and (
          r.file_path = object_name
          or (
            object_name like 'inline/%'
            and (
              position(object_name in coalesce(r.body, '')) > 0
              or position(replace(object_name, '/', '%2F') in coalesce(r.body, '')) > 0
            )
          )
        )
    )
    or exists (
      select 1
      from public.homework_assignments h
      join public.students s on s.profile_id = auth.uid() and s.status = 'active'
      where h.published_at is not null
        and s.class_code = h.class_code
        and coalesce(s.stream, '') = coalesce(h.stream, '')
        and (
          h.exam_pdf_path = object_name
          or (
            object_name like 'inline/%'
            and (
              position(object_name in coalesce(h.instructions, '')) > 0
              or position(replace(object_name, '/', '%2F') in coalesce(h.instructions, '')) > 0
            )
          )
        )
    );
$$;

grant execute on function public.can_read_class_resource_file(text) to authenticated;

commit;
