-- When pupils receive homework, resources, class notices or report cards,
-- linked parents with a portal account get a notification too.
-- Run after 0041_teacher_dashboard.sql and 0029_student_portal.sql (safe to re-run).

begin;

-- First name only, for short parent-facing copy.
create or replace function public.pupil_first_name(p_full_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(split_part(trim(coalesce(p_full_name, '')), ' ', 1)), '');
$$;

-- Notify every linked parent for active pupils in a class/stream.
create or replace function public.notify_class_parents(
  p_class_code text,
  p_stream text,
  p_title text,
  p_body text default null,
  p_href text default '/account/notifications',
  p_kind text default 'school'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 160);
  v_body text := nullif(left(trim(coalesce(p_body, '')), 2000), '');
  v_href text := nullif(left(trim(coalesce(p_href, '')), 400), '');
  v_kind text := nullif(left(trim(coalesce(p_kind, '')), 40), '');
  v_stream text := coalesce(p_stream, '');
  v_count integer := 0;
begin
  if v_title = '' or coalesce(trim(p_class_code), '') = '' then
    return 0;
  end if;

  with class_pupils as (
    select s.id, s.family_id, public.pupil_first_name(s.full_name) as first_name
    from public.students s
    where s.status = 'active'
      and s.class_code = p_class_code
      and coalesce(s.stream, '') = v_stream
      and s.family_id is not null
  ),
  parent_kids as (
    select
      g.user_id,
      string_agg(distinct cp.first_name, ', ' order by cp.first_name)
        filter (where cp.first_name is not null) as kid_names
    from public.guardians g
    join class_pupils cp on cp.family_id = g.family_id
    where g.user_id is not null
    group by g.user_id
  ),
  inserted as (
    insert into public.notifications (user_id, title, body, href, kind)
    select
      pk.user_id,
      case
        when pk.kid_names is null or pk.kid_names = '' then v_title
        else left(v_title || ' · ' || pk.kid_names, 160)
      end,
      v_body,
      coalesce(v_href, '/account/notifications'),
      v_kind
    from parent_kids pk
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end;
$$;

grant execute on function public.notify_class_parents(text, text, text, text, text, text) to authenticated;

-- Notify linked parents for specific pupils (report cards, one-off deliveries).
create or replace function public.notify_student_parents(
  p_student_ids uuid[],
  p_title text,
  p_body text default null,
  p_href text default '/account/notifications',
  p_kind text default 'school'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 160);
  v_body text := nullif(left(trim(coalesce(p_body, '')), 2000), '');
  v_href text := nullif(left(trim(coalesce(p_href, '')), 400), '');
  v_kind text := nullif(left(trim(coalesce(p_kind, '')), 40), '');
  v_count integer := 0;
begin
  if v_title = '' or p_student_ids is null or coalesce(array_length(p_student_ids, 1), 0) = 0 then
    return 0;
  end if;

  with picked as (
    select s.id, s.family_id, public.pupil_first_name(s.full_name) as first_name
    from public.students s
    where s.id = any (p_student_ids)
      and s.family_id is not null
  ),
  parent_kids as (
    select
      g.user_id,
      string_agg(distinct p.first_name, ', ' order by p.first_name)
        filter (where p.first_name is not null) as kid_names
    from public.guardians g
    join picked p on p.family_id = g.family_id
    where g.user_id is not null
    group by g.user_id
  ),
  inserted as (
    insert into public.notifications (user_id, title, body, href, kind)
    select
      pk.user_id,
      case
        when pk.kid_names is null or pk.kid_names = '' then v_title
        else left(v_title || ' · ' || pk.kid_names, 160)
      end,
      v_body,
      coalesce(v_href, '/account/notifications'),
      v_kind
    from parent_kids pk
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end;
$$;

grant execute on function public.notify_student_parents(uuid[], text, text, text, text) to authenticated;

-- Class teacher notices: pupils (existing) + linked parents (new).
create or replace function public.notify_my_class(
  p_class_code text,
  p_stream text,
  p_title text,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term uuid;
  v_notice uuid;
  v_title text;
  v_body text;
  v_stream text;
begin
  v_title := left(trim(coalesce(p_title, '')), 160);
  if v_title = '' then
    raise exception 'Write a title.';
  end if;
  v_body := nullif(left(trim(coalesce(p_body, '')), 2000), '');
  v_stream := coalesce(p_stream, '');

  select id into v_term from public.fee_terms where is_current limit 1;
  if v_term is null then
    raise exception 'Set a current term first.';
  end if;
  if not public.is_class_teacher(v_term, p_class_code, v_stream) then
    raise exception 'Only the class teacher can notify this class.';
  end if;

  insert into public.class_notices (term_id, class_code, stream, title, body, created_by)
  values (v_term, p_class_code, v_stream, v_title, v_body, auth.uid())
  returning id into v_notice;

  insert into public.notifications (user_id, title, body, href, kind)
  select pupil.profile_id, v_title, v_body, '/student/notifications', 'school'
  from public.students pupil
  where pupil.status = 'active'
    and pupil.class_code = p_class_code
    and coalesce(pupil.stream, '') = v_stream
    and pupil.profile_id is not null;

  perform public.notify_class_parents(
    p_class_code,
    v_stream,
    v_title,
    v_body,
    '/account/notifications',
    'school'
  );

  return v_notice;
end;
$$;

grant execute on function public.notify_my_class(text, text, text, text) to authenticated;

commit;
