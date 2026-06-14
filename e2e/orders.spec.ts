import { expect, test } from "@playwright/test";
import { createMinimalOrder, uniq } from "./helpers";

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

test("creates an order with an assignee + material (OptionalSelect)", async ({ page }) => {
  await page.goto("/orders/new");
  await page.locator("#of-customer").fill(uniq("Smoke Assignee"));
  await page.getByLabel("Item 1 name").fill("OptionalSelect widget");
  await page.getByLabel("Item 1 unit price").fill("50000");

  // Assignee — Radix OptionalSelect: open the trigger, pick a real staff option
  // (proves the "" ⇄ sentinel mapping submits the real id, not the sentinel).
  await page.locator("#of-assigned").click();
  await page.getByRole("option", { name: "Sara Lee" }).click();

  // Material — second OptionalSelect: pick the first real option after "Not set".
  await page.locator("#of-material").click();
  await page.getByRole("option").nth(1).click();

  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);

  // The chosen assignee is shown on the detail page → the value persisted.
  await expect(page.getByText("Sara Lee").first()).toBeVisible();
});

test("bulk deletes then restores an order (recycle bin)", async ({ page }) => {
  const customer = uniq("Bulk Test");
  await createMinimalOrder(page, { customer });

  // Delete: isolate the row by searching its unique customer, select, delete.
  await page.goto("/orders");
  await page.getByPlaceholder(/Search code, customer/i).fill(customer);
  const row = page.getByRole("row").filter({ hasText: customer });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox", { name: "Select row" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: /^Delete \(\d+\)$/ }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /order\(s\) deleted/ }),
  ).toBeVisible();

  // Restore: reload for clean state, open the recycle bin, find it, restore.
  await page.goto("/orders");
  await page.getByRole("button", { name: "Recycle bin" }).click();
  await page.getByPlaceholder(/Search code, customer/i).fill(customer);
  const deletedRow = page.getByRole("row").filter({ hasText: customer });
  await expect(deletedRow).toBeVisible();
  await deletedRow.getByRole("checkbox", { name: "Select row" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: /^Restore \(\d+\)$/ }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /order\(s\) restored/ }),
  ).toBeVisible();
});
