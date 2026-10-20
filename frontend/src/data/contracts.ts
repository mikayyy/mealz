import type { GroceryItem, Meal, WeeklyPlan } from "../../../types";

// Existing wire contracts; parse untrusted JSON at the real API adapter boundary.
// These declarations alone do not validate a server response.
export interface PlanResponse {
  plan: WeeklyPlan | null;
  meals: Meal[];
  groceryItems: GroceryItem[];
}

export interface WeekSummary {
  id: string;
  weekStart: string;
  householdSize: number;
  cookingDays: string[];
  useUp: string;
  notes: string;
  mealCount: number;
  meals: Array<Pick<Meal, "id" | "day" | "title" | "emoji" | "total_minutes">>;
  createdAt: string;
  updatedAt: string;
}

export interface WeeksResponse {
  current: WeekSummary | null;
  next: WeekSummary | null;
  past: WeekSummary[];
}

export type GroceryStateRequest =
  | { planId: string; itemId: string; action: "toggle"; checked: boolean }
  | { planId: string; itemId: string; action: "set_needed"; needed: boolean };

export interface GroceryStateResponse {
  item: GroceryItem;
}
