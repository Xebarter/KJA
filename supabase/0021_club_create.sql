-- Let the accounts office add clubs from the catalogue. Run after 0019_clubs.sql (safe to re-run).
-- Row security already limits writes to accounts staff; this only adds the missing insert privilege.

grant select, insert, update on public.clubs to authenticated;
