-- Stories upgrade: editorial fields, scheduling and draft privacy for
-- news, posts (blog), alumni_news and alumni_stories.
-- Run after 0001_schema.sql and 0002_seed.sql (it backfills seeded stories). Safe to run more than once.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['news','posts','alumni_news','alumni_stories']
  loop
    execute format('alter table public.%I add column if not exists category text', tbl);
    execute format('alter table public.%I add column if not exists tags text[] not null default ''{}''', tbl);
    execute format('alter table public.%I add column if not exists featured boolean not null default false', tbl);
    execute format('alter table public.%I add column if not exists seo_title text', tbl);
    execute format('alter table public.%I add column if not exists seo_description text', tbl);
    -- Left empty until a real edit so imported stories never read as "updated".
    execute format('alter table public.%I add column if not exists updated_at timestamptz', tbl);
    execute format('alter table public.%I alter column published_at set default now()', tbl);
    execute format('alter table public.%I alter column author set default ''Mukisa-KJA''', tbl);

    execute format('drop trigger if exists %I on public.%I', tbl || '_touch', tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', tbl || '_touch', tbl);

    execute format('create index if not exists %I on public.%I (published, published_at desc)', tbl || '_published_idx', tbl);
    execute format('create index if not exists %I on public.%I (featured) where featured', tbl || '_featured_idx', tbl);
    execute format('create index if not exists %I on public.%I using gin (tags)', tbl || '_tags_idx', tbl);

    -- Visitors only see live stories; admins also see drafts and scheduled ones.
    execute format('drop policy if exists %I on public.%I', tbl || '_read', tbl);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using ((published and (published_at is null or published_at <= now())) or public.is_admin())',
      tbl || '_read', tbl
    );
  end loop;
end $$;

-- Give undated stories a publish date so ordering is stable (without marking them edited).
do $$
declare
  tbl text;
begin
  foreach tbl in array array['news','posts','alumni_news','alumni_stories']
  loop
    execute format('alter table public.%I disable trigger %I', tbl, tbl || '_touch');
    execute format('update public.%I set published_at = created_at where published_at is null', tbl);
    if tbl = 'posts' then
      update public.posts
      set
        seo_title = coalesce(seo_title, 'KJA Alumna Okaka Natania to Represent Uganda at International Mathematics Competition 2026'),
        tags = case when cardinality(tags) = 0 then array[
          'International student representation Uganda','Kampala Junior Academy alumni','Kampala students education',
          'Math champion Uganda','Uganda education news','Uganda mathematics competition','Uganda mathematics talent',
          'Uganda student achievement','Uganda young mathematician','Ugandan students excellence'
        ] else tags end
      where slug = 'natania-an-alumni-is-to-represent-uganda-at-the-international-mathematics-competitions-an-alumni-of-ours';
    end if;
    execute format('alter table public.%I enable trigger %I', tbl, tbl || '_touch');
  end loop;
end $$;
