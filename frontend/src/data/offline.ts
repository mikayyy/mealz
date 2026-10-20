import type { GroceryItem } from "../../../types";
import type { SavedWeek } from "./demo";
import type { GroceryStateRequest } from "./contracts";
import { parseSavedWeek, record, text } from "./validation";

export interface Scope {
  environment: string;
  userId: string;
  householdId: string;
}
export interface Pending {
  id: string;
  weekStart: string;
  request: GroceryStateRequest;
  baseUpdatedAt: string;
}
export interface Snapshot {
  version: 1;
  scope: Scope;
  savedAt: number;
  weeks: SavedWeek[];
  pending: Pending[];
}
export const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
export function scopeKey(scope: Scope) {
  return `mealz:react:v1:${JSON.stringify([scope.environment, scope.userId, scope.householdId])}`;
}
export function sameScope(a: Scope, b: Scope) {
  return scopeKey(a) === scopeKey(b);
}
export function readSnapshot(storage: Storage, scope: Scope): Snapshot | null {
  const key = scopeKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = record(JSON.parse(raw)),
      savedScope = record(value.scope);
    const actual = {
      environment: text(savedScope.environment),
      userId: text(savedScope.userId),
      householdId: text(savedScope.householdId),
    };
    if (
      value.version !== 1 ||
      !sameScope(scope, actual) ||
      typeof value.savedAt !== "number" ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > Date.now() ||
      !Array.isArray(value.weeks) ||
      !Array.isArray(value.pending)
    )
      throw new Error("Expired or invalid cache.");
    const pending = value.pending.map((entry) => {
      const v = record(entry),
        r = record(v.request);
      const common = { planId: text(r.planId), itemId: text(r.itemId) };
      let request: GroceryStateRequest;
      if (r.action === "toggle" && typeof r.checked === "boolean")
        request = { ...common, action: "toggle", checked: r.checked };
      else if (r.action === "set_needed" && typeof r.needed === "boolean")
        request = { ...common, action: "set_needed", needed: r.needed };
      else throw new Error("Invalid queued change.");
      return {
        id: text(v.id),
        weekStart: text(v.weekStart),
        baseUpdatedAt: text(v.baseUpdatedAt),
        request,
      };
    });
    if (Date.now() - value.savedAt > MAX_CACHE_AGE) {
      // Expired downloaded data is not shown. Keep unacknowledged work for
      // deliberate recovery instead of silently discarding it with the cache.
      if (!pending.length) storage.removeItem(key);
      return null;
    }
    return {
      version: 1,
      scope,
      savedAt: value.savedAt,
      weeks: value.weeks.map(parseSavedWeek),
      pending,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* Storage may be denied. */
    }
    return null;
  }
}
export function persist(storage: Storage, snapshot: Snapshot) {
  storage.setItem(scopeKey(snapshot.scope), JSON.stringify(snapshot));
}
export function applyRequest(
  item: GroceryItem,
  request: GroceryStateRequest,
): GroceryItem {
  return request.action === "toggle"
    ? { ...item, checked: request.checked }
    : {
        ...item,
        needed_this_week: request.needed,
        ...(!request.needed ? { checked: false } : {}),
      };
}
export function enqueue(
  snapshot: Snapshot,
  weekStart: string,
  itemId: string,
  changes: { checked?: boolean; needed_this_week?: boolean },
): Snapshot {
  const week = snapshot.weeks.find((w) => w.weekStart === weekStart),
    item = week?.groceries.find((i) => i.id === itemId);
  if (!week || !item) throw new Error("That item is no longer available.");
  const request: GroceryStateRequest =
    changes.needed_this_week !== undefined
      ? {
          action: "set_needed",
          planId: week.id,
          itemId,
          needed: changes.needed_this_week,
        }
      : {
          action: "toggle",
          planId: week.id,
          itemId,
          checked: changes.checked ?? item.checked,
        };
  const operation: Pending = {
    id: crypto.randomUUID(),
    weekStart,
    request,
    baseUpdatedAt: item.updated_at,
  };
  return {
    ...snapshot,
    weeks: snapshot.weeks.map((w) =>
      w.id !== week.id
        ? w
        : {
            ...w,
            groceries: w.groceries.map((i) =>
              i.id !== itemId ? i : applyRequest(i, request),
            ),
          },
    ),
    pending: [...snapshot.pending, operation],
  };
}
export class QueueConflict extends Error {}
export interface QueueTransport {
  verify: () => Promise<Scope>;
  read: (weekStart: string) => Promise<SavedWeek | null>;
  write: (request: GroceryStateRequest) => Promise<GroceryItem>;
}
// A conservative queue core. Callers must serialize flushes and persist each ack.
// Replaced/deleted/changed rows pause replay instead of silently overwriting them.
export async function flushQueue(
  snapshot: Snapshot,
  transport: QueueTransport,
  checkpoint: (value: Snapshot) => void,
): Promise<Snapshot> {
  let current = snapshot;
  while (current.pending.length) {
    const operation = current.pending[0];
    if (!operation) break;
    if (!sameScope(await transport.verify(), current.scope))
      throw new QueueConflict(
        "The account or household changed. Sign in again before syncing.",
      );
    const fresh = await transport.read(operation.weekStart);
    const item = fresh?.groceries.find(
      (i) => i.id === operation.request.itemId && !i.deleted,
    );
    if (!fresh || fresh.id !== operation.request.planId || !item)
      throw new QueueConflict(
        "This week or item was replaced. Review this change before syncing.",
      );
    const targetMatches =
      operation.request.action === "toggle"
        ? item.checked === operation.request.checked
        : item.needed_this_week === operation.request.needed &&
          (operation.request.needed || !item.checked);
    if (!targetMatches && item.updated_at !== operation.baseUpdatedAt)
      throw new QueueConflict(
        "Someone changed this item. Review both versions before syncing.",
      );
    const result = targetMatches
      ? item
      : await transport.write(operation.request);
    if (result.id !== item.id || result.weekly_plan_id !== fresh.id)
      throw new QueueConflict("The saved item identity changed.");
    current = {
      ...current,
      pending: current.pending
        .filter((p) => p.id !== operation.id)
        .map((p) =>
          p.request.itemId === item.id && p.request.planId === fresh.id
            ? { ...p, baseUpdatedAt: result.updated_at }
            : p,
        ),
      weeks: current.weeks.map((w) =>
        w.id !== fresh.id
          ? w
          : {
              ...w,
              groceries: w.groceries.map((i) =>
                i.id !== item.id ? i : result,
              ),
            },
      ),
    };
    // Later desired changes must remain visible after the first ack.
    for (const pending of current.pending)
      current = {
        ...current,
        weeks: current.weeks.map((w) =>
          w.id !== pending.request.planId
            ? w
            : {
                ...w,
                groceries: w.groceries.map((i) =>
                  i.id !== pending.request.itemId
                    ? i
                    : applyRequest(i, pending.request),
                ),
              },
        ),
      };
    checkpoint(current);
  }
  return current;
}
