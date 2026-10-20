-- Report-card commenting engine: co-curricular slots, config, templates, rules, provenance.

alter table public.report_cards
  add column if not exists cocurricular_comment text;

create table if not exists public.report_card_activities (
  report_card_id uuid not null references public.report_cards (id) on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  activity_name text,
  level text check (level is null or level in ('Excellent', 'Good', 'Fair', 'Needs support')),
  primary key (report_card_id, slot)
);
create index if not exists report_card_activities_card_idx on public.report_card_activities (report_card_id);

alter table public.report_card_activities enable row level security;

drop policy if exists report_card_activities_staff on public.report_card_activities;
create policy report_card_activities_staff on public.report_card_activities for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists report_card_activities_teacher on public.report_card_activities;
create policy report_card_activities_teacher on public.report_card_activities for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_card_activities.report_card_id
        and public.teacher_sees_pupil(card.class_code, card.stream)
    )
  );

drop policy if exists report_card_activities_parent on public.report_card_activities;
create policy report_card_activities_parent on public.report_card_activities for select to authenticated
  using (
    exists (
      select 1 from public.report_cards card
      where card.id = report_card_activities.report_card_id
        and card.status = 'published'
        and card.student_id in (select public.my_student_ids())
    )
  );

grant select, insert, update, delete on public.report_card_activities to authenticated;

-- ---------------------------------------------------------------------------
-- Engine configuration
-- ---------------------------------------------------------------------------

create table if not exists public.comment_engine_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists comment_engine_configs_one_active
  on public.comment_engine_configs ((status)) where status = 'active';

