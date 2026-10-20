import { expect, test } from "@playwright/test";

test("phone flow: week → recipe → shared grocery view with sundries", async ({
  page,
}) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good food. A simpler week." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "See meals" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Lemon chicken pita bowls" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cook this" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Ingredients", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 whole diced cucumber", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Groceries", exact: true }).click();
  await expect(
    page.getByText("2 whole cucumber", { exact: true }),
  ).toBeVisible();
  const cucumber = page.getByRole("checkbox", {
    name: "2 whole cucumber",
    exact: true,
  });
  await cucumber.check();
  await expect(cucumber).toBeChecked();
  await expect(page.getByRole("status")).toContainText("1 of");
  await page
    .getByText("Sundries", { exact: false })
    .filter({ hasText: "staples to check" })
    .first()
    .click();
  await page.getByRole("button", { name: "Buy rice", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Buy rice", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("checkbox", { name: "Purchased rice", exact: true })
    .check();
  await page.getByRole("link", { name: "Meals", exact: true }).click();
  await page.getByRole("link", { name: "Groceries", exact: true }).click();
  await expect(cucumber).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ready for the store" }),
  ).toBeVisible();
  await expect(cucumber).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(apiRequests).toEqual([]);
});

test("week state is isolated and invalid routes recover", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Groceries", exact: true })
    .first()
    .click();
  await page
    .getByRole("checkbox", { name: "2 whole cucumber", exact: true })
    .check();
  await page
    .getByRole("link", { name: "Your weeks", exact: false })
    .first()
    .click();
  await page
    .getByRole("link", { name: "Groceries", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("checkbox", { name: "2 whole cucumber", exact: true }),
  ).not.toBeChecked();
  await page.goto("/#/weeks/1900-01-01/meals");
  await expect(
    page.getByRole("heading", { name: "That week isn’t in this preview" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to your weeks" }).click();
  await expect(
    page.getByRole("heading", { name: "Good food. A simpler week." }),
  ).toBeVisible();
});
