-- Admins may create the singleton settings row. Upsert needs this policy;
-- image replacement and settings saves update the existing row instead.

drop policy if exists settings_insert on public.site_settings;
create policy settings_insert on public.site_settings
  for insert to authenticated
  with check (public.is_admin());
