# TypeScript migration baseline (v0.21.1)

This document records the JavaScript, test, and deployment boundaries on `main`
at Mealz v0.21.1 (`a3007699`). It replaces assumptions from the v0.17.1
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
- `tests/grocery-api.test.js`
- `tests/grocery-database.test.js`
- `tests/household.test.js`
- `tests/navigation.test.js`
- `tests/ownership.test.js`
- `tests/profile-observer.test.js`
- `tests/quick-login.test.js`
- `tests/shared-logic.test.js`
- `tests/shopping-logic.test.js`

### Browser tests

- `tests/browser/accounts.test.js`
- `tests/browser/groceries.test.js`

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

GitHub Actions uses Node 22 and pnpm 9+ and runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm test`
4. Playwright Chromium installation
5. `pnpm test:browser`

`pnpm typecheck` currently reports zero errors against the v0.21.1 tree.
The Phase 0 error baseline (377 errors before suppression) was established at
v0.20.0; seven browser-global files still carry `@ts-nocheck` and are excluded
from the checked count.

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

## Phase 1 error baseline (T1)

Task T1 established an informational error baseline by temporarily removing
`@ts-nocheck` from each of the seven browser files and running a targeted
typecheck with cross-file globals declared in `types/browser-globals.d.ts`.

| File | Total Errors | Global-Script | DOM Narrowing | Property Mismatches | Module/Import | Other |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `account-client.js` | 0 | 0 | 0 | 0 | 0 | 0 |
| `app.js` | 51 | 51 | 0 | 0 | 0 | 0 |
| `auth-client.js` | 0 | 0 | 0 | 0 | 0 | 0 |
| `client-foundation.js` | 0 | 0 | 0 | 0 | 0 | 0 |
| `grocery-order.js` | 14 | 11 | 0 | 0 | 0 | 3 |
| `navigation-polish.js` | 0 | 0 | 0 | 0 | 0 | 0 |
| `weeks.js` | 18 | 7 | 0 | 0 | 0 | 11 |

**Notes:**
- `app.js` (51 errors): Primarily DOM element narrowing (`Element` lacks `onclick`, `dataset`, `value`, `disabled`, `checked`, `onchange` properties) due to `document.querySelector` returning `Element` instead of specific HTMLElement subtypes.
- `grocery-order.js` (14 errors): 11 DOM narrowing errors plus 3 assignment errors (function reassignment and const mutation).
- `weeks.js` (18 errors): 7 DOM narrowing (`onclick`, `closest`, `onkeydown`) plus 11 function reassignment errors from the week-navigation wrapper pattern.
- `account-client.js`, `auth-client.js`, `client-foundation.js`, `navigation-polish.js`: Zero errors — these files already align with the declared cross-file globals and do not have internal type conflicts.

This baseline is **informational only**. No `@ts-nocheck` files were modified in Phase 1. The seven files remain deferred to the client architecture phase.

## Phase 1 decisions

During Phase 1 implementation (`.kilo/plans/1790082470976-typescript-migration-phase-1.md`), the following decisions were made:

- **Q1 (Handling the 7 `@ts-nocheck` files):** Hybrid C → A. We successfully captured the informational error baseline (see T1 above). The files themselves remain unchanged and `tsc` ignores them in normal runs. They will be typed when a client architecture decision introduces a bundler.
- **Q2 (Already-checked files):** A. All API helpers (`api/_lib/*.js`) and shared logic modules (`shared-logic.js`, `shopping-logic.js`) received tighter JSDoc typings to remove implicit `any` usage. 
- **Q3 (Pilot `.ts` conversion):** A. We skipped converting `api/_lib/schemas.js` to `.ts`. A test conversion proved that without a build step or a TypeScript loader (like `tsx`), Node.js `node --test` fails to resolve local imports from `.ts` files. We maintain the strict Phase 0 constraint: no `.js`→`.ts` file renames until a build step is introduced.

## Phase 2 decisions

During Phase 2 implementation, the following decisions were made:

- **Backend Conversion:** All backend API routes and helpers (`api/*.js` and `api/_lib/*.js`) were successfully renamed to `.ts` and converted to native TypeScript syntax. JSDoc types and `/// <reference>` tags were replaced with proper ES module `import type` declarations.
- **Test execution:** The `tsx` loader was introduced as a `node --import tsx` test argument, allowing the Node native `--test` runner to seamlessly execute tests and resolve `.js` imports to the new `.ts` files on disk without needing a separate build step. Some test setups using `fs.readFileSync` for raw source text required path adjustments.
- **Vercel configuration:** The Vercel function glob in `vercel.json` was updated to `"api/**/*.{js,ts}"` to ensure the `maxDuration` rule applies to the new `.ts` backend routes.

## Constraints for the migration

- Do not rename browser `.js` files until a frontend bundler is introduced.
- Do not add a frontend bundler or emitted build output yet.
- Do not change the browser script order.
- Preserve Monday-Sunday week identity and explicit `week_start` usage.
- Preserve user-scoped Supabase access, household RLS, and server-only trusted
  device/rate-limit access.
- Preserve all UMD/CommonJS and source-text test behavior.
- Report possible runtime bugs separately instead of fixing them inside a
  behavior-neutral migration PR.
