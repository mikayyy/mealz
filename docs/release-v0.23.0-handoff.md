# v0.23.0 candidate handoff

Updated 2026-10-11. Candidate source is published in draft PR #22. Local Docker/Supabase acceptance and real single-recipe/seven-day AI expansion have passed. Hosted authentication, outbound email, live retry/timeout behavior and deployed timing remain open.

## Final review and correction

Reviewed transactional save/replay and revision handling, client recovery and cancellation, generation deadline/retry ownership, and release/CI declarations. Found and fixed duplicate normalized meal keys in the save API. Recipe feedback targets one meal key, so a duplicated key could make a later feedback mutation affect multiple rows and fail. Saves now reject collisions before any plan mutation, including keys made equal by whitespace or fallback generation. Four new test cases cover the passing parent test and three rejection scenarios.

This correction adds no migration or configuration change beyond the already-pending candidate migration. This review is scoped to the candidate changes; it does not assert a comprehensive security audit of the entire app.

## Evidence

- 196 unit/API/database tests passed after the correction.
- All 14 real PostgreSQL/API acceptance scenarios passed again after the correction.
- Type checking, API runtime smoke, six release declaration checks and whitespace validation passed.
- Existing browser acceptance: 21 passed in the preceding local run. No browser code changed during this final correction, so those tests were not repeated.
- Existing migration validation: 104 passed. No SQL changed during this final correction; the new real PostgreSQL run verified migration application, populated upgrade and reapplication.

See [local acceptance](release-v0.23.0-local-acceptance.md) for the harness and its limits. The final synthetic save/replay/rebuild observations were 87/15/39 ms; they exclude real Auth, PostgREST, external network and AI generation. The local PostgreSQL server shuts down after the run.

## Proposed draft pull request

Repository: `mikayyy/mealz`. Proposed branch: `release/v0.23.0-reliable-planning`. Target: `main`. State: draft. Source upload and draft PR creation require destination-specific authorization; do not merge or trigger a production rollout as part of that upload.

Title: **Prepare v0.23.0: transactional week saves and bounded generation**

Description:

Weekly saving now commits recipes and groceries together, detects stale household edits, and replays committed retries without duplicate writes. Pending drafts survive reloads, and on-demand generation uses one 50-second budget with a bounded transient retry and navigation cancellation. Duplicate recipe keys are rejected before saving so later meal feedback remains unambiguous.

Validated locally with 196 unit/API/database tests, 21 browser tests from the preceding local acceptance run, 104 migration checks, 14 real PostgreSQL/API scenarios, type checking, runtime smoke and release checks. Hosted Auth/AI journeys and deployed timing remain unverified. The pending transactional migration conflicts with the old create-before-delete save code; keep this PR draft until the coordinated migration/code switch and remaining acceptance have been reviewed.

## Publication contents

The adjacent `release-v0.23.0-files.json` records intended changed/new source files with SHA-256 hashes and the local base commit. It is a review inventory, not a deployable archive or authorization to publish. Recompute it if the source changes before uploading. Preserve the existing unrelated `.kilo` plans, roadmap backup and compiler baseline. Keep local branch-session state and ignored environment files out of the PR.

## Remaining release gates

Update 2026-10-11: [real local Supabase acceptance](local-supabase.md) now covers Auth, confirmation email delivery to a local inbox, PostgREST, PostgreSQL 17 and mobile browser persistence. All 12 service checks and 199 unit/API/database tests passed. Hosted configuration, outbound email and deployed AI timing remain open; the draft PR is not ready for production merging.

1. Completed: candidate published to release/v0.23.0-reliable-planning and draft PR #22; CI passed at 7cee1cc. Automatic Vercel deployment is disabled for this exact release branch.
2. Local isolation completed using Docker and Supabase PostgreSQL 17.11. Hosted isolation pending: Fumpster Dire remains Free and branches require Pro. On 2026-10-11 the user selected a separate free project, mealz-v0230-preview, in Fumpster Dire. Creation verified: project haqifhywyswptyykncnm in us-east-1 on PostgreSQL 17.11. The reviewed schema is initialized and the project is now verified paused (INACTIVE) while awaiting its preview-only server key. See the hosted preview checklist below.
3. Local two-household/member journeys and real seven-day AI expansion passed. Repeat the relevant authenticated journeys on the isolated hosted preview; verify live retry/error handling and deployed timing. Keep local handler evidence distinct from deployed evidence.
4. Recheck the actual production schema and migration ledger, duplicates, grants and RLS. Arrange a write pause and coordinated migration/code switch, require existing tabs to reload, and authorize production changes separately.
5. Verify saving and recovery before resuming writes. If verification fails, retain the write pause and committed data and prefer a forward fix. The old save implementation is not an automatically safe rollback.

