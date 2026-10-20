import { Link } from "react-router";
import { useDemo } from "../data/DemoProvider";
import { weeks } from "../domain/legacy";
import { weekLabel } from "../domain/format";

export function WeeksPage() {
  const { savedWeeks } = useDemo();
  return (
    <>
      <div className="intro">
        <p className="eyebrow">A little less to think about</p>
        <h1>
          Good food.
          <br />A simpler week.
        </h1>
        <p className="muted">
          Your dinners and shopping, together in one place.
        </p>
      </div>
      <div className="week-grid">
        {savedWeeks.map((week) => (
          <article className="card week-card" key={week.id}>
            <p className="eyebrow">
              {week.weekStart === weeks.currentWeekStart()
                ? "This week"
                : "Next week"}
            </p>
            <h2>{weekLabel(week.weekStart)}</h2>
            <p className="muted">
              {week.meals.length} dinners · {week.householdSize} people
            </p>
            <ul className="week-preview">
              {week.meals.map((meal) => (
                <li key={meal.id}>
                  <span>{meal.day.slice(0, 3)}</span>
                  {meal.title}
                </li>
              ))}
            </ul>
            <div className="card-actions">
              <Link
                className="button primary"
                to={`/weeks/${week.weekStart}/meals`}
              >
                See meals <span aria-hidden="true">↗</span>
              </Link>
              <Link
                className="button secondary"
                to={`/weeks/${week.weekStart}/groceries`}
              >
                Groceries
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
