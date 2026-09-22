# Mealz changelog

All notable changes to Mealz are listed here by version, newest first. The date
beside each version is the release date. Commit SHAs reference the `main`
branch on `https://github.com/mikayyy/mealz`.

---

## v0.21.1 — 2026-09-22 · `a3007699`

Stabilization patch for v0.21.0.

- Fixed the stylized wordmark z so its cut-detail rendering remains visible
  across browsers (`-webkit-text-fill-color` required alongside `color:
  transparent`).
- Fixed the `/api/plan` Vercel invocation failure caused by incompatible module
  initialization (replaced `createRequire` + CommonJS `require` with an ES
  module default import of `shopping-logic.js`).
- Stopped transient cloud sync errors from persisting after successful recovery
  or returning after a page reload (`syncError` is now excluded from durable
  local-storage state).
- Added regression coverage for wordmark rendering, server runtime
  compatibility, and sync recovery.

No database migration required. No Vercel configuration change required.

---

## v0.21.0 — 2026-09-21 · `4c1a160`

Consolidated, editable grocery lists.

- Combines equivalent ingredients across recipes using deterministic shopping
  names and compatible unit conversions, while preserving recipe-specific
  ingredient wording.
- Makes saved grocery rows authoritative: household-scoped add, edit, delete,
  and check-off controls operate directly on the database.
- Preserves manual edits, additions, deletions, and checked state across
  replanning.
- Added grocery-database migration test for idempotence and generated-source
  identity enforcement.
- Added browser tests for full grocery edit/toggle/add/delete workflows.

**Before deploying:** apply `migrations/20260921212102_editable_groceries_v0210.sql`
in Supabase.

---

## v0.20.2 — 2026-09-21 · `6a8beef`

Supabase access hardening (v0.20.2).

- Applied the Supabase hardening migration (`20260921194345_supabase_hardening_v0202.sql`)
  to narrow browser-role privileges, add missing RLS policies, harden the
  service boundary, and add indexes for common join paths.
- Added `api/_lib/database.types.ts` generated from the updated schema.
- Updated `docs/supabase-hardening.md` with production migration notes.

**Before deploying:** apply
`migrations/20260921194345_supabase_hardening_v0202.sql` in Supabase.

---

## v0.20.1 — 2026-09-21 · `c8521d3`

Type-safety foundation.

- Added a documented v0.20 JavaScript, API, browser-global, test, and Vercel
  migration baseline (`docs/typescript-migration-baseline.md`).
- Added pinned TypeScript and Node 22 type dependencies without renaming runtime
  files or introducing a frontend build step.
- Added non-emitting JavaScript type checking as the first GitHub Actions gate
  before unit and browser tests.
- Recorded the initial 377-error compiler baseline and limited temporary
  suppression to seven heavily coupled browser-global files.
- Added shared domain contracts and JSDoc coverage for AI schemas, validation,
  deterministic meal/shopping logic, telemetry, rate limiting, and Profile
  helpers.
- Preserved the existing ordered-script, UMD/CommonJS, Supabase authorization,
  Vercel, and product behavior.

No database migration or production configuration changes required.

---

## v0.20.0 — 2026-09-21

Trusted-device quick login.

- Added a remembered-account picker that lists only accounts previously
  authenticated on the current browser. Mealz never exposes a global user
  directory.
- Added optional 4-digit quick login after a full Supabase sign-in. The PIN is
  paired with a 256-bit random device token, hashed server-side with scrypt,
  and unlock attempts are limited to five per minute.
- Quick login issues a fresh Supabase session through an admin-generated token
  hash. The device token and PIN are not stored as reusable Supabase sessions.
  However, the Supabase client is configured with `persistSession: true` and
  `autoRefreshToken: true`, so after a successful unlock a normal Supabase
  session is persisted in browser storage and auto-refreshed in the background.
- Added account controls to set up, update, or revoke quick login on the
  current browser, plus an "add another person" path for additional remembered
  accounts.
- Sensitive password changes require full password confirmation after a
  quick-login unlock.
- Added trusted-device security/browser regression coverage.

**Before deploying:** apply
`migrations/2026-09-21_trusted_device_login.sql` in Supabase.

---

## v0.19.0

Brand and visual system refresh.

