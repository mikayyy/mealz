import { expect, test } from "@playwright/test";

const user = {
  id: "user-a",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-10-01T00:00:00Z",
};
const ingredient = {
  name: "diced cucumber",
  quantity: 1,
  unit: "whole",
  category: "Produce",
  optional: false,
};
const meal = {
  id: "meal-a",
  day: "Monday",
  title: "Test-household dinner",
  description: "Saved through the existing API contract.",
  emoji: "",
  servings: 5,
  total_minutes: 20,
  difficulty: "Easy",
  tags: [],
  kid_note: null,
  ingredients: [ingredient],
  steps: ["Prepare the ingredients."],
};
const grocery = {
  id: "grocery-a",
  weekly_plan_id: "plan-a",
  name: "cucumber",
  quantity: 1,
  unit: "whole",
  category: "Produce",
  checked: false,
  needed_this_week: false,
  source: "generated",
  source_key: "cucumber::count",
  user_modified: false,
  deleted: false,
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
};

test("authenticated reads, offline reload, read-only controls, and sign-out cache isolation", async ({
  page,
  context,
}) => {
  const mutations: string[] = [];
  let current = "";
  // Model a protected preview: its APIs require the deployment access cookie
  // even before a Mealz user has signed in.
  await context.addCookies([{
    name: "preview-access",
    value: "synthetic-test-access",
    url: "http://127.0.0.1:4173",
    httpOnly: true,
    sameSite: "Lax",
  }]);
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() !== "GET") mutations.push(request.method());
    if (!request.headers().cookie?.includes("preview-access=synthetic-test-access"))
      return route.fulfill({ status: 401, json: { error: "Preview access required" } });
    if (url.pathname === "/api/auth-config")
      return route.fulfill({
        json: {
          enabled: true,
          supabaseUrl: "https://mealz-test.supabase.co",
          publishableKey: "public-test-key",
        },
      });
    expect(request.headers().authorization).toMatch(/^Bearer /);
    if (url.pathname === "/api/household")
      return route.fulfill({
        json: {
          linked: true,
          household: { id: "household-a", name: "Isolated test household" },
          role: "member",
          needsProfile: false,
        },
      });
    if (url.pathname === "/api/weeks") {
      current = url.searchParams.get("current_start")!;
      return route.fulfill({
        json: {
          current: {
            id: "plan-a",
            weekStart: current,
            householdSize: 5,
            cookingDays: ["Monday"],
            useUp: "",
            notes: "",
            mealCount: 1,
            meals: [meal],
            createdAt: "2026-10-01",
            updatedAt: "2026-10-01",
          },
          next: null,
          past: [],
        },
      });
    }
    if (url.pathname === "/api/plan")
      return route.fulfill({
        json: {
          plan: {
            id: "plan-a",
            week_start: current,
            household_id: "household-a",
            household_size: 5,
            cooking_days: ["Monday"],
            equipment: [],
            use_up: null,
            notes: null,
            status: "active",
            created_at: "2026-10-01",
            updated_at: "2026-10-01",
          },
          meals: [meal],
          groceryItems: [grocery],
        },
      });
    return route.fulfill({ status: 404, json: { error: "Unknown route" } });
  });
  await page.route(
    "https://mealz-test.supabase.co/auth/v1/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/user")) return route.fulfill({ json: user });
      if (path.endsWith("/logout")) return route.fulfill({ status: 204 });
      const payload = Buffer.from(
        JSON.stringify({
          sub: user.id,
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: "authenticated",
          role: "authenticated",
          iat: Math.floor(Date.now() / 1000),
        }),
      ).toString("base64url");
      return route.fulfill({
        json: {
          access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`,
          refresh_token: "fake-refresh-for-test",
          token_type: "bearer",
          expires_in: 3600,
          user,
        },
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Open my household" }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Isolated test household · read-only preview"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Groceries", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "1 whole cucumber", exact: true }),
  ).toBeDisabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // ensure this page is controlled before disconnecting
  await page
    .getByRole("button", { name: "Open remembered or downloaded household" })
    .click();
  await expect(
    page.getByText("Isolated test household · read-only preview"),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Open remembered or downloaded household" })
    .click();
  await expect(
    page.getByText("Downloaded household · read-only preview"),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "1 whole cucumber", exact: true }),
  ).toBeDisabled();
  const reopened = await context.newPage();
  await reopened.goto(`/#/weeks/${current}/groceries`);
  await reopened.getByRole("button", { name: "Open remembered or downloaded household" }).click();
  await expect(reopened.getByText("Downloaded household · read-only preview")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(reopened.getByRole("heading", { name: "Open your household" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Open your household" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) => key.startsWith("mealz:react:v1:") && key.includes("user-a"),
      ),
    ),
  ).toEqual([]);
  expect(mutations).toEqual([]);
});

test("sample shopping persists through offline reload without calling household APIs", async ({
  page,
  context,
}) => {
  const api: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      api.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Groceries", exact: true })
    .first()
    .click();
  const checkbox = page.getByRole("checkbox", {
    name: "2 whole cucumber",
    exact: true,
  });
  await checkbox.check();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(checkbox).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await page.reload();
  await expect(checkbox).not.toBeChecked();
  expect(api).toEqual([]);
});
