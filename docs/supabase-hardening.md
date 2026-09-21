# Supabase hardening baseline

Release v0.20.2 narrows database privileges and optimizes the existing
household row-level security model without changing product behavior or meal
data.

## Migration

Apply `migrations/2026-09-21_supabase_hardening.sql` after the v0.20 trusted
device migration. The migration is transactional and safe to reapply.

It:

- removes anonymous table privileges;
- limits authenticated access to the CRUD operations mealz actually uses;
- keeps rate-limit and trusted-device records service-only and default-deny;
- evaluates `auth.uid()` once per statement in all eight household policies;
- adds covering indexes for the two foreign keys reported by the database
  advisor; and
- cascades trusted-device cleanup when an Auth user is deleted.

## Generated database types

`api/_lib/database.types.ts` is generated from the production schema and is a
checked-in server-side contract. Regenerate it after every schema migration:

```sh
supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > api/_lib/database.types.ts
```

The generated contract includes the service-only operational tables because it
represents the complete server schema. It does not grant runtime access. Browser
requests remain limited by Postgres grants and RLS, and should continue through
the user-scoped helper in `api/_lib/supabase.js`.

## Verification

After applying the migration:

1. Run the security and performance advisors.
2. Confirm all eight household policies use `(select auth.uid())`.
3. Confirm `anon` has no table privileges.
4. Confirm `authenticated` has CRUD only on the six user-data tables and read
   access to the household tables.
5. Run typecheck, database/unit tests, browser tests, and the normal deployment
   checks.

The two “RLS enabled, no policy” informational notices for
`mealz_rate_limits` and `mealz_trusted_devices` are intentional. Both tables are
server-only, have no browser grants, and rely on RLS default-deny as defense in
depth.

Supabase also reports leaked-password protection as disabled. That setting must
be enabled separately in the Auth dashboard; it is not changed by this SQL
migration.
