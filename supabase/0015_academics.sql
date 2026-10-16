-- Academics office. Run after 0014_accounts.sql (safe to re-run).
-- Teaching assignments, attendance, assessments and report cards.
-- The student register and fee terms stay owned by admissions and accounts.
-- Parents can read report cards only after they are published.

begin;

-- ---------------------------------------------------------------- role

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'admissions', 'accounts', 'academics', 'staff', 'parent'));

create or replace function public.is_academics_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'academics')
  );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or ((select public.is_admissions_staff()) and role in ('admin', 'admissions'))
    or ((select public.is_accounts_staff()) and role in ('admin', 'accounts'))
    or ((select public.is_academics_staff()) and role in ('admin', 'academics'))
  );

-- Read the register and families. student_directory is security_invoker, so these policies cover it.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['school_classes', 'families', 'guardians', 'students']
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_academics', tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_academics_staff()))',
      tbl || '_academics', tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------- teaching

create table if not exists public.teaching_staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  campus text,
  email text,
  phone text,
  profile_id uuid unique references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  section text not null check (section in ('nursery', 'primary', 'both')),
  kind text not null default 'core' check (kind in ('core', 'other')),
  sort_order integer not null default 0,
  applies_from integer,
  applies_to integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.grade_bands (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('nursery', 'primary')),
  label text not null,
  min_score numeric not null,
  max_score numeric not null,
  points smallint not null,
  sort_order integer not null default 0,
  unique (section, label),
  check (min_score <= max_score)
);

create table if not exists public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_code text not null,
  stream text not null default '',
  staff_id uuid not null references public.teaching_staff (id) on delete cascade,
  unique (term_id, class_code, stream)
);

create table if not exists public.subject_teachers (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_code text not null,
  stream text not null default '',
  subject_id uuid not null references public.subjects (id) on delete cascade,
  staff_id uuid not null references public.teaching_staff (id) on delete cascade,
  unique (term_id, class_code, stream, subject_id)
);

-- ---------------------------------------------------------------- attendance and assessments

create table if not exists public.attendance (
  student_id uuid not null references public.students (id) on delete cascade,
  attended_on date not null,
  term_id uuid references public.fee_terms (id) on delete set null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  note text,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (student_id, attended_on)
);
create index if not exists attendance_day_idx on public.attendance (attended_on);
create index if not exists attendance_term_idx on public.attendance (term_id);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_code text not null,
  stream text not null default '',
  subject_id uuid not null references public.subjects (id) on delete restrict,
  name text not null,
  kind text not null check (kind in ('bot', 'midterm', 'endterm', 'test')),
  max_score numeric not null default 100 check (max_score > 0),
  weight numeric not null default 1 check (weight >= 0),
  held_on date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists assessments_class_idx on public.assessments (term_id, class_code, stream);

create table if not exists public.assessment_scores (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  score numeric,
  missed boolean not null default false,
  primary key (assessment_id, student_id),
  check (score is null or score >= 0)
);

-- ---------------------------------------------------------------- report cards

create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published')),
  class_code text,
  stream text not null default '',
  class_teacher_name text,
  class_teacher_comment text,
  head_comment text,
  conduct text,
  days_present integer,
  days_opened integer,
  overall_score numeric,
  overall_position integer,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, term_id)
);
create index if not exists report_cards_term_idx on public.report_cards (term_id, status);

create table if not exists public.report_lines (
  report_card_id uuid not null references public.report_cards (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  subject_name text not null,
  score numeric,
  max_score numeric,
  grade text,
  points smallint,
  position integer,
  teacher_comment text,
  primary key (report_card_id, subject_id)
);

-- ---------------------------------------------------------------- access

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'teaching_staff', 'subjects', 'grade_bands', 'class_teachers', 'subject_teachers',
    'attendance', 'assessments', 'assessment_scores', 'report_cards', 'report_lines'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_staff', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_academics_staff())) with check ((select public.is_academics_staff()))',
      tbl || '_staff', tbl
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end $$;

drop policy if exists report_cards_parent on public.report_cards;
create policy report_cards_parent on public.report_cards for select to authenticated
  using (
    status = 'published'
    and student_id in (select public.my_student_ids())
  );

drop policy if exists report_lines_parent on public.report_lines;
create policy report_lines_parent on public.report_lines for select to authenticated
  using (
    exists (
      select 1 from public.report_cards card
      where card.id = report_lines.report_card_id
        and card.status = 'published'
        and card.student_id in (select public.my_student_ids())
    )
  );

grant execute on function public.is_academics_staff() to authenticated;

-- ---------------------------------------------------------------- seeds

insert into public.subjects (code, name, section, kind, sort_order, applies_from, applies_to) values
  ('NUR-LANG', 'Language', 'nursery', 'core', 1, null, null),
  ('NUR-LIT', 'Literacy', 'nursery', 'core', 2, null, null),
  ('NUR-NUM', 'Numeracy', 'nursery', 'core', 3, null, null),
  ('NUR-READ', 'Reading', 'nursery', 'core', 4, null, null),
  ('NUR-ART', 'Creative arts', 'nursery', 'core', 5, null, null),
  ('NUR-OUT', 'Outdoor play', 'nursery', 'core', 6, null, null),
  ('NUR-RE', 'Religious education', 'nursery', 'core', 7, null, null),
  ('ENG', 'English', 'primary', 'core', 10, null, null),
  ('MAT', 'Mathematics', 'primary', 'core', 11, null, null),
  ('SCI', 'Science', 'primary', 'core', 12, null, null),
  ('SST', 'Social studies', 'primary', 'core', 13, null, null),
  ('RE', 'Religious education', 'primary', 'core', 14, null, null),
  ('LIT', 'Literacy', 'primary', 'core', 15, 5, 7),
  ('LL', 'Local language', 'primary', 'core', 16, null, null),
  ('CAPE', 'Creative arts', 'primary', 'core', 17, null, null),
  ('PE', 'Physical education', 'primary', 'core', 18, null, null),
  ('FRE', 'French', 'primary', 'other', 30, null, null),
  ('ICT', 'Computer', 'primary', 'other', 31, null, null)
on conflict (code) do nothing;

insert into public.grade_bands (section, label, min_score, max_score, points, sort_order) values
  ('primary', 'D1', 80, 100, 1, 1),
  ('primary', 'D2', 70, 79, 2, 2),
  ('primary', 'C3', 65, 69, 3, 3),
  ('primary', 'C4', 60, 64, 4, 4),
  ('primary', 'C5', 55, 59, 5, 5),
  ('primary', 'C6', 50, 54, 6, 6),
  ('primary', 'P7', 45, 49, 7, 7),
  ('primary', 'P8', 40, 44, 8, 8),
  ('primary', 'F9', 0, 39, 9, 9),
  ('nursery', 'Exceeding', 75, 100, 1, 1),
  ('nursery', 'Secure', 50, 74, 2, 2),
  ('nursery', 'Developing', 25, 49, 3, 3),
  ('nursery', 'Beginning', 0, 24, 4, 4)
on conflict (section, label) do nothing;

commit;
