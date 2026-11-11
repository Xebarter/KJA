-- One-time cleanup: drop open nursery developmental papers with no progress codes.
-- These include sittings mirrored from primary-only assessments onto every nursery class.
-- Re-run Academics → Set assessment with nursery classes in scope to recreate intentional papers.

delete from public.developmental_assessments d
where d.status = 'open'
  and not exists (
    select 1
    from public.skill_ratings r
    where r.assessment_id = d.id
      and r.progress_code_id is not null
  );
