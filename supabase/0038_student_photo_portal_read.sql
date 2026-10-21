-- Let linked pupils read their own photo and classmates' photos (for the app + portal).
-- Staff keep full admissions access. Run after 0029_student_portal.sql (safe to re-run).

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
begin
  if object_name is null or object_name = '' then
    return false;
  end if;
  begin
    owner_id := split_part(object_name, '/', 1)::uuid;
  exception
    when others then
      return false;
  end;

  if public.is_admissions_staff() then
    return true;
  end if;

  if owner_id = public.my_student_id() then
    return true;
  end if;

  return owner_id in (select public.classmate_ids());
end;
$$;

drop policy if exists student_photos_read on storage.objects;
create policy student_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'student-photos'
    and public.can_read_student_photo(name)
  );

grant execute on function public.can_read_student_photo(text) to authenticated;

commit;
