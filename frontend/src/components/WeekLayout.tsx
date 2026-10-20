import { Link, NavLink, Outlet, useParams } from "react-router";
import { useDemo } from "../data/DemoProvider";
import { weekLabel } from "../domain/format";

export function WeekLayout() {
  const { weekStart } = useParams();
  const { savedWeeks } = useDemo();
  const week = savedWeeks.find(
    (candidate) => candidate.weekStart === weekStart,
  );
  if (!week)
    return (
      <section>
        <h1>That week isn’t in this preview</h1>
        <Link to="/">Back to your weeks</Link>
      </section>
    );
  return (
    <>
      <Link className="back-link" to="/">
        ← Your weeks
      </Link>
      <div className="week-heading">
        <p className="eyebrow">Your week</p>
        <h1>{weekLabel(week.weekStart)}</h1>
        <p className="muted">
          {week.meals.length} dinners · {week.householdSize} people · already
          sorted.
        </p>
      </div>
      <nav className="tabs" aria-label="Week views">
        <NavLink to="meals">Meals</NavLink>
        <NavLink to="groceries">Groceries</NavLink>
      </nav>
      <Outlet context={week} />
    </>
  );
}
