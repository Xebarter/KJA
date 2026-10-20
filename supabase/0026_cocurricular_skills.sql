-- Co-curricular marks (like subjects) + term skills for smarter comments.

alter table public.report_card_activities
  add column if not exists score numeric,
  add column if not exists max_score numeric,
  add column if not exists skills jsonb not null default '[]'::jsonb;

comment on column public.report_card_activities.score is 'Numeric mark for the activity (optional; band can also come from level).';
comment on column public.report_card_activities.max_score is 'Maximum mark; typically 100.';
comment on column public.report_card_activities.skills is 'Term skills: [{"label":"rhythm","acquired":true}, ...]';

-- Seed smarter co-curricular templates + rules on the active config (idempotent by template text / rule_code).
do $$
declare
  cfg uuid;
begin
  select id into cfg from public.comment_engine_configs where status = 'active' limit 1;
  if cfg is null then
    return;
  end if;

  insert into public.comment_templates (config_id, comment_type, template_group, band_code, template_text, min_words, max_words, exact_sentences, status, sort_order)
  select cfg, v.comment_type, v.template_group, v.band_code, v.template_text, v.min_words, v.max_words, v.exact_sentences, 'active', v.sort_order
  from (values
    ('cocurricular', 'skill_highlight', 'excellent', '{first_name} excelled in {activity_name} this term, showing {skills_acquired}.', 8, 12, 1, 1),
    ('cocurricular', 'skill_highlight', 'good', '{first_name} shone in {activity_name} through {skills_acquired} this term.', 8, 12, 1, 2),
    ('cocurricular', 'skill_progress', null, '{first_name} is growing in {skills_acquired} through {activity_name} this term.', 8, 12, 1, 1),
    ('cocurricular', 'skill_progress', null, '{first_name} is building {skills_acquired} in {activity_name} this term.', 8, 12, 1, 2),
    ('cocurricular', 'skill_gap', null, '{first_name} needs more practice in {skills_focus} this term.', 8, 12, 1, 1),
    ('cocurricular', 'skill_gap', null, '{first_name} should keep working on {skills_focus} next term.', 8, 12, 1, 2)
  ) as v(comment_type, template_group, band_code, template_text, min_words, max_words, exact_sentences, sort_order)
  where not exists (
    select 1 from public.comment_templates existing
    where existing.config_id = cfg
      and existing.comment_type = v.comment_type
      and existing.template_text = v.template_text
  );

  insert into public.comment_rules (config_id, rule_code, comment_type, priority, conditions, actions, is_exclusive, status)
  values
    (cfg, 'coco_skill_highlight', 'cocurricular', 15,
      '[{"op":"has_acquired_skills","equals":true},{"op":"has_strongest_activity","equals":true},{"op":"cocurricular_band_in","values":["excellent","very_good","good"]}]'::jsonb,
      '[{"op":"select_template_group","group":"skill_highlight"}]'::jsonb,
      true, 'active'),
    (cfg, 'coco_skill_progress', 'cocurricular', 18,
      '[{"op":"has_acquired_skills","equals":true},{"op":"cocurricular_band_in","values":["good","fair"]}]'::jsonb,
      '[{"op":"select_template_group","group":"skill_progress"}]'::jsonb,
      true, 'active'),
    (cfg, 'coco_skill_gap', 'cocurricular', 35,
      '[{"op":"has_skill_gaps","equals":true},{"op":"cocurricular_band_in","values":["fair","needs_improvement","weak"]}]'::jsonb,
      '[{"op":"select_template_group","group":"skill_gap"}]'::jsonb,
      true, 'active')
  on conflict (config_id, rule_code) do update set
    priority = excluded.priority,
    conditions = excluded.conditions,
    actions = excluded.actions,
    status = 'active',
    updated_at = now();

  update public.comment_templates
  set template_text = 'Strong academic and co-curricular work this term fully deserves our warm congratulations.',
      updated_at = now()
  where config_id = cfg
    and comment_type = 'headteacher'
    and template_group = 'strong_both'
    and template_text = 'Strong academic and co-curricular performance this term deserves our warm congratulations.';
end $$;
