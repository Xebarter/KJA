-- Restore skill ↔ nursery-division links so Reception / Baby Class (and others)
-- get every active skill under domains already linked to that division.
-- Live data had rc_c2 left with only a handful of links while c3/c4 kept the full set.

insert into public.domain_division_links (domain_id, division_id)
select d.id, div.id
from public.developmental_domains d
cross join public.nursery_divisions div
where d.active = true
on conflict do nothing;

insert into public.skill_division_links (skill_id, division_id)
select sk.id, ddl.division_id
from public.developmental_skills sk
join public.developmental_domains d on d.id = sk.domain_id and d.active = true
join public.domain_division_links ddl on ddl.domain_id = d.id
where sk.active = true
on conflict do nothing;
