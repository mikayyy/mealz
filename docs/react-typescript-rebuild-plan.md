# Mealz React + TypeScript rebuild — living plan

Last updated: 2026-10-20 (America/New_York)
Status: D1–D3 and D6 accepted; React foundation, password sign-in/read adapters, offline reads, and conflict review implemented. Vercel project access restored; hosted browser/API acceptance needs explicit approval for the connector's temporary preview-access link. Live queue replay remains pending.
Owner: Mike Munoz, with Codex as implementation collaborator.
Implementation: [draft PR #23](https://github.com/mikayyy/mealz/pull/23), branch feat/react-frontend-foundation.

## Working agreement

This is the authoritative working plan for the rebuild. Read the current version at the start of subsequent Mealz rebuild turns. Update it before each substantive response about the rebuild, including findings, decisions, completed work, validation, open questions, and the next step. For a short clarification, a brief session-log entry is enough. If an update fails, say so; never imply it was saved.

Present meaningful decision points with at least two viable options, their pros and cons, a recommendation, and a status. Distinguish Mike's confirmed decisions from provisional recommendations. Do not silently turn proposals into requirements. Keep explanations accessible and connect React concepts to actual Mealz features.

Mike wants active participation, with small reviewable increments and opportunities to learn. Routine implementation details can proceed within agreed scope; product, architecture, and data-behavior choices should be surfaced. This agreement applies to Mealz rebuild work, not unrelated conversations.

## Confirmed goals and constraints

- Personal project for Mike and friends/family; no current commercial objective.
- Primary motivations: learn React and improve the interface. Reliability, loading time, and ongoing maintainability also matter.
- Preserve the current product closely, with deliberate improvements and continued evolution after the rebuild.
- Preserve recipes, meal plans, groceries, accounts, household sharing, and remembered-device quick login.
- Retain existing infrastructure as much as practical: GitHub, Vercel, Supabase, and existing server-side AI integrations.
- Primarily phone use; household members coordinate through shared data.
- Consider poor connectivity and no connectivity from the start.
- Build a separate version and transition only when ready.
- Identify small UX wins while protecting feature parity.
- Maintain this plan and show options with pros and cons at decision points.

## Evidence and current baseline

Reviewed source on the default branch on 2026-10-19. These are source findings, not a live production audit. README/package report v0.22.0; deployment health has not been independently verified this session.

| Finding | Evidence | Implication |
| --- | --- | --- |
| Backend routes are already TypeScript | api/plan.ts, api/_lib/auth.ts; migration-baseline Phase 2 notes | Rebuild scope can focus on the browser; TypeScript does not itself imply strict typing |
| Browser uses classic ordered scripts and globals | index.html; app.js; weeks.js; grocery-order.js | Replace browser composition with explicit modules/components rather than translating wrappers line by line |
| Important browser files defer checks | @ts-nocheck headers; tsconfig described in prior review | Use a separate strict frontend configuration; do not force backend strictness into the first milestone |
| Startup waits for several stages | auth-client.js init; account-client.js start; app.js boot | Measure authentication/config, membership, profile, active-plan, prepared-ideas, and dashboard requests separately |
| boot awaits profile, active plan, prepared ideas, then dashboard | app.js boot; weeks.js plan override | Candidate opportunity: render essential week data sooner and defer unrelated requests; measure before changing |
| Startup resets in-memory state | account-client.js start | Writing local storage is not proof of a working offline reload path; design and verify cache hydration explicitly |
| Grocery check-off and sundry intent roll back on request failure | grocery-order.js toggle and setNeeded | Current optimistic UI is not a durable offline outbox |
| Pure domain logic is shared with server/tests | shared-logic.js, shopping-logic.js, api/plan.ts import | Preserve behavior and tests; adapt packaging deliberately |
| Existing browser tests read source files directly | tests/browser/accounts.test.js and groceries.test.js | New React tests must exercise built/served output; legacy tests should continue while legacy app remains |
| CI already includes release, migration, type, runtime, unit, and browser gates | .github/workflows/test.yml | Add frontend checks without silently replacing current coverage |
| Saved-plan replacement can replace grocery row identities | api/plan.ts savePlan; docs/architecture.md | Offline operations targeting an old plan/item must not be blindly replayed |
| Plan replacement is documented as nontransactional | docs/architecture.md | Track as existing backend debt; React will not resolve it |

Existing architecture notes sometimes retain .js backend paths even though backend source is now .ts. Resolve discrepancies against current source rather than treating historical notes as current inventory.

### Feature parity checklist

- [ ] Password sign-in, signup/confirmation, password recovery/change, sign-out.
- [ ] Remembered accounts, trusted-device PIN setup/unlock/update/revoke; sensitive-action reauthentication.
- [ ] Household create/join, owner invitation rotation, member/owner controls.
- [ ] Shared profile: household size, dietary preferences, equipment; conflict warnings.
- [ ] Monday–Sunday week dashboard, current/next/past week access, explicit week_start.
- [ ] Session draft capture across profile/planning navigation.
- [ ] Prepared ideas, generated ideas, selection counts, refresh, recipe expansion.
- [ ] Saved meals, recipe wording/quantities/instructions, kid options, recipe checkboxes.
- [ ] Meal swapping, cancellation behavior, make-again feedback.
- [ ] Consolidated groceries; add/edit/delete/check-off; preserved manual changes and deletion choices.
- [ ] Sundries disclosure, week-specific purchase intent, checked state.
- [ ] Loading, empty, error, retry, expired-session, and account-switch behavior.
- [ ] Mobile navigation, focus, keyboard access, reduced motion, and scroll behavior.
- [ ] New offline behavior as separately agreed below.

Unchecked means not verified in the rebuild; it does not mean missing from the current app.

## Decision register

### D1 — React application setup
Status: accepted by Mike on 2026-10-19 — A (Vite + React + TypeScript). A preview-only branch has a successful deployment; project access and initial hosted HTML retrieval succeed. Full protected hosted acceptance remains pending.

| Option | Pros | Cons |
| --- | --- | --- |
| A. React + TypeScript with Vite, client-side app | Focuses learning on React; fits an existing API backend; explicit browser architecture | Routing, server-data caching, and offline persistence need deliberate integration |
| B. React + TypeScript with Next.js | Integrated routing and server rendering options; room for future server features | Introduces another server/client model and overlaps with current API architecture |

Rationale for A is project fit, not a claim that Vite guarantees a faster app. React's official guidance generally favors frameworks, while also documenting build-tool setups for learning or existing constraints. Before implementation, choose exact supported dependency versions and confirm the available runtime satisfies them. Initial library candidates: React Router for navigation; evaluate a server-data cache library after defining cache ownership. Do not add a global state library by default.

References:
- https://react.dev/learn/build-a-react-app-from-scratch
- https://vite.dev/guide/

### D2 — Where the separate version lives
Status: accepted by Mike on 2026-10-19 — A (new frontend directory in the existing repository).

| Option | Pros | Cons |
| --- | --- | --- |
| A. New frontend directory in the existing repository, with a separate preview deployment | Keeps API/domain logic/tests and planning together; easier compatibility tracking | Requires deliberate Vercel build/output/routing setup so legacy production still works |
| B. Separate repository and preview deployment | Clear project separation; simpler standalone frontend layout | API contracts and shared logic can drift or require a shared package; cross-origin API/auth routing needs planning |

A separate version does not require a separate repository. Directory: frontend/ (created in the implementation branch). Use a feature branch for implementation; verify preview routes and API reachability before changing any production build settings. Offline service workers must have scopes/caches that cannot intercept the legacy app accidentally.

### D3 — Offline release scope
Status: accepted by Mike on 2026-10-19 — B (offline reads plus queued grocery check-offs and sundry intent), to be implemented in steps. Sample changes now persist offline; connected downloads are read-only. The queue core is implemented/tested but live replay is not delivered.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Read previously downloaded recipes and groceries offline | Smallest scope; useful in stores/kitchens; simpler conflict handling | Shopping check-offs cannot be reliably saved offline |
| B. Offline reading plus queued grocery check-offs and sundry purchase intent | Supports the core shopping flow; immediate feedback with pending/saved distinction | Requires persistent queue, reconciliation, account/household scoping, and stale-item handling |
| C. Broad offline editing, including grocery additions/edits/deletes and planning drafts | Most flexibility | Substantially larger identity/conflict/recovery scope; delays parity |

AI generation, signup, quick-login verification, and membership changes require connectivity. Offline access must be limited to an explicitly designed previously authenticated local experience; it must not pretend to validate a new session offline. Cache expiration, sign-out, and account/household switching rules need review. Persisted data must be scoped to environment, user, household, and week.

For B: use absolute desired states rather than replaying toggle commands. Define behavior when two people set the same field differently, a plan has been replaced, an item is deleted, or membership/session validation fails. Pending changes must survive reloads and must never replay under another account. API compatibility and server support must be proven before promising automatic conflict resolution.

### D4 — Development data
Status: provisional recommendation; confirm setup during implementation planning.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Fixtures first, then isolated staging/test household before deliberate real-household testing | Repeatable development; protects current meal plans; no initial production migration needed | Requires preparing test accounts/data and choosing staging configuration |
| B. Connect the preview to the real household immediately | Realistic data right away | Preview writes can change or replace current meals/groceries; harder to test destructive flows |

Recommendation: A. A separate frontend URL does not isolate data. Prefer fixtures for initial UI work, an isolated backend environment where practical, or a dedicated test household with verified household isolation. The latter still shares infrastructure and is not equivalent to a separate backend. Verify redirect URLs, API origin/routing, and device-token/session behavior on the preview domain.

### D5 — Visual direction
Status: deferred until architecture choices and baseline are recorded.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Refine the existing Mealz identity and navigation | Familiar; easier parity review; bounded scope | Less freedom to address structural UX issues |
| B. Redesign navigation and visual identity alongside the rewrite | More freedom and a stronger visual change | More product decisions; harder to isolate behavioral regressions |

Recommendation: A initially, with small navigation improvements discussed through phone-sized examples.

### D6 — Conflicting offline shopping changes
Status: accepted by Mike on 2026-10-19 — A (show both versions and ask which to keep). The review model, resolution logic, and phone example are implemented; connected writes remain disabled until atomic server checks and isolated hosted acceptance pass.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Show the changed item and ask which version to keep | Preserves household intent; prevents silent overwrites | Occasional review step on reconnect; needs atomic server version checks |
| B. Let the last change received by the server win | Seamless reconnect; simpler product behavior | An old offline action can overwrite another member's more recent choice |

These options concern the same item/field. Replaced plans and deleted items always
need recovery rather than matching by ingredient name. Live implementation also
needs multi-tab serialization and durable acknowledgment checkpoints.

### D7 — Download lifetime on this browser
Status: provisional implementation choice for review; seven days, with sign-out clearing downloaded data.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Seven-day offline reads (provisional default) | Covers a weekly shopping cycle; bounds stale local access | Requires an online refresh after expiry |
| B. Keep downloaded views until sign-out | Longer offline availability | More stale data and longer retention on a shared browser |

Offline access is to existing local downloads, not fresh authentication. No server
read or queued write is authorized by the offline view itself.

## Investigation and delivery sequence

### Stage 1 — Baseline and architecture
Completed: source review above; working agreement; decision options; initial parity checklist.
Remaining:
- D1–D3 are resolved. D4 uses fixtures for the first increment; staging/test-household setup remains upcoming.
- Map API request/response contracts and reusable types/logic in detail.
- Record current mobile flows and measure cold/warm startup, repeat navigation, and AI calls separately.
- Define an honest performance comparison: same device/network/account/data, with actual request timings and visible-loading milestones.
- Capture existing sync and multi-member behavior; do not assume realtime updates exist.
Exit: agreed architecture, initial data/testing setup, parity scope, and measurable baseline.

### Stage 2 — Foundation and first complete flow
- Create isolated implementation branch and chosen frontend layout.
- Add strict frontend TypeScript checks without rewriting backend configuration.
- Establish route, auth, API, cache, and component boundaries.
- Prove build/deployment routing using a separate preview; keep legacy production entry point available.
- Build saved week → meals → recipe → grocery list using fixtures, then test-household data.
- Add grocery mutations and offline support to agreed scope in bounded increments.
Exit: phone-usable flow with clear loading/pending/error states, repeat navigation, and compatible grocery behavior.

### Stage 3 — Feature parity
- Add planning/generation/refresh/swap/feedback, profile and household/account flows.
- Reuse domain behavior; preserve week and grocery rules.
- Port behavioral tests to the new served build. Keep legacy tests until cutover.
Exit: parity checklist verified and household/auth separation proven.

### Stage 4 — Polish and transition
- Tune loading paths using measured evidence.
- Refine motion, focus, scroll restoration, touch targets, and accessible status feedback.
- Validate network loss/reconnect/reload, simultaneous household activity, sign-out, account switch, and stale queued actions.
- Compare legacy/rebuild behavior and performance on phones.
- Prepare concrete cutover and rollback steps; preserve database compatibility with both clients during transition.
Exit: Mike accepts the working preview and transition plan; production cutover follows that agreed plan.

## Quick-win candidates (not promised scope)

| Candidate | Benefit | Investigation needed |
| --- | --- | --- |
| Defer prepared ideas until needed | Earlier useful dashboard | Request dependency/timing measurements |
| Explicit week loading instead of legacy newest-plan hydration | Less redundant work; clearer state ownership | Verify onboarding and all week routes |
| Preserve scroll and focus on grocery mutations and return from recipes | Smoother phone use | Define navigation versus same-screen behavior |
| Consistent pending/saved/offline status | Makes persistence understandable | Durable queue and reconciliation contract |
| Larger touch targets and stable row identity | Easier shopping; smoother animation | Mobile layout/accessibility review |
| Undo deletion | Faster recovery from mistakes | Existing deletion markers/API restoration semantics; may require backend work |

## Validation and boundaries

Current increment adds frontend/ and an independent frontend CI workflow on the implementation branch. Root application, backend, schema, auth settings, and Vercel configuration are unchanged. No production data was read or written by the React preview.

Validation completed locally:
- Strict frontend TypeScript check and Vite production build pass.
- Two served-build browser tests pass at 390 × 844: saved-week/meal/recipe/grocery navigation, unchanged recipe ingredient wording versus consolidated shopping names, purchase intent/check-offs, week isolation, reload reset, invalid-week recovery, no horizontal overflow, no uncaught page errors, and no /api requests.
- Vite development mode renders without page errors; phone screenshot inspected.
- Existing root typecheck, Vercel runtime smoke, release consistency checks, and all 110 unit/database tests pass.
- Local runtime is Node 24.19.0; CI is configured for Node 22. Browser download for Playwright 1.64.1 failed in this environment, so local browser verification used Chromium 134 through the explicit executable-path override. Standard CI browser installation and the full legacy browser suite have not been verified locally.
- Build output is approximately 279 kB JavaScript / 89 kB gzip. This is a fixture build, not a measured production performance improvement.

The first adapter attempt relied on browser globals and failed in the served build. It was replaced with Vite aliases and prebundling of the existing CommonJS exports; development and production-build browser checks then passed. The router is pinned to 8.4.0 rather than the newly published 8.5.0 after the package manager's minimum-release-age check rejected 8.5.0. No policy exception is retained.

Existing backend transaction debt and strictness gaps should be tracked separately. Do not expand the rebuild into an unbounded backend rewrite. Any required API change needs its own scoped compatibility and migration plan.

## Session log

### 2026-10-19 — Discovery kickoff and planning agreement
- Mike authorized moving ahead, requested maintained planning documentation and explicit multi-option decisions.
- Reviewed browser startup/state/navigation/grocery logic, backend examples, architecture/migration notes, package configuration, CI, and browser tests.
- Confirmed serial browser startup stages and failed-mutation rollback as investigation leads, not measured production diagnoses.
- Created this living plan and linked it from the roadmap.
- Presented D1–D3 for Mike's choice; D4 and D5 have stated recommendations and remain provisional.
- Next: incorporate Mike's decisions, finish contract/performance baseline, and prepare the isolated first-flow implementation.

### 2026-10-19 — Recommended combination accepted; first React increment
- Mike selected D1=A, D2=A, D3=B. No further approval is needed for these choices.
- Implemented a strict TypeScript React/Vite frontend with week, meals, recipe, and grocery routes, using invented sample data and existing week/shopping helpers.
- Added per-week grocery check-offs and sundry selections in React state; explicitly labelled reload-reset behavior. Cloud saves and offline persistence are not implemented yet.
- Added an independent served-build browser suite and frontend CI workflow, with no changes to legacy CI or production deployment configuration.
- Preserved the legacy app and backend. Added frontend/README.md for running the preview and learning the component/data flow.
- Recorded initial wire contracts and offline constraints in docs/react-frontend-integration-notes.md.
- Visual treatment is a proposed refinement for review, not a finalized redesign. Hash routing is a provisional preview detail.
- Validation and its environment limits are listed above. The implementation is saved in draft PR #23, not approved for production cutover.
- Next: review the sample phone flow, prove a separate preview deployment and authenticated read-only test-household access, then implement persisted offline reads and the approved shopping queue.

### 2026-10-19 — Hosted preview and offline/read integration
- Mike authorized continuing the hosted preview, authenticated test-household access, offline persistence, and shopping queue work.
- Both workflows for the first increment passed on GitHub, including the legacy Mealz suite.
- Created preview-only branch preview/react-rebuild with React build/output overrides; main and PR #23 keep the legacy deployment settings. Vercel reported the first React preview deployment successful.
- Preview URL: https://mealz-git-preview-react-rebuild-fumpster-dire.vercel.app/ . It is protected by Vercel SSO. Connector project inspection and authenticated fetch both returned 403 for team fumpster-dire/project mealz; no authenticated local CLI is available. Hosted content and live API/auth flows are not yet verified.
- Added existing-account password sign-in, scoped SDK storage, online identity and household checks, runtime response validation, saved-week reads, empty-data and connection errors, and read-only connected shopping controls.
- Added seven-day origin/user/household-scoped local downloads, app-shell offline reloads, sample shopping persistence, and sign-out/account-switch cache cleanup, including redaction in other open tabs. SDK parsing is deferred to connected mode. API/auth responses are not stored by the worker.
- Added and tested a queue core with ordered desired changes, per-ack checkpointing, ambiguous-retry recognition, scope/stale-row checks, and preservation of expired pending work. It is not connected to live mutations. D6 is the next product decision; atomic server conflict checks and multi-tab serialization remain implementation prerequisites.
- Existing Supabase project mealz-v0230-preview is inactive and belongs to PR #22 acceptance work. It was not resumed, modified, or replaced. No production database changes or new paid resources were created.
- Local validation: strict typecheck/build, six queue/cache unit tests, and four served-build browser tests cover API/auth mocks, read-only controls, offline reloads and edits, recipe/grocery navigation, new-tab offline access, and cross-tab sign-out isolation. These mocks do not establish live Supabase auth or RLS acceptance. Chromium 134 override/Node 24 remain the local environment; CI targets Node 22 and standard Chromium.
- Current shell is about 294 kB JS / 93 kB gzip; the separately loaded auth SDK is about 214 kB / 55 kB gzip. No production latency improvement is claimed.
- Next: restore connector access to the owning Vercel team/project, inspect the deployed preview and API target, coordinate isolated hosted household testing, resolve D6, then add conditional server writes and connect the queue in that isolated environment.

- Follow-up verification: the second React deployment also reported success. The final privacy fix adds storage-event redaction when another tab signs out; the four browser tests passed again, including reopening a downloaded household in a new offline tab. The final preview refresh is tracked on preview/react-rebuild.
- GitHub Actions did not report a run for the latest API-created implementation commits at the time checked. Local checks passed; do not describe the newest commits as CI-green until that is verified. Earlier foundation workflows remain confirmed green.

### 2026-10-19 — Conflict review policy accepted
- Mike selected D6=A: ask which version to keep when an offline shopping change conflicts with household data. This choice is settled; do not ask for it again.
- Added a reusable conflict review component showing the saved choice and household version. The sample route /#/preview/conflicts demonstrates both choices without changing household data.
- Keeping my change preserves the queued intent against the reviewed row version and requires another check before replay. A later household change pauses it again. Using the household version removes that item's queued changes while preserving other pending items.
- Removed items cannot be recreated automatically. Replaced plans cannot receive old item edits; the user can open the current household list instead. Stale review decisions are rejected.
- Validation: strict frontend build/typecheck, nine queue/cache unit tests, and five served-build browser tests pass locally, including both phone review choices and the existing offline/auth flows. Phone layout inspected. No backend, schema, auth configuration, or production deployment changes in this increment.
- Preview refresh uses the existing preview-only branch and original deployment protection. Existing Vercel connector access is still the hosted acceptance dependency; no unchanged access probes or protection changes were made.
- Next: implement atomic server-side write preconditions and multi-tab queue coordination, connect review actions to persistent live replay in an isolated test household, and complete hosted acceptance once Vercel access is restored.

### 2026-10-20 — Vercel unblock guidance
- Mike asked what is needed to unblock Vercel. Fresh project inspection still returns 403 forbidden for team fumpster-dire / project mealz; the connected identity returns no visible teams.
- This confirms missing access in the current connection, without establishing whether its cause is the signed-in account, the integration's team/project selection, or revoked membership. No account or deployment settings were changed.
- Next user action: verify the Mealz-owning Vercel account can open the team/project in the dashboard, then manage/re-authorize the Vercel connection for that team and project. Reconnecting without correcting scope is not a verified fix. Keep deployment protection enabled; no API token needs to be pasted into chat.
- Once updated, verify project inspection and protected-preview access before resuming hosted acceptance. Documentation-only update; no application tests needed.

### 2026-10-20 — Access retry after connection changes
- Mike requested another check. Project inspection still returns 403 forbidden for fumpster-dire / mealz; team listing still returns no teams. Access is not restored, and hosted preview acceptance remains blocked.
- Prior local CLI inspection found no authenticated fallback. No unchanged retries or deployment protection changes were made.
- Next diagnostic: establish whether Mike can open the owning team's project dashboard in his browser; this separates Vercel account/team access from the ChatGPT connection's authorization.

### 2026-10-20 — Browser dashboard access confirmed
- Mike supplied a screenshot showing the Mealz dashboard under FumpsterDire at vercel.com/fumpster-dire/mealz. His browser account can access the intended project; the screenshot also shows production Ready and the React preview branch listed.
- The connector's earlier 403/no-teams result therefore differs from his browser access. This narrows the issue to the connection's identity/authorization or connector behavior; the precise cause remains unproven.
- Next: inspect the Integrations entry visible in the dashboard sidebar to establish whether the connection has a manageable installation. Avoid repeating reconnect instructions without new evidence. Screenshot is not hosted React acceptance.

### 2026-10-20 — Connection identity confirmed; no installed integrations
- Mike reports the Vercel Integrations page has no installed integrations. The earlier integration-permissions path was conditional and does not provide a fix for this connection; do not ask him to install an unrelated integration.
- A new authenticated-user diagnostic succeeds: username mikayyy, defaultTeamId team_5eaTwY5ccwceeD1SCyLvpHaO, matching the intended project team. Earlier team listing was empty and scoped project inspection returned 403. Wrong account is less likely; limited authorization or connector behavior remains unresolved.
- No verified automatic repair or authorization-management tool is available. Next inspect the ChatGPT Vercel connection details/authorization screen before prescribing further changes. Alternative: user-approved browser fallback for preview acceptance while connector access is investigated. Do not repeatedly reconnect without new evidence.

### 2026-10-20 — ChatGPT plugin screen inspected
- Mike supplied the ChatGPT Vercel plugin overview screenshot. It shows Manage, Try in chat, and an Apps section with Vercel, but no account authorization details or team selection.
- Next visible navigation: open Manage and inspect its available connection options. No new API probes, permission changes, or reconnects were made.

### 2026-10-20 — Connected account settings inspected
- Screenshots show the expected connected email, OAuth authorization, and ChatGPT permission set to Allow low-risk. They do not show Vercel team grants. The permission control governs ChatGPT action approvals and is not evidence of Vercel API team access.
- The visible account row has an ellipsis menu; inspect its available account-management actions before prescribing another reconnect. No permission or skill-toggle changes are needed based on these screenshots.

### 2026-10-20 — Account reconnect action located
- Mike reports the connected-account menu offers Rename, Reconnect, and Disconnect. Reconnect is the available account-specific authorization action.
- Next: use Reconnect, inspect the Vercel authorization flow for a team/project selector, and authorize FumpsterDire / mealz if offered. If no selector appears, record that rather than assuming scope was corrected. Reconnect is a diagnostic attempt, not a verified fix; recheck project access after completion.

### 2026-10-20 — Vercel connection restored
- After Mike completed the account-specific Reconnect action, project inspection succeeds for fumpster-dire / mealz. The production deployment reports READY.
- Authenticated fetch of https://mealz-git-preview-react-rebuild-fumpster-dire.vercel.app/ succeeds with HTTP 200 and the expected mealz React preview HTML, including built JS/CSS asset references. Deployment protection remains enabled.
- The connector-access blocker is resolved. This verifies hosted shell retrieval, not rendered UI, live Supabase authentication, household isolation, or offline replay acceptance. Next resume hosted acceptance and isolated test-household setup before enabling connected shopping writes.

### 2026-10-20 — Hosted acceptance preparation and access review
- Mike authorized continuing verification. Inspected deployment dpl_6CvAQsLuwBNa1CqeRGCqG7KgQuqy: READY, preview/react-rebuild at e93c305c7aad6c2aa67e52815c9e4085165b1197, matching the conflict-review increment. Confirmed preview-only React build/output configuration in GitHub and no preview cron entry.
- Environment metadata confirms SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY entries targeted to Preview; no branch-specific entries were returned for preview/react-rebuild. Values were not decrypted or shown. This establishes presence, not database identity or correctness.
- Automatic approval review rejected creation of a preview share link, and then rejected the authenticated-fetch tool because it also creates/reuses an authentication-bypass link. Reason: testing authorization did not explicitly authorize temporary share access to the protected deployment. No alternate bypass, protection change, or repeat attempt followed. Project access itself remains restored.
- Concrete requested access: a temporary link for this React preview only, used privately for verification; a newly created link expires in 23 hours according to the tool. Existing valid reused links can have a different expiration. Possession of the link grants deployment access, so it must not be published. Await explicit approval before using these tools again.
- Source review identifies a test candidate: frontend/src/data/api.ts uses credentials:omit for same-origin API fetches. That may omit the deployment-protection cookie even after the document opens; reproduce before changing it.
- Acceptance sequence after access: render phone week/meals/recipe/groceries and conflict examples; inspect browser errors and asset/service-worker requests; GET public auth config and establish backend project identity; verify application-auth 401 for protected APIs; select an isolated backend/test household before credentials or writes; then verify live sign-in, household/week reads, and offline/sign-out boundaries.
- Options: approve private temporary preview access (enables automated hosted checks, but anyone holding the link can access the deployment) or use manual signed-in browser checks (avoids creating a share link, but requires Mike to run/relay acceptance observations). Recommend the temporary preview link with explicit approval. No app, schema, environment, or deployment protection settings were changed, and no new application tests ran this turn.
