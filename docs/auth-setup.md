# mealz authentication setup

v0.15.0 adds an opt-in Supabase Auth gate. It is deliberately dormant until a browser-safe Supabase key is configured, so existing prototype behavior is preserved during rollout.

## Enable authentication

1. In Supabase, keep Email auth enabled.
2. In Supabase Auth URL Configuration, set the Site URL to the production mealz URL and add the production URL to Redirect URLs.
3. In Vercel, add `SUPABASE_PUBLISHABLE_KEY` using the project's browser-safe publishable key. Legacy projects can use `SUPABASE_ANON_KEY` instead.
4. Redeploy.
5. Open mealz and sign in with the email magic link.

`SUPABASE_SECRET_KEY` remains server-only and must never be exposed to the browser.

## Rollout behavior

- Without `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`, the app stays in legacy single-user mode.
- Once a publishable key is present, browser API calls wait for an authenticated Supabase session and attach its bearer token.
- Server API routes verify the token with Supabase before reading data or invoking OpenAI.
- The scheduled `prep-next-week` endpoint continues to use `CRON_SECRET` and is not part of browser auth.

## Important limitation before v0.15.1 / Step 4B

Authentication is now an access gate, but the database rows are still the existing shared prototype rows. Do not invite additional users yet. The next migration will add user ownership to profiles and weekly plans, scope API queries by user, and enable user-specific RLS policies before multi-user use.

For the safest interim setup, create/sign in with the owner account and then disable new-user signups in Supabase until the ownership migration is complete.
