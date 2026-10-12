# Mealz local Supabase environment

Set up and verified 2026-10-11. This environment runs on this Windows computer in Docker, with synthetic accounts and no hosted database connection. CLI version: 2.120.0. Docker server: 29.8.2. PostgreSQL: 17.11.

## Using the app

Open PowerShell in `F:\mealz code\mealz`:

```powershell
pnpm local:start
pnpm local:app
```

Open `http://127.0.0.1:3000`. The app uses real local Supabase Auth and PostgREST. It is not the `?dev=true` browser-only demo. The simplest sign-in details are in `.local/owner-login.txt`; all three household account emails and passwords are in `.local/test-accounts.json`. Use the owner account to inspect the saved seven-day test week. These are local-only accounts and do not work in production. The optional quick-login offer can be dismissed with “not now.”

Local Supabase Studio is at `http://127.0.0.1:54323`. The Mailpit test inbox is at `http://127.0.0.1:54324`; emails stay in the local catcher. AI generation is deliberately disabled in the app server and Studio, so ordinary account, saved-week and grocery work can be tested without model charges.

When finished, press **Ctrl+C** in the app terminal, then run:

```powershell
pnpm local:stop
```

This stops only the `mealz-local` Supabase project and retains its data for next time. Closing a browser tab alone does not stop the local services. Local Docker uses computer resources; it creates no Supabase cloud branch charge.

## Repeat acceptance

Stop the app terminal first so port 3000 is free, then:

```powershell
pnpm local:start
pnpm local:verify
```

The verifier opens and closes its own app server and headless mobile browser. It creates fresh synthetic accounts each run and replaces the ignored test-account file with that run's three household accounts. It checks email confirmation using a fourth signup account, retained only as test data. The result and screenshot are in `.local/supabase-acceptance.json` and `.local/local-signed-in.png`.

## Verified evidence

Story: a household member signs in through the Mealz UI, opens a saved week, changes a grocery checkbox, and sees the same saved value after reloading.

| Boundary | Evidence |
| --- | --- |
| Browser and Auth | The shipped SDK completed password sign-in and restored its session after reload; zero browser page errors. |
| Client to API | The grocery control sent a real `PATCH /api/plan`; the response was HTTP 200. |
| API to database | The handler used real Auth and PostgREST against PostgreSQL 17.11; migration column/table probes passed. |
| Database to response | The saved week had seven complete recipe graphs; retries replayed and stale writes returned HTTP 409. |
| Response to browser | The grocery checkbox retained the saved value after browser reload; screenshot stored locally. |

All 12 real-service checks passed:

1. Signup delivers a real confirmation email to Mailpit; following the local link enables password sign-in.
2. Three synthetic household accounts sign in through real Supabase Auth.
3. Household creation, invitation joining and a separate household work through the real API.
4. Profile saving is household-scoped.
5. A seven-day save commits complete recipes and consolidated groceries through Auth and PostgREST.
6. Replaying a committed request returns the same plan without duplicate writes.
7. A stale second-member save returns HTTP 409.
8. Rebuilding preserves grocery identity, checked state and sundry purchase intent.
9. Another household cannot read or mutate the saved week through the API or direct PostgREST.
10. Auth rejects requests without a token or with an invalid signature.
11. A mobile browser grocery checkbox writes through the real API and persists after reload.
12. The actual browser SDK signs in and restores its session after reload.

The final fresh-database verification made zero AI calls and contacted no production database. All 199 unit/API/database tests also passed, including new local-address and credential-separation guards. Type checking, release checks and script syntax checks passed. Stop/start was verified: all local test containers stopped, and restarting preserved Auth-user count, saved-week count and a grocery-data checksum.

## How setup stays isolated

The local helpers require the API address `http://127.0.0.1:54321` or its localhost equivalent and the exact running database container `supabase_db_mealz-local`. Credentials, accounts, tokens, downloads and logs are under ignored `.local/`; the local app serves only root public assets and the cached real SDK, not these private files. It binds its web server to loopback.

The original prototype table definitions were absent from the canonical migration history. `supabase/migrations/*_local_prototype_baseline.sql` creates those base tables for a fresh local installation while leaving the real Supabase Auth schema and roles intact. The setup helper then applies the existing canonical `migrations/manifest.js` files. A private, unexposed `mealz_local_setup.migrations` ledger records each filename and content hash transactionally, prevents historical backfills from being replayed on restart, and refuses changed previously applied files.

Do not use this local baseline as a production migration or run `db push`, `link`, or a remote reset as part of this setup. Only a disposable local reset was used while developing and verifying the helper. Resetting the local database removes its test accounts and saved data; it is not part of ordinary startup.

The optional Vector/log analytics containers are excluded because Vector expected an unavailable Docker TCP log endpoint on this Windows installation. Database, Auth, PostgREST, gateway, realtime, storage, Studio and Mailpit are running. Docker's unsecured TCP API was not enabled to work around that issue.

## Remaining release checks

These tests use real local services and PostgreSQL 17, but they do not verify the hosted project's configuration, real outbound email delivery, actual model output, paid AI timing, or Vercel function behavior. Draft PR #22 remains unmerged, and its automatic Vercel deployment is disabled. Production migration, write pause and deployment still require their own coordinated acceptance and authorization.
