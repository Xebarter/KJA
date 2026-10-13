-- Faster admissions office queries. Run after 0011_admissions_office.sql (safe to re-run).
--
-- Policies written as `using (public.is_admissions_staff())` make Postgres call the function, and so
-- look up the caller's profile, once for every row it reads. The student register view joins five
-- tables and counts siblings per student, so one search could make thousands of these calls.
-- Wrapping the call in a sub-select lets Postgres run it once per query and reuse the answer.
-- Access rules are unchanged.

begin;

-- ---------------------------------------------------------------- student register

do $$
declare
  tbl text;
begin
  foreach tbl in array array['school_classes', 'families', 'guardians', 'family_contacts', 'students']
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_office', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_admissions_staff())) with check ((select public.is_admissions_staff()))',
      tbl || '_office', tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------- applications

drop policy if exists applications_admin on public.applications;
create policy applications_admin on public.applications for select to authenticated
  using ((select public.is_admissions_staff()));
drop policy if exists applications_own_read on public.applications;
create policy applications_own_read on public.applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admissions_staff()));
drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications for update to authenticated
  using ((select public.is_admissions_staff())) with check ((select public.is_admissions_staff()));
drop policy if exists applications_delete on public.applications;
create policy applications_delete on public.applications for delete to authenticated
  using ((select public.is_admissions_staff()));

drop policy if exists activity_select on public.application_activity;
create policy activity_select on public.application_activity for select to authenticated
  using ((select public.is_admissions_staff()));
drop policy if exists activity_insert on public.application_activity;
create policy activity_insert on public.application_activity for insert to authenticated
  with check ((select public.is_admissions_staff()) and actor_id = (select auth.uid()));
drop policy if exists activity_delete on public.application_activity;
create policy activity_delete on public.application_activity for delete to authenticated
  using ((select public.is_admissions_staff()) and actor_id = (select auth.uid()) and kind = 'note');

drop policy if exists admission_payments_select on public.admission_payments;
create policy admission_payments_select on public.admission_payments for select to authenticated
  using ((select public.is_admissions_staff()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or ((select public.is_admissions_staff()) and role in ('admin', 'admissions'))
  );

-- ---------------------------------------------------------------- student timeline and duplicates

drop policy if exists student_activity_select on public.student_activity;
create policy student_activity_select on public.student_activity for select to authenticated
  using ((select public.is_admissions_staff()));
drop policy if exists student_activity_insert on public.student_activity;
create policy student_activity_insert on public.student_activity for insert to authenticated
  with check ((select public.is_admissions_staff()) and actor_id = (select auth.uid()));
drop policy if exists student_activity_delete on public.student_activity;
create policy student_activity_delete on public.student_activity for delete to authenticated
  using ((select public.is_admissions_staff()) and actor_id = (select auth.uid()) and kind = 'note');

drop policy if exists duplicate_dismissals_office on public.student_duplicate_dismissals;
create policy duplicate_dismissals_office on public.student_duplicate_dismissals for all to authenticated
  using ((select public.is_admissions_staff())) with check ((select public.is_admissions_staff()));

-- ---------------------------------------------------------------- indexes for the directory joins

create index if not exists guardians_family_relationship_idx on public.guardians (family_id, relationship);

commit;
