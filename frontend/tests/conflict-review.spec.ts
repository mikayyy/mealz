import { expect, test } from "@playwright/test";

test("phone conflict review shows both versions and makes either choice explicit", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      mutations.push(request.method());
  });
  await page.goto("/#/preview/conflicts");
  await expect(
    page.getByRole("heading", { name: "Which change should we keep?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your saved change" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Household version", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Picked up", { exact: true })).toBeVisible();
  await expect(page.getByText("Still to buy", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Use household version", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your saved change was removed",
  );
  await page.getByRole("button", { name: "Try the example again" }).click();
  await page
    .getByRole("button", { name: "Keep my change", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("another sync check");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(mutations).toEqual([]);
});
