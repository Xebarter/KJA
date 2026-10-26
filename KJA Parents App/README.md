# KJA Parents

Flutter parent portal for Kampala Junior Academy — mirrors the website `/account` experience.

## Setup

1. Copy `.env.example` to `.env` and fill with the same **public** keys as the website:

```bash
SUPABASE_URL=…
SUPABASE_ANON_KEY=…
KJA_SITE_URL=https://kja.ug
```

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

School fee and club **Mobile Money** payments stay in the app (PIN prompt). Admission payments still open in the website browser (`KJA_SITE_URL`).

## App icon

Navy (`#1A3A5C`) adaptive background — distinct from the white Pupils app icon.

```bash
dart run flutter_launcher_icons
```

## Package

- Dart package: `kja_parents`
- Android / iOS application id: `ug.ac.kja.kja_parents`
