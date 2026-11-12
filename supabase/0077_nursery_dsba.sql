-- Nursery Developmental Skills-Based Assessment (DSBA).
-- Replaces nursery subject/marks/band model for RC–C4 with domains → skills → progress codes.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------- progress scales

create table if not exists public.progress_scales (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.progress_codes (
  id uuid primary key default gen_random_uuid(),
  scale_id uuid not null references public.progress_scales (id) on delete cascade,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  unique (scale_id, code)
);

-- ---------------------------------------------------------------- nursery divisions

create table if not exists public.nursery_divisions (
  id text primary key check (id in ('rc_c2', 'c3', 'c4')),
  label text not null,
  class_codes text[] not null,
  progress_scale_id uuid references public.progress_scales (id) on delete set null,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------- domains & skills

create table if not exists public.developmental_domains (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.developmental_skills (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.developmental_domains (id) on delete cascade,
  description text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.domain_division_links (
  domain_id uuid not null references public.developmental_domains (id) on delete cascade,
  division_id text not null references public.nursery_divisions (id) on delete cascade,
  primary key (domain_id, division_id)
);

create table if not exists public.skill_division_links (
  skill_id uuid not null references public.developmental_skills (id) on delete cascade,
  division_id text not null references public.nursery_divisions (id) on delete cascade,
  primary key (skill_id, division_id)
);

create index if not exists developmental_skills_domain_idx on public.developmental_skills (domain_id, sort_order);
create index if not exists domain_division_links_div_idx on public.domain_division_links (division_id);
create index if not exists skill_division_links_div_idx on public.skill_division_links (division_id);

-- ---------------------------------------------------------------- assessments & ratings

create table if not exists public.developmental_assessments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  campus text not null default 'Kitante',
  class_code text not null,
  stream text not null default '',
  name text not null,
  kind text not null default 'endterm' check (kind in ('bot', 'midterm', 'endterm', 'test')),
  held_on date,
  status text not null default 'open' check (status in ('open', 'submitted', 'approved')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (term_id, campus, class_code, stream, name)
);

create index if not exists developmental_assessments_class_idx
  on public.developmental_assessments (term_id, campus, class_code, stream);

create table if not exists public.skill_ratings (
  assessment_id uuid not null references public.developmental_assessments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  skill_id uuid not null references public.developmental_skills (id) on delete cascade,
  progress_code_id uuid references public.progress_codes (id) on delete set null,
  note text,
  updated_at timestamptz not null default now(),
  primary key (assessment_id, student_id, skill_id)
);

create index if not exists skill_ratings_student_idx on public.skill_ratings (student_id);
create index if not exists skill_ratings_skill_idx on public.skill_ratings (skill_id);

-- ---------------------------------------------------------------- report freeze

create table if not exists public.report_skill_lines (
  report_card_id uuid not null references public.report_cards (id) on delete cascade,
  skill_id uuid not null,
  domain_id uuid,
  domain_name text not null,
  skill_description text not null,
  progress_code text,
  progress_label text,
  domain_sort integer not null default 0,
  skill_sort integer not null default 0,
  primary key (report_card_id, skill_id)
);

create index if not exists report_skill_lines_card_idx
  on public.report_skill_lines (report_card_id, domain_sort, skill_sort);

alter table public.report_cards
  add column if not exists progress_legend jsonb;

-- ---------------------------------------------------------------- RLS

alter table public.progress_scales enable row level security;
alter table public.progress_codes enable row level security;
alter table public.nursery_divisions enable row level security;
alter table public.developmental_domains enable row level security;
alter table public.developmental_skills enable row level security;
alter table public.domain_division_links enable row level security;
alter table public.skill_division_links enable row level security;
alter table public.developmental_assessments enable row level security;
alter table public.skill_ratings enable row level security;
alter table public.report_skill_lines enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'progress_scales', 'progress_codes', 'nursery_divisions',
    'developmental_domains', 'developmental_skills',
    'domain_division_links', 'skill_division_links'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_staff', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_academics_staff())) with check ((select public.is_academics_staff()))',
      tbl || '_staff', tbl
    );
    execute format('drop policy if exists %I on public.%I', tbl || '_teacher', tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_linked_teacher()))',
      tbl || '_teacher', tbl
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end $$;

drop policy if exists developmental_assessments_staff on public.developmental_assessments;
create policy developmental_assessments_staff on public.developmental_assessments for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists developmental_assessments_teacher_read on public.developmental_assessments;
create policy developmental_assessments_teacher_read on public.developmental_assessments for select to authenticated
  using (
    (select public.is_linked_teacher())
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

drop policy if exists developmental_assessments_teacher_update on public.developmental_assessments;
create policy developmental_assessments_teacher_update on public.developmental_assessments for update to authenticated
  using (
    (select public.is_linked_teacher())
    and status = 'open'
    and public.is_class_teacher(term_id, class_code, stream, campus)
  )
  with check (
    (select public.is_linked_teacher())
    and status in ('open', 'submitted')
    and public.is_class_teacher(term_id, class_code, stream, campus)
  );

drop policy if exists skill_ratings_staff on public.skill_ratings;
create policy skill_ratings_staff on public.skill_ratings for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists skill_ratings_teacher_read on public.skill_ratings;
create policy skill_ratings_teacher_read on public.skill_ratings for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.developmental_assessments paper
      where paper.id = skill_ratings.assessment_id
        and public.is_class_teacher(paper.term_id, paper.class_code, paper.stream, paper.campus)
    )
  );

drop policy if exists skill_ratings_teacher_write on public.skill_ratings;
create policy skill_ratings_teacher_write on public.skill_ratings for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.developmental_assessments paper
      where paper.id = skill_ratings.assessment_id
        and paper.status = 'open'
        and public.is_class_teacher(paper.term_id, paper.class_code, paper.stream, paper.campus)
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.developmental_assessments paper
      where paper.id = skill_ratings.assessment_id
        and paper.status = 'open'
        and public.is_class_teacher(paper.term_id, paper.class_code, paper.stream, paper.campus)
    )
  );

