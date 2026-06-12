import { expect, test } from "@playwright/test";
import { createMinimalOrder } from "./helpers";

test("orders list renders seeded data", async ({ page }) => {
  await page.goto("/orders");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("creates a minimal order", async ({ page }) => {
  const { code } = await createMinimalOrder(page);
  // Landed on the detail page and it shows the generated order code.
  await expect(page.getByText(code).first()).toBeVisible();
});
