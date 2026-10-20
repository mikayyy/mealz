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
