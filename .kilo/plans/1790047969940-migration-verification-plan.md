# Plan: migration verification + PGlite fixture DRY

## Goal

Make it **hard to deploy with unapplied migrations**, without giving any automation
write access to the production database.

## Context

- Migrations are applied by hand in the Supabase SQL Editor. Nothing enforces that
  this happened before a deploy.
- `migration:validate` (offline, PGlite, 86 checks) verifies that the migrations
  *produce* the required schema. It cannot verify they were *applied to live*.
- The runtime guard `householdSchemaReady()` (`api/_lib/supabase.js`) probes only
  four things. A migration that adds a column the app uses — but was never applied —
  surfaces as a runtime error, not a pre-deploy failure.
- The PGlite bootstrap fixture and the SQL-adaptation regex exist in **two places**:
  `scripts/migrate-validate.js` and `tests/migration-manifest.test.js`. Changing
  the fixture requires changing both. That is the "spaghetti" smell.

## Decision (option B — confirmed)

No auto-apply. No automated writer to the production database. Instead, two layers:

1. **Live gate** — a read-only check that the production schema matches the manifest,
   run before deploy.
2. **Apply helper** — one command that emits the ordered migration SQL, so the manual
   step is a single paste instead of eight copy-pastes.

Plus a DRY fix for the duplicated fixture.

## Tasks

### 1. Shared PGlite fixture module (DRY)

Create `migrations/pglite-fixture.js` exporting:

- `adaptForPGlite(sql)` — the four substitutions already inline in both files:
  `create extension if not exists pgcrypto`, `not valid`, `validate constraint`,
  `pg_advisory_xact_lock`.
- `makeDb()` — async; returns a connected PGlite preloaded with the Supabase
  auth/roles fixture and the prototype tables, ready to apply migrations.

Then:

- `scripts/migrate-validate.js` — import from `../migrations/pglite-fixture.js`;
  delete the inline copies. Keep the 86-check flow identical.
- `tests/migration-manifest.test.js` — import `makeDb`/`adaptForPGlite`;
  delete the inline copies. Keep all 14 tests passing.

Verify: `pnpm migration:validate` = 86/86, `pnpm test` = 99/99.

### 2. Live schema gate

Create `scripts/migrate-live.js` (`pnpm migration:live`):

- Read `SUPABASE_URL` + `SUPABASE_SECRET_KEY` from env. If either is missing, print
  `skipped: no credentials` and **exit 0** — never fail a run just because secrets
  are absent.
- For every entry in `REQUIRED_TABLES` and `REQUIRED_COLUMNS` (from
  `migrations/manifest.js`), probe the live database that the table/column exists,
  using the same REST pattern already proven by `householdSchemaReady()`:
  `GET /rest/v1/<table>?select=<col>&limit=0`. A missing column returns 404.
- Read-only by construction: SELECT probes only, no write path.
- Exit 1 if any required object is missing, with a clear list and a next-step message
  ("apply the missing migration(s) in the Supabase SQL Editor, then re-run").
- Exit 0 if all present.

### 3. Apply helper

Create `scripts/migrate-apply.js` (`pnpm migration:apply`):

- Read `MIGRATIONS` from the manifest, concatenate the SQL in order, print a header
  (count + ordered filenames), then print the full SQL to stdout.
- Intended usage: `pnpm migration:apply` → copy output → paste into Supabase SQL
  Editor → run → `pnpm migration:live` to confirm.
- Does not execute SQL itself. Needs no credentials. Cannot modify the database.

### 4. Docs

- `docs/auth-setup.md` — add the three new commands to the Verification section and
  the pre-deploy sequence: `migration:apply` → `migration:live` → deploy. Note that
  `migration:live` skips without credentials.
- `docs/architecture.md` — add a "Migration verification" note under Migration state
  describing the offline/live split and the no-auto-apply rule.

### 5. CI wiring

- `.github/workflows/test.yml` — add `pnpm migration:live` after
  `migration:validate`. It skips gracefully without secrets, so it is safe to leave
  in for runners that have the secret injected.

## Validation

- `pnpm migration:validate` = 86/86
- `pnpm test` = 99/99 (14 migration tests)
- `pnpm typecheck` = 0 errors
- `pnpm migration:apply` prints the 8 migrations in order
- `pnpm migration:live` with valid creds: exit 0 on a fully-applied DB; exit 1 with
  a clear list if something is missing
- `pnpm migration:live` without creds: prints skip, exit 0
- CI green

## Risks / mitigations

- **Live gate false-fail** if a column exists but PostgREST won't expose it. We probe
  only the `public` data tables the app already queries, so this is the authoritative
  check, not a new surface.
- **Live gate false-pass** if the manifest is stale. The manifest is the single
  source of truth; adding a migration requires editing both the SQL file and the
  manifest, and `migration:validate` enforces that.
- **Fixture refactor could break the 86 checks.** Re-run `migration:validate` and
  `pnpm test` after.
- **CI running a live check needs the secret.** The step skips without it and never
  fails CI on the absence of secrets.

## Out of scope

- Auto-applying migrations (declined).
- Dropping objects / `supabase db push`.
- Touching `api/` runtime code.
- Phase 2 transactional plan work.

## Open decision (toggle)

Whether `migration:live` runs in CI against production. **Recommended: yes**, as a
skip-if-no-secret step. Delete the line from the workflow if the team prefers
local-only.