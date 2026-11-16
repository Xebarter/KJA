-- Persistent nursery class-teacher comments, keyed by student + term.
-- Survives cancel preparation (draft report_cards delete). Safe to re-run.

begin;

create table if not exists public.nursery_class_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  campus text not null default 'Kitante',
  class_code text,
  stream text not null default '',
  comment text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (student_id, term_id)
);

create index if not exists nursery_class_comments_term_idx
  on public.nursery_class_comments (term_id);

create index if not exists nursery_class_comments_class_idx
  on public.nursery_class_comments (term_id, class_code, stream);

comment on table public.nursery_class_comments is
  'Nursery class-teacher remarks that persist independently of report_cards preparation.';

alter table public.nursery_class_comments enable row level security;

drop policy if exists nursery_class_comments_staff on public.nursery_class_comments;
create policy nursery_class_comments_staff on public.nursery_class_comments
  for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists nursery_class_comments_teacher_read on public.nursery_class_comments;
create policy nursery_class_comments_teacher_read on public.nursery_class_comments
  for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

grant select, insert, update, delete on public.nursery_class_comments to authenticated;

-- Backfill from existing nursery report card comments.
insert into public.nursery_class_comments (
  student_id, term_id, campus, class_code, stream, comment, updated_at
)
select
  rc.student_id,
  rc.term_id,
  coalesce(nullif(trim(rc.campus), ''), 'Kitante'),
  rc.class_code,
  coalesce(rc.stream, ''),
  nullif(trim(rc.class_teacher_comment), ''),
  coalesce(rc.updated_at, now())
from public.report_cards rc
where nullif(trim(rc.class_teacher_comment), '') is not null
  and rc.class_code in ('RC', 'C2', 'C3', 'C4')
on conflict (student_id, term_id) do update
  set
    comment = excluded.comment,
    campus = excluded.campus,
    class_code = excluded.class_code,
    stream = excluded.stream,
    updated_at = greatest(public.nursery_class_comments.updated_at, excluded.updated_at)
  where public.nursery_class_comments.comment is distinct from excluded.comment
     or public.nursery_class_comments.comment is null;

commit;
