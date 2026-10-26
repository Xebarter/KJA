-- Term points. Teachers award 1–10 or −1 to −10. Parents and pupils see the current term.
-- The academics office can look back and void a mistaken award. Safe to re-run.

begin;

create table if not exists public.point_reasons (
  id uuid primary key default gen_random_uuid(),
  polarity text not null check (polarity in ('positive', 'negative')),
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (polarity, label)
);

create table if not exists public.point_awards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  staff_id uuid references public.teaching_staff (id) on delete set null,
  teacher_name text not null,
  points smallint not null check (points between -10 and 10 and points <> 0),
  reason_id uuid references public.point_reasons (id) on delete set null,
  reason_label text not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null
);

create index if not exists point_awards_term_student_idx on public.point_awards (term_id, student_id);
create index if not exists point_awards_student_idx on public.point_awards (student_id, created_at desc);

insert into public.point_reasons (polarity, label, sort_order) values
  ('positive', 'Excellent classwork', 10),
  ('positive', 'Helpful to others', 20),
  ('positive', 'Good behaviour', 30),
  ('positive', 'Leadership', 40),
  ('positive', 'Improvement', 50),
  ('positive', 'Took part in class', 60),
  ('positive', 'Kindness', 70),
  ('positive', 'Homework done well', 80),
  ('negative', 'Incomplete work', 10),
  ('negative', 'Disrupted the class', 20),
  ('negative', 'Homework not done', 30),
  ('negative', 'Unkind behaviour', 40),
  ('negative', 'Did not follow instructions', 50),
  ('negative', 'Disrespect', 60),
  ('negative', 'Off task', 70),
  ('negative', 'Late to class', 80)
on conflict (polarity, label) do update
  set sort_order = excluded.sort_order, active = true;

alter table public.point_reasons enable row level security;
alter table public.point_awards enable row level security;

drop policy if exists point_reasons_read on public.point_reasons;
create policy point_reasons_read on public.point_reasons
  for select to authenticated
  using (active or (select public.is_academics_staff()));

drop policy if exists point_awards_staff on public.point_awards;
create policy point_awards_staff on public.point_awards
  for select to authenticated
  using ((select public.is_academics_staff()));

drop policy if exists point_awards_teacher on public.point_awards;
create policy point_awards_teacher on public.point_awards
  for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.students pupil
      where pupil.id = point_awards.student_id
        and public.teacher_sees_pupil(pupil.class_code, pupil.stream)
    )
  );

drop policy if exists point_awards_pupil on public.point_awards;
create policy point_awards_pupil on public.point_awards
  for select to authenticated
  using (
    exists (
      select 1
      from public.students pupil
      join public.fee_terms term on term.id = point_awards.term_id and term.is_current
      where pupil.id = point_awards.student_id
        and pupil.profile_id = auth.uid()
    )
  );

drop policy if exists point_awards_parent on public.point_awards;
create policy point_awards_parent on public.point_awards
  for select to authenticated
  using (
    point_awards.student_id in (select public.my_student_ids())
    and exists (
      select 1 from public.fee_terms term
      where term.id = point_awards.term_id and term.is_current
    )
  );

revoke all on table public.point_reasons from public, anon, authenticated;
revoke all on table public.point_awards from public, anon, authenticated;
grant select on table public.point_reasons to authenticated;
grant select on table public.point_awards to authenticated;

create or replace function public.award_pupil_points(p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_name text;
  v_term uuid;
  v_count integer := 0;
  v_entry jsonb;
  v_student uuid;
  v_points integer;
  v_reason uuid;
  v_pupil public.students%rowtype;
  v_label text;
  v_polarity text;
  v_active boolean;
  v_title text;
  v_body text;
  v_word text;
begin
  if auth.uid() is null or not public.is_linked_teacher() then
    raise exception 'Only a linked teacher can award points.';
  end if;
  v_staff := public.my_teaching_staff_id();
  if v_staff is null then
    raise exception 'Only a linked teacher can award points.';
  end if;
  select full_name into v_name from public.teaching_staff where id = v_staff;
  v_name := coalesce(nullif(trim(v_name), ''), 'Your teacher');
  select id into v_term from public.fee_terms where is_current limit 1;
  if v_term is null then
    raise exception 'Set a current term before awarding points.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Choose at least one pupil.';
  end if;
  if jsonb_array_length(p_entries) > 200 then
    raise exception 'That is too many pupils at once.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    if coalesce(v_entry->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Choose a pupil.';
    end if;
    if coalesce(v_entry->>'reason_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Choose a reason from the list.';
    end if;
    if coalesce(v_entry->>'points', '') !~ '^-?[0-9]+$' then
      raise exception 'Points must be from 1 to 10, or from -1 to -10.';
    end if;
    v_student := (v_entry->>'student_id')::uuid;
    v_reason := (v_entry->>'reason_id')::uuid;
    v_points := (v_entry->>'points')::integer;
    if v_points = 0 or v_points < -10 or v_points > 10 then
      raise exception 'Points must be from 1 to 10, or from -1 to -10.';
    end if;

    select * into v_pupil from public.students where id = v_student and status = 'active';
    if not found then
      raise exception 'That pupil is not on the active roll.';
    end if;
    if not public.teacher_sees_pupil(v_pupil.class_code, v_pupil.stream) then
      raise exception 'You can only award pupils in a class you teach.';
    end if;

    select label, polarity, active into v_label, v_polarity, v_active
    from public.point_reasons where id = v_reason;
    if not found or v_active is not true then
      raise exception 'Choose a reason from the list.';
    end if;
    if (v_points > 0 and v_polarity <> 'positive') or (v_points < 0 and v_polarity <> 'negative') then
      raise exception 'Choose a reason that matches the points.';
    end if;

    insert into public.point_awards (student_id, term_id, staff_id, teacher_name, points, reason_id, reason_label)
    values (v_student, v_term, v_staff, v_name, v_points, v_reason, v_label);

    v_word := case when abs(v_points) = 1 then 'point' else 'points' end;
    v_title := case when v_points > 0 then '+' else '' end || v_points::text || ' ' || v_word;
    v_body := v_name || ' gave ' || v_points::text || ' ' || v_word || ' for ' || v_label || '.';
    if v_pupil.profile_id is not null then
      perform public.notify_user(v_pupil.profile_id, v_title, v_body, '/student/points', 'points');
    end if;
    perform public.notify_student_parents(
      array[v_student],
      v_title,
      v_body,
      '/account/points?child=' || v_student::text,
      'points'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.void_pupil_points(p_award_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null or not public.is_academics_staff() then
    raise exception 'Only the academics office can void points.';
  end if;
  update public.point_awards
  set voided_at = now(), voided_by = auth.uid()
  where id = p_award_id and voided_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'That award is already void, or it could not be found.';
  end if;
end;
$$;

revoke all on function public.award_pupil_points(jsonb) from public, anon;
revoke all on function public.void_pupil_points(uuid) from public, anon;
grant execute on function public.award_pupil_points(jsonb) to authenticated;
grant execute on function public.void_pupil_points(uuid) to authenticated;

commit;
