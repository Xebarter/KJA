-- Allow admins to read teaching_staff (Team page) and let a linked teacher
-- always read their own row (even if profiles.role was wrong for a moment).

begin;

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.is_full_admin()
    or exists (
      select 1 from public.dashboard_grant_lookup
      where profile_id = auth.uid() and dashboard = 'admin'
    );
end;
$$;

drop policy if exists teaching_staff_admin_select on public.teaching_staff;
create policy teaching_staff_admin_select on public.teaching_staff
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists teaching_staff_self_select on public.teaching_staff;
create policy teaching_staff_self_select on public.teaching_staff
  for select to authenticated
  using (profile_id = (select auth.uid()));

commit;
