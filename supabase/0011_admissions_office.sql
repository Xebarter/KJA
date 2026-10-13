-- Admissions office. Run after every part of 0010_student_register (safe to re-run).
-- Adds the "admissions" role, opens the student register and applications to admissions staff,
-- and adds the student timeline, enrolment links and year-end promotion.

begin;

-- ---------------------------------------------------------------- role

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'admissions', 'staff', 'parent'));

create or replace function public.is_admissions_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'admissions')
  );
$$;

-- ---------------------------------------------------------------- register access

do $$
declare
  tbl text;
begin
  foreach tbl in array array['school_classes', 'families', 'guardians', 'family_contacts', 'students']
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_admin', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_office', tbl);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admissions_staff()) with check (public.is_admissions_staff())', tbl || '_office', tbl);
  end loop;
end $$;

-- ---------------------------------------------------------------- applications access

drop policy if exists applications_admin on public.applications;
create policy applications_admin on public.applications for select to authenticated using (public.is_admissions_staff());
drop policy if exists applications_own_read on public.applications;
create policy applications_own_read on public.applications for select to authenticated
  using (user_id = auth.uid() or public.is_admissions_staff());
drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications for update to authenticated
  using (public.is_admissions_staff()) with check (public.is_admissions_staff());
drop policy if exists applications_delete on public.applications;
create policy applications_delete on public.applications for delete to authenticated using (public.is_admissions_staff());

drop policy if exists activity_select on public.application_activity;
create policy activity_select on public.application_activity for select to authenticated using (public.is_admissions_staff());
drop policy if exists activity_insert on public.application_activity;
create policy activity_insert on public.application_activity for insert to authenticated
  with check (public.is_admissions_staff() and actor_id = auth.uid());
drop policy if exists activity_delete on public.application_activity;
create policy activity_delete on public.application_activity for delete to authenticated
  using (public.is_admissions_staff() and actor_id = auth.uid() and kind = 'note');

drop policy if exists admission_payments_select on public.admission_payments;
create policy admission_payments_select on public.admission_payments for select to authenticated using (public.is_admissions_staff());

-- Admissions staff can see the names of their teammates, not every parent account.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_admissions_staff() and role in ('admin', 'admissions')));

-- ---------------------------------------------------------------- students

alter table public.students add column if not exists left_reason text;
alter table public.students add column if not exists admitted_from_application uuid references public.applications (id) on delete set null;

alter table public.students drop constraint if exists students_status_check;
alter table public.students add constraint students_status_check
  check (status in ('active', 'graduated', 'transferred', 'withdrawn', 'left'));

alter table public.applications add column if not exists student_id uuid references public.students (id) on delete set null;
create index if not exists applications_student_idx on public.applications (student_id);
create index if not exists students_enrolled_idx on public.students (enrolled_on desc);

-- One shared timeline per student, so the whole office sees who changed what.
create table if not exists public.student_activity (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'edit', 'class', 'status', 'enrol', 'promotion', 'review')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists student_activity_student_idx on public.student_activity (student_id, created_at desc);
create index if not exists student_activity_created_idx on public.student_activity (created_at desc);
alter table public.student_activity enable row level security;

drop policy if exists student_activity_select on public.student_activity;
create policy student_activity_select on public.student_activity for select to authenticated using (public.is_admissions_staff());
drop policy if exists student_activity_insert on public.student_activity;
create policy student_activity_insert on public.student_activity for insert to authenticated
  with check (public.is_admissions_staff() and actor_id = auth.uid());
drop policy if exists student_activity_delete on public.student_activity;
create policy student_activity_delete on public.student_activity for delete to authenticated
  using (public.is_admissions_staff() and actor_id = auth.uid() and kind = 'note');

-- Pairs of students someone has checked and confirmed are different children.
create table if not exists public.student_duplicate_dismissals (
  student_a uuid not null references public.students (id) on delete cascade,
  student_b uuid not null references public.students (id) on delete cascade,
  dismissed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (student_a, student_b),
  check (student_a < student_b)
);
alter table public.student_duplicate_dismissals enable row level security;
drop policy if exists duplicate_dismissals_office on public.student_duplicate_dismissals;
create policy duplicate_dismissals_office on public.student_duplicate_dismissals for all to authenticated
  using (public.is_admissions_staff()) with check (public.is_admissions_staff());

-- ---------------------------------------------------------------- directory

-- Recreated with the new columns, so lists can show campus, leaving details and review flags.
drop view if exists public.student_directory;
create view public.student_directory with (security_invoker = true) as
select
  s.id,
  s.student_number,
  s.full_name,
  s.surname,
  s.given_names,
  s.preferred_name,
  s.sex,
  s.date_of_birth,
  extract(year from age(s.date_of_birth))::integer as age,
  s.class_code,
  c.name as class_name,
  c.section,
  c.sort_order as class_order,
  s.stream,
  s.house,
  s.campus,
  s.status,
  s.enrolled_on,
  s.left_on,
  s.left_reason,
  s.religion,
  s.nationality,
  s.staff_child,
  s.staff_category,
  s.medical_notes,
  s.panadol_allowed,
  s.updated_at,
  f.id as family_id,
  f.family_code,
  f.mailing_name,
  f.home_area,
  fa.full_name as father_name,
  fa.phone as father_phone,
  fa.email as father_email,
  mo.full_name as mother_name,
  mo.phone as mother_phone,
  mo.email as mother_email,
  (select count(*) from public.students sib where sib.family_id = s.family_id and sib.id <> s.id)::integer as siblings,
  cardinality(s.import_notes) > 0 as needs_review
