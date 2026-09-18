# mealz v0.17.0 account rollout

## Required deployment order

1. Keep the current v0.16.3 production deployment running while preparing the database. Do not create replacement accounts for existing users.
2. In Supabase SQL Editor, run all of `migrations/2026-09-17_account_security.sql`. The v0.16 household and compatibility migrations must already be applied. The new migration preserves household/profile/meal data, adds atomic household-management RPCs and shared rate-limit counters, and narrows browser privileges for membership and invitation columns. It is safe to rerun.
3. Confirm Email authentication is enabled in Supabase. Keep email confirmation enabled. Set Site URL to `https://mealz-pink.vercel.app`, and allow that URL plus `https://mealz-pink.vercel.app/?reset=1` in Redirect URLs. If testing a Vercel preview, add its exact URLs temporarily. Verify email delivery/SMTP for confirmation and reset messages before inviting friends.
4. Keep `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`), `OPENAI_API_KEY`, and `CRON_SECRET` configured in Vercel. No additional secrets or services are needed.
5. After migration success and CI success, merge/deploy v0.17.0. Do not deploy without the migration: AI and household writes deliberately return a temporary-unavailable error when the rate-limit RPC is missing.
6. Reopen mealz. Existing signed-in users go straight to their household. In **Account → Set or change password**, set a password for future sign-ins. A signed-out existing user can choose **Forgot or need a password?** using their existing email. This preserves the account, household membership, and meal history.
7. If new-user signup was previously disabled, enable it only after this deployment. Create an invitation via **Account → Create a new invitation code**. Share it privately; the invited person creates their own account, confirms their email, signs in, and chooses **Join a household**.

## Product rules

- One household per account. Joining loads that household's existing Profile/weeks without copying or overwriting them. Creating opens Profile setup. Interrupted setup resumes if the household has no Profile yet.
- Both members and owners can edit meals and Profile. Only the owner can replace the invitation code. Replacing a code leaves current members connected; the old code stops accepting new members.
- The clear invitation code is displayed only when created/replaced. Only its SHA-256 hash and a short hint are stored in the database. If lost, create a new code in Account.
- Self-service leaving, ownership transfer, household deletion, and switching between households are not included in this release. Existing linked accounts cannot join a second household accidentally.
- Browser preferences and drafts from the old prototype are never uploaded into a new household. Startup reloads authoritative cloud data; signing out or changing accounts clears that user's scoped browser cache.

## Security and rate limits

- All normal APIs require a verified Supabase user. Missing authentication configuration, expired sessions, and database errors never enable legacy service-key reads.
- User data access, including suggestion history/favorites, uses the publishable key plus the verified bearer token and RLS. Household setup uses server-only RPCs with a verified user ID, per-user transaction locks, and existing unique membership constraints.
- Household mutations: 10 requests per authenticated account per 15 minutes, including invalid-code attempts. AI endpoints share 20 requests per household per 15 minutes. Recipe expansion allows at most seven distinct cooking days. Limits are stored atomically in Postgres and cannot be reset by a browser. Exhaustion returns HTTP 429 and Retry-After; limiter failure returns 503.
- Supabase handles password storage, confirmation, reset tokens, session refresh, and authentication endpoint rate limits. Review its Auth rate limits/email provider settings for your account. mealz does not store passwords.
- The Friday job remains protected by CRON_SECRET and runs only household-scoped preparation; missing household schema causes a safe failure.

## Verification

Use Node 22 and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

Database tests use embedded Postgres with fixtures for the Supabase roles/auth schema and the actual household/account-security migrations. They test cross-household reads/writes/reparenting on six data tables, direct membership/invite privilege denial, shared household access, atomic failure, code rotation, rate exhaustion, and window reset. No live credentials are used. Browser tests execute shipped scripts with mocked auth/API boundaries and isolated storage. CI runs both suites on Linux.

Production smoke checks after deployment:

1. Existing account: verify Profile, This Week/Past Weeks, recipes, groceries, edit/save, refresh persistence, and password setup.
2. New account: confirm email, create household, finish Profile, sign out/in, and confirm it reopens without repeating onboarding.
3. Invited account: join with the code, confirm shared Profile/meals, save a harmless preference and verify it from the owner's account. A bad code should show an error while keeping the form usable.
4. Separate household: confirm neither family's meals/Profile appear in the other. Sign out and change accounts in the same browser to check local state isolation.
5. Request a password reset, follow the email, choose a new password, and confirm the same household opens. Verify that expired/reused reset links can recover through another reset request.

The live email-delivery and live database checks require your Supabase project; mocked browser tests do not certify them. If a rollout issue appears, revert the application commit through a new deployment. The migration is additive and privilege-narrowing; do not delete household data or reverse the earlier household migrations.

References: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [auth event handling](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), and [password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
