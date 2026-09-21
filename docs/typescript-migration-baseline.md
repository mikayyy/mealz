# TypeScript migration baseline (v0.20.0)

This document records the JavaScript, test, and deployment boundaries on `main`
at Mealz v0.20.0 (`72df412`). It replaces assumptions from the v0.17.1
migration notes. The migration remains incremental: TypeScript is introduced as
a checker first, without renaming runtime files or adding a browser build step.

## Runtime inventory

There are 30 runtime JavaScript files: nine browser files, twelve API routes,
and nine API helpers.

### Browser files

| File | Role |
| --- | --- |
| `auth-client.js` | Supabase Auth bootstrap, recovery, quick-login client, and authenticated fetch interception |
| `shared-logic.js` | Deterministic week, normalization, and dietary-conflict logic shared with Node tests |
| `shopping-logic.js` | Grocery-category normalization and ordering shared with Node tests |
| `app.js` | Primary browser state, planning, recipes, grocery generation, and view rendering |
| `grocery-order.js` | Grocery presentation override and checked-state interaction |
| `weeks.js` | Monday-Sunday week identity, week loading/cache, and dashboard behavior |
| `navigation-polish.js` | Route-aware breadcrumbs and navigation behavior |
| `client-foundation.js` | Profile/conflict observers, busy states, and UI safeguards |
| `account-client.js` | Household and account screens and actions |

`index.html` loads the Supabase browser SDK first, then the application files in
the exact order above. These are classic scripts, not ES modules. Later files
depend on globals and functions created by earlier files, so TypeScript Phase 0
must not reorder them.

### API routes

| File | Boundary |
| --- | --- |
| `api/auth-config.js` | Safe public Auth configuration |
| `api/expand-meals.js` | AI recipe expansion |
| `api/feedback.js` | Meal feedback history |
| `api/generate-ideas.js` | AI meal-idea generation |
| `api/household.js` | Household creation, joining, and invitation rotation |
| `api/plan.js` | Weekly plan, recipe, and grocery persistence |
| `api/pregenerated-ideas.js` | Prepared weekly ideas |
| `api/prep-next-week.js` | Friday cron preparation |
| `api/profile.js` | Household profile persistence |
| `api/quick-login.js` | Trusted-device setup, unlock, and revocation |
| `api/swap-meal.js` | AI meal replacement |
| `api/weeks.js` | Explicit week summaries and week lookup |

### API helpers

- `api/_lib/auth.js`
- `api/_lib/openai.js`
- `api/_lib/profile-store.js`
- `api/_lib/profile.js`
- `api/_lib/rate-limit.js`
- `api/_lib/schemas.js`
- `api/_lib/supabase.js`
- `api/_lib/telemetry.js`
- `api/_lib/validation.js`

## Browser dependency model

The browser still uses ordered global scripts. Important dependencies include:

- `shared-logic.js` publishes `globalThis.MealzLogic`; `weeks.js` and
  `client-foundation.js` consume it.
- `shopping-logic.js` publishes `globalThis.MealzShopping`;
  `grocery-order.js` consumes it.
- `auth-client.js` publishes `window.MealzAuth` and wraps `window.fetch` before
  application data requests begin.
- `app.js` creates shared state and globally scoped rendering/data functions that
  the later enhancement scripts wrap or call.

The migration must preserve this behavior until a separate client-architecture
decision introduces modules and a build step.

## UMD/CommonJS dual-use modules

Two files deliberately support both the browser and direct CommonJS tests:

- `shared-logic.js`
- `shopping-logic.js`

Their wrapper behavior and `module.exports` paths must remain unchanged during
JSDoc typing. Converting either file to ESM would break the current browser or
Node test contract.

## Test inventory

There are thirteen test files: twelve top-level unit/database/source-contract
files and one Playwright browser file.

### Unit, database, and source-contract tests

- `tests/account-api.test.js`
- `tests/account-database.test.js`
- `tests/auth.test.js`
- `tests/brand.test.js`
- `tests/foundation.test.js`
- `tests/household.test.js`
- `tests/navigation.test.js`
- `tests/ownership.test.js`
- `tests/profile-observer.test.js`
- `tests/quick-login.test.js`
- `tests/shared-logic.test.js`
- `tests/shopping-logic.test.js`

