import type { Snapshot, ShoppingConflict } from "../data/offline";
import { ingredientLabel } from "../domain/format";

interface Props {
  snapshot: Snapshot;
  review: ShoppingConflict;
  onChoose: (choice: "keep_mine" | "use_household") => void;
}
export function ConflictReview({ snapshot, review, onChoose }: Props) {
  const { operation, latestWeek, reason } = review;
  const local = snapshot.weeks
    .find((week) => week.id === operation.request.planId)
    ?.groceries.find((item) => item.id === operation.request.itemId);
  const remote =
    latestWeek?.id === operation.request.planId
      ? latestWeek.groceries.find(
          (item) => item.id === operation.request.itemId && !item.deleted,
        )
      : undefined;
  const canKeepMine = reason === "item_changed" && !!local && !!remote;
  const label = (item: NonNullable<typeof local>) =>
    operation.request.action === "toggle"
      ? item.checked
        ? "Picked up"
        : "Still to buy"
      : item.needed_this_week
        ? "Buy this week"
        : "Available at home";
  return (
    <section
      className="card conflict-review"
      aria-labelledby="conflict-heading"
    >
      <p className="eyebrow">A quick check before syncing</p>
      <h1 id="conflict-heading">
        {reason === "plan_replaced"
          ? "Your household has a new plan"
          : reason === "item_removed"
            ? "This item was removed"
            : "Which change should we keep?"}
      </h1>
      <p className="muted">
        {reason === "plan_replaced"
          ? "Your saved shopping changes belong to the previous plan. Open the current list to check what you need."
          : reason === "item_removed"
            ? "This item is no longer on the household list. We won’t add it back automatically."
            : "This item changed in your household while you were offline. Nothing has been overwritten."}
      </p>
      <div className="conflict-versions">
        <article>
          <h2>Your saved change</h2>
          <p>
            {local ? ingredientLabel(local) : "Item from the previous list"}
          </p>
          {local ? <strong>{label(local)}</strong> : null}
        </article>
        <article>
          <h2>Household version</h2>
          <p>
            {remote
              ? ingredientLabel(remote)
              : reason === "plan_replaced"
                ? "A replacement weekly list"
                : "No longer on the list"}
          </p>
          {remote ? <strong>{label(remote)}</strong> : null}
        </article>
      </div>
      <div className="card-actions">
        <button
          className="button primary"
          onClick={() => onChoose("use_household")}
        >
          {reason === "plan_replaced"
            ? "Open current household list"
            : reason === "item_removed"
              ? "Discard unavailable change"
              : "Use household version"}
        </button>
        {canKeepMine ? (
          <button
            className="button secondary"
            onClick={() => onChoose("keep_mine")}
          >
            Keep my change
          </button>
        ) : null}
      </div>
      {canKeepMine ? (
        <p className="demo-note">
          Keeping your change checks the household version again before saving.
          If it changes again, we’ll ask again.
        </p>
      ) : null}
    </section>
  );
}
