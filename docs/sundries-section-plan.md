# Grocery sundries section plan

**Status:** deployed 2026-09-25
**Release:** v0.22.0
**Last reviewed:** 2026-09-25

## Objective

Add a collapsible **Sundries** section at the top of the grocery list for
recipe-required staples that a household will often already have, such as rice,
couscous, cooking oils, salt, pepper, and common spices.

Sundries must remain visible as recipe requirements without cluttering the
ordinary checkable shopping list. A household member can mark a sundry as
needed for the current week; it then becomes visually prominent and checkable.

Recipe ingredient wording must remain unchanged.

## Product decision

A sundry has three distinct states:

| State | Meaning | Presentation |
| --- | --- | --- |
| Available at home | Required by a recipe, but not currently needed from the store | Subdued and not checkable |
| Need to buy | The household needs more this week | Highlighted, labelled `buy`, and checkable |
| Purchased | The required sundry was bought | Checked and struck through |

Do not overload the existing `checked` value to represent purchase intent.
Whether an item is needed and whether it has been purchased are separate facts.

## Recommended experience

- Render Sundries above Produce and the other shopping sections.
- Use an accessible disclosure control. The collapsed summary should report,
  for example, `Sundries · 8 used this week · 1 to buy`.
- Start collapsed when no sundry is marked for purchase.
- Show only sundries required by recipes in the selected week.
- Preserve the combined recipe quantity, such as `3 cups long-grain rice`.
- Let the item-name control toggle whether the sundry is needed this week.
- Use a real button with `aria-pressed`; do not communicate the state with
  color or bold text alone.
- Show a checkbox only after the sundry has been marked as needed.
- If the section is collapsed with active items, keep the `to buy` count visible
  in the summary.
- Treat the disclosure's open state as UI-only state. It does not need cloud
  persistence.

## Initial classification catalog

Use a conservative, explicit catalog after grocery-name normalization. Do not
classify the entire Pantry category as sundries.

Initial groups:

- **Rice:** white, brown, jasmine, basmati, and long-grain rice.
- **Couscous:** regular, pearl, and Moroccan couscous.
- **Oils:** olive, avocado, vegetable, canola, and neutral cooking oil.
- **Seasonings:** salt, black pepper, garlic powder, onion powder, cumin,
  paprika, smoked paprika, chili powder, cayenne, red pepper flakes, oregano,
  coriander, turmeric, and cinnamon.

Keep beans, canned tomatoes, broth, pasta, breadcrumbs, flour, honey, coconut
milk, and similar pantry purchases in the ordinary list for the first release.
Hiding too many items creates a greater risk than showing an occasional staple.

## Current implementation context

- `shopping-logic.js` owns grocery-name normalization, compatible-unit
  consolidation, and rebuild reconciliation.
- `grocery-order.js` renders saved grocery rows and handles add, edit, delete,
  and checked-state interactions.
- `api/plan.ts` reads and mutates household-scoped grocery rows.
- `grocery_items` already stores generated/manual identity, source keys,
  checked state, edits, and deletion markers.
- Salt and pepper are currently removed by `PANTRY_STAPLES`; this feature should
  display them as inactive sundries instead of silently omitting them.
- Rice, couscous, oils, and most spices currently appear as ordinary Pantry
  rows.

## Data model

Add one weekly row attribute:

```sql
needed_this_week boolean not null default false
```

Do not add an `is_sundry` column. Classification should remain deterministic in
shopping logic so existing grocery rows immediately use the current catalog.

Behavior:

- Newly generated sundries default to `needed_this_week = false`.
- Ordinary generated items ignore this field and remain checkable.
- A manually added sundry starts with `needed_this_week = true`, because adding
  it manually indicates an intent to buy it.
- Turning purchase intent off also clears `checked`.
- Intent is scoped to one weekly plan and must not carry into another week.
- A same-week rebuild or meal swap must retain intent for a matching source key.

Create the migration with the Supabase CLI rather than inventing its filename.
Update the migration manifest, generated database types, PGlite fixture, offline
validation, and live-schema gate. Existing household RLS already scopes updates
through `grocery_items`; do not weaken or replace those policies.

Before implementation, check the current Supabase changelog and documentation.

## Shopping logic

1. Add and export an `isSundry()` classifier that operates on the normalized
   grocery name.
2. Replace the current salt/pepper exclusion with normal generated grocery
   rows that the classifier identifies as sundries.
3. Continue consolidating compatible quantities across recipes before
   classification.
