# Mealz roadmap

**Last updated:** 2026-09-25

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
