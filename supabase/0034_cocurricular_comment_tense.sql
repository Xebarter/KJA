-- Co-curricular comments: past performance this term + forward recommendation next term.
-- Updates active config templates/settings only. Does not edit 0025 / 0026 in place.

do $$
declare
  cfg uuid;
begin
  select id into cfg from public.comment_engine_configs where status = 'active' limit 1;
  if cfg is null then
    return;
  end if;

  -- Widen cocurricular word window so past+forward sentences validate against DB settings.
  update public.comment_engine_configs
  set settings = jsonb_set(
        settings,
        '{cocurricular}',
        coalesce(settings->'cocurricular', '{}'::jsonb)
          || '{"min_words": 12, "max_words": 22, "exact_sentences": 1, "require_first_name": true}'::jsonb
      ),
      updated_at = now()
  where id = cfg;

  -- Band / highlight / incomplete (seeded in 0025)
  update public.comment_templates
  set template_text = '{first_name} has shown excellent commitment across co-curricular activities this term and should keep that energy next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} shows excellent commitment across co-curricular activities this term.';

  update public.comment_templates
  set template_text = '{first_name} has participated with excellent energy in school activities this term and should keep that lead next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} participates with excellent energy in school activities.';

  update public.comment_templates
  set template_text = '{first_name} has taken part well in co-curricular school activities this term and should keep building next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} takes part well in co-curricular school activities.';

  update public.comment_templates
  set template_text = '{first_name} has shown good involvement in co-curricular activities this term and should keep that positive attitude next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} shows good involvement in co-curricular activities this term.';

  update public.comment_templates
  set template_text = '{first_name} has shown mixed commitment in co-curricular activities this term and should aim for greater consistency next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} shows mixed commitment across co-curricular activities this term.';

  update public.comment_templates
  set template_text = '{first_name} has engaged unevenly in co-curricular activities this term and should participate more steadily next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} engages unevenly in co-curricular activities this term.';

  update public.comment_templates
  set template_text = '{first_name} has engaged only partly in co-curricular activities this term and needs more support and encouragement next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} needs more support to engage in co-curricular activities.';

  update public.comment_templates
  set template_text = '{first_name} has taken a limited part in co-curricular activities this term and should join more fully next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} should take a fuller part in co-curricular activities.';

  update public.comment_templates
  set template_text = '{first_name} has stood out in {activity_name} this term and should keep that steady effort next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} stands out clearly in {activity_name} this term.';

  update public.comment_templates
  set template_text = '{first_name} has limited co-curricular records available for comment this term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} has limited co-curricular records for this term.';

  -- Skill templates (seeded in 0026)
  update public.comment_templates
  set template_text = '{first_name} excelled in {activity_name} this term, showing {skills_acquired}, and should keep building confidence next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} excelled in {activity_name} this term, showing {skills_acquired}.';

  update public.comment_templates
  set template_text = '{first_name} shone in {activity_name} this term through {skills_acquired} and should keep that willing spirit next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} shone in {activity_name} through {skills_acquired} this term.';

  update public.comment_templates
  set template_text = '{first_name} has grown in {skills_acquired} through {activity_name} this term and should keep practising next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} is growing in {skills_acquired} through {activity_name} this term.';

  update public.comment_templates
  set template_text = '{first_name} has built {skills_acquired} in {activity_name} this term and should continue next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} is building {skills_acquired} in {activity_name} this term.';

  update public.comment_templates
  set template_text = '{first_name} has needed more practice in {skills_focus} this term and should keep improving that skill next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} needs more practice in {skills_focus} this term.';

  update public.comment_templates
  set template_text = '{first_name} has shown gaps in {skills_focus} this term and should keep working on that skill next term.',
      min_words = 12,
      max_words = 22,
      updated_at = now()
  where config_id = cfg
    and comment_type = 'cocurricular'
    and template_text = '{first_name} should keep working on {skills_focus} next term.';

  -- Headteacher lines that mention co-curricular (keep strong_both / academic_strong_cocurricular_weak as-is)
  update public.comment_templates
  set template_text = 'Both academic and co-curricular work this term need closer support next term.',
      updated_at = now()
  where config_id = cfg
    and comment_type = 'headteacher'
    and template_group = 'support_both'
    and template_text = 'Academic and co-curricular work both need closer support throughout the next term.';

  update public.comment_templates
  set template_text = 'Co-curricular strength was clear while academic work needs closer support next term.',
      updated_at = now()
  where config_id = cfg
    and comment_type = 'headteacher'
    and template_group = 'academic_weak_cocurricular_strong'
    and template_text = 'Co-curricular strength is clear while academic work still needs much closer support.';
end $$;
