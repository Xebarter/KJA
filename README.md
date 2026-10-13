# Kampala Junior Academy

Next.js site for Kampala Junior Academy. Public pages read Supabase when it is configured, and otherwise use the imported content in `data/content.json`. Staff manage the site at `/admin`. Parents use `/account`.

## Setup

1. Create a Supabase project.
2. In the SQL editor, run the scripts in `supabase/` in filename order: `0001_schema.sql`, `0002_seed.sql`, `0003_parent_portal.sql`, `0004_admissions.sql`, `0005_stories.sql`.
3. In Storage, confirm the public `media` bucket exists (the schema creates it).
4. In Authentication, enable Email and Google providers. For Google, add the redirect URL `https://YOUR-DOMAIN/auth/callback`.
5. Create the first admin: sign up through "Parent portal" on the site (or add an Auth user), then run:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

After that, admins add each other from **Admin → Team**.

6. Copy `.env.example` to `.env.local` and fill in the project URL, anon key, and service role key.

```bash
npm install
npm run dev
```

Open `/` for the site, `/admin` for staff, and `/account` for the parent portal.

## Refresh content from the current WordPress site

```bash
npm run import
```

That rewrites `data/content.json` and `supabase/0002_seed.sql`. Re-run the seed (then `0005_stories.sql`) in Supabase if you want the database to match.
