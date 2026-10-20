import type { GroceryStateRequest } from "./contracts";
import {
  parseGrocery,
  parseHousehold,
  parseOverview,
  parsePlan,
  record,
  text,
} from "./validation";
import { weeks } from "../domain/legacy";
import type { SavedWeek } from "./demo";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function json(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    // Same-origin deployment protection uses a cookie in addition to the
    // application's Bearer token. Never send that cookie across origins.
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const v = record(value);
    throw new ApiError(
      typeof v.error === "string"
        ? v.error
        : "Mealz could not complete this request.",
      response.status,
    );
  }
  return value;
}
export async function authConfig() {
  const value = record(await json("/api/auth-config"));
  if (value.enabled !== true)
    throw new Error("Sign-in is not configured for this preview.");
  const url = new URL(text(value.supabaseUrl));
  if (url.protocol !== "https:")
    throw new Error("Invalid sign-in configuration.");
  return { supabaseUrl: url.href, publishableKey: text(value.publishableKey) };
}
export async function household(token: string) {
  return parseHousehold(await json("/api/household", token));
}
export async function readWeek(
  token: string,
  weekStart: string,
  householdId: string,
): Promise<SavedWeek | null> {
  const result = parsePlan(
    await json(`/api/plan?week_start=${encodeURIComponent(weekStart)}`, token),
  );
  if (!result.plan) return null;
  if (
    result.plan.household_id !== householdId ||
    result.plan.week_start !== weekStart
  )
    throw new Error("This week belongs to a different household or date.");
  return {
    id: result.plan.id,
    weekStart,
    householdSize: result.plan.household_size,
    meals: result.meals,
    groceries: result.groceryItems,
  };
}
export async function readWeeks(
  token: string,
  householdId: string,
): Promise<SavedWeek[]> {
  const overview = parseOverview(
    await json(
      `/api/weeks?current_start=${weeks.currentWeekStart()}&next_start=${weeks.nextWeekStart()}`,
      token,
    ),
  );
  const summaries = [overview.current, overview.next, ...overview.past].filter(
    (value) => value !== null,
  );
  const starts = [...new Set(summaries.map((value) => value.weekStart))];
  return (
    await Promise.all(
      starts.map((start) => readWeek(token, start, householdId)),
    )
  ).filter((value) => value !== null);
}
export async function writeGrocery(
  token: string,
  operation: GroceryStateRequest,
) {
  const value = record(
    await json("/api/plan", token, {
      method: "PATCH",
      body: JSON.stringify(operation),
    }),
  );
  return parseGrocery(value.item);
}
