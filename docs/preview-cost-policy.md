# Temporary Mealz preview database policy

Approved 2026-10-06: development branch in Fumpster Dire, with limited cost and active shutdown controls.

- Create only for an active cloud test session; continue ordinary development locally.
- One temporary branch at a time. Parent project must be `zyqlarqlzmmcitgiqyqm`; never delete or pause that production project.
- Session duration: at most two hours. At the quoted starting compute rate of $0.01344/hour, two hours is approximately $0.02688 before other billable usage. This is an operating limit, not a provider-enforced financial cap.
- Record branch name, exact branch ID, project reference, creation time and expiry in `docs/preview-session.json`. Store no credentials there.
- Delete at session completion, a blocker requiring user input, or expiry. Verify absence by listing branches. Do not rely on inactivity to stop billing. Test fixtures are disposable; retain source, migrations and test evidence locally.
- An hourly Codex cleanup automation is a backup. It may run only while the local app/host is available; never claim a guaranteed deadline. It may delete only the recorded branch after verifying both its ID and name under the specified parent. Notify only on successful cleanup, failure or required action.
- No automatic branch creation, renewal, production merge, persistent staging environment, larger compute, production-data copy or unrelated-resource changes. Obtain renewed approval before extending a session or increasing its scope.
- Limit test activity to synthetic households and bounded acceptance cases; record branch duration and request counts. Remove obsolete preview secrets and Auth redirects after disposal when those have been configured.

Supabase branches incur usage charges beyond base compute and are not covered by its spend cap. Deletion is the available connector shutdown control. See [branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching) and [branch lifecycle](https://supabase.com/docs/guides/deployment/branching).

## Separate free preview project — authorized 2026-10-11

The user selected a separate free project in Fumpster Dire after verification that the organization remains Free and development branching requires Pro. This adds no authorization to upgrade the organization or accept paid add-ons. Create only mealz-v0230-preview, subject to actual free-project capacity and Free-plan selection. Keep GitHub integration unlinked to prevent automatic migration/deployment activity.

Retain the two-hour active-session limit and synthetic-only test scope. Record the exact new project reference and expiry before mutation/testing. Reject production reference zyqlarqlzmmcitgiqyqm in setup and cleanup. Pause the free preview at completion, user-input blockers after creation, or expiry; verify paused status instead of relying on inactivity. Do not enable the branch-delete automation for this project, because its identity and cleanup action differ. Reconfigure any backup cleanup explicitly for the exact free project before activating it, and report that host availability limits its guarantee.

Free compute/project capacity must be confirmed by the authenticated dashboard; the cost connector currently reports unavailable. Free-plan project availability is account-wide across organizations where the user is an owner/admin. See [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase). Record actual creation success rather than assuming availability from the visible project list.