drop policy if exists report_skill_lines_staff on public.report_skill_lines;
create policy report_skill_lines_staff on public.report_skill_lines for all to authenticated
  using ((select public.is_academics_staff()))
  with check ((select public.is_academics_staff()));

drop policy if exists report_skill_lines_teacher_read on public.report_skill_lines;
create policy report_skill_lines_teacher_read on public.report_skill_lines for select to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_skill_lines.report_card_id
        and public.is_class_teacher(card.term_id, card.class_code, card.stream, card.campus)
    )
  );

drop policy if exists report_skill_lines_teacher_write on public.report_skill_lines;
create policy report_skill_lines_teacher_write on public.report_skill_lines for all to authenticated
  using (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_skill_lines.report_card_id
        and card.status = 'draft'
        and public.is_class_teacher(card.term_id, card.class_code, card.stream, card.campus)
    )
  )
  with check (
    (select public.is_linked_teacher())
    and exists (
      select 1 from public.report_cards card
      where card.id = report_skill_lines.report_card_id
        and card.status = 'draft'
        and public.is_class_teacher(card.term_id, card.class_code, card.stream, card.campus)
    )
  );

-- Parents / students can read skill lines on published cards (mirror report_lines).
drop policy if exists report_skill_lines_parent on public.report_skill_lines;
create policy report_skill_lines_parent on public.report_skill_lines for select to authenticated
  using (
    exists (
      select 1 from public.report_cards card
      where card.id = report_skill_lines.report_card_id
        and card.status = 'published'
        and card.student_id in (select public.my_student_ids())
    )
  );

grant select, insert, update, delete on public.developmental_assessments to authenticated;
grant select, insert, update, delete on public.skill_ratings to authenticated;
grant select, insert, update, delete on public.report_skill_lines to authenticated;

