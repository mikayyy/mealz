# Mealz React frontend

First rebuild increment: a phone-first, fixture-backed React + TypeScript app.
The existing root application and backend remain independently runnable.

## Run and verify

Use Node 22.12+ and pnpm 9 (matching repository CI):

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
pnpm --dir frontend build
pnpm --dir frontend exec playwright install --with-deps chromium
pnpm --dir frontend test:browser
```

The browser suite serves the production build, so build before running it.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing Chromium
binary for environments where browser downloads are unavailable. CI uses the
standard Playwright-managed browser.

## What works in this increment

- This/next week → meals → recipe → groceries.
- Existing domain behavior for Monday–Sunday weeks, grocery consolidation,
  shopping categories, and sundry classification.
- Grocery check-offs and sundry purchase intent, isolated per sample week.
- State survives screen navigation within the open app; reload resets it.
- Mobile layout, labelled controls, navigation focus, reduced-motion handling,
  invalid-week recovery, and direct hash-route reloads.

## Boundaries

The preview uses invented household data and makes no Mealz API requests.
It does not sign in, generate plans, save to Supabase, support offline reloads,
or queue cloud writes yet. No credentials are required. Never describe the sample
check-offs as cloud saves. Keep the sample-data banner until a real authenticated
data mode is implemented.

There is no deployment configuration change in this increment. Root Vercel
settings still serve the legacy app; an existing automatic PR deployment should
not be advertised as the React preview. A separate preview build/routing proof is
the next infrastructure step.

## How the React pieces fit

- `src/main.tsx` mounts the app; `App.tsx` defines routes and the shared shell.
- `DemoProvider` owns the current sample weeks using React state. Components read
  that state through context instead of browser globals.
- `WeekLayout` finds the selected week and passes it to its route's page.
- Pages display their data and send explicit desired changes back to the provider.
- `domain/legacy.ts` imports the existing UMD/CommonJS helpers through Vite aliases.
  The declarations describe that boundary; they are not runtime JSON validators.
- `contracts.ts` records existing API shapes for the next authenticated adapter.

Hash routing keeps this fixture preview portable without a catch-all hosting
rewrite. It is a provisional preview detail, not a permanent production URL choice.
Do not introduce a service worker until its scope, cache ownership, and account
switch behavior have been tested separately from the legacy app.

See [the living plan](../docs/react-typescript-rebuild-plan.md) for decisions,
scope, progress, and validation limits.
