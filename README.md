# mealz

*less planning. more good food.*

mealz is a mobile-first family meal-planning app that turns weekly constraints into meal ideas, recipes, and a consolidated grocery list.

Current stack: Vercel, OpenAI Responses API, Supabase, and GitHub.

## Changelog

### v0.16.0
- Added authenticated user ownership for Profile and weekly plan data.
- Added a Supabase migration that claims existing prototype data for the sole authenticated user, then requires `owner_user_id` on Profiles and weekly plans.
- Added RLS policies across Profiles, weekly plans, meals, ingredients, recipe steps, and grocery items.
- Changed normal signed-in data requests to use the user's Supabase session token, so RLS is enforced instead of relying only on the server secret.
- Kept a temporary compatibility path before the migration is applied; the app automatically switches to user-scoped RLS access after the ownership schema is detected.
- Made Friday idea preparation ownership-aware so prepared ideas are written and read within the correct account.
- Added ownership/RLS regression tests.

### v0.15.4
- Fixed a planning-screen MutationObserver feedback loop that could drive the browser into a “page unresponsive” state.
- Made use-up conflict warnings idempotent so unchanged warnings are not repeatedly removed and reinserted.
- Limited automatic conflict-warning rendering to newly mounted planning inputs, while keeping direct input/focus updates responsive.
- Added regression coverage for observer stability.

### v0.15.3
- Added pointer cursors for enabled buttons and a not-allowed cursor for disabled buttons.
- Fixed a stale breadcrumb race where a late swap response could repaint `Weeks › Meals › Swap` after the user had already returned to the Weeks dashboard.
- Added regression coverage for both interaction-state fixes.

### v0.15.2
- Fixed a dashboard interaction bug where week/profile buttons could lose their click handlers after authenticated startup rerenders.
- Replaced per-render button binding with one delegated handler on the stable app root.
- Added regression coverage to ensure week actions remain wired across rerenders.

### v0.15.1
- Fixed an authentication bootstrap deadlock that could leave API-backed navigation appearing unresponsive.
- Added a bounded timeout for auth configuration loading.
- Changed unauthenticated API requests to fail immediately with a clear auth response instead of waiting indefinitely for a future session.
- Added regression tests for the auth startup and no-session paths.

### v0.15.0
- Added the first authentication foundation using Supabase magic-link sign-in.
- Added authenticated API request handling and server-side user verification for protected and AI-powered endpoints.
- Kept auth dormant until a Supabase publishable key is configured.
- Updated visible brand styling to lowercase `mealz` and removed the extra recipe back button in favor of breadcrumb navigation.

### v0.14.4
- Improved breadcrumb hierarchy and made more breadcrumb levels interactive.
- Added distinct styling for navigable pages, contextual hierarchy, and the current page.
- Added then later queued removal of a redundant recipe back button.

### v0.14.3
- Added direct Meals ↔ Groceries switching within the selected week.
- Preserved week context for This Week, Next Week, and Past Weeks.

### v0.14.2
- Replaced stacked back buttons with directory-style breadcrumbs.
- Reworked grocery display order to Produce → Meat & Dairy → Pantry → Frozen → Misc, oriented around a typical Trader Joe’s shopping flow.

### v0.14.1
- Fixed week navigation bugs where cached weeks could lose their route back to the dashboard.
- Added regression coverage for durable back navigation and swap-flow cancellation.

### v0.14.0
- Moved to a week-first navigation model.
- Removed global Plan / Meals / Groceries bottom navigation.
- Made Next Week, This Week, and Past Weeks the primary navigation objects.

### v0.13.1
- Added a visible Profile card to the main weeks dashboard.

### v0.13.0
- Began replacing the fake profile record stored in `weekly_plans` with a dedicated `profiles` table.
- Renamed user-facing “Household” language to “Profile”.
- Made plan replacement safer by creating the new plan before deleting the prior version.

### v0.12.0
- Migrated major AI endpoints to strict Structured Outputs.
- Added low reasoning effort, output-token caps, `store:false`, and richer telemetry.
- Changed recipe generation to retry only failed recipes within a request instead of regenerating all of them.

### v0.11.3
- Added shared client and server helper modules.
- Added deterministic logic tests and GitHub Actions CI.
- Consolidated draft, conflict, scroll, Supabase, profile, and telemetry helpers.

### v0.11.2
- Improved scroll behavior so new screens open at the top while same-screen rerenders preserve position.

### v0.11.1
- Added warnings when weekly “use up” ingredients conflict with profile dietary settings.

### v0.11.0
- Introduced the card-based Weeks dashboard with Next Week, This Week, and Past Weeks.
- Added explicit Monday–Sunday week identity and historical week access.

### v0.10.1
- Improved preservation of weekly draft state while navigating between planning and profile screens.

### v0.10.0
- Consolidated the client architecture into the main app flow and removed obsolete scripts/endpoints.
- Added a more controlled startup sequence for profile, active plan, and prepared ideas.

### v0.9.5
- Fixed stale prepared-idea behavior and empty-equipment handling.
- Filtered common salt and pepper staples from the grocery display.

### v0.9.3
- Added a Clear Equipment action.

### v0.9.2
- Added cloud-backed profile persistence using the prototype profile-storage approach.
- Made Friday pre-generation profile-aware.

### v0.9.1
- Expanded dietary preferences and equipment choices.
- Wired profile constraints more fully into AI generation.
- Hardened AI response parsing.

### v0.9.0
- Added the first Profile/Household settings foundation with adults, children, dietary preferences, stores, and equipment.

### v0.8.1
- Fixed hydration so the newest active plan loads correctly.

### v0.8.0
- Cleaned up planning state and made meal-idea counts scale with the number of cooking days.

### v0.7.1
- Added reliability fixes around the preference-learning flow.

### v0.7.0
- Added “Make Again” preference learning so favorite meals can influence future suggestions.

### v0.6.0
- Added Friday-night pre-generation of next week’s meal ideas.

### v0.5.0
- Introduced the two-stage AI flow: generate lightweight meal ideas first, then expand only selected ideas into recipes.

### v0.4.0
- Added meal swapping with two AI-generated alternatives.

### v0.3.0
- Added Supabase persistence for weekly plans, meals, recipes, grocery items, and checked grocery state.

### v0.2.0
- Added editable household size and equipment toggles.
- Added AI-generated meals and recipes plus a recipe-derived grocery list.
- Added browser persistence and server-side OpenAI calls through Vercel.

### v0.1.0
- Created the first static mobile-first mealz prototype with sample meal-planning UI.

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

Authentication and user-scoped data access are implemented as of v0.16.0. The ownership/RLS migration at `migrations/2026-09-15_user_ownership_rls.sql` must be applied in Supabase before the app switches from its temporary compatibility path to RLS-backed per-user isolation. Rate limiting and removal of remaining legacy compatibility behavior are the next security/operations steps.
