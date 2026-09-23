# Plan: TypeScript migration Phase 1

## Context

TypeScript was introduced in v0.20.1 (Phase 0) as a non-emitting checker — no runtime files renamed, no build step, no browser bundler. `pnpm typecheck` currently reports **0 errors**. Seven browser-global files carry `@ts-nocheck`, deferred to the "client architecture phase." The migration baseline (`docs/typescript-migration-baseline.md`) constrains Phase 1: no `.js` renames, no build step, no script-order changes.

## Current state

| Category | Status |
| --- | --- |
| `pnpm typecheck` | 0 errors |
| Checked files (API routes, helpers, shared logic, tests) | Fully typed, JSDoc coverage present |
| `types.d.ts` | 221-line manual type declarations (domain objects, API responses, DB types) |
| `api/_lib/database.types.ts` | Supabase-generated types (Rows/Ins/Upd for all 12 tables) |
| `@ts-nocheck` browser files | 7 files, deferred to client architecture phase |
| `@ts-nocheck` comment text | `"Ordered browser globals are intentionally deferred to the client architecture phase."` |
| Constraints | No `.js`→`.ts` renames in Phases 0/1, no bundler, no build output, no script reorder |

## Goal

Expand type coverage without violating Phase 0/1 constraints. Prepare the 7 `@ts-nocheck` files for eventual typing by identifying what blocks them.

## Decisions to resolve before implementation

### Q1: How to handle the 7 `@ts-nocheck` files?

**Options:**
- **A** — Leave them unchanged until a separate client-architecture decision (modules + build step) is made. Zero work now.
- **B** — Add JSDoc annotations incrementally while keeping `@ts-nocheck`, improving type documentation for future tooling.
- **C** — Run `tsc` with `--no-error-triggers` or extract the errors to establish a baseline count and ticket each one.

**Recommended: C → A hybrid.** First establish the error count per file (informational baseline). Then leave files as-is until client architecture is decided. This gives the team a concrete measure of technical debt.

### Q2: Should any checked files get stricter typing?

**Options:**
- **A** — Search for implicit `any`, `unknown`, or `Object` types in currently-checked files and add JSDoc.
- **B** — No changes to already-checked files; they're green and that's enough.

**Recommended: A.** Tighten type safety where it's cheap (API helpers, shared logic). Skip anything that requires behavior changes.

### Q3: Is a pilot `.ts` conversion in scope?

**Options:**
- **A** — No `.ts` conversion until all browser files are ready. Avoids mixed-module complexity.
- **B** — Convert one low-risk, non-browser file (e.g. `api/_lib/schemas.js`) to `.ts` as a proven path.

**Recommended: B** if the team wants a proven path; **A** if conservative. Document the decision.

## Tasks (ordered)

### T1. Establish error baseline for `@ts-nocheck` files

For each of the 7 files, run a targeted `tsc` check that surfaces what errors *would* appear if `@ts-nocheck` were removed. Record counts per file category:
- Global-script resolution (cross-file browser globals like `app`, `MealzAuth`, `globalThis.MealzLogic`)
- DOM element narrowing (`document.querySelector` return types)
- Inferred property mismatches
- Module/import resolution

This is **informational only** — does not change any files. Creates a concrete debt measure for future tickets.

### T2. Tighten types in already-checked API helpers

Search `api/_lib/*.js` for implicit `any` in function parameters, return values, and object properties. Add JSDoc `@type` annotations or convert signatures to use `types.d.ts` interfaces where applicable. Target files in order of highest call-site density:
1. `api/_lib/supabase.js` — REST client, used by all API routes
2. `api/_lib/auth.js` — session/auth helpers
3. `api/_lib/telemetry.js` — telemetry interface
4. `api/_lib/rate-limit.js` — rate-limit helpers
5. `api/_lib/profile.js` / `api/_lib/profile-store.js` — profile helpers
6. `api/_lib/validation.js` — validation helpers
7. `api/_lib/openai.js` — OpenAI request helpers
8. `api/_lib/schemas.js` — schema helpers

Verify: `pnpm typecheck` still 0 errors after each file.

### T3. Tighten types in shared logic modules

1. `shared-logic.js` — verify all function signatures are JSDoc-typed; add types for any remaining implicit `any` in return values or parameters
2. `shopping-logic.js` — same treatment; this is a UMD module so JSDoc types must not break the `module.exports` contract

### T4. (Conditional) Pilot `.ts` conversion

If Q3 decision is B, convert `api/_lib/schemas.js` → `api/_lib/schemas.ts`:
- Copy existing JSDoc types into TypeScript interfaces (many are already in `types.d.ts`)
- Update any importers (currently just `api/generate-ideas.js` and `api/_lib/schemas.js` internal)
- Verify `pnpm typecheck` still green
- Verify `pnpm test` still green
- Verify `pnpm migration:validate` still green (not affected, but confirm)

If decision is A, skip this task and document why.

### T5. Update `docs/typescript-migration-baseline.md`

After T1–T4, update the baseline doc to reflect:
- Phase 1 error baseline (if T1 surfaces numbers)
- Any `.ts` pilot conversion (if T4 happened)
- Updated file inventory if T4 adds a `.ts` file
- Decisions made on Q1–Q3

## Validation

| Command | Expected |
| --- | --- |
| `pnpm typecheck` | 0 errors |
| `pnpm test` | All pass (no test behavior changed) |
| `pnpm migration:validate` | 86/86 (unchanged) |
| If T4 runs: `pnpm test:browser` | All pass |

## Risks / mitigations

- **T1 produces many errors**: This is expected for DOM-heavy global-script files. Record them, don't fix them — that's Phase 2/3 work.
- **T2 introduces behavior changes**: Each JSDoc addition is type-only; no control flow should change. If a cast is needed, use `/** @type {...} */` inline, not runtime code.
- **T4 `.ts` conversion breaks the browser**: `schemas.js` is imported by API routes, not browser scripts directly. Low risk. Verify with `pnpm test:browser`.
- **Mixed JS/TS module resolution**: If T4 happens, verify tsconfig `moduleResolution: Bundler` handles the mix. The existing `database.types.ts` already proves TS imports work.

## Out of scope

- Converting any of the 7 `@ts-nocheck` browser files to `.ts` (requires client architecture decision first)
- Adding a frontend bundler or build step
- Renaming any `.js` files
- Changing browser script order
- Phase 2: transactional plan work, schema migration work
- Removing `@ts-nocheck` from browser files (depends on Q1 decision)
