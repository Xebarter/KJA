-- Primary class-teacher templates: gendered variants (girl/boy, she/he, her/his).
-- Safe to re-run; inserts only when the active text is not already present.

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
    raise notice 'No active comment_engine_configs row; skip primary gender templates.';
    return;
  end if;

  insert into public.comment_templates (
    config_id, comment_type, sentence_role, template_group, template_text,
    exact_sentences, status, sort_order
  )
  select active_id, v.comment_type, v.sentence_role, v.template_group, v.template_text, 1, 'active', v.sort_order
  from (values
    ('class_teacher', 'academic_overview', 'strong', '{first_name} is a capable {girl_boy} who has produced strong academic results this term.', 2),
    ('class_teacher', 'academic_overview', 'good', '{first_name} is a hardworking {girl_boy} who has made good academic progress this term.', 2),
    ('class_teacher', 'academic_overview', 'fair', '{first_name} is a determined {girl_boy} who has shown fair academic progress this term.', 2),
    ('class_teacher', 'academic_overview', 'support', '{first_name} is still finding {her_his} feet academically and needs continued support this term.', 2),
    ('class_teacher', 'strengths', 'named', '{She_He} shows particular strength in {strongest_subjects}.', 2),
    ('class_teacher', 'balanced_performance', 'balanced', '{She_He} has kept a steady standard across the subjects assessed.', 2),
    ('class_teacher', 'improvement', 'named', '{She_He} needs further attention in {weakest_subjects}.', 2),
    ('class_teacher', 'reinforcement', 'strong', 'Keeping this standard next term will serve {her_his} progress well.', 2),
    ('class_teacher', 'next_step', 'support', 'Regular practice and support will help {her_his} academic progress.', 2)
  ) as v(comment_type, sentence_role, template_group, template_text, sort_order)
  where not exists (
    select 1
    from public.comment_templates existing
    where existing.config_id = active_id
      and existing.comment_type = v.comment_type
      and existing.sentence_role = v.sentence_role
      and existing.template_group = v.template_group
      and existing.template_text = v.template_text
      and existing.status = 'active'
  );
end $$;
