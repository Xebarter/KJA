-- Class learning resources: notes, files, images and links from teachers to pupils.
-- Run after 0029_student_portal.sql (safe to re-run).

begin;

create table if not exists public.class_resources (
  id uuid primary key default gen_random_uuid(),
  term_id uuid references public.fee_terms (id) on delete set null,
  class_code text not null,
  stream text not null default '',
  subject_id uuid references public.subjects (id) on delete set null,
  teacher_staff_id uuid references public.teaching_staff (id) on delete set null,
  teacher_name text,
  kind text not null default 'note',
  title text not null,
  body text,
  link_url text,
  file_path text,
  file_name text,
  file_mime text,
  file_size integer,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_resources_kind_check check (kind in ('note', 'file', 'image', 'link')),
  constraint class_resources_payload_check check (
    (kind = 'note' and coalesce(body, '') <> '')
    or (kind = 'link' and coalesce(link_url, '') <> '')
    or (kind in ('file', 'image') and coalesce(file_path, '') <> '')
  )
);

create index if not exists class_resources_class_idx
  on public.class_resources (class_code, stream, published_at desc);
create index if not exists class_resources_term_idx
  on public.class_resources (term_id, class_code, stream);
create index if not exists class_resources_published_idx
  on public.class_resources (published_at) where published_at is not null;

alter table public.class_resources enable row level security;

drop policy if exists class_resources_staff on public.class_resources;
create policy class_resources_staff on public.class_resources
  for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists class_resources_teacher_select on public.class_resources;
create policy class_resources_teacher_select on public.class_resources
  for select to authenticated
  using (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  );

drop policy if exists class_resources_teacher_write on public.class_resources;
create policy class_resources_teacher_write on public.class_resources
  for insert to authenticated
  with check (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  );

drop policy if exists class_resources_teacher_update on public.class_resources;
create policy class_resources_teacher_update on public.class_resources
  for update to authenticated
  using (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  )
  with check (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  );

drop policy if exists class_resources_teacher_delete on public.class_resources;
create policy class_resources_teacher_delete on public.class_resources
  for delete to authenticated
  using (
    exists (
      select 1 from public.teaching_staff t
      where t.profile_id = auth.uid() and t.active
    )
  );

drop policy if exists class_resources_student on public.class_resources;
create policy class_resources_student on public.class_resources
  for select to authenticated
  using (
    published_at is not null
    and exists (
      select 1 from public.students s
      where s.profile_id = auth.uid()
        and s.status = 'active'
        and s.class_code = class_resources.class_code
        and coalesce(s.stream, '') = coalesce(class_resources.stream, '')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-resources',
  'class-resources',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_read_class_resource_file(object_name text)
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
    )
    or exists (
      select 1
      from public.class_resources r
      join public.students s on s.profile_id = auth.uid() and s.status = 'active'
      where r.published_at is not null
        and s.class_code = r.class_code
        and coalesce(s.stream, '') = coalesce(r.stream, '')
        and (
          r.file_path = object_name
          or (
            object_name like 'inline/%'
            and (
              position(object_name in coalesce(r.body, '')) > 0
              or position(replace(object_name, '/', '%2F') in coalesce(r.body, '')) > 0
            )
          )
        )
    );
$$;

create or replace function public.can_write_class_resource_file()
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

drop policy if exists class_resources_files_read on storage.objects;
create policy class_resources_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'class-resources'
    and public.can_read_class_resource_file(name)
  );

drop policy if exists class_resources_files_insert on storage.objects;
create policy class_resources_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'class-resources'
    and public.can_write_class_resource_file()
  );

drop policy if exists class_resources_files_update on storage.objects;
create policy class_resources_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'class-resources'
    and public.can_write_class_resource_file()
  );

drop policy if exists class_resources_files_delete on storage.objects;
create policy class_resources_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'class-resources'
    and public.can_write_class_resource_file()
  );

grant execute on function public.can_read_class_resource_file(text) to authenticated;
grant execute on function public.can_write_class_resource_file() to authenticated;

commit;
