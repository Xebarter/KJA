-- Kampala Junior Academy schema. Run this in the Supabase SQL editor before 0002_seed.sql.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'parent' check (role in ('admin', 'staff', 'parent')),
  full_name text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

-- Must come after profiles: SQL function bodies are validated when created.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  phone text,
  email text,
  address text,
  map_url text,
  footer_text text,
  video_url text,
  about_title text,
  about_body text,
  vision text,
  mission text,
  campuses_intro text,
  counters jsonb not null default '[]'::jsonb,
  hero_slides jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  choose_items jsonb not null default '[]'::jsonb,
  socials jsonb not null default '[]'::jsonb,
  popup_enabled boolean not null default true,
  popup_title text,
  popup_body text,
  popup_cta_label text,
  popup_cta_href text
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  author text,
  published_at timestamptz,
  seo_description text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  seo_description text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campus_sections (
  id uuid primary key default gen_random_uuid(),
  campus_slug text,
  kind text not null default 'life',
  title text not null,
  body text,
  image_url text,
  sort_order int not null default 0
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  role text,
  excerpt text,
  body text,
  image_url text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  starts_on date,
  ends_on date,
  start_time text,
  end_time text,
  location text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  author text,
  published_at timestamptz,
  seo_description text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  author text,
  published_at timestamptz,
  seo_description text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quote text,
  role text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.alumni_news (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  author text,
  published_at timestamptz,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.alumni_events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  starts_on date,
  location text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.alumni_stories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  author text,
  published_at timestamptz,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.alumni_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  role text,
  excerpt text,
  body text,
  image_url text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.alumni_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  location text,
  closes_on date,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  email text not null,
  phone text,
  child_name text not null,
  campus text,
  grade text,
  message text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'profiles','site_settings','pages','campuses','campus_sections','teachers','events','news','posts',
    'gallery_items','testimonials','alumni_news','alumni_events','alumni_stories','alumni_profiles',
    'alumni_photos','vacancies','applications','contact_messages','newsletter_subscribers'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists settings_read on public.site_settings;
create policy settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists settings_write on public.site_settings;
create policy settings_write on public.site_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'pages','campuses','campus_sections','teachers','events','news','posts','gallery_items','testimonials',
    'alumni_news','alumni_events','alumni_stories','alumni_profiles','alumni_photos','vacancies'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_read', tbl);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', tbl || '_read', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', tbl || '_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', tbl || '_update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', tbl || '_delete', tbl);
  end loop;
end $$;

drop policy if exists applications_insert on public.applications;
create policy applications_insert on public.applications for insert to anon, authenticated with check (true);
drop policy if exists applications_admin on public.applications;
create policy applications_admin on public.applications for select to authenticated using (public.is_admin());
drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists applications_delete on public.applications;
create policy applications_delete on public.applications for delete to authenticated using (public.is_admin());

drop policy if exists messages_insert on public.contact_messages;
create policy messages_insert on public.contact_messages for insert to anon, authenticated with check (true);
drop policy if exists messages_admin on public.contact_messages;
create policy messages_admin on public.contact_messages for select to authenticated using (public.is_admin());
drop policy if exists messages_update on public.contact_messages;
create policy messages_update on public.contact_messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists messages_delete on public.contact_messages;
create policy messages_delete on public.contact_messages for delete to authenticated using (public.is_admin());

drop policy if exists newsletter_insert on public.newsletter_subscribers;
create policy newsletter_insert on public.newsletter_subscribers for insert to anon, authenticated with check (true);
drop policy if exists newsletter_admin on public.newsletter_subscribers;
create policy newsletter_admin on public.newsletter_subscribers for select to authenticated using (public.is_admin());
drop policy if exists newsletter_delete on public.newsletter_subscribers;
create policy newsletter_delete on public.newsletter_subscribers for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select to anon, authenticated using (bucket_id = 'media');
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());
