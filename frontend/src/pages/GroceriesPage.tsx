import { useOutletContext } from "react-router";
import type { GroceryItem } from "../../../types";
import type { SavedWeek } from "../data/demo";
import { useMealz } from "../data/MealzProvider";
import { shopping } from "../domain/legacy";
import { ingredientLabel } from "../domain/format";

export function GroceriesPage() {
  const week = useOutletContext<SavedWeek>();
  const { setGrocery, readOnly } = useMealz();
  const sundries = week.groceries.filter((item) =>
    shopping.isSundry(item.name),
  );
  const groceries = week.groceries.filter(
    (item) => !shopping.isSundry(item.name),
  );
  const active = week.groceries.filter(
    (item) => !shopping.isSundry(item.name) || item.needed_this_week,
  );
  const purchased = active.filter((item) => item.checked).length;
  const sort = (items: GroceryItem[]) =>
    [...items].sort(
      (a, b) =>
        Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name),
    );
  const row = (item: GroceryItem) => (
    <li
      key={item.id}
      className={`grocery-row ${item.checked ? "purchased" : ""}`}
    >
      <label>
        <input
          type="checkbox"
          disabled={readOnly}
          checked={item.checked}
          onChange={(event) =>
            setGrocery(week.weekStart, item.id, {
              checked: event.target.checked,
            })
          }
        />
        <span>{ingredientLabel(item)}</span>
      </label>
    </li>
  );
  return (
    <section aria-label="Grocery list">
      <div className="shopping-heading">
        <div>
          <h2>Ready for the store</h2>
          <p className="muted">Combined across your recipes.</p>
        </div>
        <p className="progress" role="status">
          {purchased} of {active.length} picked up
        </p>
      </div>
      <p className="demo-note">
        {readOnly
          ? "Shopping changes are available in the current Mealz app. This preview is read-only."
          : "Changes save on this device, including when you’re offline. Sample data never syncs to your household."}
      </p>
      {sundries.length ? (
        <details className="card sundries">
          <summary>
            Sundries <span>{sundries.length} staples to check</span>
          </summary>
          <p className="muted">
            Assumed available at home. Choose “Buy” if you need one this week.
          </p>
          <ul>
            {sundries.map((item) => (
              <li key={item.id} className="sundry-row">
                <div>
                  <button
                    className={`intent-button ${item.needed_this_week ? "needed" : ""}`}
                    disabled={readOnly}
                    aria-pressed={item.needed_this_week}
                    aria-label={`Buy ${item.name}`}
                    onClick={() =>
                      setGrocery(week.weekStart, item.id, {
                        needed_this_week: !item.needed_this_week,
                        ...(!item.needed_this_week ? {} : { checked: false }),
                      })
                    }
                  >
                    {ingredientLabel(item)}
                    <span>{item.needed_this_week ? "Buy" : "At home"}</span>
                  </button>
                </div>
                {item.needed_this_week ? (
                  <label className="sundry-check">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={item.checked}
                      aria-label={`Purchased ${item.name}`}
                      onChange={(event) =>
                        setGrocery(week.weekStart, item.id, {
                          checked: event.target.checked,
                        })
                      }
                    />
                    Picked up
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="grocery-sections">
        {shopping.SHOPPING_CATEGORY_ORDER.map((category) => {
          const items = sort(
            groceries.filter(
              (item) => shopping.shoppingCategory(item.category) === category,
            ),
          );
          return items.length ? (
            <section className="card grocery-category" key={category}>
              <h3>
                {category}
                <span>{items.length}</span>
              </h3>
              <ul>{items.map(row)}</ul>
            </section>
          ) : null;
        })}
      </div>
    </section>
  );
}
