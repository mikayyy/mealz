# mealz account rollout and trusted-device login

Current baseline: **v0.21.1** (`a3007699`). Follow the steps below for a fresh
installation or when applying new migrations to an existing deployment.

## Required deployment order

Database migrations must be applied **before** deploying the application.
The application fails closed when required migrations are absent.

1. In Supabase SQL Editor, apply all migrations in this order (each is idempotent
   and safe to rerun):
   1. `migrations/2026-09-14_profiles.sql`
   2. `migrations/2026-09-15_user_ownership_rls.sql`
   3. `migrations/2026-09-15_households.sql`
   4. `migrations/2026-09-16_household_compatibility.sql`
   5. `migrations/2026-09-17_account_security.sql`
   6. `migrations/2026-09-21_trusted_device_login.sql`
   7. `migrations/20260921194345_supabase_hardening_v0202.sql`
   8. `migrations/20260921212102_editable_groceries_v0210.sql`
2. Confirm Email authentication is enabled in Supabase. Keep email confirmation
   enabled. Set Site URL to `https://mealz-pink.vercel.app`, and allow that URL
   plus `https://mealz-pink.vercel.app/?reset=1` in Redirect URLs. If testing a
   Vercel preview, add its exact URLs temporarily. Verify email delivery/SMTP for
   confirmation and reset messages before inviting friends.
3. Keep `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` (or
   legacy `SUPABASE_ANON_KEY`), `OPENAI_API_KEY`, and `CRON_SECRET` configured in
   Vercel. No additional secrets or services are needed.
4. After migration success and CI success (`pnpm migration:validate` green),
   deploy the application. Do not deploy without the migrations: AI and household
   writes deliberately return a temporary-unavailable error when the rate-limit
   RPC is missing. A missing or incomplete schema fails closed: `householdSchemaReady()`
   probes for required tables, columns, and the grocery editable-list additions
   before any household data is accessed.
5. Reopen mealz. Existing signed-in users go straight to their household. In
   **Account → Set or change password**, set a password for future sign-ins. A
   signed-out existing user can choose **Forgot or need a password?** using their
   existing email. This preserves the account, household membership, and meal
   history.
6. If new-user signup was previously disabled, enable it only after this
   deployment. Create an invitation via **Account → Create a new invitation code**.
   Share it privately; the invited person creates their own account, confirms their
   email, signs in, and chooses **Join a household**.

**Rollback:** revert the application to its prior Vercel deployment. The migrations
are additive and privilege-narrowing; do not delete household data or reverse the
database migrations as a rollback path.

## Product rules

- One household per account. Joining loads that household's existing Profile/weeks without copying or overwriting them. Creating opens Profile setup. Interrupted setup resumes if the household has no Profile yet.
- Both members and owners can edit meals and Profile. Only the owner can replace the invitation code. Replacing a code leaves current members connected; the old code stops accepting new members.
- The clear invitation code is displayed only when created/replaced. Only its SHA-256 hash and a short hint are stored in the database. If lost, create a new code in Account.
- Self-service leaving, ownership transfer, household deletion, and switching between households are not included in this release. Existing linked accounts cannot join a second household accidentally.
- Browser preferences and drafts from the old prototype are never uploaded into a new household. Startup reloads authoritative cloud data; signing out or changing accounts clears that user's scoped browser cache.

## Security and rate limits

- All normal APIs require a verified Supabase user. Missing authentication configuration, expired sessions, and database errors never enable legacy service-key reads.
- User data access, including suggestion history/favorites, uses the publishable key plus the verified bearer token and RLS. Household setup uses server-only RPCs with a verified user ID, per-user transaction locks, and existing unique membership constraints.
- Household mutations: 10 requests per authenticated account per 15 minutes, including invalid-code attempts. AI endpoints share 20 requests per household per 15 minutes. Recipe expansion allows at most seven distinct cooking days. Limits are stored atomically in Postgres and cannot be reset by a browser. Exhaustion returns HTTP 429 and Retry-After; limiter failure returns 503.
- Supabase handles password storage, confirmation, reset tokens, session refresh, and authentication endpoint rate limits. Review its Auth rate limits/email provider settings for your account. mealz does not store passwords.
- The Friday job remains protected by CRON_SECRET and runs only household-scoped preparation; missing household schema causes a safe failure.

