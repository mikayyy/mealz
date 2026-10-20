# React frontend integration notes

Source review: 2026-10-19. Implementation branch: `feat/react-frontend-foundation`.
This is an implementation companion to the living rebuild plan, not another
decision register. The first frontend increment uses fixtures only.

## Existing API boundaries

| Purpose | Request | Response / behavior |
| --- | --- | --- |
| Public auth config | GET /api/auth-config | Safe public configuration; never a server secret |
| Household resolution | GET /api/household | linked, household, role, needsProfile |
| Household profile | GET /api/profile | profile, source |
| Week overview | GET /api/weeks?current_start=YYYY-MM-DD&next_start=YYYY-MM-DD | current, next, past; summaries only |
| Complete saved week | GET /api/plan?week_start=YYYY-MM-DD | plan, meals with ingredients/steps, groceryItems; absent plan returns plan:null |
| Grocery purchased state | PATCH /api/plan with planId,itemId,action:toggle,checked:boolean | item; desired state, not a flip command |
| Sundry purchase intent | PATCH /api/plan with planId,itemId,action:set_needed,needed:boolean | item; needed:false clears checked on the server |

Protected requests need the authenticated user's Bearer token. The server verifies
identity and household membership and uses household RLS. The React client must
never receive service credentials or retry failures with elevated credentials.
API responses currently use Cache-Control:no-store: offline persistence must be
an explicit application cache, not incidental HTTP caching.

The initial browser adapter must validate JSON at runtime, handle 401/403 without
replaying data from another user, and pass explicit week identity. The type-only
contracts in frontend/src/data/contracts.ts are documentation, not validation.

## Startup changes to evaluate

Current source path:
auth config/session → household membership → profile → legacy active plan →
prepared ideas → dashboard overview → optional week prefetch.

Proposed path, subject to measurements and onboarding rules:
auth/session → membership → essential overview; fetch a selected week's complete
data explicitly. Load profile/prepared ideas when required and parallelize only
independent requests. Never parallelize past an unresolved authorization boundary.

No authenticated live baseline has been measured. The fixture build's performance
does not establish an improvement over production, and its compressed bundle size
is not a time-to-interactive measurement.

## Offline shopping implementation requirements

1. Persist downloaded weeks and pending desired states under separate environment,
   user, household, and week keys. Decide local-cache lifetime and sign-out handling.
2. Persist a change before reporting that it will survive a reload. Treat storage
   failures explicitly. Only report saved-to-cloud after server acknowledgment.
3. Include plan and grocery IDs plus operation identity in pending records.
   Preserve ordering between dependent sundry intent and checked-state operations.
4. Revalidate identity/membership before replay. Suspend replay on auth failures;
   never replay another account's queue or use an offline PIN as server validation.
5. Reconcile with current cloud data before replay. Saving/replacing a week can
   replace plan/item IDs. Deleted or stale targets require recovery, not blind
   remapping by ingredient name.
6. Decide simultaneous-member conflict behavior before implementation. The
   existing PATCH path has no version/precondition check; updated_at is written,
   not used as an optimistic concurrency guard. Current missing-item errors can
   return 500, so do not infer a permanent conflict from HTTP status alone.
7. Test close/reopen, offline reload, network loss during a request, retry after an
   ambiguous response, account switch, week replacement, and another member's edit.
8. Add an app-shell service worker only on the isolated preview with bounded scope
   and cache names. Do not cache secret responses or intercept legacy production.

## Next review point

The fixture flow is ready for interface feedback. Next implementation work should
prove separate preview build/routing and authenticated read-only test-household
access, then add persisted offline reads and queued shopping state. The shared
backend, production account flows, and production data have not been changed.

## Second increment — authentication and offline groundwork

The provider now supports sample mode and existing-account password sign-in. It
uses the pinned Supabase browser SDK, an isolated auth storage key, verified online
identity, household resolution, and validated week-specific plan responses. It does
not introduce privileged client access. Connected grocery controls are disabled.

Snapshots and the last downloaded scope use local storage so an offline page can
reopen after a tab closes. Seven days is the provisional maximum offline-read age.
Offline access is to previously downloaded local data; it does not verify server
membership or a new session offline. Switching accounts/signing out clears the
previous user's downloaded snapshots. Empty-household onboarding is not implemented.

A generated service worker caches index.html and the build's JS/CSS only, within
this React preview origin. It ignores /api and cross-origin requests. Immutable
asset matching ignores Vary headers: Vite preview's Vary:Origin otherwise makes
cache.addAll assets fail to match module/script requests on an offline reload.
The auth SDK is dynamically loaded and its built chunk is available offline.

The queue core persists desired operations and per-ack checkpoints, preserves
ordering, recognizes already-applied retries, and pauses on changed scopes, replaced
plans, deleted items, or changed row timestamps. Expired view caches do not silently
delete pending operations. It is tested against in-memory transports, not enabled
for real cloud writes. A read-then-compare in this core is NOT atomic: before live
replay, add a backward-compatible server-side expected-version predicate (or another
atomic conflict mechanism) and multi-tab queue coordination. Do not claim that the
existing API prevents writes between the read and PATCH.

The preview-only branch overrides Vercel build/output settings and omits the cron
job. Main and PR #23 retain their original Vercel configuration. The first React
preview deployment was reported successful, but direct access reaches Vercel SSO
and the connector's authenticated fetch returns 403 for team fumpster-dire/project
mealz. Do not disable protection to work around that access issue. There is no local
Vercel CLI authentication available. Hosted API/auth verification remains blocked.

The inactive Supabase project mealz-v0230-preview is associated with separate PR #22
acceptance work. It was not resumed or modified. Coordinate its eventual test session
and schema compatibility rather than silently changing that workstream.
