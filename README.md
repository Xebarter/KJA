# Kampala Junior Academy

Next.js site for Kampala Junior Academy. Public pages read Supabase when it is configured, and otherwise use the imported content in `data/content.json`. Staff manage the site at `/admin`. Parents use `/account`.

## Setup

1. Create a Supabase project.
2. In the SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`, then `supabase/parent-portal.sql`.
3. In Storage, confirm the public `media` bucket exists (the schema creates it).
4. In Authentication, enable Email and Google providers. For Google, add the redirect URL `https://YOUR-DOMAIN/auth/callback`.
5. Create a staff Auth user and run:

```sql
insert into public.profiles (id, role) values ('USER_UUID', 'admin');
```

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

That rewrites `data/content.json` and `supabase/seed.sql`. Re-run the seed in Supabase if you want the database to match.
