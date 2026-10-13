-- Job applications from the careers page. Run after 0006_vacancies.sql (safe to re-run).

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid references public.vacancies (id) on delete set null,
  vacancy_title text,
  full_name text not null,
  email text not null,
  phone text not null,
  location text,
  current_position text,
  qualification text,
  experience text,
  campus text,
  available_from date,
  cover_letter text,
  documents jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  rating smallint,
  interview_at timestamptz,
  assigned_to uuid references public.profiles (id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.job_applications drop constraint if exists job_applications_status_check;
alter table public.job_applications add constraint job_applications_status_check
  check (status in ('new', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn'));
alter table public.job_applications drop constraint if exists job_applications_rating_check;
alter table public.job_applications add constraint job_applications_rating_check check (rating is null or rating between 1 and 5);
alter table public.job_applications drop constraint if exists job_applications_documents_check;
alter table public.job_applications add constraint job_applications_documents_check
  check (jsonb_typeof(documents) = 'array' and jsonb_array_length(documents) <= 4);

create index if not exists job_applications_created_idx on public.job_applications (created_at desc);
create index if not exists job_applications_vacancy_idx on public.job_applications (vacancy_id);
create index if not exists job_applications_status_idx on public.job_applications (status);
-- One application per person per role.
create unique index if not exists job_applications_once_idx on public.job_applications (vacancy_id, lower(email)) where vacancy_id is not null;

create or replace function public.touch_job_application()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'read' - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'read' - 'updated_at' - 'updated_by') then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists job_applications_touch on public.job_applications;
create trigger job_applications_touch
  before update on public.job_applications
  for each row execute function public.touch_job_application();

alter table public.job_applications enable row level security;

-- The careers form may only create fresh applications, for a role that is published and still open.
drop policy if exists job_applications_insert on public.job_applications;
create policy job_applications_insert on public.job_applications for insert to anon, authenticated
  with check (
    status = 'new' and rating is null and interview_at is null and assigned_to is null
    and read = false and updated_by is null
    and (
      job_applications.vacancy_id is null
      or exists (
        select 1 from public.vacancies v
        where v.id = job_applications.vacancy_id
          and v.published
          and (v.closes_on is null or v.closes_on >= (now() at time zone 'Africa/Kampala')::date)
      )
    )
  );
drop policy if exists job_applications_select on public.job_applications;
create policy job_applications_select on public.job_applications for select to authenticated using (public.is_admin());
drop policy if exists job_applications_update on public.job_applications;
create policy job_applications_update on public.job_applications for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists job_applications_delete on public.job_applications;
create policy job_applications_delete on public.job_applications for delete to authenticated using (public.is_admin());

-- Shared hiring timeline: notes and changes, so every admin sees who did what.
create table if not exists public.job_application_activity (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'status', 'assign', 'interview', 'rating')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists job_application_activity_app_idx on public.job_application_activity (application_id, created_at desc);
alter table public.job_application_activity enable row level security;

drop policy if exists job_activity_select on public.job_application_activity;
create policy job_activity_select on public.job_application_activity for select to authenticated using (public.is_admin());
drop policy if exists job_activity_insert on public.job_application_activity;
create policy job_activity_insert on public.job_application_activity for insert to authenticated
  with check (public.is_admin() and actor_id = auth.uid());
drop policy if exists job_activity_delete on public.job_application_activity;
create policy job_activity_delete on public.job_application_activity for delete to authenticated
  using (public.is_admin() and actor_id = auth.uid() and kind = 'note');

-- Private bucket for CVs and certificates. Applicants can upload; only admins can read (through signed links) or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-applications', 'job-applications', false, 5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists job_files_insert on storage.objects;
create policy job_files_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'job-applications' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$');
drop policy if exists job_files_read on storage.objects;
create policy job_files_read on storage.objects for select to authenticated
  using (bucket_id = 'job-applications' and public.is_admin());
drop policy if exists job_files_delete on storage.objects;
create policy job_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-applications' and public.is_admin());
