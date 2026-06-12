import { expect, type Page } from "@playwright/test";

/** Unique, human-spottable name so smoke-test rows are easy to find (and ignore) in the dev DB. */
export function uniq(prefix: string) {
  return `${prefix} ${Date.now().toString(36).toUpperCase()}`;
}

export function isoDate(daysFromNow = 0) {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Creates a minimal valid order (new walk-in customer + one line item; every
 * other field keeps its form default) and waits for the redirect to the order
 * detail page. Returns the generated order code.
 */
export async function createMinimalOrder(
  page: Page,
  opts: { customer?: string; itemName?: string; voucherCode?: string; printJob?: boolean } = {},
) {
  await page.goto("/orders/new");
  await page.locator("#of-customer").fill(opts.customer ?? uniq("Smoke Buyer"));
  await page.getByLabel("Item 1 name").fill(opts.itemName ?? "Smoke test widget");
  await page.getByLabel("Item 1 unit price").fill("50000");
  if (opts.printJob) {
    // Filament grams marks the order as a print job (shows PrintControls on detail).
    await page.locator("#of-grams").fill("50");
  }
  if (opts.voucherCode) {
    await page.locator("#of-voucher").fill(opts.voucherCode);
  }
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);

  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: /Order .+ created/ });
  await expect(toast).toBeVisible();
  const code = /Order (\S+) created/.exec((await toast.innerText()) ?? "")?.[1] ?? "";
  expect(code).not.toBe("");
  return { code, url: page.url() };
}
