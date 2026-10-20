import { createContext, useContext, useState, type ReactNode } from "react";
import { createDemoWeeks, type SavedWeek } from "./demo";

interface DemoState {
  savedWeeks: SavedWeek[];
  setGrocery: (
    weekStart: string,
    itemId: string,
    changes: { checked?: boolean; needed_this_week?: boolean },
  ) => void;
}
const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [savedWeeks, setSavedWeeks] = useState(createDemoWeeks);
  const setGrocery: DemoState["setGrocery"] = (weekStart, itemId, changes) => {
    setSavedWeeks((current) =>
      current.map((week) =>
        week.weekStart !== weekStart
          ? week
          : {
              ...week,
              groceries: week.groceries.map((item) =>
                item.id !== itemId ? item : { ...item, ...changes },
              ),
            },
      ),
    );
  };
  return (
    <DemoContext value={{ savedWeeks, setGrocery }}>{children}</DemoContext>
  );
}

export function useDemo() {
  const state = useContext(DemoContext);
  if (!state) throw new Error("DemoProvider is missing.");
  return state;
}
