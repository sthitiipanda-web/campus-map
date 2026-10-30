import { expect, test } from "@playwright/test";

/**
 * Search runs over the published snapshot, so these tests only make sense when
 * campus data has been published (skipped in CI, which has no database).
 */
test("searching selects a building and drops a marker", async ({ page, request }) => {
  const data = await request.get("/api/campus-data");
  test.skip(data.status() !== 200, "no published campus data available");

  await page.goto("/");
  const input = page.getByLabel("Search campus buildings and facilities");
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill("library");
  const option = page.getByRole("option", { name: /library/i }).first();
  await expect(option).toBeVisible();

  const optionName = (await option.textContent()) ?? "";
  await option.click();

  // Input reflects the chosen POI and a marker appears on the map.
  await expect(input).not.toHaveValue("library");
  await expect(page.getByTestId("selected-poi-marker")).toBeVisible({ timeout: 15_000 });
  expect(optionName.toLowerCase()).toContain("library");
});

test("search reports no matches for off-campus queries", async ({ page, request }) => {
  const data = await request.get("/api/campus-data");
  test.skip(data.status() !== 200, "no published campus data available");

  await page.goto("/");
  const input = page.getByLabel("Search campus buildings and facilities");
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill("buckingham palace");
  await expect(page.getByRole("listbox")).toContainText("No matches on campus");
});
