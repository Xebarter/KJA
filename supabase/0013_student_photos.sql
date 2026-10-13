-- Student photos. Run after 0012_faster_office_policies.sql (safe to re-run).
-- Photos live in a private bucket that only admissions staff can read; pages show them through
-- short-lived signed links.

begin;

alter table public.students add column if not exists photo_path text;

-- Same view as 0011 with photo_path added at the end, so lists can show the photo.
create or replace view public.student_directory with (security_invoker = true) as
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
  cardinality(s.import_notes) > 0 as needs_review,
  s.photo_path
from public.students s
left join public.school_classes c on c.code = s.class_code
left join public.families f on f.id = s.family_id
left join public.guardians fa on fa.family_id = f.id and fa.relationship = 'father'
left join public.guardians mo on mo.family_id = f.id and mo.relationship = 'mother';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_photos_read on storage.objects;
create policy student_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and (select public.is_admissions_staff()));
drop policy if exists student_photos_insert on storage.objects;
create policy student_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and (select public.is_admissions_staff()));
drop policy if exists student_photos_update on storage.objects;
create policy student_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and (select public.is_admissions_staff()));
drop policy if exists student_photos_delete on storage.objects;
create policy student_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and (select public.is_admissions_staff()));

commit;