-- ---------------------------------------------------------------- seeds: scales & codes

insert into public.progress_scales (key, name, sort_order)
values ('nursery', 'Progress codes', 1)
on conflict (key) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.progress_codes (scale_id, code, label, sort_order)
select s.id, v.code, v.label, v.sort_order
from public.progress_scales s
join (
  values
    ('nursery', 'M', 'Strong mastery', 1),
    ('nursery', 'S', 'Satisfactory Progress', 2),
    ('nursery', 'D', 'Developing', 3),
    ('nursery', 'NP', 'Needs more practice', 4),
    ('nursery', '+', 'Stronger', 5),
    ('nursery', '-', 'Weaker', 6),
    ('nursery', 'P', 'Progressing', 7),
    ('nursery', 'A', 'Area needs growth', 8),
    ('nursery', 'I', 'Improving', 9),
    ('nursery', 'NA', 'Not applicable', 10),
    ('nursery', 'NT', 'Not taught', 11)
) as v(scale_key, code, label, sort_order) on v.scale_key = s.key
on conflict (scale_id, code) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.nursery_divisions (id, label, class_codes, progress_scale_id, sort_order)
select v.id, v.label, v.class_codes::text[], s.id, v.sort_order
from (
  values
    ('rc_c2', 'Reception & Baby Class', array['RC', 'C2'], 1),
    ('c3', 'Middle Class', array['C3'], 2),
    ('c4', 'Top Class', array['C4'], 3)
) as v(id, label, class_codes, sort_order)
cross join public.progress_scales s
where s.key = 'nursery'
on conflict (id) do update
  set label = excluded.label,
      class_codes = excluded.class_codes,
      sort_order = excluded.sort_order,
      progress_scale_id = excluded.progress_scale_id;

-- ---------------------------------------------------------------- seeds: domains & skills (from additems.txt)

insert into public.developmental_domains (code, name, sort_order, active)
values
  ('FUNC', 'Functional / Living Skills', 1, true),
  ('WRITE', 'Writing Skills', 2, true),
  ('LANG', 'Language Skills', 3, true),
  ('MATH', 'Maths Skills', 4, true),
  ('SOC', 'Personal & Social Development', 5, true),
  ('PHYS', 'Physical and Motor Skills', 6, true),
  ('ART', 'Creative Art', 7, true),
  ('MUSIC', 'Music', 8, true)
on conflict (code) do update set name = excluded.name, sort_order = excluded.sort_order, active = true;

-- Link all domains to all three divisions
insert into public.domain_division_links (domain_id, division_id)
select d.id, div.id
from public.developmental_domains d
cross join public.nursery_divisions div
where d.code in ('FUNC', 'WRITE', 'LANG', 'MATH', 'SOC', 'PHYS', 'ART', 'MUSIC')
on conflict do nothing;

-- Skills: insert only when domain has no skills yet (idempotent-ish)
do $$
declare
  rec record;
  skill text;
  skills text[];
  ord integer;
  sid uuid;
