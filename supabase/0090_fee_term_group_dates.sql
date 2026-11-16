-- Per class-group term dates (Nursery / Lower primary / Upper primary).
-- School-wide fee_terms.starts_on / ends_on / due_on stay the default;
-- a row here overrides only the fields that are set for that group.
-- Run after 0089. Safe to re-run.

begin;

create table if not exists public.fee_term_group_dates (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.fee_terms (id) on delete cascade,
  class_group text not null check (class_group in ('nursery', 'lower', 'upper')),
  starts_on date,
  ends_on date,
  due_on date,
  updated_at timestamptz not null default now(),
  unique (term_id, class_group),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists fee_term_group_dates_term_idx
  on public.fee_term_group_dates (term_id);

alter table public.fee_term_group_dates enable row level security;

drop policy if exists fee_term_group_dates_read on public.fee_term_group_dates;
create policy fee_term_group_dates_read on public.fee_term_group_dates
  for select to authenticated using (true);

drop policy if exists fee_term_group_dates_accounts on public.fee_term_group_dates;
create policy fee_term_group_dates_accounts on public.fee_term_group_dates
  for all to authenticated
  using ((select public.is_accounts_staff()))
  with check ((select public.is_accounts_staff()));

grant select, insert, update, delete on public.fee_term_group_dates to authenticated;

-- Map a register class code to nursery / lower / upper.
create or replace function public.fee_class_group(p_class text)
returns text
language sql
immutable
as $$
  select case
    when p_class in ('RC', 'C2', 'C3', 'C4') then 'nursery'
    when p_class in ('P1', 'P2', 'P3') then 'lower'
    when p_class in ('P4', 'P5', 'P6', 'P7') then 'upper'
    else null
  end;
$$;

-- Term invoices pick the group due date when set, else the school-wide due date.
drop function if exists public.generate_term_invoices(uuid, text[], boolean, text);
create or replace function public.generate_term_invoices(
  p_term uuid,
  p_classes text[] default null,
  p_dry_run boolean default true,
  p_status text default 'issued'
)
returns table (class_code text, pupils integer, to_bill integer, already_billed integer, no_rates integer, gross bigint, discounts bigint, net bigint)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  actor uuid := auth.uid();
  t record;
  pupil record;
  new_id uuid;
  made integer := 0;
  pupil_due date;
begin
  if not public.is_accounts_staff() then
    raise exception 'Only accounts staff can generate invoices.';
  end if;
  if p_status not in ('draft', 'issued') then
    raise exception 'Invoices can only be generated as drafts or issued.';
  end if;
  select * into t from public.fee_terms ft where ft.id = p_term;
  if not found then
    raise exception 'That term no longer exists.';
  end if;

  drop table if exists inv_pupils;
  drop table if exists inv_lines;
  drop table if exists inv_found;
  drop table if exists inv_discounts;

  -- Eldest first within each family, so younger siblings get the sibling discount.
  create temporary table inv_pupils on commit drop as
  with ranked as (
    select
      s.id,
      s.family_id,
      s.class_code,
      coalesce(s.campus, '') as campus,
      s.staff_child,
      row_number() over (partition by coalesce(s.family_id, s.id) order by c.sort_order desc, s.date_of_birth nulls last, s.id) as sib_pos
    from public.students s
    join public.school_classes c on c.code = s.class_code
    where s.status = 'active'
  )
  select
    r.*,
    exists (
      select 1 from public.invoices i
      where i.student_id = r.id and i.term_id = p_term and i.kind = 'term' and i.status <> 'void'
    ) as billed
  from ranked r
  where p_classes is null or cardinality(p_classes) = 0 or r.class_code = any (p_classes);

  create temporary table inv_lines on commit drop as
  select distinct on (p.id, r.item_id)
    p.id as student_id,
    r.item_id,
    i.name,
    i.kind as item_kind,
    i.sort_order,
    r.amount
  from inv_pupils p
  join public.fee_rates r on r.term_id = p_term and r.class_code = p.class_code and (r.campus = '' or lower(r.campus) = lower(p.campus))
  join public.fee_items i on i.id = r.item_id and i.active
  where not p.billed and r.amount > 0
  order by p.id, r.item_id, (r.campus = '');

  create temporary table inv_found on commit drop as
  select p.id as student_id, d.name as label, d.method, d.value
  from inv_pupils p
  join public.discount_rules d on d.active and (
    (d.kind = 'sibling' and p.family_id is not null and p.sib_pos >= d.sibling_from)
    or (d.kind = 'staff' and p.staff_child)
  )
  where not p.billed
  union all
  select sd.student_id, sd.label, sd.method, sd.value
  from public.student_discounts sd
  join inv_pupils p on p.id = sd.student_id and not p.billed
  where sd.term_id is null or sd.term_id = p_term;

  -- Discounts come off tuition only and never take it below zero.
  create temporary table inv_discounts on commit drop as
  with tuition as (
    select l.student_id, sum(l.amount)::bigint as base from inv_lines l where l.item_kind = 'tuition' group by l.student_id
  ), raw as (
    select
      f.student_id,
      f.label,
      tu.base,
      (case when f.method = 'percent' then round(tu.base * f.value / 100) else f.value end)::bigint as wanted
    from inv_found f
    join tuition tu on tu.student_id = f.student_id
    where tu.base > 0
  ), capped as (
    select
      raw.*,
      greatest(0, least(raw.wanted, raw.base - coalesce(sum(raw.wanted) over (partition by raw.student_id order by raw.label rows between unbounded preceding and 1 preceding), 0))) as amount
    from raw
  )
  select student_id, label, amount::integer as amount from capped where amount > 0;

  if not p_dry_run then
    for pupil in
      select p.* from inv_pupils p
      where not p.billed and exists (select 1 from inv_lines l where l.student_id = p.id)
    loop
      select coalesce(
        (
          select g.due_on
          from public.fee_term_group_dates g
          where g.term_id = p_term
            and g.class_group = public.fee_class_group(pupil.class_code)
            and g.due_on is not null
        ),
        t.due_on
      ) into pupil_due;

      insert into public.invoices (student_id, family_id, term_id, kind, status, class_code, campus, due_on, created_by)
      values (pupil.id, pupil.family_id, p_term, 'term', p_status, pupil.class_code, nullif(pupil.campus, ''), pupil_due, actor)
      returning id into new_id;

      insert into public.invoice_lines (invoice_id, item_id, kind, description, amount, position)
      select new_id, l.item_id, 'charge', l.name, l.amount, (row_number() over (order by l.sort_order, l.name))::smallint
      from inv_lines l where l.student_id = pupil.id;

      insert into public.invoice_lines (invoice_id, kind, description, amount, position)
      select new_id, 'discount', d.label, -d.amount, (100 + row_number() over (order by d.label))::smallint
      from inv_discounts d where d.student_id = pupil.id;

      made := made + 1;
    end loop;

    if made > 0 then
      insert into public.account_activity (actor_id, kind, entity, entity_id, body)
      values (actor, 'invoice', 'term', p_term, 'Generated ' || made || ' term invoice' || case when made = 1 then '' else 's' end || ' for ' || t.label
        || case when p_status = 'draft' then ' as drafts' else '' end);
    end if;
  end if;

  return query
  select
    p.class_code,
    count(*)::integer,
    (count(*) filter (where not p.billed and l.total is not null))::integer,
    (count(*) filter (where p.billed))::integer,
    (count(*) filter (where not p.billed and l.total is null))::integer,
    coalesce(sum(l.total) filter (where not p.billed), 0)::bigint,
    coalesce(sum(d.total) filter (where not p.billed), 0)::bigint,
    (coalesce(sum(l.total) filter (where not p.billed), 0) - coalesce(sum(d.total) filter (where not p.billed), 0))::bigint
  from inv_pupils p
  join public.school_classes c on c.code = p.class_code
  left join (select student_id, sum(amount) as total from inv_lines group by student_id) l on l.student_id = p.id
  left join (select student_id, sum(amount) as total from inv_discounts group by student_id) d on d.student_id = p.id
  group by p.class_code, c.sort_order
  order by c.sort_order;
end;
$$;

commit;
