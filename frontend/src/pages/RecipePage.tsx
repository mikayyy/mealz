import { Link, useOutletContext, useParams } from "react-router";
import type { SavedWeek } from "../data/demo";
import { ingredientLabel } from "../domain/format";

export function RecipePage() {
  const week = useOutletContext<SavedWeek>();
  const { mealId } = useParams();
  const meal = week.meals.find((candidate) => candidate.id === mealId);
  if (!meal)
    return (
      <section>
        <h2>Recipe not found</h2>
        <Link to="../meals">Back to meals</Link>
      </section>
    );
  return (
    <article className="recipe">
      <Link className="back-link" to="../meals">
        ← Meals
      </Link>
      <p className="eyebrow">{meal.day} dinner</p>
      <h2 className="recipe-title">{meal.title}</h2>
      <p className="muted">{meal.description}</p>
      <p className="recipe-meta">
        {meal.total_minutes} minutes <span aria-hidden="true">·</span>{" "}
        {meal.servings} servings
      </p>
      <div className="recipe-columns">
        <section className="card">
          <h3>Ingredients</h3>
          <ul className="ingredients">
            {meal.ingredients.map((item, index) => (
              <li key={`${meal.id}-${index}`}>
                <label>
                  <input type="checkbox" />
                  <span>{ingredientLabel(item)}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
        <section className="steps">
          <h3>Let’s cook</h3>
          <ol>
            {meal.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {meal.kid_note ? (
            <aside className="kid-note">
              <h4>For the little ones</h4>
              <p>{meal.kid_note}</p>
            </aside>
          ) : null}
        </section>
      </div>
    </article>
  );
}
