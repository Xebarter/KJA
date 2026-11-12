-- Soften nursery strength templates so outstanding_skills gerunds read naturally
-- (avoid "shows lovely confidence with names parents…").

update public.comment_templates
set template_text = '{first_name} is doing especially well at {outstanding_skills}.',
    updated_at = now()
where comment_type = 'class_teacher'
  and sentence_role = 'nursery_strengths'
  and template_group in ('nursery_mastery', 'nursery_solid')
  and template_text = '{first_name} shows lovely confidence with {outstanding_skills}.';
