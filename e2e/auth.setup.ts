import path from "node:path";
import { test as setup } from "@playwright/test";

const authFile = path.join(__dirname, "..", "playwright", ".auth", "admin.json");

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(process.env.E2E_ADMIN_EMAIL ?? "admin@furnza.local");
  await page.locator("#password").fill(process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.context().storageState({ path: authFile });
});
