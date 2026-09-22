# Leave App (standalone)

A separate mobile-first Leave / Vacation request app that lives at `leave-app/` — fully independent from the main
HR portal codebase. It talks only to its own isolated backend tables (prefixed `la_`) in the same Supabase project.

## Workflow

```
Employee submits  →  Replacement concurs  →  Line manager  →  HR (balance check)  →  CEO (final approval)
      PENDING              DEPUTY_CONFIRMED     MANAGER_APPROVED      HR_APPROVED               APPROVED
```

- Any rejection bounces the request back to the employee with a reason; the previous application stays `REJECTED`
  and the employee submits a **new** application.
- Employee can cancel while in progress (`PENDING` → `HR_APPROVED`).
- Leave days are working days, **Fridays excluded**.
- Balance is deducted only after CEO final approval (`la_ceo_decision`).
- CEO is hardcoded to **Dr. Faisal Al-Sabah** (`faisal@test.com`) via `la_ceo_email()`.

## Backend

- Migrations (root `migrations/`, all idempotent, same Supabase project):
  - `025_leave_app_isolated_schema.sql` — core schema, RPCs, RLS, seed roster.
  - `026_sync_balances_from_hrportal.sql` — mirrors each employee's balances from the HR portal's `leave_balances`
    table (joined via `employees.email`) into `la_leave_balances`; callable as `la_sync_hr_balances()`.
  - `027_collate_leave_app_into_hrportal.sql` — on CEO final approval, inserts the request into the HR portal's
    `leave_requests` (status `HR_Finalized`, origin tagged by `la_request_id`). The portal's existing
    `update_leave_balances()` trigger then recomputes the employee's **real** balance, so the HR portal Leave
    Management page and the Leave App stay in sync.
- All workflow/reads go through SECURITY DEFINER RPCs keyed off the signed JWT email (`auth.jwt()`). Clients have
  **no** table grants except `SELECT` on `la_users` (directory / deputy picker).
- Tables: `la_users`, `la_leave_balances`, `la_leave_requests`, `la_approval_log`, `la_notifications`.

### Deploy / re-deploy the backend

```bash
node scripts/deploy_leave_app.cjs   # from the repo root (applies 025, 026, 027 in order)
```

The script uses the live project Postgres credentials (see `../scripts/deploy_leave_app.cjs`).
Re-running it re-syncs balances from the HR portal (source of truth) and upgrades function definitions.

## Run locally

```bash
cd leave-app
npm install
cp .env.example .env   # fill in Supabase URL + anon key, or use the existing .env
npm run dev            # http://localhost:5174
```

## Build

```bash
cd leave-app
npm run build
npm run preview
```

## Native Android app (Capacitor)

The same app is wrapped in **Capacitor 8** (`android/`) so it runs as an installable native Android app from the Play
Store or a sideloaded APK — the desktop HR portal is untouched. It reuses the exact same Supabase RPCs, balances and
collation backend; no extra server code.

```bash
cd leave-app
# First time only: needs Android Studio (SDK platform android-36 + JDK 21).
npm run build:native            # tsc + vite build (relative base) + cap sync android
cd android
gradlew.bat assembleDebug       # outputs app/build/outputs/apk/debug/app-debug.apk
```

Notes:
- `build:native` runs `vite build --base ./` so asset URLs work from the `https://localhost` WebView origin; the
  regular `npm run build` (hosting-oriented, absolute base) is unchanged.
- `capacitor.config.ts`: `appId com.hrportal.leaveapp`, `androidScheme https`, mixed content allowed (needed if any
  Supabase SDK asset/http call requires it).
- Signing: debug APK is self-signed for testing. For Play Store, create a keystore and add `signingConfigs` in
  `android/app/build.gradle`.
- The service worker (`sw.js`) still registers in production builds and works from the WebView origin for offline
  shell caching; API/auth calls stay network-first.
- If you add Capacitor plugins later, run `npx cap sync android` after install, or re-run `npm run build:native`.

(Deploy `dist/` to any static host — Vercel/Netlify/nginx.)

## Demo accounts

All passwords `12345` (Supabase Auth users pre-provisioned in the main portal):

| Email | Role | Sees |
|---|---|---|
| `faisal@test.com` | CEO | final approval queue |
| `layla@test.com` | HR | balance-check queue |
| `ahmed@test.com` | Line manager (IT) | team requests (Mohamed) |
| `sarah@test.com` | Line manager (Ops) | team requests (Ihab, John) |
| `mohamed@test.com`, `ihab@test.com`, `john@test.com` | Staff | own requests, balances, deputy concurrence |

Quick test: log in as `mohamed@test.com`, pick `ihab@test.com` as replacement, submit; then approve with Ihab →
Ahmed → Layla → Faisal.

## Notes

- Balances are **synced from the HR portal** (`leave_balances` → `la_leave_balances` by `employees.email`), so they
  show the employee's real used/entitled numbers from the LeaveManagement page. Run the deploy script to re-sync.
- Add new staff: insert into `la_users`, add a matching Supabase Auth user (same email, password `12345`), and give
  the employee an `email` in the HR portal `employees` table so the balance mirror finds them.
- PWA: manifest + service worker (`public/sw.js`) included; installable from the browser.
- HR portal link: set `VITE_LEAVE_APP_URL` in the portal `.env` (defaults to `http://localhost:5174`) to show the
  "Leave App" button on the Leave Management page.