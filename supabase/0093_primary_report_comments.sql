-- Persistent primary report remarks (class teacher, subject, activity/other).
-- Survive cancel / re-prepare of draft report_cards. Run after 0092. Safe to re-run.

begin;

-- ---------------------------------------------------------------- class teacher
create table if not exists public.primary_class_comments (
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

create index if not exists primary_class_comments_term_idx
  on public.primary_class_comments (term_id);
create index if not exists primary_class_comments_class_idx
  on public.primary_class_comments (term_id, class_code, stream);

comment on table public.primary_class_comments is
  'Primary class-teacher remarks that persist independently of report_cards preparation.';

alter table public.primary_class_comments enable row level security;

drop policy if exists primary_class_comments_staff on public.primary_class_comments;
create policy primary_class_comments_staff on public.primary_class_comments
  for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists primary_class_comments_teacher_read on public.primary_class_comments;
create policy primary_class_comments_teacher_read on public.primary_class_comments
  for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

grant select, insert, update, delete on public.primary_class_comments to authenticated;

-- ---------------------------------------------------------------- per subject
create table if not exists public.primary_subject_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  campus text not null default 'Kitante',
  class_code text,
  stream text not null default '',
  comment text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (student_id, term_id, subject_id)
);

create index if not exists primary_subject_comments_term_idx
  on public.primary_subject_comments (term_id);
create index if not exists primary_subject_comments_class_idx
  on public.primary_subject_comments (term_id, class_code, stream);
create index if not exists primary_subject_comments_subject_idx
  on public.primary_subject_comments (term_id, subject_id);

comment on table public.primary_subject_comments is
  'Primary subject-teacher remarks that persist independently of report_lines rebuilds.';

alter table public.primary_subject_comments enable row level security;

drop policy if exists primary_subject_comments_staff on public.primary_subject_comments;
create policy primary_subject_comments_staff on public.primary_subject_comments
  for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists primary_subject_comments_teacher_read on public.primary_subject_comments;
create policy primary_subject_comments_teacher_read on public.primary_subject_comments
  for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

grant select, insert, update, delete on public.primary_subject_comments to authenticated;

-- ---------------------------------------------------------------- other / activity slots
create table if not exists public.primary_activity_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  subject_id uuid references public.subjects (id) on delete set null,
  activity_name text,
  campus text not null default 'Kitante',
  class_code text,
  stream text not null default '',
  comment text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (student_id, term_id, slot)
);

create index if not exists primary_activity_comments_term_idx
  on public.primary_activity_comments (term_id);
create index if not exists primary_activity_comments_class_idx
  on public.primary_activity_comments (term_id, class_code, stream);

comment on table public.primary_activity_comments is
  'Primary cocurricular / other-subject slot remarks that persist across report regeneration.';

alter table public.primary_activity_comments enable row level security;

drop policy if exists primary_activity_comments_staff on public.primary_activity_comments;
create policy primary_activity_comments_staff on public.primary_activity_comments
  for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists primary_activity_comments_teacher_read on public.primary_activity_comments;
create policy primary_activity_comments_teacher_read on public.primary_activity_comments
  for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

grant select, insert, update, delete on public.primary_activity_comments to authenticated;

-- ---------------------------------------------------------------- backfill class teacher
insert into public.primary_class_comments (
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
  and rc.class_code in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')
on conflict (student_id, term_id) do update
  set
    comment = excluded.comment,
    campus = excluded.campus,
    class_code = excluded.class_code,
    stream = excluded.stream,
    updated_at = greatest(public.primary_class_comments.updated_at, excluded.updated_at)
  where public.primary_class_comments.comment is distinct from excluded.comment
     or public.primary_class_comments.comment is null;

-- ---------------------------------------------------------------- backfill subject comments
insert into public.primary_subject_comments (
  student_id, term_id, subject_id, campus, class_code, stream, comment, updated_at
)
select
  rc.student_id,
  rc.term_id,
  rl.subject_id,
  coalesce(nullif(trim(rc.campus), ''), 'Kitante'),
  rc.class_code,
  coalesce(rc.stream, ''),
  nullif(trim(rl.teacher_comment), ''),
  coalesce(rc.updated_at, now())
from public.report_lines rl
join public.report_cards rc on rc.id = rl.report_card_id
where nullif(trim(rl.teacher_comment), '') is not null
  and rc.class_code in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')
on conflict (student_id, term_id, subject_id) do update
  set
    comment = excluded.comment,
    campus = excluded.campus,
    class_code = excluded.class_code,
    stream = excluded.stream,
    updated_at = greatest(public.primary_subject_comments.updated_at, excluded.updated_at)
  where public.primary_subject_comments.comment is distinct from excluded.comment
     or public.primary_subject_comments.comment is null;

-- ---------------------------------------------------------------- backfill activity comments
insert into public.primary_activity_comments (
  student_id, term_id, slot, subject_id, activity_name, campus, class_code, stream, comment, updated_at
)
select
  rc.student_id,
  rc.term_id,
  ra.slot,
  ra.subject_id,
  ra.activity_name,
  coalesce(nullif(trim(rc.campus), ''), 'Kitante'),
  rc.class_code,
  coalesce(rc.stream, ''),
  nullif(trim(ra.comment), ''),
  coalesce(rc.updated_at, now())
from public.report_card_activities ra
join public.report_cards rc on rc.id = ra.report_card_id
where nullif(trim(ra.comment), '') is not null
  and rc.class_code in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')
on conflict (student_id, term_id, slot) do update
  set
    comment = excluded.comment,
    subject_id = coalesce(excluded.subject_id, public.primary_activity_comments.subject_id),
    activity_name = coalesce(excluded.activity_name, public.primary_activity_comments.activity_name),
    campus = excluded.campus,
    class_code = excluded.class_code,
    stream = excluded.stream,
    updated_at = greatest(public.primary_activity_comments.updated_at, excluded.updated_at)
  where public.primary_activity_comments.comment is distinct from excluded.comment
     or public.primary_activity_comments.comment is null;

notify pgrst, 'reload schema';

commit;
