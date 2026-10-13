-- Vacancies upgrade: role details, application email, edit tracking and draft privacy.
-- Run after 0001_schema.sql and 0005_stories.sql (it reuses public.touch_updated_at). Safe to run more than once.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.vacancies add column if not exists summary text;
alter table public.vacancies add column if not exists department text;
alter table public.vacancies add column if not exists employment_type text;
alter table public.vacancies add column if not exists positions integer not null default 1;
alter table public.vacancies add column if not exists salary text;
alter table public.vacancies add column if not exists start_date date;
alter table public.vacancies add column if not exists apply_email text;
alter table public.vacancies add column if not exists updated_at timestamptz;

alter table public.vacancies drop constraint if exists vacancies_positions_check;
alter table public.vacancies add constraint vacancies_positions_check check (positions between 1 and 99);

drop trigger if exists vacancies_touch on public.vacancies;
create trigger vacancies_touch before update on public.vacancies for each row execute function public.touch_updated_at();

create index if not exists vacancies_published_idx on public.vacancies (published, closes_on);

-- Visitors only see published vacancies; admins also see drafts.
drop policy if exists vacancies_read on public.vacancies;
create policy vacancies_read on public.vacancies for select to anon, authenticated
  using (published or public.is_admin());
