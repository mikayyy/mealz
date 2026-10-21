# React acceptance households

Mike selected dedicated synthetic households on the existing backend on
2026-10-20. This shares production infrastructure but does not use the family's
accounts or meal plans. Setup is prepared; it has not been run against the backend.

## Run setup

Use the React implementation branch and install its existing frontend dependencies.
First inspect the operation without credentials or writes:

```sh
node scripts/setup-react-test-households.mjs
```

In a private local terminal, supply the existing project's `SUPABASE_SECRET_KEY`
and `SUPABASE_PUBLISHABLE_KEY` as environment variables using your secret manager
or a hidden-input prompt. Do not paste either into chat or command arguments.
The secret must be for `zyqlarqlzmmcitgiqyqm`; no new server key is required if an
existing one is available. Then run:

```sh
node scripts/setup-react-test-households.mjs --apply --existing-backend
```

Remove the secret from the terminal environment afterward. The setup uses the
supported Auth Admin API, auto-confirms only its three generated accounts, and
sends no email. It creates two clearly named households, with an owner and member
in A and a separate owner in B, and one complete sample week per household.
It runs actual password sign-in and user-token RLS read checks, then signs those
test sessions out. No schema migration, real-household mutation, or AI request
is included. It does not enable React shopping writes.

The private checkpoint `.env.react-test-households.json` contains generated test
passwords and fixture IDs. Existing `.env*` ignore rules exclude it from Git.
Keep it private and retain it for reruns; do not delete it to bypass a failed or
ambiguous setup. A lost Auth-create response requires checking that exact
synthetic email before retrying. Reruns reset only the recorded fixture rows.
The script is scoped to this one approved project and refuses other project URLs.

Current setup blocker: Vercel marks the existing server secret sensitive and does
not return its value; the Supabase connector exposes publishable keys, not Auth
Admin provisioning. No server secret is present in this workspace. Do not work
around that by inserting password records directly into `auth.users`.

## Hosted acceptance after setup

1. Sign in to the protected React preview as A's owner, then its member. Confirm
   the same synthetic week, full recipe, and disabled grocery controls.
2. Sign in as B's owner. Only B's week may appear. Try A's week/row identities
   through user-scoped REST and the hosted APIs; expose no A data.
3. Download A's week, disconnect, reload and open it in another tab. Confirm
   downloaded/read-only status. Sign out and confirm both tabs redact A's data.
4. Reconnect as B. A's downloads and pending state must not appear or replay.

Local mocked browser tests do not substitute for these live checks. The setup's
direct Auth/RLS checks also do not establish hosted browser/API acceptance.

## Pending backend migration

Draft PR #22 (`release/v0.23.0-reliable-planning`) adds transactional weekly saves,
request replay, revisions and concurrency handling. Its separate free Supabase
project `mealz-v0230-preview` was paused by the temporary-test policy after its
session; it is not a paused production migration.

Production inspection on 2026-10-20 found no weekly-plan revision column,
transactional-save RPCs, receipts table, or active-household-week unique index.
The migration ledger contains only two recorded historical migrations even though
later schema features exist. Verify actual schema; do not replay old migrations
or manufacture history entries merely to align the ledger.

Read-only React work can proceed on today's schema. Before enabling new live save
or offline replay behavior, coordinate PR #22's backend contract and production
rollout. Its new unique index conflicts with today's create-before-delete save
code; applying SQL alone is unsafe. The release handoff requires a write pause,
coordinated code/database switch, old-tab reload, and post-switch verification.

Recommended sequence: continue React reads/UI and test-data setup, complete the
backend release's isolated hosted acceptance, then adapt React writes to the
accepted backend version. The alternative is a smaller concurrency change on the
old backend, which may arrive sooner but duplicates work and increases integration
risk. No production migration or PR merge is included in fixture setup.
