import { useState } from "react";
import { Link } from "react-router";
import { ConflictReview } from "../components/ConflictReview";
import { createDemoWeeks } from "../data/demo";
import {
  enqueue,
  resolveShoppingConflict,
  type ShoppingConflict,
  type Snapshot,
} from "../data/offline";

function example() {
  const weeks = createDemoWeeks(),
    week = weeks[0],
    item = week?.groceries.find((row) => row.name === "cucumber");
  if (!week || !item) throw new Error("The review example is unavailable.");
  const snapshot: Snapshot = {
    version: 1,
    scope: {
      environment: "example",
      userId: "example",
      householdId: "example",
    },
    savedAt: Date.now(),
    weeks,
    pending: [],
  };
  const queued = enqueue(snapshot, week.weekStart, item.id, { checked: true });
  const operation = queued.pending[0];
  if (!operation) throw new Error("The review example is unavailable.");
  const review: ShoppingConflict = {
    reason: "item_changed",
    operation,
    latestWeek: {
      ...week,
      groceries: week.groceries.map((row) =>
        row.id === item.id
          ? { ...row, checked: false, updated_at: "household-newer-version" }
          : row,
      ),
    },
  };
  return { snapshot: queued, review };
}
export function ConflictExamplePage() {
  const [state, setState] = useState(example),
    [result, setResult] = useState("");
  return (
    <>
      <p className="demo-note">
        Example only · these choices do not change a real household.
      </p>
      {!result ? (
        <ConflictReview
          snapshot={state.snapshot}
          review={state.review}
          onChoose={(choice) => {
            setState((current) => ({
              ...current,
              snapshot: resolveShoppingConflict(
                current.snapshot,
                current.review,
                choice,
              ),
            }));
            setResult(
              choice === "keep_mine"
                ? "Your saved choice was kept for another sync check."
                : "The household version was kept. Your saved change was removed.",
            );
          }}
        />
      ) : (
        <section className="card">
          <h1>Choice recorded</h1>
          <p role="status">{result}</p>
          <p className="muted">
            Example resolved. No household data was changed.
          </p>
          <button
            className="text-button"
            onClick={() => {
              setState(example());
              setResult("");
            }}
          >
            Try the example again
          </button>
        </section>
      )}
      <Link className="back-link" to="/">
        ← Your weeks
      </Link>
    </>
  );
}
