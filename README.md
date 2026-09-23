# mealz

*less planning. more good food.*

mealz is a mobile-first family meal-planning app that turns weekly constraints into meal ideas, recipes, and a consolidated grocery list.

Current stack: Vercel, OpenAI Responses API, Supabase, and GitHub.

## Current release

**v0.21.2** (2026-09-23) — Grocery consolidation repair.

- Repairs legacy generated grocery rows that predate deterministic source keys.
- Combines preparation variants such as diced and sliced onions without changing recipe wording.
- Treats small, medium, large, and whole produce as compatible count units.
- Preserves manual items, household edits, deletion markers, and conservative checked state during repair.
- Adds unit and browser coverage for repair, reload, and recipe preservation.

No database migration or Vercel configuration change required. Legacy lists repair once through the existing authenticated plan-sync path.

See [CHANGELOG.md](CHANGELOG.md) for the complete version history back to v0.1.0.

## Changelog (recent)

### v0.21.2 — grocery consolidation repair
- Repairs legacy generated grocery rows once, then persists the consolidated list.
- Combines compatible preparation and produce-size variants while preserving recipe-specific wording.
- Preserves manual items, edits, deletion markers, and checked state during repair.
- Adds regression coverage for legacy rows and reload behavior.

### v0.21.0 — consolidated, editable grocery lists
- Combines equivalent ingredients across recipes using deterministic shopping names and compatible unit conversions while preserving recipe-specific ingredient wording.
- Makes saved grocery rows authoritative, with household-scoped add, edit, delete, and check-off controls.
- Preserves manual items, household edits, checked state, and deletion choices when a weekly plan is rebuilt.
- Recorded and verified production migration `20260921212102_editable_groceries_v0210`.

### v0.20.2 — Supabase hardening
- Removed anonymous table privileges and narrowed authenticated access to the CRUD operations mealz uses.
- Optimized all eight household RLS policies so `auth.uid()` is evaluated once per statement.
- Added covering indexes for the two foreign keys identified by the Supabase performance advisor.
- Added automatic trusted-device cleanup when an Auth user is deleted.
- Added generated production database types as a checked, server-side contract.
- Added executable regression coverage for privileges, household isolation, policy shape, indexes, migration idempotence, and trusted-device cleanup.
- Recorded and verified production migration `20260921194345_supabase_hardening_v0202`.

### v0.21.1 — stabilization
- Fixed the stylized wordmark z so its cut-detail rendering remains visible across browsers.
- Fixed the `/api/plan` Vercel invocation failure caused by incompatible module initialization.
- Stopped transient cloud sync errors from persisting after successful recovery or returning after reload.
- Added regression coverage for wordmark rendering, server runtime compatibility, and sync recovery.

### v0.21.0 — consolidated, editable grocery lists
- Combines equivalent ingredients across recipes using deterministic shopping names and compatible unit conversions while preserving recipe-specific ingredient wording.
- Makes saved grocery rows authoritative, with household-scoped add, edit, delete, and check-off controls.
- Preserves manual items, household edits, checked state, and deletion choices when a weekly plan is rebuilt.
- Recorded and verified production migration `20260921212102_editable_groceries_v0210`.

### v0.20.2 — Supabase hardening
- Removed anonymous table privileges and narrowed authenticated access to the CRUD operations mealz uses.
- Optimized all eight household RLS policies so `auth.uid()` is evaluated once per statement.
- Added covering indexes for the two foreign keys identified by the Supabase performance advisor.
- Added automatic trusted-device cleanup when an Auth user is deleted.
- Added generated production database types as a checked, server-side contract.
- Added executable regression coverage for privileges, household isolation, policy shape, indexes, migration idempotence, and trusted-device cleanup.
- Recorded and verified production migration `20260921194345_supabase_hardening_v0202`.

### v0.20.1 — type-safety foundation
- Added a documented v0.20 JavaScript, API, browser-global, test, and Vercel migration baseline.
- Added pinned TypeScript and Node 22 type dependencies without renaming runtime files or introducing a frontend build step.
- Added non-emitting JavaScript type checking as the first GitHub Actions gate before unit and browser tests.
- Recorded the initial 377-error compiler baseline and limited temporary suppression to seven heavily coupled browser-global files.
- Added shared domain contracts and JSDoc coverage for AI schemas, validation, deterministic meal/shopping logic, telemetry, rate limiting, and Profile helpers.
- Preserved the existing ordered-script, UMD/CommonJS, Supabase authorization, Vercel, and product behavior.
- No database migration or production configuration changes required.

### v0.20.0 — trusted-device quick login
- Added a remembered-account picker that lists only accounts previously authenticated on the current browser; mealz never exposes a global user directory.
- Added optional 4-digit quick login after a full Supabase sign-in. The PIN is paired with a 256-bit random device token, hashed server-side with scrypt, and unlock attempts are limited to five per minute.
- Quick login issues a fresh Supabase session through an admin-generated token hash. The device token and PIN are not stored as reusable Supabase sessions. After a successful unlock the Supabase client (configured with `persistSession: true` and `autoRefreshToken: true`) persists and auto-refreshes a normal session in browser storage.
- Added account controls to set up, update, or revoke quick login on the current browser, plus an "add another person" path for additional remembered accounts.
- Sensitive password changes require full password confirmation after a quick-login unlock.
- Added trusted-device security/browser regression coverage.
- **Before deploying:** apply `migrations/2026-09-21_trusted_device_login.sql` in Supabase.

Older entries (v0.19.0 and earlier) are in [CHANGELOG.md](CHANGELOG.md).

## Current product model

A mealz week runs Monday through Sunday. The core flow is:

`weekly constraints → meal ideas → user selects → recipes → grocery list → shopping → cooking`

The app currently supports profile preferences, weekly planning, prepared ideas, recipe generation, meal swapping, grocery tracking, history, and week-first navigation.

## Environment

Server-side environment variables used by mealz include:

- `OPENAI_API_KEY`
- optional `OPENAI_MODEL` (defaults to `gpt-5.6-luna`)
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY` for browser auth and RLS-backed user data access
- `CRON_SECRET` for scheduled idea preparation

Never place secret API keys in browser code or commit them to GitHub.

## Current architecture note

Authentication is user-specific and meal data belongs to households. v0.17.0 requires the household and account-security migrations and fails closed when authenticated access is unavailable. Browser data requests use the user's token and household-membership RLS. Only authenticated household management RPCs and the secret-protected Friday job use server-level database access. Quick login uses a service-level key (`SUPABASE_SECRET_KEY`) only to issue the admin-generated magic-link token during unlock; all subsequent requests use the resulting user session token. See `docs/auth-setup.md` for deployment prerequisites and test commands.

## Future roadmap notes

- **Admin dashboard:** owner-only operational view. Initial scope is seeing who has signed up; later versions may add debugging, account status, delivery/AI diagnostics, and other support tooling.
- **Roadmap:** see the phased plan covering data integrity, deployment safety, retry safety, operational visibility, AI safety, client-state cleanup, and release hygiene.
