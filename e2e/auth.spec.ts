import { expect, test } from "@playwright/test";

// Auth tests start from a clean, signed-out browser context.
test.use({ storageState: { cookies: [], origins: [] } });

test("redirects unauthenticated visitors to /login", async ({ page }) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/login");
  // Nonexistent email so repeated runs never trip the per-account lockout.
  await page.locator("#email").fill("nobody@furnza.local");
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("signs in and lands on the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(process.env.E2E_ADMIN_EMAIL ?? "admin@furnza.local");
  await page.locator("#password").fill(process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("link", { name: "Orders" }).first()).toBeVisible();
});