begin
  for rec in
    select id, code from public.developmental_domains
    where code in ('FUNC', 'WRITE', 'LANG', 'MATH', 'SOC', 'PHYS', 'ART', 'MUSIC')
  loop
    if exists (select 1 from public.developmental_skills where domain_id = rec.id) then
      continue;
    end if;

    skills := case rec.code
      when 'FUNC' then array[
        'Recites full name',
        'Tells his/her gender',
        'Tells his/her likes & dislikes',
        'Knows area of residence',
        'Asks and answers questions',
        'Names parents'
      ]
      when 'WRITE' then array[
        'Likes to pretend to write',
        'Holds writing implements like crayons, painting brushes',
        'Understands that print carries a message',
        'Matches pictures to letter sounds',
        'Traces lowercase letters',
        'Colours within a shape',
        'Copies simple shapes and patterns',
        'Writes lowercase letters'
      ]
      when 'LANG' then array[
        'Can express him/herself in vernacular',
        'Can express him/herself in English',
        'Has an increasing vocabulary of words',
        'Likes to look at picture books',
        'Likes to pretend to read books',
        'Understands that pictures carry a message',
        'Can tell a simple story from interpreting the pictures',
        'Can identify characters in a story using pictures',
        'Listens to short stories and answers questions',
        'Can pronounce sounds of letters',
        'Relates letter sounds to pictures',
        'Follows simple instructions'
      ]
      when 'MATH' then array[
        'Counts by rote to 10',
        'Recognizes numbers up to 5',
        'Writes/traces numbers up to 5',
        'Counts objects up to 5 and writes/traces the number',
        'Recites the days of the week',
        'Identifies and describes shapes like circle, triangle, square',
        'Recognizes and associates colours with objects',
        'Compares height i.e. tall, short',
        'Compares size i.e. big, small',
        'Compares length i.e. long, short',
        'Compares volume: full, empty',
        'Tells position left, right',
        'Tells position i.e. top, bottom',
        'Tells position i.e. front, middle, back'
      ]
      when 'SOC' then array[
        'Can be away from home without being upset',
        'Looks after own toilet needs',
        'Feels good about self',
        'Listens attentively',
        'Talks easily',
        'Likes teachers',
        'Gets along with other children',
        'Plays with other children',
        'Meets visitors without shyness',
        'Enters into conversation with other children',
        'Enters into conversation with adults',
        'Shares with others',
        'Cares for own belongings',
        'Respects authority',
        'Maintains self control',
        'Is helpful in class i.e. puts away toys',
        'Is able to stay on a task',
        'Is able to work independently'
      ]
      when 'PHYS' then array[
        'Balances on one foot for 5 seconds',
        'Hops on spot',
        'Has increasing wrist control i.e. turns, twists, bends',
        'Jumps in place and off low objects such as steps',
        'Moves around obstacles with balance and direction',
        'Walks along a line on the floor/beam',
        'Throws a ball a short distance with accuracy'
      ]
      when 'ART' then array[
        'Paints and colours within a given picture',
        'Reads and draws simple pictures',
        'Identifies cuttings and sticks appropriately',
        'Uses writing and drawing tools with increasing control',
        'Uses playdough to model different shapes',
        'Works confidently with a variety of materials',
        'Identifies and names some colours'
      ]
      when 'MUSIC' then array[
        'Likes singing',
        'Follows action songs',
        'Claps hands in a set rhythm',
        'Recalls songs, chants and rhymes with ease',
        'Enjoys listening to music',
        'Gets involved in dancing',
        'Can perform in front of an audience'
      ]
      else array[]::text[]
    end;

    ord := 0;
    foreach skill in array skills
    loop
      ord := ord + 1;
      insert into public.developmental_skills (domain_id, description, sort_order, active)
      values (rec.id, skill, ord, true)
      returning id into sid;

      insert into public.skill_division_links (skill_id, division_id)
      select sid, div.id from public.nursery_divisions div
      on conflict do nothing;
    end loop;
  end loop;
end $$;

-- Ensure skill↔division links exist for any skills already present
insert into public.skill_division_links (skill_id, division_id)
select sk.id, div.id
from public.developmental_skills sk
join public.developmental_domains d on d.id = sk.domain_id
cross join public.nursery_divisions div
where d.code in ('FUNC', 'WRITE', 'LANG', 'MATH', 'SOC', 'PHYS', 'ART', 'MUSIC')
on conflict do nothing;

-- Deactivate legacy nursery core subjects (historical assessments/reports remain)
update public.subjects
set active = false
where code in ('NUR-LANG', 'NUR-LIT', 'NUR-NUM', 'NUR-READ', 'NUR-ART', 'NUR-OUT', 'NUR-RE')
  and section = 'nursery';

commit;
