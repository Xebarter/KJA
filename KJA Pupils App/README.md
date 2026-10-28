# KJA Pupils

Mobile companion to the Kampala Junior Academy student portal. Pupils sign in with the same email and password the office creates for the website.

Homework, Home and Chart stay in the footer. Timetable, attendance, reports, class, clubs, calendar, messages, notifications and the student card live in the menu.

## Setup (once)

Copy the website’s public Supabase values into `.env` in this folder:

```bash
# From the KJA website .env:
SUPABASE_URL=…          # same as NEXT_PUBLIC_SUPABASE_URL
SUPABASE_ANON_KEY=…     # same as NEXT_PUBLIC_SUPABASE_ANON_KEY
```

There is already a `.env.example`. Do not put the service-role key in this app.

## Run

```bash
cd "KJA Pupils App"
flutter run -d chrome
```

With `.env` present the app opens on the pupil sign-in screen — no project URL / anon key prompts.

Release / CI builds can also inject keys without shipping a file:

```bash
flutter run -d chrome --dart-define-from-file=.env
# or
flutter build apk --dart-define-from-file=.env
```

## Android release APK

1. Keep a filled `.env` in this folder (bundled as an asset). Use production `KJA_SITE_URL=https://kja.ug`.
2. Optional production signing: copy `android/key.properties.example` → `android/key.properties`, point `storeFile` at your `.jks`, then rebuild. Without it, the release APK is signed with the debug key (fine for sideload tests).
3. Build:

```bash
cd "KJA Pupils App"
flutter pub get
flutter build apk --release
```

APK path: `build/app/outputs/flutter-apk/app-release.apk`.

“Look around with a sample pupil” opens example data without contacting the school.

## What it uses

The app reads and writes the same Supabase tables as the website portal: the linked pupil, homework, timetable, attendance, clubs, teachers, calendar, published reports, notices and classmate messages. Chat uses the same word filter, and new messages arrive live when Realtime is enabled for `student_messages`.
