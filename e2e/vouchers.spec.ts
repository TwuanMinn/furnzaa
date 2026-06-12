import { expect, test, type Page } from "@playwright/test";
import { createMinimalOrder, isoDate } from "./helpers";

/** Creates a 10%-off promotional voucher in CRM → Vouchers and returns its code. */
async function createVoucher(page: Page) {
  const code = `SMOKE-${Date.now().toString(36).toUpperCase()}`;
  await page.goto("/crm");
  await page.getByRole("tab", { name: "Vouchers" }).click();
  await page.getByRole("button", { name: "New voucher" }).click();
  await page.locator("#vc-code").fill(code);
  // Type is a Radix Select: open the trigger, then pick the option from the portal.
  await page.locator("#vc-type").click();
  await page.getByRole("option", { name: "Percentage off" }).click();
  await page.locator("#vc-value").fill("10");
  await page.locator("#vc-start").fill(isoDate(0));
  await page.locator("#vc-end").fill(isoDate(30));
  await page.locator("#vc-limit").fill("5");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("tbody tr").filter({ hasText: code }).first()).toBeVisible();
  return code;
}

test("creates a voucher in CRM", async ({ page }) => {
  await createVoucher(page);
});

test("redeems a voucher on a new order", async ({ page }) => {
  const code = await createVoucher(page);

  // Redemption is atomic with order creation — an invalid code would roll the
  // whole order back, so reaching the detail page proves the redeem succeeded.
  await createMinimalOrder(page, { voucherCode: code });

  await page.goto("/crm");
  await page.getByRole("tab", { name: "Vouchers" }).click();
  const row = page.locator("tbody tr").filter({ hasText: code }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("1 / 5");
});
