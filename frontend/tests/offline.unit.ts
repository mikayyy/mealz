import test from "node:test";
import assert from "node:assert/strict";
import {
  enqueue,
  flushQueue,
  QueueConflict,
  readSnapshot,
  persist,
  scopeKey,
  type Snapshot,
  type Scope,
} from "../src/data/offline";
import type { GroceryItem } from "../../types";
const scope: Scope = {
  environment: "https://preview.invalid",
  userId: "user-a",
  householdId: "household-a",
};
const item: GroceryItem = {
  id: "item-a",
  weekly_plan_id: "plan-a",
  name: "rice",
  quantity: 1,
  unit: "cup",
  category: "Pantry",
  checked: false,
  needed_this_week: true,
  source: "generated",
  source_key: "rice",
  user_modified: false,
  deleted: false,
  created_at: "2026-01-01",
  updated_at: "v1",
};
const sample = (): Snapshot => ({
  version: 1,
  scope,
  savedAt: Date.now(),
  weeks: [
    {
      id: "plan-a",
      weekStart: "2026-10-19",
      householdSize: 5,
      meals: [],
      groceries: [structuredClone(item)],
    },
  ],
  pending: [],
});
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  } as Storage;
}

test("snapshots round-trip only within their account, household, environment, and lifetime", () => {
  const local = storage(),
    value = sample();
  persist(local, value);
  assert.equal(
    readSnapshot(local, scope)?.weeks[0]?.groceries[0]?.name,
    "rice",
  );
  for (const other of [
    { ...scope, userId: "user-b" },
    { ...scope, householdId: "household-b" },
    { ...scope, environment: "https://other.invalid" },
  ])
    assert.equal(readSnapshot(local, other), null);
  persist(local, { ...value, savedAt: 0 });
  assert.equal(readSnapshot(local, scope), null);
  local.setItem(scopeKey(scope), "{bad json");
  assert.equal(readSnapshot(local, scope), null);
});

test("opposite changes to the same item remain ordered and use the prior acknowledgment version", async () => {
  let value = enqueue(sample(), "2026-10-19", item.id, { checked: true });
  value = enqueue(value, "2026-10-19", item.id, { checked: false });
  let remote = structuredClone(item);
  const desired: boolean[] = [];
  let checkpoints = 0;
  const result = await flushQueue(
    value,
    {
      verify: async () => scope,
      read: async () => ({ ...sample().weeks[0]!, groceries: [remote] }),
      write: async (request) => {
        assert.equal(request.action, "toggle");
        if (request.action !== "toggle") throw new Error();
        desired.push(request.checked);
        remote = {
          ...remote,
          checked: request.checked,
          updated_at: `v${desired.length + 1}`,
        };
        return remote;
      },
    },
    () => {
      checkpoints++;
    },
  );
  assert.deepEqual(desired, [true, false]);
  assert.equal(result.pending.length, 0);
  assert.equal(result.weeks[0]?.groceries[0]?.checked, false);
  assert.equal(checkpoints, 2);
});

test("an ambiguous retry already at the desired state is acknowledged without another write", async () => {
  const value = enqueue(sample(), "2026-10-19", item.id, { checked: true });
  let writes = 0;
  const result = await flushQueue(
    value,
    {
      verify: async () => scope,
      read: async () => ({
        ...sample().weeks[0]!,
        groceries: [{ ...item, checked: true, updated_at: "changed" }],
      }),
      write: async () => {
        writes++;
        return item;
      },
    },
    () => {},
  );
  assert.equal(result.pending.length, 0);
  assert.equal(writes, 0);
});

test("changed accounts, replaced plans, deleted rows, and conflicting edits never send writes", async () => {
  const value = enqueue(sample(), "2026-10-19", item.id, { checked: true });
  let writes = 0;
  const cases = [
    { scope: { ...scope, userId: "other" }, week: sample().weeks[0]! },
    { scope, week: { ...sample().weeks[0]!, id: "replacement" } },
    { scope, week: { ...sample().weeks[0]!, groceries: [] } },
    {
      scope,
      week: {
        ...sample().weeks[0]!,
        groceries: [{ ...item, updated_at: "other-change" }],
      },
    },
  ];
  for (const entry of cases)
    await assert.rejects(
      flushQueue(
        value,
        {
          verify: async () => entry.scope,
          read: async () => entry.week,
          write: async () => {
            writes++;
            return item;
          },
        },
        () => {},
      ),
      QueueConflict,
    );
  assert.equal(writes, 0);
  assert.equal(value.pending.length, 1);
});

test("network failure preserves pending changes and disabling a sundry clears purchased state", async () => {
  const value = enqueue(sample(), "2026-10-19", item.id, {
    needed_this_week: false,
  });
  assert.equal(value.weeks[0]?.groceries[0]?.checked, false);
  assert.equal(value.weeks[0]?.groceries[0]?.needed_this_week, false);
  await assert.rejects(
    flushQueue(
      value,
      {
        verify: async () => scope,
        read: async () => {
          throw new Error("offline");
        },
        write: async () => item,
      },
      () => {},
    ),
    /offline/,
  );
  assert.equal(value.pending.length, 1);
});

test("expired cached views do not silently delete unacknowledged work", () => {
  const local = storage(),
    value = enqueue(sample(), "2026-10-19", item.id, { checked: true });
  persist(local, { ...value, savedAt: 0 });
  assert.equal(readSnapshot(local, scope), null);
  assert.ok(local.getItem(scopeKey(scope))?.includes(value.pending[0]!.id));
});
