-- Set the campus of every learner currently on the roll to Kitante.
-- Graduated, transferred, withdrawn and left learners are left unchanged.

begin;

update public.students
set campus = 'Kitante'
where status = 'active'
  and campus is distinct from 'Kitante';

commit;
