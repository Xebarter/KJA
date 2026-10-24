-- Let linked pupils read their own photo and classmates' photos (for the app + portal).
-- Without this, the Pupils app Chat / My Class / sidebar only show initials.
-- Also accepts legacy flat keys "{student_id}.jpg" as well as "{student_id}/file.jpg".
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
      -- Legacy flat key: "{uuid}.jpg" / "{uuid}.webp"
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
grant execute on function public.classmate_ids() to authenticated;
grant execute on function public.my_student_id() to authenticated;

commit;
