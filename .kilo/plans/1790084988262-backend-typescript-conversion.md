# Plan: TypeScript migration Phase 2 (Backend Conversion)

## Context

Phase 1 established the error baseline for the browser files and tightened the JSDoc typings for backend files. A pilot test proved that renaming files to `.ts` breaks the local Node `--test` runner unless a loader like `tsx` is used.
We are now entering Phase 2: renaming backend `.js` files to `.ts` and using `tsx` to power the local test runner.

## Goal

Convert all backend API routes and helpers (`api/` and `api/_lib/`) from `.js` to `.ts`, introducing the `tsx` loader to preserve local test execution without adding a build step.

## Scope

- **In scope**: `api/*.js` and `api/_lib/*.js`.
- **Out of scope**: Tests (`tests/`), root scripts (`scripts/`), migrations (`migrations/`), shared dual-use modules (`shared-logic.js`, `shopping-logic.js`), and browser scripts.

## Tasks

1. **Install `tsx`**
   - Run `pnpm add -D tsx` to add it to `devDependencies`.

2. **Update npm scripts**
   - In `package.json`, update the test scripts to use the loader:
     - `"test": "node --import tsx --test tests/*.test.js"`
     - `"test:browser": "node --import tsx --test tests/browser/*.test.js"`

3. **Update Vercel configuration**
   - In `vercel.json`, update the function matcher to include `.ts` files so the 60-second execution duration applies:
     - Change `"api/*.js"` to `"api/**/*.{js,ts}"`.

4. **Rename API files to `.ts`**
   - Rename all `api/_lib/*.js` files to `.ts`.
   - Rename all `api/*.js` files to `.ts`.

5. **Resolve strict TypeScript errors**
   - Run `pnpm typecheck` after the rename.
   - Fix any new TypeScript compilation errors that emerge from the `.js` → `.ts` transition (e.g. converting JSDoc type definitions to native TS syntax where necessary, or fixing `/// <reference>` vs `import type`).

6. **Validate execution**
   - Run `pnpm test` and `pnpm test:browser` to confirm `tsx` correctly resolves the `.js` specifiers in tests to the new `.ts` files on disk.
   - Run `pnpm migration:validate` to ensure no related scripts broke.

7. **Update documentation**
   - Update `docs/typescript-migration-baseline.md` to reflect that Phase 2 is complete, `tsx` was introduced for testing, and the backend is now native TypeScript.

## Risks & Mitigations

- **Test resolution failures**: If Node `--test` fails to resolve `import { requireUser } from '../api/_lib/auth.js'` when the file is renamed to `auth.ts`, `tsx` should automatically intercept and resolve it. If it fails, ensure `tsx` is correctly passed via `--import tsx`.
- **Vercel deployment failures**: Vercel's Node builder automatically compiles `.ts` files inside `api/`. The only risk is if `vercel.json`'s glob mismatch removes the 60-second timeout, which step 3 mitigates.

## Validation

| Command | Expected |
| --- | --- |
| `pnpm typecheck` | 0 errors |
| `pnpm test` | All tests pass |
| `pnpm test:browser` | All tests pass |