- Rebuilt the client visual system around Inter, warm off-white, near-black,
  two neutral greys, and signal orange (#E85D04).
- Replaced rounded cards, pill controls, shadows, serif headings, and green
  brand chrome with a flat, grid-driven Swiss-minimal system.
- Added a monochrome lowercase mealz wordmark with a subtle cut-detail z and
  changed the primary tagline to "already sorted."
- Refreshed auth, Weeks, Meals, Recipes, Groceries, Profile, Account,
  breadcrumbs, loading states, and shared controls without changing
  authentication flow structure.
- Removed emoji from controlled product UI and separated neutral loading/error
  states from completed-action confirmation styling.
- Added automated brand guardrails for typography, palette, geometry,
  signal-orange behavior, wordmark treatment, and emoji removal.

No database migration or configuration changes required.

---

## v0.18.0

Performance and UX foundation.

- Coalesced duplicate dashboard/week requests so repeated navigation reuses
  in-flight work instead of issuing redundant loads.
- Added idle prefetching for likely Current/Next Week detail views while keeping
  prefetch failure isolated from real navigation.
- Added lightweight dashboard skeletons and busy states for week actions so
  waits are visible without blanking the app.
- Improved scroll-to-top behavior by keying screen changes to
  week/mode/breadcrumb context, fixing same-title screens such as Meals across
  different weeks while preserving same-screen rerenders.
- Added regression coverage for loading coalescing, prefetch isolation, busy
  feedback, structured loading UI, and route-aware scroll behavior.

No database migration or configuration changes required.

---

## v0.17.1

- Added accessible eye buttons to show/hide passwords on sign-in, signup,
  password reset, and password-change forms. Passwords start hidden each time a
  form opens.
- Kept password submission working while revealed and added browser regression
  coverage for mouse/keyboard toggling and submission.

No database or configuration changes required.

---

## v0.17.0

Households, passwords, and account security.

- Added Create / Join Household onboarding, with Profile setup for new
  households and shared data loading for invited members.
- Added Account controls for sign-out, password changes, and owner-only
  invitation-code replacement, including existing migrated households.
- Replaced email-link-only sign-in with email/password signup and sign-in,
  confirmation messaging, password recovery, and persistent sessions. Existing
  accounts can set a password without creating a new account.
- Load meal data only after authentication and household resolution; separate
  browser caches by account/household and clear them on account changes and
  sign-out.
- Fixed a startup race that could replace first-time Profile setup with a late
  dashboard response. Failed Profile saves now stay on Profile with a retryable
  error.
- Removed legacy server-wide data fallbacks and scoped suggestion
  history/favorites to household RLS.
- Added atomic household creation/joining and shared Postgres rate limits: 10
  household actions per account and 20 AI requests per household per 15 minutes.
  Recipe expansion is limited to seven distinct days.
- Added Postgres RLS/transaction tests and browser regression tests to CI.

**Before deploying:** apply `migrations/2026-09-17_account_security.sql`.
Follow `docs/auth-setup.md` for password reset redirects, email delivery,
rollout, and smoke checks.

---

## v0.16.3

- Fixed the Profile page freeze: profile-label cleanup was unconditionally
  replacing the introduction text inside a subtree MutationObserver, triggering
  itself indefinitely even when the text already matched.
- Only update that text when it changes, preserving label normalization,
  navigation, and planning warnings without a render loop.
- Added executable regression coverage for opening/reopening Profile, repeated
  preference renders, startup on Profile, unrelated DOM changes, and save-progress
  labels.

No new Supabase migration or Vercel configuration required.

---

## v0.16.2

- Removed the obsolete `owner_user_id` NOT NULL requirement for
  household-owned Profile and weekly-plan rows, with a compatibility migration
  for existing installations.
- Temporarily continued populating `owner_user_id` on household writes for
  compatibility before that migration is applied.

---

## v0.16.1

- Added the shared-household data model with `households` and
  `household_members`.
- Added a forward migration from v0.16.0 user-owned data to household-owned
  data without rolling back the prior migration.
- Changed RLS from direct user ownership to household-membership access across
  Profile, weeks, meals, recipes, and groceries.
- Added a household API foundation for creating a household and joining one with
  a human-friendly code.
- Household join codes are normalized and SHA-256 hashed before storage; the
  plain code is returned only when created.
- Updated new Profile and weekly-plan writes to carry `household_id` once the
  household schema is active.
- Made Friday idea preparation household-aware while retaining compatibility
  with the v0.16.0 ownership schema before migration.
- Added household/RLS regression tests.

---

## v0.16.0

- Added authenticated user ownership for Profile and weekly plan data.
- Added a Supabase migration that claims existing prototype data for the sole
  authenticated user, then requires `owner_user_id` on Profiles and weekly plans.
- Added RLS policies across Profiles, weekly plans, meals, ingredients, recipe
  steps, and grocery items.
- Changed normal signed-in data requests to use the user's Supabase session
  token, so RLS is enforced instead of relying only on the server secret.
- Kept a temporary compatibility path before the migration is applied; the app
  automatically switches to user-scoped RLS access after the ownership schema is
  detected.
- Made Friday idea preparation ownership-aware so prepared ideas are written and
  read within the correct account.
- Added ownership/RLS regression tests.

---

## v0.15.4

- Fixed a planning-screen MutationObserver feedback loop that could drive the
  browser into a "page unresponsive" state.
- Made use-up conflict warnings idempotent so unchanged warnings are not
  repeatedly removed and reinserted.
- Limited automatic conflict-warning rendering to newly mounted planning inputs,
  while keeping direct input/focus updates responsive.
- Added regression coverage for observer stability.

---

## v0.15.3

- Added pointer cursors for enabled buttons and a not-allowed cursor for
  disabled buttons.
- Fixed a stale breadcrumb race where a late swap response could repaint
  `Weeks › Meals › Swap` after the user had already returned to the Weeks
  dashboard.
- Added regression coverage for both interaction-state fixes.

---

## v0.15.2

- Fixed a dashboard interaction bug where week/profile buttons could lose their
  click handlers after authenticated startup rerenders.
- Replaced per-render button binding with one delegated handler on the stable
  app root.
- Added regression coverage to ensure week actions remain wired across rerenders.

---

## v0.15.1

- Fixed an authentication bootstrap deadlock that could leave API-backed
  navigation appearing unresponsive.
- Added a bounded timeout for auth configuration loading.
- Changed unauthenticated API requests to fail immediately with a clear auth
  response instead of waiting indefinitely for a future session.
- Added regression tests for the auth startup and no-session paths.

---

## v0.15.0

- Added the first authentication foundation using Supabase magic-link sign-in.
- Added authenticated API request handling and server-side user verification for
  protected and AI-powered endpoints.
- Kept auth dormant until a Supabase publishable key is configured.
- Updated visible brand styling to lowercase `mealz` and removed the extra
  recipe back button in favor of breadcrumb navigation.

---

## v0.14.4

- Improved breadcrumb hierarchy and made more breadcrumb levels interactive.
- Added distinct styling for navigable pages, contextual hierarchy, and the
  current page.

---

## v0.14.3

- Added direct Meals ↔ Groceries switching within the selected week.
- Preserved week context for This Week, Next Week, and Past Weeks.

---

## v0.14.2

- Replaced stacked back buttons with directory-style breadcrumbs.
- Reworked grocery display order to Produce → Meat & Dairy → Pantry → Frozen →
  Misc, oriented around a typical Trader Joe's shopping flow.

---

## v0.14.1

- Fixed week navigation bugs where cached weeks could lose their route back to
  the dashboard.
- Added regression coverage for durable back navigation and swap-flow
  cancellation.

---

## v0.14.0

- Moved to a week-first navigation model.
- Removed global Plan / Meals / Groceries bottom navigation.
- Made Next Week, This Week, and Past Weeks the primary navigation objects.

---

## v0.13.1

- Added a visible Profile card to the main weeks dashboard.

---

## v0.13.0

- Began replacing the fake profile record stored in `weekly_plans` with a
  dedicated `profiles` table.
- Renamed user-facing "Household" language to "Profile".
- Made plan replacement safer by creating the new plan before deleting the
  prior version.

---

## v0.12.0

- Migrated major AI endpoints to strict Structured Outputs.
- Added low reasoning effort, output-token caps, `store:false`, and richer
  telemetry.
- Changed recipe generation to retry only failed recipes within a request
  instead of regenerating all of them.

---

## v0.11.3

- Added shared client and server helper modules.
- Added deterministic logic tests and GitHub Actions CI.
- Consolidated draft, conflict, scroll, Supabase, profile, and telemetry
  helpers.

---

## v0.11.2

- Improved scroll behavior so new screens open at the top while same-screen
  rerenders preserve position.

---

## v0.11.1

- Added warnings when weekly "use up" ingredients conflict with profile dietary
  settings.

---

## v0.11.0

- Introduced the card-based Weeks dashboard with Next Week, This Week, and Past
  Weeks.
- Added explicit Monday–Sunday week identity and historical week access.

---

## v0.10.1

- Improved preservation of weekly draft state while navigating between planning
  and profile screens.

---

## v0.10.0

- Consolidated the client architecture into the main app flow and removed
  obsolete scripts/endpoints.
- Added a more controlled startup sequence for profile, active plan, and
  prepared ideas.

---

## v0.9.5

- Fixed stale prepared-idea behavior and empty-equipment handling.
- Filtered common salt and pepper staples from the grocery display.

---

## v0.9.3

- Added a Clear Equipment action.

---

## v0.9.2

- Added cloud-backed profile persistence using the prototype profile-storage
  approach.
- Made Friday pre-generation profile-aware.

---

## v0.9.1

- Expanded dietary preferences and equipment choices.
- Wired profile constraints more fully into AI generation.
- Hardened AI response parsing.

---

## v0.9.0

- Added the first Profile/Household settings foundation with adults, children,
  dietary preferences, stores, and equipment.

---

## v0.8.1

- Fixed hydration so the newest active plan loads correctly.

---

## v0.8.0

- Cleaned up planning state and made meal-idea counts scale with the number of
  cooking days.

---

## v0.7.1

- Added reliability fixes around the preference-learning flow.

---

## v0.7.0

- Added "Make Again" preference learning so favorite meals can influence future
  suggestions.

---

## v0.6.0

- Added Friday-night pre-generation of next week's meal ideas.

---

## v0.5.0

- Introduced the two-stage AI flow: generate lightweight meal ideas first, then
  expand only selected ideas into recipes.

---

## v0.4.0

- Added meal swapping with two AI-generated alternatives.

---

## v0.3.0

- Added Supabase persistence for weekly plans, meals, recipes, grocery items,
  and checked grocery state.

---

## v0.2.0

- Added editable household size and equipment toggles.
- Added AI-generated meals and recipes plus a recipe-derived grocery list.
- Added browser persistence and server-side OpenAI calls through Vercel.

---

## v0.1.0

- Created the first static mobile-first mealz prototype with sample
  meal-planning UI.
