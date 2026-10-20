# Mealz React frontend

A separate phone-first React + TypeScript rebuild. The existing root app and
backend remain independently runnable. The default mode uses invented sample
household data; the connected mode uses an existing Mealz account and is read-only.

## Run and verify

Use Node 22.12+ and pnpm 9 (matching CI):

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
pnpm --dir frontend build
pnpm --dir frontend test:unit
pnpm --dir frontend exec playwright install --with-deps chromium
pnpm --dir frontend test:browser
```

Build before the browser suite: it serves compiled output and the generated service
worker. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium when
the environment cannot download Playwright's browser. CI uses standard installation.
Local development serves the fixture app; connected mode requires the existing
same-origin `/api` functions, such as the hosted preview. No API credentials belong
in browser source or a VITE_ variable.

## Current behavior

- Saved week → meals → recipe → grocery list, using existing week/shopping helpers.
- Sample check-offs and sundry selections persist on this device, including offline
  reloads. They never sync to a real household.
- Existing-account email/password sign-in reads saved weeks through authenticated
  Mealz APIs. Live shopping controls are disabled. Quick login, signup/recovery,
  household onboarding, and plan generation remain later parity work.
- Successful connected downloads last up to seven days and are scoped to origin,
  user, household, and week. Offline access is to previously downloaded local data,
  not a new server-authenticated session. Sign out before sharing the browser.
- The app shell is cached separately. The worker never intercepts `/api` or external
  auth requests. The auth SDK is a separate chunk, loaded only for connected mode.
- Queued shopping has a tested transport-independent core, but live replay is not
  wired into the provider. It still needs an isolated hosted write test, atomic server preconditions, and multi-tab serialization.

A sample of the accepted conflict-review behavior is available at
`/#/preview/conflicts`. It shows both choices without changing a real household.

## Hosted preview

Branch: `preview/react-rebuild` (preview-only; do not merge its configuration).
URL: https://mealz-git-preview-react-rebuild-fumpster-dire.vercel.app/

The preview branch has its own `vercel.json` with the React build/output settings.
The implementation PR and main retain the legacy Vercel configuration. Preview
configuration must be reapplied when updating the preview branch from the latest
implementation commit. Do not promote this deployment or point production at it.

Vercel access was restored on 2026-10-20. The hosted sample flow and reload
persistence have been checked. Preview auth configuration currently points to
the production Supabase project; this is not an isolated backend. Connected mode
remains read-only. The existing isolated Supabase preview project is paused; no
new project was created and it has not been resumed for this rebuild.

Same-origin API requests retain deployment-protection cookies as well as the
Mealz Bearer token. The browser test models a cookie-protected API. Hosted
sign-in and household acceptance remain pending; see the living rebuild plan.

## React/data structure

- `App.tsx`: routes and shell; `AccountPanel`: sign-in/downloaded-account UI.
- `MealzProvider`: mode, account boundaries, sample state, authenticated downloads.
- `validation.ts` and `api.ts`: validate unknown JSON and use explicit week IDs.
- `offline.ts`: scoped snapshots and conservative queue/checkpoint logic.
- `domain/legacy.ts`: actual shared UMD/CommonJS helpers through Vite aliases.
- `vite.config.ts`: emits a versioned service worker using this build's assets.

Hash routing is a provisional preview choice. The living decision register is in
[the rebuild plan](../docs/react-typescript-rebuild-plan.md).
