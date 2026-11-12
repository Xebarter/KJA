-- Nursery class-teacher comment stems for the active comment bank.
-- Stored as comment_type = class_teacher with nursery_* roles/groups (no CHECK change).

do $$
declare
  active_id uuid;
begin
  select id into active_id
  from public.comment_engine_configs
  where status = 'active'
  order by version desc
  limit 1;

  if active_id is null then
    raise notice 'No active comment_engine_configs row; skip nursery comment templates.';
    return;
  end if;

  insert into public.comment_templates (
    config_id, comment_type, sentence_role, template_group, template_text,
    exact_sentences, status, sort_order
  )
  select active_id, v.comment_type, v.sentence_role, v.template_group, v.template_text, 1, 'active', v.sort_order
  from (values
    ('class_teacher', 'nursery_overview', 'nursery_mastery', '{first_name} has shown lovely strong mastery across many nursery skills this term.', 10),
    ('class_teacher', 'nursery_overview', 'nursery_solid', '{first_name} has made steady, cheerful progress across nursery learning this term.', 20),
    ('class_teacher', 'nursery_overview', 'nursery_growing', '{first_name} is growing in confidence and is progressing well in nursery learning this term.', 30),
    ('class_teacher', 'nursery_overview', 'nursery_mixed', '{first_name} has shown a mixed but hopeful picture of progress across nursery skills this term.', 40),
    ('class_teacher', 'nursery_overview', 'nursery_support', '{first_name} is still finding their feet in several nursery skills and needs warm, patient support.', 50),
    ('class_teacher', 'nursery_overview', 'nursery_incomplete', 'We are still gathering a full picture of {first_name}''s nursery progress this term.', 60),
    ('class_teacher', 'nursery_strengths', 'nursery_mastery', '{first_name} stands out especially in {outstanding_skills}.', 110),
    ('class_teacher', 'nursery_strengths', 'nursery_solid', 'A real highlight for {first_name} has been {outstanding_skills}.', 120),
    ('class_teacher', 'nursery_strengths', 'nursery_mixed', '{first_name} shines in {strong_domains}, especially through {outstanding_skills}.', 130),
    ('class_teacher', 'nursery_strengths', 'nursery_support', '{first_name} responds warmly to encouragement and enjoys praise for small steps.', 140),
    ('class_teacher', 'nursery_strengths', 'nursery_incomplete', 'We look forward to celebrating {first_name}''s special strengths once more skills are coded.', 150),
    ('class_teacher', 'nursery_next_step', 'nursery_mastery', 'Keeping this joyful curiosity next term will help {first_name} stretch even further.', 210),
    ('class_teacher', 'nursery_next_step', 'nursery_solid', 'Please keep celebrating effort at home so {first_name} stays proud of this progress.', 220),
    ('class_teacher', 'nursery_next_step', 'nursery_mixed', 'With warm practice on {focus_skills}, {first_name} will grow more confident next term.', 230),
    ('class_teacher', 'nursery_next_step', 'nursery_support', 'A little extra play-practice with {focus_skills} will help {first_name} settle those skills.', 240),
    ('class_teacher', 'nursery_next_step', 'nursery_incomplete', 'We will complete {first_name}''s next steps once every skill has a progress code.', 250)
  ) as v(comment_type, sentence_role, template_group, template_text, sort_order)
  where not exists (
    select 1
    from public.comment_templates existing
    where existing.config_id = active_id
      and existing.comment_type = v.comment_type
      and existing.sentence_role = v.sentence_role
      and existing.template_group = v.template_group
      and existing.template_text = v.template_text
  );
end $$;
