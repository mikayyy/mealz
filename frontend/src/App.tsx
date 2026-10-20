import { useEffect, useRef } from "react";
import { HashRouter, Link, Route, Routes, useLocation } from "react-router";
import { MealzProvider } from "./data/MealzProvider";
import { WeekLayout } from "./components/WeekLayout";
import { WeeksPage } from "./pages/WeeksPage";
import { MealsPage } from "./pages/MealsPage";
import { RecipePage } from "./pages/RecipePage";
import { GroceriesPage } from "./pages/GroceriesPage";
import { AccountPanel } from "./components/AccountPanel";
import { useMealz } from "./data/MealzProvider";

function Shell() {
  const { pathname } = useLocation();
  const { mode } = useMealz();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo({ top: 0, behavior: "instant" });
    main.current?.focus({ preventScroll: true });
  }, [pathname]);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="mealz — your weeks">
          meal<span>z</span>
        </Link>
        <span className="tagline">already sorted.</span>
      </header>
      <AccountPanel />
      <main id="main" ref={main} tabIndex={-1}>
        {mode !== "signin" && mode !== "loading" ? (
          <Routes>
            <Route path="/" element={<WeeksPage />} />
            <Route path="/weeks/:weekStart" element={<WeekLayout />}>
              <Route path="meals" element={<MealsPage />} />
              <Route path="groceries" element={<GroceriesPage />} />
              <Route
                path="recipes/:mealId"
                element={<RecipePage key={pathname} />}
              />
            </Route>
            <Route
              path="*"
              element={
                <section>
                  <h1>Let’s get you back to your week</h1>
                  <Link to="/">Your weeks</Link>
                </section>
              }
            />
          </Routes>
        ) : null}
      </main>
      <footer>less planning. more good food.</footer>
    </div>
  );
}

export function App() {
  return (
    <MealzProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </MealzProvider>
  );
}
