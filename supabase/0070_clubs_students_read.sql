-- Clubs desk needs pupil rows for register, reports, receipts, roll, and consents.
-- Administrators already see students via admissions policies; clubs-only staff did not.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- students: clubs staff select (campus-scoped)

drop policy if exists students_clubs_select on public.students;
create policy students_clubs_select on public.students
  for select to authenticated
  using (
    (select public.is_clubs_staff())
    and (
      coalesce(campus, '') = ''
      or (select public.can_access_clubs_campus(campus))
    )
  );

-- Accounts desk also loads pupils for club receipts / rolls; non-admin accounts staff
-- had the same gap. Keep campus-scoped the same way expenses are scoped.
drop policy if exists students_accounts_select on public.students;
create policy students_accounts_select on public.students
  for select to authenticated
  using (
    (select public.is_accounts_staff())
    and (
      coalesce(campus, '') = ''
      or (select public.can_access_accounts_campus(campus))
    )
  );

-- ---------------------------------------------------------------- passport photos on the clubs desk

create or replace function public.can_read_student_photo(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  folder text;
  stem text;
begin
  if object_name is null or btrim(object_name) = '' then
    return false;
  end if;

  folder := split_part(btrim(object_name, '/'), '/', 1);

  begin
    owner_id := folder::uuid;
  exception
    when others then
      stem := split_part(folder, '.', 1);
      begin
        owner_id := stem::uuid;
      exception
        when others then
          return false;
      end;
  end;

  if public.is_admissions_staff() then
    return true;
  end if;

  if owner_id = public.my_student_id() then
    return true;
  end if;

  if owner_id in (select public.classmate_ids()) then
    return true;
  end if;

  if public.is_clubs_staff() then
    return exists (
      select 1
      from public.students s
      where s.id = owner_id
        and (
          coalesce(s.campus, '') = ''
          or public.can_access_clubs_campus(s.campus)
        )
    );
  end if;

  if public.is_accounts_staff() then
    return exists (
      select 1
      from public.students s
      where s.id = owner_id
        and (
          coalesce(s.campus, '') = ''
          or public.can_access_accounts_campus(s.campus)
        )
    );
  end if;

  return exists (
    select 1
    from public.students s
    where s.id = owner_id
      and public.teacher_sees_pupil(s.class_code, s.stream, coalesce(s.campus, ''))
  );
end;
$$;

grant execute on function public.can_read_student_photo(text) to authenticated, service_role;

commit;
