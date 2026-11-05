-- Club weekly schedules readable on academics / student timetables as "Club time".
-- Clubs desk remains the write owner; this only opens select for teaching views.

begin;

drop policy if exists clubs_timetable_read on public.clubs;
create policy clubs_timetable_read on public.clubs
  for select to authenticated
  using (
    (select public.is_academics_staff())
    or (select public.is_student())
  );

drop policy if exists club_schedules_timetable_read on public.club_schedules;
create policy club_schedules_timetable_read on public.club_schedules
  for select to authenticated
  using (
    active
    and (
      (select public.is_academics_staff())
      or (select public.is_student())
      or (select public.is_clubs_staff())
      or (select public.is_accounts_staff())
    )
  );

commit;