Candidate source has been committed and pushed to the release branch. Nothing has been deployed or migrated in production. The cloud cleanup automation remains paused because no preview branch exists.


## Real AI smoke-test evidence

One real four-serving recipe completed in 8.9 seconds on the first provider attempt, with the saved week unchanged and temporary credentials removed. See [real AI evidence](release-v0.23.0-live-ai-test.md). Seven-day expansion also passed in 8.444 seconds with seven provider calls, no retries and an unchanged saved week. Deployed Vercel timing remains open; this does not authorize merging or production deployment.

## Isolated hosted preview checklist — 2026-10-11

1. Verify the new project is ACTIVE_HEALTHY, named mealz-v0230-preview, in organization xztomtwtarjmnmhnulib, and on the Free plan. Record its exact reference and a two-hour expiry without credentials. Reject production reference zyqlarqlzmmcitgiqyqm before any mutation. The dashboard must not request a paid upgrade.
2. Initialize only this empty preview using the reviewed fresh-project baseline and canonical migration manifest. Copy no production accounts or data. Verify schema probes, grants, RLS and security advisors before adding synthetic accounts.
3. Prepare a manual Vercel preview for the reviewed release SHA in project prj_QQnJmrE0Jmhu8pgtfIXOCkqucrqx, team team_5eaTwY5ccwceeD1SCyLvpHaO. Override both build and runtime database configuration with preview-only keys. Keep automatic Git deployments disabled. Do not change production environment variables or alias/promote the preview to production.
4. Start AI-disabled. Verify public configuration contains only the preview URL and publishable key, never the server secret. Configure Auth redirects for the exact preview origin; verify signup, confirmation, login, household isolation, save/replay/conflict and grocery persistence. Email delivery depends on the preview Auth/SMTP configuration and must be verified separately.
5. Enable AI only for an explicitly bounded hosted acceptance run with an authorized test credential. Record endpoint, model, request count, token usage and deployed latency. Do not infer hosted success from the local seven-day result.
6. End the session at completion, a blocker or expiry: pause only the recorded free preview project, verify its paused state, and remove temporary preview deployment/configuration as appropriate. Never pause production. A later session requires explicit resumption and a new expiry. Keep migration source and evidence locally.

Current inspection: the authenticated Vercel CLI confirms the intended project and returns no deployments for the release branch. The connector lacks that team scope, so CLI is the working path. The Supabase pricing connector is unavailable; dashboard Free-plan selection and current billing documentation are the verification path. The user created the Free project. Its initial_schema migration applied successfully; all eleven public application tables are empty with RLS enabled. Security advisors returned only informational no-policy findings for the intentionally server-only rate-limit and trusted-device tables. The connector supplies public keys but no server key; the Supabase CLI lacks a current login. Preview deployment is awaiting the user-supplied preview secret in ignored .local/hosted-preview-config.json. The project was paused immediately on this blocker and pause was independently verified as INACTIVE; the cleanup backup is paused until an authorized active session resumes.

Preview deployment preparation: scripts/deploy-isolated-preview.mjs creates a fresh staging directory from git archive of the current release commit, excludes untracked files and .local credentials, removes cron configuration, and defaults to preparation only. Explicit --deploy requires the exact preview identity, a live session expiry, status active_ready_for_deployment and a modern sb_secret_ preview key. It performs read-only schema probes before uploading, targets only the named Vercel preview project, overrides build/runtime Supabase values, leaves AI disabled, and removes the temporary config after an attempted submission. Two preparation runs succeeded with zero deployments or provider requests. Production is unchanged.
