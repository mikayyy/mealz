# v0.23.0 release preparation

Prepared 2026-10-06. Status: local release candidate; unpublished.

## Candidate changes

Package version, HTML title, README and newest changelog entry now identify v0.23.0 as unreleased. The release check validates the exact current title, the unique Current release section, candidate/released state, newest changelog entry, and every Supabase SDK script pin. Historical version mentions cannot satisfy it.

Credential-free PR checks run local migration validation. The separate manually dispatched `preview-preflight.yml` uses the `release-preview` GitHub environment and requires its scoped Supabase credentials. Missing credentials fail this gate; each read-only table/column request has an eight-second timeout. RPC grants, RLS and authenticated journeys require separate verification. Configure environment protections and preview-only secrets before dispatching; do not place production secrets in this environment.

## Read-only live evidence

- Public production HTML title: `mealz v0.22.0`.
- Existing Vercel production deployment `dpl_81X433ST8DzdX3sx5xk3Ms4VKazx` is Ready. Local CLI access to the existing `fumpster-dire` scope works; the connector deployment read returned a scope authorization error.
- Supabase project `mealz` (`zyqlarqlzmmcitgiqyqm`) is active; no development branches exist.
- Duplicate active household/week groups: zero at this check.
- Transaction receipt table is absent, confirming the candidate migration is unapplied.
- Sundry purchase-intent column exists, but the migration ledger records only the hardening and editable-grocery migrations. Reconcile actual schema with migration files before initializing a branch; its replayed history may omit existing production objects. Do not blindly rerun historical backfills on production.

No production database writes, migration applications, commits, pushes or deployments were performed.

## Preview setup and acceptance

1. Create an isolated database after confirming its ongoing cost. A Supabase branch has separate credentials and starts without production data; inspect its replayed schema against the manifest and install missing baseline migrations only there. See [Supabase branching](https://supabase.com/docs/guides/deployment/branching).
2. Apply the candidate migration to that isolated database. Verify tables, functions, indexes, grants, RLS and duplicate prevention. Seed synthetic data with two household members and a second isolated household.
3. Deploy to the existing Vercel project's Preview environment with that database's URL/keys and exact Auth redirects. Review client public configuration as well as server secrets. Vercel Preview separates deployment configuration; external database isolation must be configured explicitly. See [Vercel environments](https://vercel.com/docs/deployments/environments).
4. Run the authenticated preflight and the release-plan acceptance journey: concurrent edits, lost save response/retry, reload recovery, household separation, expired session and mobile keyboard use.
5. Measure real one-day and seven-day ideas/expand/swap requests using request IDs and stage timings. Verify the deployed function duration exceeds the 50-second budget. Induce a slow provider response and one retry; confirm bounded completion, no partial saved week, and no late update after navigation. Record measured times and outcomes here; simulated tests are not deployed timing evidence.

## Local validation

After branch provisioning was blocked, the user chose local verification. See [local acceptance evidence and repeatable checks](release-v0.23.0-local-acceptance.md) for 14 additional real PostgreSQL/API scenarios, shutdown verification and the limits of controlled Auth/transport tests.

Release declarations, type checking, API runtime smoke, 104 migration checks and 21 browser tests pass. All 192 unit/database tests pass. Preview timing and authenticated cloud journeys remain unverified.

## Preview provisioning attempt and cost controls (2026-10-06)

User approved the quoted branch cost conditional on limited runtime. Implemented [temporary preview cost policy](preview-cost-policy.md), a two-hour session lease in `preview-session.json`, immediate cleanup on completion/blockers, and an hourly local cleanup backup. Base compute for a two-hour session would be approximately $0.02688; other usage can add cost, and no provider spend-cap guarantee applies.

Supabase rejected creation with `PaymentRequiredException`: branching requires Pro or above. Verification found no branch named `mealz-v0230-preview-20261006`; only the default `main` entry referencing production exists. No preview database was provisioned. The cleanup automation is paused because there is no preview resource to clean up. No plan upgrade, migration application or deployment was performed. Cloud acceptance remains blocked by the plan requirement; evaluate the additional plan cost before authorizing an upgrade, or use a local Supabase environment for further checks.

## Production switch procedure

After preview acceptance and explicit production authorization, arrange a write pause, verify current duplicates/schema, apply the reviewed migration, switch to the matching code, and require old browser tabs to reload. The old create-before-delete save path conflicts with the new uniqueness constraint. Verify authenticated saving before resuming writes. Prefer a forward fix or continued write pause over reverting to the unsafe old save path; preserve committed data.