from public.students s
left join public.school_classes c on c.code = s.class_code
left join public.families f on f.id = s.family_id
left join public.guardians fa on fa.family_id = f.id and fa.relationship = 'father'
left join public.guardians mo on mo.family_id = f.id and mo.relationship = 'mother';

-- ---------------------------------------------------------------- functions

create or replace function public.next_student_number()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select (coalesce(max(student_number::bigint) filter (where student_number ~ '^\d{1,15}$'), 0) + 1)::text
  from public.students;
$$;

create or replace function public.next_family_code(student_number text)
returns text
language sql
immutable
as $$
  select 'F' || student_number;
$$;

-- Moves every active student up one class. Top class (P7) graduates. Students in p_exclude repeat.
-- With p_dry_run the register is left untouched and only the summary comes back.
drop function if exists public.promote_students(uuid[], boolean);
create or replace function public.promote_students(p_exclude uuid[] default '{}', p_dry_run boolean default true)
returns table (from_class text, to_class text, moving integer, repeating integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_admissions_staff() then
    raise exception 'Only admissions staff can promote students.';
  end if;

  drop table if exists promo_plan;
  create temporary table promo_plan on commit drop as
  select
    s.id,
    s.class_code as from_code,
    nxt.code as to_code,
    s.id = any (coalesce(p_exclude, '{}')) as repeats
  from public.students s
  join public.school_classes c on c.code = s.class_code
  left join lateral (
    select n.code from public.school_classes n where n.sort_order > c.sort_order order by n.sort_order limit 1
  ) nxt on true
  where s.status = 'active';

  if not p_dry_run then
    update public.students s
    set class_code = p.to_code
    from promo_plan p
    where s.id = p.id and not p.repeats and p.to_code is not null;

    update public.students s
    set status = 'graduated', left_on = current_date, left_reason = 'Completed Primary Seven'
    from promo_plan p
    where s.id = p.id and not p.repeats and p.to_code is null;

    insert into public.student_activity (student_id, actor_id, kind, body)
    select
      p.id,
      actor,
      'promotion',
      case
        when p.repeats then 'Kept in ' || p.from_code || ' at the year-end promotion'
        when p.to_code is null then 'Graduated at the year-end promotion'
        else 'Promoted from ' || p.from_code || ' to ' || p.to_code
      end
    from promo_plan p;
  end if;

  return query
  select
    p.from_code,
    coalesce(p.to_code, 'Graduated'),
    (count(*) filter (where not p.repeats))::integer,
    (count(*) filter (where p.repeats))::integer
  from promo_plan p
  join public.school_classes c on c.code = p.from_code
  group by p.from_code, p.to_code, c.sort_order
  order by c.sort_order;
end;
$$;

-- Likely duplicate records: the same name with the same date of birth or family.
create or replace function public.find_duplicate_students()
returns table (student_a uuid, student_b uuid, reason text)
language sql
stable
security invoker
set search_path = public
as $$
  with norm as (
    select
      id,
      family_id,
      date_of_birth,
      (select string_agg(w, ' ' order by w) from unnest(regexp_split_to_array(lower(regexp_replace(full_name, '[^A-Za-z ]', '', 'g')), '\s+')) w where w <> '') as name_key
    from public.students
    where status = 'active'
  )
  select a.id, b.id,
    case
      when a.date_of_birth is not null and a.date_of_birth = b.date_of_birth then 'Same name and date of birth'
      else 'Same name in the same family'
    end
  from norm a
  join norm b on a.id < b.id and a.name_key = b.name_key
  where ((a.date_of_birth is not null and a.date_of_birth = b.date_of_birth)
     or (a.family_id is not null and a.family_id = b.family_id))
  and not exists (
    select 1 from public.student_duplicate_dismissals d where d.student_a = a.id and d.student_b = b.id
  );
$$;

grant execute on function public.next_student_number() to authenticated;
grant execute on function public.next_family_code(text) to authenticated;
grant execute on function public.promote_students(uuid[], boolean) to authenticated;
grant execute on function public.find_duplicate_students() to authenticated;
grant execute on function public.is_admissions_staff() to authenticated;

commit;

notify pgrst, 'reload schema';

-- Check it worked: this should return one row with a campus column.
--   select campus, left_reason from public.student_directory limit 1;

-- Give someone the admissions role from the admin Team page, or here:
--   update public.profiles set role = 'admissions' where lower(email) = lower('officer@example.com');
