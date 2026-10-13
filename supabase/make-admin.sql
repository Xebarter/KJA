-- Makes sebenock027@gmail.com an admin. Run in the Supabase SQL editor.
-- The account must exist first: sign up on the website with this address (email or Google).
-- Safe to run more than once.

do $$
declare
  target_email constant text := 'sebenock027@gmail.com';
  target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = lower(target_email);
  if target_id is null then
    raise exception 'No account found for %. Sign up on the website with this email first, then run this script again.', target_email;
  end if;

  insert into public.profiles (id, role, email)
  values (target_id, 'admin', target_email)
  on conflict (id) do update
    set role = 'admin',
        email = coalesce(public.profiles.email, excluded.email);
end $$;

select p.id, p.email, p.role, p.full_name
from public.profiles p
where lower(p.email) = lower('sebenock027@gmail.com');
