# KJA Parents

Flutter parent portal for Kampala Junior Academy — mirrors the website `/account` experience.

## Setup

1. Copy `.env.example` to `.env` and fill with the same **public** keys as the website:

```bash
SUPABASE_URL=…
SUPABASE_ANON_KEY=…
KJA_SITE_URL=https://kja-phi.vercel.app
```

`KJA_SITE_URL` must be the Next.js site (Vercel), not WordPress `https://kja.ug`. Admission, club and school-fee Mobile Money calls go to `/api/parents/*` on that host.

Never put the service-role key in the app.

2. Install and run:

```bash
cd "KJA Parents App"
flutter pub get
flutter run
```

## Navigation

- **Dock:** Children · Home · Communications
- **Header menu:** Reports, School fees, Applications, Clubs, Calendar, Notifications, My details
- **Header bell:** Notifications

Mobile Money for **applications**, **clubs** and **school fees** stays in the app (PIN prompt on the phone). Status is polled from the Next.js API while you wait.

## App icon

Premium blue (`#0A2F5C`) adaptive background — crest recolored sapphire/navy with champagne gold accents.

```bash
dart run flutter_launcher_icons
```

## Package

- Dart package: `kja_parents`
- Android / iOS application id: `ug.ac.kja.kja_parents`