4. Extend `reconcileGroceries()` to preserve `needed_this_week` and checked
   state for matching same-week generated rows.
5. Preserve recipe ingredient objects exactly as they were supplied.
6. Keep manual rows, user edits, deletion markers, and current conservative
   checked-state behavior intact.

## API behavior

Add a narrowly scoped PATCH action for weekly purchase intent, for example:

```json
{
  "action": "set_needed",
  "planId": "...",
  "itemId": "...",
  "needed": true
}
```

Requirements:

- Continue requiring an authenticated user.
- Scope the mutation by both grocery item and weekly plan IDs.
- Preserve the existing household data scope and RLS behavior.
- Return the updated row.
- Do not alter the existing checked-state, edit, add, or delete contracts.
- When `needed` becomes false, set `checked` to false in the same update.

## Client implementation

1. Derive `isSundry` for each visible grocery item.
2. Split the rendered data into sundries and normal shopping categories.
3. Render the Sundries disclosure before Produce.
4. Keep inactive rows subdued and non-checkable.
5. Render the item name as an accessible pressed-state control.
6. When active, add a visible `buy` indicator and the ordinary grocery
   checkbox.
7. Preserve edit and delete controls without making the entire row an ambiguous
   click target.
8. Use optimistic updates with rollback and the existing sync-error treatment.
9. Preserve mobile spacing and reduced-motion behavior.

## Required regression coverage

### Unit tests

- Approved rice, couscous, oil, and seasoning names classify as sundries.
- Variants such as `long-grain white rice`, `ground cumin`, and `neutral cooking
  oil` classify correctly after normalization.
- Beans, pasta, canned tomatoes, and other ordinary pantry purchases do not.
- Salt and pepper are emitted as sundries instead of being removed.
- Sundry quantities still consolidate across recipes.
- Recipe ingredient wording and objects are unchanged.
- Same-week reconciliation preserves purchase intent.
- A different week starts with inactive sundries.

### Database and API tests

- The migration is idempotent and the new column has a safe default.
- The live migration manifest expects the new column.
- Purchase-intent mutations require the correct plan and item IDs.
- Household isolation remains enforced.
- Turning intent off clears checked state.
- Manually adding a classified sundry marks it needed.

### Browser tests

- Sundries render above Produce and begin collapsed when none are needed.
- The summary reports total sundries and the active purchase count.
- Opening the section exposes the recipe-required staples.
- Activating rice makes it highlighted, labelled, and checkable.
- The state survives reload and a same-week plan rebuild.
- It does not appear in another week's purchase state.
- Mobile interactions, edit/delete controls, and ordinary grocery behavior still
  work.
- Recipe screens retain their original ingredient wording.

## Release sequence

1. Create a bounded feature branch, suggested name
   `feature/v0.22.0-sundries`.
2. Add the migration and data-contract changes.
3. Implement deterministic classification and reconciliation.
4. Add the API mutation.
5. Add the disclosure UI and interaction states.
6. Add unit, database, and Playwright regression coverage.
7. Run:
   - `pnpm install --frozen-lockfile`
   - `pnpm release:check`
   - `pnpm migration:validate`
   - `pnpm migration:live`
   - `pnpm typecheck`
   - `pnpm runtime:smoke`
   - `pnpm test`
   - `pnpm test:browser`
8. Apply the production migration before deploying code that writes the new
   column, following the repository's manual migration workflow.
9. Verify the Vercel preview, authenticated grocery load, reload, meal swap,
   week navigation, and mobile interaction.
10. Update the package version, title marker, README, and changelog only when
    the feature is ready to release.

## Acceptance criteria

- Sundries appear above the ordinary grocery categories.
- Only sundries required by the selected week's recipes appear.
- Inactive sundries are visible but not part of the checkable shopping list.
- A household member can mark a sundry as needed and then check it off.
- Purchase intent survives reload and same-week plan replacement.
- Purchase intent remains isolated by week and household.
- Recipe wording, grocery consolidation, manual items, edits, deletions, and
  ordinary checked-state behavior remain intact.
- Migration validation, typecheck, unit/database tests, Playwright, CI, and the
  Vercel preview are green.

## Out of scope

- A full pantry inventory.
- Automatic estimates of whether a household has run out of an ingredient.
- Household-customizable staple catalogs.
- Changes to recipe generation or ingredient categories.
- Changes to ordinary grocery ordering.
- Broad grocery personalization.

Household-customizable sundries are a logical later enhancement after the
fixed catalog has been used and evaluated.
