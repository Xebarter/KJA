-- Schemes of work: optional PDF / Word attachment for the whole plan.
-- Safe to re-run.

begin;

alter table public.schemes
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_mime text,
  add column if not exists file_size integer;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'schemes',
  'schemes',
  false,
  15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_scheme_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_academics_staff()
    or exists (
      select 1
      from public.schemes s
      join public.teaching_staff t on t.id = s.staff_id
      where s.file_path = object_name
        and t.profile_id = auth.uid()
        and t.active
    );
$$;

create or replace function public.can_write_scheme_file()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_academics_staff()
    or exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    );
$$;

drop policy if exists schemes_files_read on storage.objects;
create policy schemes_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'schemes'
    and public.can_access_scheme_file(name)
  );

drop policy if exists schemes_files_insert on storage.objects;
create policy schemes_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'schemes'
    and public.can_write_scheme_file()
  );

drop policy if exists schemes_files_update on storage.objects;
create policy schemes_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'schemes'
    and public.can_write_scheme_file()
  );

drop policy if exists schemes_files_delete on storage.objects;
create policy schemes_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'schemes'
    and public.can_write_scheme_file()
  );

grant execute on function public.can_access_scheme_file(text) to authenticated;
grant execute on function public.can_write_scheme_file() to authenticated;

commit;
