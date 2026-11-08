-- Allow Accounts staff to insert club consents when recording desk "Consent and pay".
-- Parents keep their existing insert policy; Clubs staff keep theirs.

drop policy if exists club_consents_clubs_write on public.club_consents;
create policy club_consents_clubs_write on public.club_consents for insert to authenticated
  with check (
    (select public.is_clubs_staff())
    or (select public.is_accounts_staff())
  );
