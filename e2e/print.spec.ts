import { expect, test } from "@playwright/test";
import { createMinimalOrder } from "./helpers";

test("runs a print job from start to complete", async ({ page }) => {
  await createMinimalOrder(page, { printJob: true });

  await page.getByRole("button", { name: "Start print" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /Print started/ }),
  ).toBeVisible();

  // router.refresh() swaps the controls to printing-state buttons.
  await page.getByRole("button", { name: "Complete print" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /Print completed/ }),
  ).toBeVisible();

  await expect(page.getByText(/Printed ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start print" })).toBeHidden();
});
