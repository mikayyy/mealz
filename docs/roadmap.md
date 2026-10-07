# Mealz roadmap

**Last updated:** 2026-10-06

This roadmap records recent releases and later product directions. Release
numbers are proposed sequencing, not deployment promises.

## Current baseline

The production baseline is v0.22.0. It includes household accounts, week-first
planning, AI-generated meals and recipes, editable consolidated grocery lists,
grocery normalization, legacy grocery repair, and weekly sundry purchase intent.

## Recent release

### v0.22.0 — grocery sundries (deployed 2026-09-25)

Added a collapsible Sundries section above the ordinary grocery list for
recipe-required staples such as rice, couscous, cooking oils, salt, pepper, and
common spices.

Key outcomes:

- Show required staples without placing them in the default checkable list.
- Let a household member mark a sundry as needed for that week.
- Make an active sundry highlighted, labelled, and checkable.
- Preserve purchase intent across reload and same-week plan rebuilds.
- Keep intent isolated by week and household.
- Preserve recipe-specific ingredient wording and existing grocery
  consolidation.

See [Grocery sundries section plan](sundries-section-plan.md) for the complete
implementation, data model, tests, release sequence, and acceptance criteria.

## Proposed next release

v0.23.0 is now a local unreleased candidate. See [release preparation](release-v0.23.0-stage-4.md) for verification, live baseline evidence, isolated preview setup and remaining acceptance gates.

Cloud branch provisioning is blocked by the Supabase plan requirement. Local acceptance now includes the real save API against PostgreSQL, populated upgrade, concurrency, rollback and household isolation. See [local acceptance](release-v0.23.0-local-acceptance.md); hosted Auth/AI and deployed timing remain release gates.

### v0.23.0 — reliable week planning (in progress locally; unreleased)

Outcome: households can build or rebuild a week without losing their saved
plan or silently overwriting another member's changes.

- Make plan replacement atomic, with conflict detection and safe save retries.
- Correct runtime schema checks that assume every table has an `id` column.
- Bound recipe generation and retries within the function's execution budget.
- Preserve grocery edits, deletion markers, checked state, and sundry intent.
- Add executable failure/concurrency tests and reconcile release documentation.

This selects the operational-hardening opportunity based on the
[2026-10-05 code review and SWOT](code-review-2026-10-05.md).
See the [proposed release plan](release-v0.23.0-plan.md) for scope, implementation
order, acceptance criteria, and deployment gates. No release date is committed.

[Stage 1](release-v0.23.0-stage-1.md) adds failure-path regression coverage,
shared schema checks, and an interim save-cleanup fix. [Stage 2](release-v0.23.0-stage-2.md)
replaces the interim save path with a transaction, concurrent-edit protection,
and draft retry/conflict recovery. [Stage 3](release-v0.23.0-stage-3.md) adds a shared
generation deadline, classified retries and cancellation of stale browser work.
Release preparation and preview/live verification remain outstanding. All changes
are local and unreleased.

## Later opportunities

These items are intentionally unsequenced:

- **Household-customizable sundries:** allow each household to add or remove
  items from its usual-staples catalog after the fixed v0.22.0 catalog has been
  evaluated.
- **Admin dashboard:** owner-only operational visibility into signups, account
  status, debugging, AI delivery, and support diagnostics.
- **Operational hardening:** continue improving data integrity, deployment
  safety, retry behavior, observability, AI safety, client-state boundaries,
  and release hygiene as specific needs are identified.

## Roadmap rules

- Keep releases bounded around one user-visible outcome.
- Do not mix unrelated refactors into product releases.
- Preserve household RLS, authenticated data access, week identity, and recipe
  wording.
- Require migration, unit/database, browser, CI, and Vercel validation when the
  affected layer applies.
- Update this document when a planned item ships, changes scope, or is deferred.
