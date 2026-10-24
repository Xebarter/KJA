-- Teacher profile photos for the teacher desk, academics staff list, and Pupils App My Class.
-- Run after 0045_pupil_class_teachers.sql (safe to re-run).

begin;

alter table public.teaching_staff
  add column if not exists photo_path text;

comment on column public.teaching_staff.photo_path is
  'Private storage object path in the teacher-photos bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'teacher-photos',
  'teacher-photos',
  false,
  1048576,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Teachers may update only their own photo_path (other columns stay office-managed).
create or replace function public.set_my_teacher_photo(p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  staff uuid := public.my_teaching_staff_id();
  cleaned text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if staff is null then
    raise exception 'Not a linked teacher';
  end if;
  if cleaned is not null and split_part(cleaned, '/', 1) is distinct from staff::text then
    raise exception 'Photo path must be under your staff folder';
  end if;
  update public.teaching_staff
  set photo_path = cleaned
  where id = staff;
  return cleaned;
end;
$$;

comment on function public.set_my_teacher_photo(text) is
  'Linked teacher sets or clears their own profile photo path.';

revoke all on function public.set_my_teacher_photo(text) from public;
grant execute on function public.set_my_teacher_photo(text) to authenticated;

-- Include photo_path for the Pupils App / web My Class directory.
-- Must drop first: CREATE OR REPLACE cannot change the OUT/returns-table row type.
drop function if exists public.my_class_teachers();

create or replace function public.my_class_teachers()
returns table (
  staff_id uuid,
  full_name text,
  title text,
  subject_id uuid,
  role text,
  photo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      s.class_code,
      coalesce(nullif(btrim(s.stream), ''), '') as stream
    from public.students s
    where s.profile_id = auth.uid()
      and s.status = 'active'
    limit 1
  ),
  term as (
    select t.id
    from public.fee_terms t
    where t.is_current
    limit 1
  )
  select
    ct.staff_id,
    ts.full_name,
    ts.title,
    null::uuid as subject_id,
    'class'::text as role,
    ts.photo_path
  from public.class_teachers ct
  join public.teaching_staff ts on ts.id = ct.staff_id and ts.active
  join me on me.class_code is not null
    and me.class_code = ct.class_code
    and coalesce(nullif(btrim(ct.stream), ''), '') = me.stream
  join term on term.id = ct.term_id
  union all
  select
    st.staff_id,
    ts.full_name,
    ts.title,
    st.subject_id,
    'subject'::text as role,
    ts.photo_path
  from public.subject_teachers st
  join public.teaching_staff ts on ts.id = st.staff_id and ts.active
  join me on me.class_code is not null
    and me.class_code = st.class_code
    and coalesce(nullif(btrim(st.stream), ''), '') = me.stream
  join term on term.id = st.term_id;
$$;

comment on function public.my_class_teachers() is
  'Class teacher and subject teachers for the signed-in pupil''s current class stream, with photo paths.';

revoke all on function public.my_class_teachers() from public;
grant execute on function public.my_class_teachers() to authenticated;

-- Storage: own folder for teachers; full access for academics office.
drop policy if exists teacher_photos_read on storage.objects;
create policy teacher_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'teacher-photos'
    and (
      (select public.is_academics_staff())
      or (storage.foldername(name))[1] = (select public.my_teaching_staff_id()::text)
      or exists (
        select 1
        from public.teaching_staff ts
        where ts.id::text = (storage.foldername(name))[1]
          and ts.active
          and (select public.is_student())
          and (
            exists (
              select 1
              from public.class_teachers ct
              join public.students s on s.profile_id = auth.uid()
              where ct.staff_id = ts.id
                and s.status = 'active'
                and s.class_code = ct.class_code
                and coalesce(nullif(btrim(s.stream), ''), '') = coalesce(nullif(btrim(ct.stream), ''), '')
            )
            or exists (
              select 1
              from public.subject_teachers st
              join public.students s on s.profile_id = auth.uid()
              where st.staff_id = ts.id
                and s.status = 'active'
                and s.class_code = st.class_code
                and coalesce(nullif(btrim(s.stream), ''), '') = coalesce(nullif(btrim(st.stream), ''), '')
            )
          )
      )
    )
  );

drop policy if exists teacher_photos_insert on storage.objects;
create policy teacher_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'teacher-photos'
    and (
      (select public.is_academics_staff())
      or (storage.foldername(name))[1] = (select public.my_teaching_staff_id()::text)
    )
  );

drop policy if exists teacher_photos_update on storage.objects;
create policy teacher_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'teacher-photos'
    and (
      (select public.is_academics_staff())
      or (storage.foldername(name))[1] = (select public.my_teaching_staff_id()::text)
    )
  );

drop policy if exists teacher_photos_delete on storage.objects;
create policy teacher_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'teacher-photos'
    and (
      (select public.is_academics_staff())
      or (storage.foldername(name))[1] = (select public.my_teaching_staff_id()::text)
    )
  );

commit;
