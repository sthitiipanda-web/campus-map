import { expect, test } from "@playwright/test";

test("public home renders the map shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Search campus buildings and facilities")).toBeVisible();
  // The name appears in both the brand header and the attribution pill.
  await expect(page.getByText("Campus Navigator", { exact: true })).toBeVisible();
  await expect(page.getByText("University of Roehampton", { exact: true })).toBeVisible();
});

test("admin area redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Campus Navigator admin" })).toBeVisible();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect((await res.json()).ok).toBe(true);
});
