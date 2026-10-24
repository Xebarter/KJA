# KJA Staff Desktop

Windows Electron shell that runs the **same** Next.js staff desks as the website (Admin, Admissions, Accounts, Academics, Teacher). Pages, CSS, and server actions are not reimplemented — they load from a local Next process. A loopback Supabase proxy (SQLite via `sql.js`, so the `Desktop App` folder name with spaces is fine) adds instant reads, offline cache, and a write outbox.

## Architecture

```
Electron splash → local Next (127.0.0.1:47322)
                      ↓
              Supabase proxy (127.0.0.1:47321)
                      ↓
              SQLite cache + outbox  →  real Supabase
```

- `NEXT_PUBLIC_SUPABASE_URL` inside the desktop Next process is the proxy URL.
- The real project URL is `KJA_UPSTREAM_SUPABASE_URL` (falls back to `NEXT_PUBLIC_SUPABASE_URL` from the website `.env` / `.env.local` when that value is not already the proxy).

## Setup

1. Install Node 20+ and npm.
2. From the **website** repo root, ensure `.env` or `.env.local` has:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…   # optional; used by Next server routes only
```

Optionally set an explicit upstream for the desktop proxy:

```env
KJA_UPSTREAM_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
```

3. From this folder:

```bash
npm install
npm run dev
```

`npm run dev` starts Electron, the proxy, and `next dev` on the fixed ports above.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Electron + proxy + Next (development) |
| `npm test` | Proxy / outbox unit and integration tests |
| `npm run pack` | Standalone Next (`KJA_DESKTOP=1`) + Electron Windows installer |

## Behaviour

- Sign in with a staff / officer / admin / teacher account (same as the website).
- Sidebar pages prefetch inside the desktop cookie (`kja-desktop=1`) so switches feel instant.
- Offline: last-synced REST reads stay available; plain table writes go to a local outbox and flush when the network returns.
- Online-only (not queued): RPCs, storage uploads, service-role calls, mail, and `/api/desktop/team`.
- Public-site links open in the system browser. Only `127.0.0.1:47322` stays in the desk window.

## Packaging notes

1. `npm run pack` builds the website with `KJA_DESKTOP=1` and `KJA_DESKTOP_PACK=1` (`distDir: .next-desktop`, `output: 'standalone'`, longer router `staleTimes`).
2. electron-builder copies `.next-desktop/standalone`, `.next-desktop/static`, and `public` into the app resources.
3. Do **not** run website `next dev` and Desktop App at the same time against a shared cache — they use separate folders (`.next` vs `.next-desktop`).
3. Installer output is under `Desktop App/release/`.

## Website hooks (desktop-gated)

These only activate when `KJA_DESKTOP=1` and/or the `kja-desktop=1` cookie is present:

- [`next.config.ts`](../next.config.ts) — standalone + 120s dynamic stale time
- [`components/DeskWarmup.tsx`](../components/DeskWarmup.tsx) — nav prefetch
- [`components/DesktopSyncBar.tsx`](../components/DesktopSyncBar.tsx) — offline / outbox strip
- Desk shells under `components/admin`, `office`, `accounts`, `academics`, `teacher`
