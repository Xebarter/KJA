-- Club patrons: phone on club_leaders, rename lead role → patron.
-- Safe to re-run.

begin;

alter table public.club_leaders
  add column if not exists phone text;

update public.club_leaders
set phone = coalesce(phone, '')
where phone is null;

alter table public.club_leaders
  alter column phone set default '';

alter table public.club_leaders
  alter column phone set not null;

alter table public.club_leaders drop constraint if exists club_leaders_role_check;

update public.club_leaders
set role = 'patron'
where role = 'lead';

alter table public.club_leaders
  add constraint club_leaders_role_check
  check (role in ('patron', 'assistant'));

commit;
