# v0.23.0 local acceptance

Verified 2026-10-06. Status: local candidate; unpublished.

## What was verified

The local harness now runs the shipped `/api/plan` handler, its input validation, user-scoped database helper, grocery reconciliation, and transactional SQL together against an isolated PostgreSQL server. It uses synthetic household data and forbids external fetches. It substitutes only the Supabase Auth response and PostgREST transport; actual SQL runs with the authenticated database role and fixture user claims.

Fourteen acceptance scenarios passed:

1. Upgrading a populated v0.22 fixture preserves existing recipes and groceries.
2. Reapplying the candidate migration preserves data and revisions.
3. A concurrent writer actually waits on the household/week advisory lock.
4. Concurrent first saves produce one success and one stale-writer conflict.
5. Only one authoritative active week exists for that household/date.
6. Replaying a committed request does not duplicate its plan.
7. A concurrent grocery edit conflicts a stale rebuild and retains the check.
8. The actual API saves seven complete recipes and consolidates groceries.
9. The actual API replays a lost-response retry without duplication.
10. A second member's stale API save returns HTTP 409 and `WEEK_CONFLICT`.
11. API rebuilding preserves plan/grocery identity, manual purchases, checks and sundry intent.
12. An injected recipe-step insertion failure rolls back the prior graph, revision and receipt together.
13. Missing and expired fixture sessions return HTTP 401.
14. Real row-level security hides another household's rows and rejects its save RPC.

The measured synthetic seven-day API save took 94 ms, its replay 13 ms, and its rebuild 38 ms in the passing run. These timings exclude real authentication, PostgREST, external network traffic and AI generation; they are local diagnostic observations, not production performance claims.

The temporary PostgreSQL server stopped when verification finished. Process inspection confirmed zero processes for that acceptance cluster. Disposable database files remain in the Windows temporary directory for inspection; no cloud branch was created or renewed.

## Repeat the local checks

From `F:\mealz code\mealz`, with existing Node 22 and pnpm dependencies installed:

```powershell
pnpm test
pnpm test:browser
pnpm release:check
pnpm typecheck
pnpm runtime:smoke
pnpm migration:validate

# The isolated PostgreSQL tools are already installed on this machine.
$env:MEALZ_PG_TOOLS = Join-Path $env:TEMP 'mealz-pg-stage2-tools'
pnpm test:local-db
```

`test:local-db` binds PostgreSQL to loopback, chooses a temporary port, creates a fresh database, uses a random database password, and shuts down in `finally`, including when an assertion fails. It does not use production credentials or contact hosted services. It requires `embedded-postgres` in the isolated tools directory; this machine has `18.4.0-beta.17` installed. It is not an application dependency.

## Results and remaining limits

- 192 unit/API/database tests passed.
- 21 browser tests passed, including pending-save recovery, late response suppression, canceled generation, and duplicate build controls. Their API/Auth/AI responses are controlled fixtures.
- Release declaration checks, type checking and API runtime smoke passed.
- The earlier full migration validation passed 104 checks; the new real-server run applied all baseline migrations and the candidate migration, including populated upgrade/reapplication.
- The local server is PostgreSQL 18.4; the hosted production database was PostgreSQL 17. These local results do not establish identical behavior on the hosted version.

No container runtime was found on PATH or at the checked Docker Desktop, Podman and Rancher Desktop locations. A full local Supabase stack is therefore not running. Supabase's native stack runtime currently does not support Windows; see [official runtime support](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).

Real Supabase Auth/email/JWT validation, PostgREST deployment behavior, hosted PostgreSQL 17 acceptance, Vercel function timing, live AI output quality and seven-day generation duration remain unverified. Continue ordinary development and regression checks locally. A future complete local stack would require a Docker-compatible runtime and proper baseline schema setup; a future cloud preview would require the additional plan cost and its shutdown policy. Neither setup is silently authorized by this verification.
