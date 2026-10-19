-- A class can be taken off today's open-register count without deleting marks.

create table if not exists public.attendance_closures (
  attended_on date not null,
  class_code text not null,
  stream text not null default '',
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz not null default now(),
  primary key (attended_on, class_code, stream)
);

alter table public.attendance_closures enable row level security;

drop policy if exists attendance_closures_staff on public.attendance_closures;
create policy attendance_closures_staff on public.attendance_closures
  for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists attendance_closures_teacher on public.attendance_closures;
create policy attendance_closures_teacher on public.attendance_closures
  for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.fee_terms term
      where term.is_current
        and public.is_class_teacher(term.id, class_code, stream)
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.fee_terms term
      where term.is_current
        and public.is_class_teacher(term.id, class_code, stream)
    )
  );

grant select, insert, update, delete on public.attendance_closures to authenticated;
