-- Pupil club access for the KJA Pupils app.
-- 1) Read open consents for the linked pupil.
-- 2) Read club catalogue rows for those consents (even if the club is no longer published).
-- 3) Read own non-voided club payments (for Paid / To pay badges).
-- Run after 0029_student_portal.sql (safe to re-run).

begin;

drop policy if exists club_consents_student on public.club_consents;
create policy club_consents_student on public.club_consents
  for select to authenticated
  using (student_id = public.my_student_id() and withdrawn_at is null);

drop policy if exists club_payments_student on public.club_payments;
create policy club_payments_student on public.club_payments
  for select to authenticated
  using (voided_at is null and student_id = public.my_student_id());

drop policy if exists clubs_student_consented on public.clubs;
create policy clubs_student_consented on public.clubs
  for select to authenticated
  using (
    id in (
      select c.club_id
      from public.club_consents c
      where c.student_id = public.my_student_id()
        and c.withdrawn_at is null
    )
  );

grant execute on function public.my_student_id() to authenticated;
grant select on public.club_consents to authenticated;
grant select on public.club_payments to authenticated;
grant select on public.clubs to authenticated;

commit;