## Verification

Use Node 22 and pnpm 9 (or later):

```sh
pnpm install --frozen-lockfile
pnpm release:check          # version consistency: package.json, index.html, README, CHANGELOG
pnpm migration:validate     # schema preflight: applies all migrations to PGlite; verifies tables,
                             # columns, indexes, functions, RLS, grants, and idempotency
pnpm migration:live         # live preflight: probes required tables/columns in Supabase; skips if
                             # no SUPABASE_URL/SUPABASE_SECRET_KEY configured (exit 0)
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

The `migration:validate` command (`node scripts/migrate-validate.js`) applies all
migrations from `migrations/manifest.js` in order to an in-process PGlite
database and checks 86 structural requirements. It requires no live credentials and
runs before every unit test run in CI.

The `migration:live` command (`node scripts/migrate-live.js`) probes the live
Supabase database for every required table and column listed in the manifest.
It is read-only (SELECT probes only). If `SUPABASE_URL` or `SUPABASE_SECRET_KEY`
are absent it prints `skipped: no credentials` and exits 0 — it never fails a
run just because secrets are missing. The `migration:apply` command
(`node scripts/migrate-apply.js`) prints the ordered SQL to stdout for manual
application in the Supabase SQL Editor; it does not execute SQL itself.

Pre-deploy sequence:

1. `pnpm migration:apply` — review and copy the ordered SQL
2. Apply the SQL in the Supabase SQL Editor
3. `pnpm migration:live` — confirm all required objects are present
4. Deploy the application

Database tests use embedded Postgres with fixtures for the Supabase roles/auth schema and the actual household/account-security migrations. They test cross-household reads/writes/reparenting on six data tables, direct membership/invite privilege denial, shared household access, atomic failure, code rotation, rate exhaustion, and window reset. No live credentials are used. Browser tests execute shipped scripts with mocked auth/API boundaries and isolated storage. CI runs both suites on Linux.

Production smoke checks after deployment:

1. Existing account: verify Profile, This Week/Past Weeks, recipes, groceries, edit/save, refresh persistence, and password setup.
2. New account: confirm email, create household, finish Profile, sign out/in, and confirm it reopens without repeating onboarding.
3. Invited account: join with the code, confirm shared Profile/meals, save a harmless preference and verify it from the owner's account. A bad code should show an error while keeping the form usable.
4. Separate household: confirm neither family's meals/Profile appear in the other. Sign out and change accounts in the same browser to check local state isolation.
5. Request a password reset, follow the email, choose a new password, and confirm the same household opens. Verify that expired/reused reset links can recover through another reset request.
6. Grocery list: verify add, edit, delete, check/uncheck, and that edits survive a replan.

The live email-delivery and live database checks require your Supabase project; mocked browser tests do not certify them. If a rollout issue appears, revert the application commit through a new Vercel deployment. The migrations are additive and privilege-narrowing; do not delete household data or reverse earlier migrations as a rollback path.

References: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [auth event handling](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), and [password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Trusted-device quick login (v0.20.0+)

- Quick login is optional and is only offered after a successful full Supabase sign-in.
- Remembered account names live only in that browser. There is no public/global account directory.
- A 4-digit PIN is not sufficient by itself: the server also requires a random device token stored on that browser. PINs are scrypt-hashed and unlock attempts are limited to five per minute using the shared Postgres rate limiter.
- Trusted-device records (`mealz_trusted_devices`) and the rate-limit table (`mealz_rate_limits`) are service-only and cannot be read directly by authenticated or anonymous browser roles.
- Quick unlock uses `SUPABASE_SECRET_KEY` (service role) server-side to generate an admin magic-link token hash, which is then exchanged through the normal Supabase client. RLS and household authorization remain unchanged for all subsequent requests.
- **Session persistence after unlock:** after a successful quick login, the Supabase client is configured with `persistSession: true` and `autoRefreshToken: true`. A normal Supabase session is therefore persisted in browser storage and auto-refreshed. The device token and PIN are not stored as reusable sessions — only the resulting Supabase session is.
- Account → quick login can update or revoke the remembered device. Removing an account from the signed-out picker only removes the local browser entry; revocation from Account also disables the server-side token.
