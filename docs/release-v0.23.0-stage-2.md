# v0.23.0 stage 2 — transactional saves and draft recovery

Follow-up: [stage 3](release-v0.23.0-stage-3.md) implements bounded on-demand generation and its browser cancellation. This document records the stage 2 checkpoint and deployment constraints.

Completed locally on 2026-10-05, based on `main` commit `fabdeb9`. Nothing has been committed, pushed, deployed, or applied to the live database. Package/HTML versions remain 0.22.0. This implements the transaction stage and the essential client recovery portion of [the release plan](release-v0.23.0-plan.md).

## What changed and why

A transaction makes the complete saved week one database operation: every required change succeeds together, or all changes roll back. The previous separate REST writes could leave partial plans or erase both versions during cleanup. The new save RPC updates the existing plan ID, replaces recipes, reconciles groceries, removes prepared ideas, and records a retry receipt in one transaction.

`api/_lib/plan-save.ts` uses the existing shared shopping rules to reconcile authoritative database groceries. The SQL checks that this snapshot and the user's expected revision still match after acquiring the household/week lock. Another member's intervening edit returns HTTP 409 without replacing their work. Grocery changes and meal feedback acquire the same lock and check the same revision; child triggers also advance revisions for direct REST writes.

Saved weeks have stable IDs, and retained grocery rows preserve their IDs. Manual purchases, household edits, generated deletion markers, checked state, and weekly sundry intent survive rebuilding. Recipe ingredient wording remains separate from normalized shopping names. The complete graph and its revision are returned from one SQL snapshot.

Each unchanged draft keeps a request key under the authenticated user/household cache key. A committed request can be retried after a lost response without generating meals again or repeating writes. Replay returns the current graph for that same plan, including newer household edits. The receipt is scoped to the household and authenticated user; changing the logical payload while reusing the key conflicts.

The browser retains pending drafts across reloads without automatically uploading cached plans. A conflict offers “load saved week,” then “review your draft,” then an explicit save with a new key and the reviewed revision. Grocery requests are serialized locally. Late save/mutation responses cannot overwrite a different account or selected week. A failed meal preference update restores the previous visible preference.

## Files and database contract

- Migration: `migrations/20261006015243_transactional_week_saves.sql`, generated through Supabase CLI and registered in the repository's migration manifest.
- API: `api/plan.ts` delegates to `api/_lib/plan-handler.ts`; save validation/reconciliation lives in `api/_lib/plan-save.ts`; feedback uses the revision-checked RPC.
- Database: `weekly_plans.revision`, a partial unique active household/week index, RLS-protected request receipts, and user-scoped save/grocery/feedback/read RPCs. Functions use `SECURITY INVOKER`, fixed search paths, qualified relations, and explicit grants; anonymous execution is denied.
- Browser: `app.js`, `weeks.js`, `account-client.js`, and `grocery-order.js` track revisions, retain pending payloads, and implement explicit recovery.
- Types describe the pending schema; regenerate Supabase types after applying it in the target environment.

There is no fallback to unsafe REST saving or elevated service-key access if the migration is missing. Plan routes return an unavailable response for missing RPC/schema infrastructure. Revision numbers may advance multiple times during one save; they are concurrency tokens, not a count of user actions.

## Verification

The following checks passed locally:

| Check | Evidence |
| --- | --- |
| Unit/API/database suite | 153 passing tests, including executed handler requests, complete rollback, first-save failure, replay, changed-key payload rejection, stale writes, RLS denial, grocery preservation, feedback revisions, and duplicate-week migration refusal |
| Browser suite | 17 passing tests; includes shipped-script recovery after a lost response/reload, explicit conflict review, and late account/week response guards |
| Migration validation | 104 checks; full migration order, schema contracts, grants/RLS, and idempotent reapplication |
| Real PostgreSQL concurrency | PostgreSQL 18.4, two separate authenticated household members and database sessions; observed the second writer waiting on the advisory lock, then receiving a conflict; one active week; receipt replay; shopping check preserved against stale rebuild |
| Static/runtime checks | Typecheck, Vercel API-module runtime smoke, existing v0.22.0 release check, and Git whitespace validation |

PGlite serializes work and adapts advisory-lock calls; it establishes rollback/RLS invariants but cannot prove real multi-session locking. `scripts/verify-plan-concurrency.mjs` separately runs the unmodified migrations on an isolated loopback PostgreSQL cluster. It stops the server and retains its temporary data directory for inspection. This is local evidence, not live Supabase/Vercel validation.

To repeat the optional real PostgreSQL check in PowerShell:

```powershell
$taskTools = Join-Path $env:TEMP 'mealz-pg-stage2-tools'
npm install --prefix $taskTools --no-audit --no-fund --save-exact embedded-postgres@18.4.0-beta.17
$env:MEALZ_PG_TOOLS = $taskTools
node scripts/verify-plan-concurrency.mjs
```

This test tool is installed separately and is not an application dependency. Standard checks use the existing project dependencies: `npm test`, `npm run test:browser`, `npm run migration:validate`, `npm run typecheck`, and `npm run runtime:smoke`.

## Deployment gate

The new uniqueness rule is incompatible with v0.22.0's create-before-delete save implementation. Do not apply this migration while old save code is accepting writes. Arrange a write pause and coordinated migration/code switch, reload existing browser tabs, then verify before resuming writes. Rollback to the old save code with this index present is not a safe recovery path; prefer a forward fix and keep committed household data.

Run a read-only duplicate preflight first:

```sql
select household_id, week_start, count(*) as active_plan_count,
       array_agg(id order by created_at desc) as plan_ids
from public.weekly_plans
where status = 'active' and household_id is not null
group by household_id, week_start
having count(*) > 1;
```

Resolve any duplicate rows deliberately after inspecting their meals/groceries; the migration refuses them and does not pick or delete a winner. Verify the live migration baseline, RPC grants/RLS, and a database backup before the coordinated release. The live readiness manifest now expects the pending schema, so this code cannot be deployed against an unmigrated database.

In a preview with the new migration, verify:

1. Save/rebuild a full seven-day week and reload; confirm recipe wording and grocery edits, additions, deletes, checks, and sundry intent.
2. Use two members of one household to edit the same revision; confirm one save succeeds and the other offers conflict recovery.
3. Interrupt a response after saving, reload, and retry the retained draft; confirm the same plan/key produces no duplicate writes and no new recipe generation.
4. Load/review a conflicted draft before explicitly saving it against the newer week.
5. Switch week/account while a save is pending; confirm the late response does not change the new view. Verify another household remains isolated and an expired session closes private views.
6. Check mobile keyboard operation and the saving/recovery controls.

Request receipts currently remain until their saved plan is deleted. Retention policy and cleanup can be added once retry needs and growth are observed; do not expire them casually while recoverable drafts may still refer to them.

## Remaining release work

Bound generation and retries by one end-to-end deadline, complete broader generation/navigation cancellation, reconcile release metadata, and run authenticated preview/live acceptance. No production database change or deployment was performed in this stage.
