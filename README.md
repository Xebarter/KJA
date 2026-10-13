# Kampala Junior Academy

Next.js site for Kampala Junior Academy. Public pages read Supabase when it is configured, and otherwise use the imported content in `data/content.json`. Staff manage the site at `/admin`. Parents use `/account`.

## Setup

1. Create a Supabase project.
2. In the SQL editor, run the scripts in `supabase/` in filename order: `0001_schema.sql`, `0002_seed.sql`, `0003_parent_portal.sql`, `0004_admissions.sql`, `0005_stories.sql`, `0006_vacancies.sql`, `0007_job_applications.sql`, `0008_admission_payments.sql`, `0009_payment_followups.sql`.
3. In Storage, confirm the public `media` bucket and the private `job-applications` bucket (for applicants' CVs) exist. The scripts create both.
4. In Authentication, enable Email and Google providers. For Google, add the redirect URL `https://YOUR-DOMAIN/auth/callback`.
5. Create the first admin: sign up through "Parent portal" on the site (or add an Auth user), then run:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

After that, admins add each other from **Admin → Team**.

6. Copy `.env.example` to `.env.local` and fill in the project URL, anon key, and service role key.
7. For email alerts, add either `RESEND_API_KEY` or the `SMTP_*` settings, plus `EMAIL_FROM`. Every admin on **Admin → Team** is then emailed when a parent sends in an admission application and when someone applies for a job (CV attached). Use **Send me a test email** on the Team page to check delivery.

```bash
npm install
npm run dev
```

Open `/` for the site, `/admin` for staff, and `/account` for the parent portal.

## Student register

The register (students, families, parents and every emergency contact) is imported from the school system's export. Put the export in the project root as `students.csv`, then run:

```bash
node scripts/import-students.mjs
```

This writes numbered scripts to `supabase/0010_student_register/`, each small enough for the Supabase SQL editor. Run them in order (`01_schema.sql` first). Each part is its own transaction, so if one fails, fix the problem and re-run that part. It's safe to run them again with a newer export: students are matched by student number and updated in place. The CSV and the generated scripts hold children's personal and medical details, so they're kept out of git.

## Refresh content from the current WordPress site

```bash
npm run import
```

That rewrites `data/content.json` and `supabase/0002_seed.sql`. Re-run the seed (then `0005_stories.sql`) in Supabase if you want the database to match.
