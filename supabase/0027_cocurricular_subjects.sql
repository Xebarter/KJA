-- Co-curricular activity subjects: catalogue kind, taught skills, and score skills.

-- Kind values: core = Academic (marks table); cocurricular = Other (co-curricular table).
-- 0028 drops the legacy 'other' elective kind.
alter table public.subjects
  drop constraint if exists subjects_kind_check;
alter table public.subjects
  add constraint subjects_kind_check check (kind in ('core', 'other', 'cocurricular'));

alter table public.subjects
  add column if not exists default_skills jsonb not null default '[]'::jsonb;

comment on column public.subjects.default_skills is
  'For cocurricular subjects: skills taught this term, e.g. ["rhythm","timing"]. Used on marks workbooks and report activities.';

alter table public.assessment_scores
  add column if not exists skills jsonb not null default '[]'::jsonb;

comment on column public.assessment_scores.skills is
  'Acquired skills for cocurricular papers: [{"label":"rhythm","acquired":true}, ...]';

alter table public.report_card_activities
  add column if not exists subject_id uuid references public.subjects (id) on delete set null;

create index if not exists report_card_activities_subject_idx
  on public.report_card_activities (subject_id)
  where subject_id is not null;