create table if not exists public.comment_templates (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.comment_engine_configs (id) on delete cascade,
  comment_type text not null check (comment_type in ('subject_teacher', 'cocurricular', 'class_teacher', 'headteacher')),
  sentence_role text,
  template_group text,
  band_code text,
  template_text text not null,
  locale text not null default 'en-UG',
  min_words integer,
  max_words integer,
  exact_words integer,
  exact_sentences integer,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comment_templates_config_idx on public.comment_templates (config_id, comment_type, status);

create table if not exists public.comment_rules (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.comment_engine_configs (id) on delete cascade,
  rule_code text not null,
  comment_type text not null check (comment_type in ('subject_teacher', 'cocurricular', 'class_teacher', 'headteacher')),
  priority integer not null default 100,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_exclusive boolean not null default true,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  help_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (config_id, rule_code)
);
create index if not exists comment_rules_config_idx on public.comment_rules (config_id, comment_type, priority);

create table if not exists public.generated_report_comments (
  id uuid primary key default gen_random_uuid(),
  report_card_id uuid not null references public.report_cards (id) on delete cascade,
  comment_type text not null check (comment_type in ('subject_teacher', 'cocurricular', 'class_teacher', 'headteacher')),
  subject_id uuid references public.subjects (id) on delete set null,
  generated_text text,
  final_text text,
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved', 'published', 'superseded', 'failed')),
  source_rule_ids uuid[] not null default '{}',
  source_template_ids uuid[] not null default '{}',
  profile_snapshot jsonb,
  configuration_version integer,
  engine_version text not null default '1.0',
  validation_results jsonb,
  generated_by uuid references auth.users (id) on delete set null,
  edited_by uuid references auth.users (id) on delete set null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists generated_report_comments_subject_uidx
  on public.generated_report_comments (report_card_id, comment_type, subject_id)
  where subject_id is not null;
create unique index if not exists generated_report_comments_card_uidx
  on public.generated_report_comments (report_card_id, comment_type)
  where subject_id is null;

create table if not exists public.comment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  generated_comment_id uuid references public.generated_report_comments (id) on delete set null,
  report_card_id uuid references public.report_cards (id) on delete cascade,
  action text not null,
  previous_text text,
  new_text text,
  previous_status text,
  new_status text,
  actor_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists comment_audit_logs_card_idx on public.comment_audit_logs (report_card_id, created_at desc);

alter table public.comment_engine_configs enable row level security;
alter table public.comment_templates enable row level security;
alter table public.comment_rules enable row level security;
alter table public.generated_report_comments enable row level security;
alter table public.comment_audit_logs enable row level security;

drop policy if exists comment_engine_configs_staff on public.comment_engine_configs;
create policy comment_engine_configs_staff on public.comment_engine_configs for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists comment_templates_staff on public.comment_templates;
create policy comment_templates_staff on public.comment_templates for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists comment_rules_staff on public.comment_rules;
create policy comment_rules_staff on public.comment_rules for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists generated_report_comments_staff on public.generated_report_comments;
create policy generated_report_comments_staff on public.generated_report_comments for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists comment_audit_logs_staff on public.comment_audit_logs;
create policy comment_audit_logs_staff on public.comment_audit_logs for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

grant select, insert, update, delete on public.comment_engine_configs to authenticated;
grant select, insert, update, delete on public.comment_templates to authenticated;
grant select, insert, update, delete on public.comment_rules to authenticated;
grant select, insert, update, delete on public.generated_report_comments to authenticated;
grant select, insert, update, delete on public.comment_audit_logs to authenticated;

-- ---------------------------------------------------------------------------
-- Default active configuration + seed templates/rules
-- ---------------------------------------------------------------------------

do $$
declare
  cfg uuid;
begin
  if exists (select 1 from public.comment_engine_configs where status = 'active') then
    return;
  end if;

  insert into public.comment_engine_configs (name, version, status, settings)
  values (
    'KJA default',
    1,
    'active',
    '{
      "engine_version": "1.0",
      "max_named_subjects": 2,
      "strength_min_band": "good",
      "support_max_band": "fair",
      "cocurricular": { "min_words": 8, "max_words": 12, "exact_sentences": 1, "require_first_name": true },
      "subject_teacher": { "exact_words": 2 },
      "class_teacher": { "exact_sentences": 3 },
      "headteacher": { "exact_words": 12 },
      "require_subject_comments": true,
      "require_class_teacher": true,
      "require_headteacher": true,
      "require_cocurricular_when_activities": true,
      "academic_bands": [
        { "code": "excellent", "label": "excellent", "min": 80, "max": 100 },
        { "code": "very_good", "label": "very good", "min": 70, "max": 79.999 },
        { "code": "good", "label": "good", "min": 60, "max": 69.999 },
        { "code": "fair", "label": "fair", "min": 50, "max": 59.999 },
        { "code": "needs_improvement", "label": "needs improvement", "min": 40, "max": 49.999 },
        { "code": "weak", "label": "weak", "min": 0, "max": 39.999 }
      ],
      "level_bands": {
        "Excellent": "excellent",
        "Good": "good",
        "Fair": "fair",
        "Needs support": "needs_improvement"
      },
      "band_rank": {
        "excellent": 6,
        "very_good": 5,
        "good": 4,
        "fair": 3,
        "needs_improvement": 2,
        "weak": 1
      }
    }'::jsonb
  )
  returning id into cfg;

  -- Subject teacher (exact 2 words)
  insert into public.comment_templates (config_id, comment_type, band_code, template_text, exact_words, status, sort_order) values
    (cfg, 'subject_teacher', 'excellent', 'Excellent work', 2, 'active', 1),
    (cfg, 'subject_teacher', 'excellent', 'Outstanding work', 2, 'active', 2),
    (cfg, 'subject_teacher', 'very_good', 'Very good', 2, 'active', 1),
    (cfg, 'subject_teacher', 'very_good', 'Strong work', 2, 'active', 2),
    (cfg, 'subject_teacher', 'good', 'Good progress', 2, 'active', 1),
    (cfg, 'subject_teacher', 'good', 'Solid work', 2, 'active', 2),
    (cfg, 'subject_teacher', 'fair', 'Fair performance', 2, 'active', 1),
    (cfg, 'subject_teacher', 'fair', 'Steady progress', 2, 'active', 2),
    (cfg, 'subject_teacher', 'needs_improvement', 'Needs improvement', 2, 'active', 1),
    (cfg, 'subject_teacher', 'needs_improvement', 'Requires support', 2, 'active', 2),
    (cfg, 'subject_teacher', 'weak', 'Requires support', 2, 'active', 1),
    (cfg, 'subject_teacher', 'weak', 'Needs guidance', 2, 'active', 2);

  -- Co-curricular summaries (must include {first_name}, 8–12 words, one sentence)
  insert into public.comment_templates (config_id, comment_type, template_group, band_code, template_text, min_words, max_words, exact_sentences, status, sort_order) values
    (cfg, 'cocurricular', 'strong', 'excellent', '{first_name} shows excellent commitment across co-curricular activities this term.', 8, 12, 1, 'active', 1),
    (cfg, 'cocurricular', 'strong', 'excellent', '{first_name} participates with excellent energy in school activities.', 8, 12, 1, 'active', 2),
    (cfg, 'cocurricular', 'strong', 'good', '{first_name} takes part well in co-curricular school activities.', 8, 12, 1, 'active', 1),
    (cfg, 'cocurricular', 'strong', 'good', '{first_name} shows good involvement in co-curricular activities this term.', 8, 12, 1, 'active', 2),
    (cfg, 'cocurricular', 'mixed', 'fair', '{first_name} shows mixed commitment across co-curricular activities this term.', 8, 12, 1, 'active', 1),
    (cfg, 'cocurricular', 'mixed', 'fair', '{first_name} engages unevenly in co-curricular activities this term.', 8, 12, 1, 'active', 2),
    (cfg, 'cocurricular', 'support', 'needs_improvement', '{first_name} needs more support to engage in co-curricular activities.', 8, 12, 1, 'active', 1),
    (cfg, 'cocurricular', 'support', 'needs_improvement', '{first_name} should take a fuller part in co-curricular activities.', 8, 12, 1, 'active', 2),
    (cfg, 'cocurricular', 'highlight', null, '{first_name} stands out clearly in {activity_name} this term.', 8, 12, 1, 'active', 1),
    (cfg, 'cocurricular', 'incomplete', 'incomplete', '{first_name} has limited co-curricular records for this term.', 8, 12, 1, 'active', 1);

  -- Class teacher sentence roles
  insert into public.comment_templates (config_id, comment_type, sentence_role, template_group, template_text, exact_sentences, status, sort_order) values
    (cfg, 'class_teacher', 'academic_overview', 'strong', '{first_name} has produced strong academic results this term.', 1, 'active', 1),
    (cfg, 'class_teacher', 'academic_overview', 'good', '{first_name} has made good academic progress this term.', 1, 'active', 1),
    (cfg, 'class_teacher', 'academic_overview', 'fair', '{first_name} has shown fair academic progress this term.', 1, 'active', 1),
    (cfg, 'class_teacher', 'academic_overview', 'support', '{first_name} needs continued academic support this term.', 1, 'active', 1),
    (cfg, 'class_teacher', 'academic_overview', 'incomplete', 'Academic results for {first_name} are incomplete this term.', 1, 'active', 1),
    (cfg, 'class_teacher', 'strengths', 'named', 'Particular strength is shown in {strongest_subjects}.', 1, 'active', 1),
    (cfg, 'class_teacher', 'strengths', 'named', 'The strongest work appears in {strongest_subjects}.', 1, 'active', 2),
    (cfg, 'class_teacher', 'balanced_performance', 'balanced', 'Performance is steady across the subjects assessed.', 1, 'active', 1),
    (cfg, 'class_teacher', 'balanced_performance', 'balanced', 'Results are consistent across the subjects assessed.', 1, 'active', 2),
    (cfg, 'class_teacher', 'improvement', 'named', 'Further attention is needed in {weakest_subjects}.', 1, 'active', 1),
    (cfg, 'class_teacher', 'improvement', 'named', 'Priority for improvement is {weakest_subjects}.', 1, 'active', 2),
    (cfg, 'class_teacher', 'reinforcement', 'strong', 'Maintaining this standard next term will serve {first_name} well.', 1, 'active', 1),
    (cfg, 'class_teacher', 'reinforcement', 'strong', 'Continued focus will help {first_name} keep this standard.', 1, 'active', 2),
    (cfg, 'class_teacher', 'next_step', 'support', 'Regular practice and support will help {first_name} improve.', 1, 'active', 1),
    (cfg, 'class_teacher', 'next_step', 'support', 'Steady practice with guidance will help {first_name} move forward.', 1, 'active', 2),
    (cfg, 'class_teacher', 'incomplete_data', 'incomplete', 'Comments will be completed once all subject results are recorded.', 1, 'active', 1);

  -- Headteacher (exact 12 words)
  insert into public.comment_templates (config_id, comment_type, template_group, template_text, exact_words, status, sort_order) values
    (cfg, 'headteacher', 'incomplete_data', 'Evidence remains incomplete so further careful review of this report is required.', 12, 'active', 1),
    (cfg, 'headteacher', 'support_both', 'Academic and co-curricular work both need closer support throughout the next term.', 12, 'active', 1),
    (cfg, 'headteacher', 'academic_strong_cocurricular_weak', 'Strong academics shown yet co-curricular engagement needs more consistent attention next term.', 12, 'active', 1),
    (cfg, 'headteacher', 'academic_weak_cocurricular_strong', 'Co-curricular strength is clear while academic work still needs much closer support.', 12, 'active', 1),
    (cfg, 'headteacher', 'strong_both', 'Strong academic and co-curricular work this term fully deserves our warm congratulations.', 12, 'active', 1),
    (cfg, 'headteacher', 'mixed_performance', 'Mixed results this term so keep building strengths and closing remaining gaps.', 12, 'active', 1),
    (cfg, 'headteacher', 'balanced_good', 'Balanced progress this term so keep working steadily across every school area.', 12, 'active', 1),
    (cfg, 'headteacher', 'fallback', 'Continue working hard with steady support from both teachers and family alike.', 12, 'active', 1);

  -- Rules (lower priority number = higher precedence)
  insert into public.comment_rules (config_id, rule_code, comment_type, priority, conditions, actions, is_exclusive, help_text) values
    (cfg, 'coco_incomplete', 'cocurricular', 10,
      '[{"op":"cocurricular_complete","equals":false}]'::jsonb,
      '[{"op":"select_template_group","group":"incomplete"},{"op":"set_review_flag"}]'::jsonb,
      true, 'No assessed activities'),
    (cfg, 'coco_highlight', 'cocurricular', 20,
      '[{"op":"has_strongest_activity","equals":true},{"op":"cocurricular_band_in","values":["excellent","good"]}]'::jsonb,
      '[{"op":"select_template_group","group":"highlight"}]'::jsonb,
      true, 'Name strongest activity when overall strong'),
    (cfg, 'coco_strong', 'cocurricular', 30,
      '[{"op":"cocurricular_band_in","values":["excellent","very_good","good"]}]'::jsonb,
      '[{"op":"select_template_group","group":"strong"}]'::jsonb,
      true, 'Generally strong co-curricular'),
    (cfg, 'coco_support', 'cocurricular', 40,
      '[{"op":"cocurricular_band_in","values":["needs_improvement","weak"]}]'::jsonb,
      '[{"op":"select_template_group","group":"support"}]'::jsonb,
      true, 'Needs co-curricular support'),
    (cfg, 'coco_mixed', 'cocurricular', 50,
      '[{"op":"cocurricular_complete","equals":true}]'::jsonb,
      '[{"op":"select_template_group","group":"mixed"}]'::jsonb,
      true, 'Default assessed co-curricular'),

    (cfg, 'class_incomplete', 'class_teacher', 10,
      '[{"op":"academic_complete","equals":false}]'::jsonb,
      '[{"op":"select_sentence_plan","roles":["academic_overview","incomplete_data","next_step"]},{"op":"set_overview_group","group":"incomplete"},{"op":"set_review_flag"}]'::jsonb,
      true, 'Incomplete academics'),
    (cfg, 'class_strong_reinforce', 'class_teacher', 20,
      '[{"op":"academic_band_in","values":["excellent","very_good"]},{"op":"has_weak_subjects","equals":false}]'::jsonb,
      '[{"op":"select_sentence_plan","roles":["academic_overview","strengths","reinforcement"]},{"op":"set_overview_group","group":"strong"}]'::jsonb,
      true, 'Strong with no weak subjects'),
    (cfg, 'class_strong_improve', 'class_teacher', 30,
      '[{"op":"academic_band_in","values":["excellent","very_good","good"]},{"op":"has_weak_subjects","equals":true}]'::jsonb,
      '[{"op":"select_sentence_plan","roles":["academic_overview","strengths","improvement"]},{"op":"set_overview_group","group":"good"}]'::jsonb,
      true, 'Good/strong with a weak subject'),
    (cfg, 'class_support', 'class_teacher', 40,
      '[{"op":"academic_band_in","values":["fair","needs_improvement","weak"]}]'::jsonb,
      '[{"op":"select_sentence_plan","roles":["academic_overview","strengths","next_step"]},{"op":"set_overview_group","group":"support"}]'::jsonb,
      true, 'Generally needing support'),
    (cfg, 'class_balanced', 'class_teacher', 50,
      '[{"op":"academic_complete","equals":true}]'::jsonb,
      '[{"op":"select_sentence_plan","roles":["academic_overview","balanced_performance","reinforcement"]},{"op":"set_overview_group","group":"fair"}]'::jsonb,
      true, 'Default complete academics'),

    (cfg, 'head_incomplete', 'headteacher', 10,
      '[{"op":"overall_assessment_complete","equals":false}]'::jsonb,
      '[{"op":"select_template_group","group":"incomplete_data"},{"op":"set_review_flag"}]'::jsonb,
      true, 'Missing evidence'),
    (cfg, 'head_support_both', 'headteacher', 20,
      '[{"op":"academic_band_in","values":["needs_improvement","weak"]},{"op":"cocurricular_band_in","values":["needs_improvement","weak"]}]'::jsonb,
      '[{"op":"select_template_group","group":"support_both"}]'::jsonb,
      true, 'Weak both'),
    (cfg, 'head_acad_strong_coco_weak', 'headteacher', 30,
      '[{"op":"academic_band_in","values":["excellent","very_good","good"]},{"op":"cocurricular_band_in","values":["needs_improvement","weak"]}]'::jsonb,
      '[{"op":"select_template_group","group":"academic_strong_cocurricular_weak"}]'::jsonb,
      true, 'Academics strong, co-curricular weak'),
    (cfg, 'head_acad_weak_coco_strong', 'headteacher', 40,
      '[{"op":"academic_band_in","values":["needs_improvement","weak"]},{"op":"cocurricular_band_in","values":["excellent","very_good","good"]}]'::jsonb,
      '[{"op":"select_template_group","group":"academic_weak_cocurricular_strong"}]'::jsonb,
      true, 'Academics weak, co-curricular strong'),
    (cfg, 'head_strong_both', 'headteacher', 50,
      '[{"op":"academic_band_in","values":["excellent","very_good"]},{"op":"cocurricular_band_in","values":["excellent","very_good","good"]},{"op":"overall_assessment_complete","equals":true}]'::jsonb,
      '[{"op":"select_template_group","group":"strong_both"}]'::jsonb,
      true, 'Strong both'),
    (cfg, 'head_mixed', 'headteacher', 60,
      '[{"op":"mixed_performance","equals":true}]'::jsonb,
      '[{"op":"select_template_group","group":"mixed_performance"}]'::jsonb,
      true, 'Mixed'),
    (cfg, 'head_balanced', 'headteacher', 70,
      '[{"op":"academic_complete","equals":true}]'::jsonb,
      '[{"op":"select_template_group","group":"balanced_good"}]'::jsonb,
      true, 'Balanced fallback'),
    (cfg, 'head_fallback', 'headteacher', 100,
      '[]'::jsonb,
      '[{"op":"select_template_group","group":"fallback"}]'::jsonb,
      true, 'Safe fallback');
end $$;
