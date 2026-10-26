-- Teachers may read passport photos for pupils on their classes.
-- The markbook shows those faces. Admissions, the pupil, and classmates keep the access they already have.
-- Safe to re-run.

begin;

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

  return exists (
    select 1
    from public.students s
    where s.id = owner_id
      and public.teacher_sees_pupil(s.class_code, s.stream)
  );
end;
$$;

commit;
