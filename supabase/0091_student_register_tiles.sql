-- One round-trip for the Students register summary tiles.
-- Counts the tile scope (status / section / class / stream / house / campus) without
-- re-running six head queries against student_directory on every search keystroke.
-- Run after 0090. Safe to re-run.

begin;

create or replace function public.student_register_tiles(
  p_status text default 'active',
  p_section text default null,
  p_class text default null,
  p_stream text default null,
  p_house text default null,
  p_campus text default null,
  p_campuses text[] default null
)
returns table (
  total bigint,
  boys bigint,
  girls bigint,
  medical bigint,
  staff bigint,
  review bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as total,
    count(*) filter (where s.sex = 'M')::bigint as boys,
    count(*) filter (where s.sex = 'F')::bigint as girls,
    count(*) filter (where s.medical_notes is not null)::bigint as medical,
    count(*) filter (where s.staff_child is true)::bigint as staff,
    count(*) filter (where cardinality(coalesce(s.import_notes, '{}'::text[])) > 0)::bigint as review
  from public.students s
  left join public.school_classes c on c.code = s.class_code
  where
    (p_status is null or p_status = '' or p_status = 'all' or s.status = p_status)
    and (p_section is null or p_section = '' or c.section = p_section)
    and (p_class is null or p_class = '' or s.class_code = p_class)
    and (p_stream is null or p_stream = '' or s.stream = p_stream)
    and (
      p_house is null or p_house = ''
      or (p_house = 'none' and s.house is null)
      or (p_house <> 'none' and s.house = p_house)
    )
    and (
      case
        when p_campus is not null and p_campus <> '' then s.campus = p_campus
        when p_campuses is not null then s.campus = any (p_campuses)
        else true
      end
    );
$$;

grant execute on function public.student_register_tiles(text, text, text, text, text, text, text[])
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
