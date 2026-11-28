-- Allow any number of co-curricular ("Other") subjects per class on report cards
-- instead of capping report_card_activities.slot and primary_activity_comments.slot at 4.
-- Safe to re-run.

begin;

do $$
declare
  c record;
begin
  if to_regclass('public.report_card_activities') is not null then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.report_card_activities'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%slot%'
    loop
      execute format('alter table public.report_card_activities drop constraint if exists %I', c.conname);
    end loop;
    alter table public.report_card_activities
      add constraint report_card_activities_slot_check check (slot >= 1);
  end if;

  if to_regclass('public.primary_activity_comments') is not null then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.primary_activity_comments'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%slot%'
    loop
      execute format('alter table public.primary_activity_comments drop constraint if exists %I', c.conname);
    end loop;
    alter table public.primary_activity_comments
      add constraint primary_activity_comments_slot_check check (slot >= 1);
  end if;
end $$;

commit;
