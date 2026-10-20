import type {
  GroceryItem,
  Meal,
  WeeklyPlan,
  HouseholdStatusResult,
} from "../../../types";
import type { PlanResponse, WeeksResponse, WeekSummary } from "./contracts";
import type { SavedWeek } from "./demo";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Mealz received an invalid response.");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Mealz received invalid text.");
  return value;
}
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new Error("Mealz received an invalid list.");
  return value.map(text);
};
const num = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Mealz received an invalid number.");
  return value;
};
const flag = (value: unknown): boolean => {
  if (typeof value !== "boolean")
    throw new Error("Mealz received an invalid state.");
  return value;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error("Mealz received an invalid list.");
  return value;
};
const nullable = (value: unknown): string | null =>
  value == null ? null : text(value);
const categories = new Set([
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Frozen",
  "Bakery",
  "Pantry",
  "Other",
]);
function category(value: unknown): GroceryItem["category"] {
  const result = text(value);
  if (!categories.has(result)) throw new Error("Unknown grocery category.");
  return result as GroceryItem["category"];
}
export function parseMeal(value: unknown): Meal {
  const v = record(value);
  return {
    id: text(v.id),
    day: text(v.day),
    title: text(v.title),
    description: v.description == null ? "" : text(v.description),
    emoji: v.emoji == null ? "" : text(v.emoji),
    servings: v.servings == null ? 1 : num(v.servings),
    total_minutes: v.total_minutes == null ? 0 : num(v.total_minutes),
    difficulty: v.difficulty == null ? "" : text(v.difficulty),
    tags: v.tags == null ? [] : strings(v.tags),
    kid_note: nullable(v.kid_note),
    steps: strings(v.steps),
    ingredients: list(v.ingredients).map((item) => {
      const i = record(item);
      return {
        name: text(i.name),
        quantity: i.quantity == null ? null : num(i.quantity),
        unit: nullable(i.unit),
        category: category(i.category),
        optional: i.optional == null ? false : flag(i.optional),
      };
    }),
  };
}
export function parseGrocery(value: unknown): GroceryItem {
  const v = record(value);
  const source = text(v.source);
  if (source !== "generated" && source !== "manual")
    throw new Error("Unknown grocery source.");
  return {
    id: text(v.id),
    weekly_plan_id: text(v.weekly_plan_id),
    name: text(v.name),
    quantity: v.quantity == null ? null : num(v.quantity),
    unit: nullable(v.unit),
    category: category(v.category),
    checked: flag(v.checked),
    needed_this_week: flag(v.needed_this_week),
    source,
    source_key: nullable(v.source_key),
    user_modified: flag(v.user_modified),
    deleted: flag(v.deleted),
    created_at: text(v.created_at),
    updated_at: text(v.updated_at),
  };
}
export function parseSavedWeek(value: unknown): SavedWeek {
  const v = record(value);
  return {
    id: text(v.id),
    weekStart: text(v.weekStart),
    householdSize: num(v.householdSize),
    meals: list(v.meals).map(parseMeal),
    groceries: list(v.groceries).map(parseGrocery),
  };
}
export function parsePlan(value: unknown): PlanResponse {
  const v = record(value);
  const meals = list(v.meals).map(parseMeal),
    groceryItems = list(v.groceryItems).map(parseGrocery);
  if (v.plan == null) return { plan: null, meals, groceryItems };
  const p = record(v.plan);
  const plan: WeeklyPlan = {
    id: text(p.id),
    week_start: text(p.week_start),
    household_id: text(p.household_id),
    household_size: num(p.household_size),
    cooking_days: strings(p.cooking_days) as WeeklyPlan["cooking_days"],
    equipment: strings(p.equipment),
    use_up: nullable(p.use_up),
    notes: nullable(p.notes),
    status: text(p.status),
    created_at: text(p.created_at),
    updated_at: text(p.updated_at),
  };
  if (groceryItems.some((item) => item.weekly_plan_id !== plan.id))
    throw new Error("Grocery data belongs to another plan.");
  return { plan, meals, groceryItems };
}
export function parseOverview(value: unknown): WeeksResponse {
  const v = record(value);
  function summary(value: unknown): WeekSummary {
    const w = record(value);
    return {
      id: text(w.id),
      weekStart: text(w.weekStart),
      householdSize: num(w.householdSize),
      cookingDays: strings(w.cookingDays),
      useUp: text(w.useUp),
      notes: text(w.notes),
      mealCount: num(w.mealCount),
      meals: list(w.meals).map((item) => {
        const m = record(item);
        return {
          id: text(m.id),
          day: text(m.day),
          title: text(m.title),
          emoji: m.emoji == null ? "" : text(m.emoji),
          total_minutes: m.total_minutes == null ? 0 : num(m.total_minutes),
        };
      }),
      createdAt: text(w.createdAt),
      updatedAt: text(w.updatedAt),
    };
  }
  return {
    current: v.current == null ? null : summary(v.current),
    next: v.next == null ? null : summary(v.next),
    past: list(v.past).map(summary),
  };
}
export function parseHousehold(value: unknown): HouseholdStatusResult {
  const v = record(value);
  const linked = flag(v.linked);
  if (!linked) return { linked: false, household: null, role: null };
  const h = record(v.household);
  if (v.role !== "owner" && v.role !== "member")
    throw new Error("Unknown household role.");
  return {
    linked,
    household: { id: text(h.id), name: text(h.name) },
    role: v.role,
    needsProfile: v.needsProfile === true,
  };
}