### Browser tests

- `tests/browser/accounts.test.js`

The browser suite intercepts requests and serves `index.html`, JavaScript, and
CSS directly from the working tree. There is no compiled-output directory.

## Files consumed as source text or VM scripts

Several tests intentionally inspect or execute source text rather than import a
module. Renames, module syntax, generated wrappers, and formatting-only rewrites
can therefore be test-visible.

Directly read JavaScript files include:

- `account-client.js`
- `app.js`
- `auth-client.js`
- `client-foundation.js`
- `navigation-polish.js`
- `weeks.js`
- `api/_lib/auth.js`
- `api/_lib/profile-store.js`
- `api/_lib/supabase.js`
- `api/auth-config.js`
- `api/household.js`
- `api/plan.js`
- `api/prep-next-week.js`
- `api/profile.js`
- `api/quick-login.js`
- `api/weeks.js`

`tests/profile-observer.test.js` executes `client-foundation.js` with
`node:vm`. The Playwright suite serves all browser scripts directly. The two UMD
modules are loaded with CommonJS `require` by their focused tests.

## Trusted-device and account additions since v0.17.1

The migration scope now includes:

- `api/quick-login.js` and its trusted-device request/response contracts.
- Quick-login client behavior in `auth-client.js`.
- `account-client.js` and the household/account API results it consumes.
- `tests/quick-login.test.js`, `tests/account-api.test.js`,
  `tests/account-database.test.js`, and expanded Playwright account coverage.
- The server-only `mealz_trusted_devices` and `mealz_rate_limits` boundaries.

Type declarations must not make either server-only table available through the
normal authenticated browser data path. A failed user-scoped request must never
retry with service credentials.

## Vercel and CI baseline

`vercel.json` currently applies the 60-second function duration with the glob
`api/*.js` and schedules `/api/prep-next-week` every Friday at 23:00 UTC. This
glob is correct while routes remain JavaScript. Before the first `.ts` route is
renamed in Phase 2, preview deployment must prove a mixed JavaScript/TypeScript
glob preserves both the function duration and cron route.

GitHub Actions currently uses Node 22 and pnpm 11.19.0, then runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm test`
3. Playwright Chromium installation
4. `pnpm test:browser`

Phase 0 inserts `pnpm typecheck` after dependency installation and before unit
tests.

## Phase 0 error baseline

The first complete `tsc` run checked all runtime and test JavaScript before any
file-level suppression and reported 377 errors:

| Category | Count | Notes |
| --- | ---: | --- |
| Global-script resolution | 225 | 220 `TS2304` and five `TS2552` errors from implicit cross-file browser globals |
| Inferred-property mismatch | 114 | 111 `TS2339` and three `TS2353` errors, primarily DOM element narrowing and inferred object shapes |
| CommonJS test/module mode | 38 | `TS1470` errors from `import.meta` under the initial Node16 module setting |
| Implicit `any` | 0 | Non-strict Phase 0 does not enable `noImplicitAny` |
| Nullable/undefined access | 0 | Non-strict Phase 0 does not enable `strictNullChecks` |
| UMD/CommonJS wrapper resolution | 0 | The two dual-use deterministic modules resolved successfully |

No compiler finding demonstrated a confirmed runtime bug. Four server findings
identified useful type gaps: the optional rate-limit retry value and an inferred
cron scope/object shape. They were resolved with JSDoc annotations and casts,
without changing control flow.

Seven heavily coupled browser files use documented `@ts-nocheck` directives:
`account-client.js`, `app.js`, `auth-client.js`, `client-foundation.js`,
`grocery-order.js`, `navigation-polish.js`, and `weeks.js`. The deterministic
shared modules and all API files remain checked. Tests also remain checked.

## Constraints for the migration

- Do not rename runtime `.js` files in Phases 0 or 1.
- Do not add a frontend bundler or emitted build output.
- Do not change the browser script order.
- Preserve Monday-Sunday week identity and explicit `week_start` usage.
- Preserve user-scoped Supabase access, household RLS, and server-only trusted
  device/rate-limit access.
- Preserve all UMD/CommonJS and source-text test behavior.
- Report possible runtime bugs separately instead of fixing them inside a
  behavior-neutral migration PR.
