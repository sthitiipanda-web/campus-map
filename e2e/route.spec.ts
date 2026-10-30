import { expect, test } from "@playwright/test";

/**
 * Routing flows over the published snapshot — skipped automatically when no
 * campus data is published (e.g. in CI, which has no database).
 */
test.use({ permissions: ["geolocation"], geolocation: { longitude: -0.246, latitude: 51.458 } });

test("directions from my location, then live walking mode", async ({ page, request, context }) => {
  const dataRes = await request.get("/api/campus-data");
  test.skip(dataRes.status() !== 200, "no published campus data available");
  const data = await dataRes.json();

  // Stand the fake user at the first seeded entrance so snapping succeeds.
  const entrance = data.entrances.features[0];
  test.skip(!entrance, "no entrances in snapshot");
  const [lon, lat] = entrance.geometry.coordinates;
  await context.setGeolocation({ longitude: lon, latitude: lat });

  await page.goto("/");
  const input = page.getByLabel("Search campus buildings and facilities");
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill("cafe");
  await page.getByRole("option", { name: /cafe/i }).first().click();

  // Destination card → origin chooser → my location.
  await page.getByRole("button", { name: "Directions" }).click();
  await page.getByRole("button", { name: "Use my location" }).click();

  const panel = page.getByLabel(/Directions to/);
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText("min");
  await expect(panel.getByText(/Arrive at/)).toBeVisible();

  // Step-free toggle re-routes without errors.
  await panel.getByLabel("Step-free route (avoid stairs)").check();
  await expect(panel.getByText(/Arrive at/)).toBeVisible();

  // Live walking mode: beacon appears, sheet switches to the walking HUD.
  await panel.getByRole("button", { name: "Start walking" }).click();
  await expect(panel.getByText(/Walking to|nearly at/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("user-location-dot")).toBeVisible({ timeout: 15_000 });

  await panel.getByRole("button", { name: "End route" }).click();
  await expect(panel).toBeHidden();
});

test("directions starting from a pre-fed place", async ({ page, request }) => {
  const dataRes = await request.get("/api/campus-data");
  test.skip(dataRes.status() !== 200, "no published campus data available");
  const data = await dataRes.json();
  test.skip(data.pois.features.length < 2, "need at least two POIs");

  await page.goto("/");
  const input = page.getByLabel("Search campus buildings and facilities");
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill("cafe");
  await page.getByRole("option", { name: /cafe/i }).first().click();

  await page.getByRole("button", { name: "Directions" }).click();

  // Pick the first suggested starting point instead of using geolocation.
  await page
    .getByRole("list", { name: "Suggested starting points" })
    .getByRole("button")
    .first()
    .click();

  const panel = page.getByLabel(/Directions to/);
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/Arrive at/)).toBeVisible();
});

test("route API returns a route between two seeded POIs", async ({ request }) => {
  const dataRes = await request.get("/api/campus-data");
  test.skip(dataRes.status() !== 200, "no published campus data available");
  const data = await dataRes.json();
  const ids = data.pois.features.map((f: { id: string }) => f.id);
  test.skip(ids.length < 2, "need at least two POIs");

  const res = await request.get(`/api/route?from=${ids[0]}&to=${ids[1]}&stepFree=false`);
  expect(res.status()).toBe(200);
  const route = await res.json();
  expect(route.distanceMeters).toBeGreaterThan(0);
  expect(Array.isArray(route.steps)).toBe(true);
  expect(route.geometry.type).toBe("LineString");
});

test("route API rejects coordinates outside the campus bbox", async ({ request }) => {
  const res = await request.get("/api/route?from=0.1,52.5&to=-0.244,51.457");
  expect(res.status()).toBe(400);
});
