-- Keep the Admissions directory searchable and stable when ordering/paginating.
-- Run after 0095. Safe to re-run.

begin;

create extension if not exists pg_trgm;

create index if not exists students_full_name_trgm_idx
  on public.students using gin (full_name gin_trgm_ops);
create index if not exists students_preferred_name_trgm_idx
  on public.students using gin (preferred_name gin_trgm_ops);
create index if not exists students_number_trgm_idx
  on public.students using gin (student_number gin_trgm_ops);
create index if not exists families_code_trgm_idx
  on public.families using gin (family_code gin_trgm_ops);
create index if not exists families_mailing_name_trgm_idx
  on public.families using gin (mailing_name gin_trgm_ops);
create index if not exists families_home_area_trgm_idx
  on public.families using gin (home_area gin_trgm_ops);
create index if not exists guardians_full_name_trgm_idx
  on public.guardians using gin (full_name gin_trgm_ops);
create index if not exists guardians_phone_trgm_idx
  on public.guardians using gin (phone gin_trgm_ops);
create index if not exists guardians_email_trgm_idx
  on public.guardians using gin (email gin_trgm_ops);

create index if not exists students_register_name_sort_idx
  on public.students (full_name, id);
create index if not exists students_register_number_sort_idx
  on public.students (student_number, id);
create index if not exists students_register_dob_sort_idx
  on public.students (date_of_birth desc, id);
create index if not exists students_register_enrolment_sort_idx
  on public.students (enrolled_on desc nulls last, full_name, id);
create index if not exists students_register_class_sort_idx
  on public.students (class_code, stream, full_name, id);

-- Each student must produce exactly one directory row even when a family has
-- multiple guardians recorded with the same relationship.
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
left join lateral (
  select g.full_name, g.phone, g.email
  from public.guardians g
  where g.family_id = f.id and g.relationship = 'father'
  order by g.is_primary desc nulls last, g.id
  limit 1
) fa on true
left join lateral (
  select g.full_name, g.phone, g.email
  from public.guardians g
  where g.family_id = f.id and g.relationship = 'mother'
  order by g.is_primary desc nulls last, g.id
  limit 1
) mo on true;

commit;
