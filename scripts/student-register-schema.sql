-- ---------------------------------------------------------------- schema

create table if not exists public.school_classes (
  code text primary key,
  name text not null,
  section text not null check (section in ('daycare', 'nursery', 'primary')),
  sort_order integer not null
);

-- A household. Siblings share one family, so parents and contacts are stored once.
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  family_code text not null unique,
  mailing_name text,
  home_area text,
  street text,
  home_address text,
  country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  relationship text not null check (relationship in ('father', 'mother', 'guardian')),
  title text,
  full_name text not null,
  nationality text,
  occupation text,
  employer text,
  phone text,
  phone_alt text,
  work_phone text,
  email text,
  is_primary boolean not null default false,
  user_id uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every phone number and email the family gave, including relatives and emergency contacts.
create table if not exists public.family_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null check (kind in ('phone', 'email')),
  value text not null,
  relationship text not null default 'other'
    check (relationship in ('father', 'mother', 'guardian', 'grandparent', 'aunt', 'uncle', 'sibling', 'driver', 'friend', 'helper', 'teacher', 'household', 'other')),
  name text,
  phone_type text check (phone_type in ('mobile', 'work', 'landline')),
  label text,
  needs_check boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, kind, value)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_number text not null unique,
  family_id uuid references public.families (id) on delete set null,
  full_name text not null,
  surname text,
  given_names text,
  preferred_name text,
  formal_name text,
  sex text check (sex in ('M', 'F')),
  date_of_birth date,
  class_code text references public.school_classes (code) on update cascade,
  stream text,
  house text,
  tutor_group text,
  campus text,
  religion text,
  nationality text,
  home_language text,
  enrolled_on date,
  status text not null default 'active' check (status in ('active', 'graduated', 'transferred', 'left')),
  left_on date,
  transferred_from text,
  transferred_to text,
  exam_index_number text,
  passport_or_id text,
  staff_child boolean not null default false,
  staff_category text,
  medical_notes text,
  panadol_allowed boolean,
  import_notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_family_idx on public.students (family_id);
create index if not exists students_class_idx on public.students (class_code, stream);
create index if not exists students_status_idx on public.students (status);
create index if not exists students_name_idx on public.students (lower(full_name));
create index if not exists guardians_family_idx on public.guardians (family_id);
create unique index if not exists guardians_family_relationship on public.guardians (family_id, relationship) where relationship in ('father', 'mother');
create index if not exists guardians_email_idx on public.guardians (lower(email));
create index if not exists family_contacts_family_idx on public.family_contacts (family_id, position);
create index if not exists family_contacts_value_idx on public.family_contacts (value);

-- Lets a parent-portal child be tied to the official register later.
alter table public.children add column if not exists student_id uuid references public.students (id) on delete set null;

create or replace function public.touch_register_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['families', 'guardians', 'students']
  loop
    execute format('drop trigger if exists %I on public.%I', tbl || '_touch', tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_register_row()', tbl || '_touch', tbl);
  end loop;
end $$;

-- Medical, family and contact details are private: admins only.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['school_classes', 'families', 'guardians', 'family_contacts', 'students']
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_admin', tbl);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', tbl || '_admin', tbl);
  end loop;
end $$;

-- One row per student with class, parents and their main contacts, for lists and exports.
create or replace view public.student_directory with (security_invoker = true) as
select
  s.id,
  s.student_number,
  s.full_name,
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
  s.status,
  s.enrolled_on,
  s.religion,
  s.nationality,
  s.staff_child,
  s.medical_notes,
  s.panadol_allowed,
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
