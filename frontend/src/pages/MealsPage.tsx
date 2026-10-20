import { Link, useOutletContext } from "react-router";
import type { SavedWeek } from "../data/demo";

export function MealsPage() {
  const week = useOutletContext<SavedWeek>();
  return (
    <section aria-label="This week's dinners" className="meal-list">
      {week.meals.map((meal) => (
        <article className="card meal-card" key={meal.id}>
          <div className="meal-top">
            <p className="eyebrow">{meal.day}</p>
            <span className="time">{meal.total_minutes} min</span>
          </div>
          <h2>
            <Link to={`../recipes/${meal.id}`}>{meal.title}</Link>
          </h2>
          <p className="muted">{meal.description}</p>
          <div className="meal-bottom">
            <div className="tags">
              {meal.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <Link className="recipe-link" to={`../recipes/${meal.id}`}>
              Cook this <span aria-hidden="true">→</span>
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}
