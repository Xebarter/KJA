-- Parent portal. Run after schema.sql (safe to re-run).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'staff', 'parent'));
alter table public.profiles alter column role set default 'parent';
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;

alter table public.applications add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.applications add column if not exists status text not null default 'received';
alter table public.applications add column if not exists grade text;

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  campus text,
  grade text,
  date_of_birth date,
  student_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.student_reports (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  title text not null,
  term text,
  summary text,
  file_url text,
  issued_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.fee_balances (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  term text not null,
  description text,
  amount_due numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  due_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  title text unique not null,
  campus text,
  meeting text,
  description text,
  published boolean not null default true
);

create table if not exists public.club_signups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (child_id, club_id)
);

create table if not exists public.parent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  body text not null,
  direction text not null default 'out' check (direction in ('out', 'in')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    'parent',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.clubs (title, campus, meeting, description) values
  ('Creative & Performing Arts', 'All campuses', 'To be announced', 'Music, drama, dance and visual arts.'),
  ('Sports & Physical Activities', 'All campuses', 'To be announced', 'Football, swimming, athletics and more.'),
  ('Faith-Based Clubs', 'All campuses', 'To be announced', 'Christian and faith formation groups.'),
  ('Academic & Enrichment Clubs', 'All campuses', 'To be announced', 'Reading, STEM and academic support.'),
  ('Leadership, Character & Life Skills', 'All campuses', 'To be announced', 'Prefects, scouts and leadership.'),
  ('Badminton', 'Kitante & Najjanankumbi', 'To be announced', 'Skill, teamwork and match play.'),
  ('Music & Dance', 'All campuses', 'To be announced', 'Choir, instruments and performance.'),
  ('Language Club', 'All campuses', 'To be announced', 'English, Kiswahili and public speaking.')
on conflict (title) do nothing;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['children','student_reports','fee_balances','notifications','clubs','club_signups','parent_messages']
  loop
    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists applications_own_read on public.applications;
create policy applications_own_read on public.applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists applications_own_insert on public.applications;
create policy applications_own_insert on public.applications for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists children_own on public.children;
drop policy if exists children_select on public.children;
drop policy if exists children_insert on public.children;
drop policy if exists children_update on public.children;
drop policy if exists children_delete on public.children;
create policy children_select on public.children for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy children_insert on public.children for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy children_update on public.children for update to authenticated using (user_id = auth.uid() or public.is_admin());
create policy children_delete on public.children for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists reports_select on public.student_reports;
create policy reports_select on public.student_reports for select to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and (c.user_id = auth.uid() or public.is_admin())));
drop policy if exists reports_admin on public.student_reports;
create policy reports_admin on public.student_reports for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists fees_select on public.fee_balances;
create policy fees_select on public.fee_balances for select to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and (c.user_id = auth.uid() or public.is_admin())));
drop policy if exists fees_admin on public.fee_balances;
create policy fees_admin on public.fee_balances for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_admin on public.notifications;
create policy notifications_admin on public.notifications for insert to authenticated with check (public.is_admin());

drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select to anon, authenticated using (published = true or public.is_admin());
drop policy if exists clubs_admin on public.clubs;
create policy clubs_admin on public.clubs for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists signups_select on public.club_signups;
create policy signups_select on public.club_signups for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists signups_insert on public.club_signups;
create policy signups_insert on public.club_signups for insert to authenticated with check (user_id = auth.uid());
drop policy if exists signups_delete on public.club_signups;
create policy signups_delete on public.club_signups for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists pmsg_select on public.parent_messages;
create policy pmsg_select on public.parent_messages for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists pmsg_insert on public.parent_messages;
create policy pmsg_insert on public.parent_messages for insert to authenticated with check ((user_id = auth.uid() and direction = 'out') or public.is_admin());
drop policy if exists pmsg_update on public.parent_messages;
create policy pmsg_update on public.parent_messages for update to authenticated using (user_id = auth.uid() or public.is_admin());
