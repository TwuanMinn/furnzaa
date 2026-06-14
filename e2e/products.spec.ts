import { expect, test } from "@playwright/test";

/**
 * Exercises the shared LineItemRow editor + the nextDocumentNumber() wrapper by
 * creating a purchase order end to end: pick a supplier (OptionalSelect), add a
 * product line via the catalog picker, set qty/cost, and confirm the generated
 * PO number comes back in the success toast.
 */
test("creates a purchase order (LineItemRow + generated PO number)", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("tab", { name: "Purchase orders" }).click();
  await page.getByRole("button", { name: "New purchase order" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("New purchase order")).toBeVisible();

  // Supplier — OptionalSelect: open, pick the first real supplier (after the
  // "Pick a supplier…" sentinel item).
  await dialog.locator("#po-supplier").click();
  await page.getByRole("option").nth(1).click();

  // Line item — open the catalog picker (portaled), search, pick a product.
  // Catalog results render as buttons (name = "<product> <sku> · <stock> · <price>").
  await dialog.getByRole("button", { name: "Pick a catalog product" }).click();
  await page.getByPlaceholder(/Search products by name/i).fill("Phone");
  await page.getByRole("button", { name: /Phone Stand/i }).first().click();

  // Quantity + unit cost cells live inside the LineItemRow.
  await dialog.getByLabel("Quantity").fill("3");
  await dialog.getByLabel("Unit cost").fill("25000");

  await dialog.getByRole("button", { name: "Create PO" }).click();

  // nextDocumentNumber() produced a PO-YYYY-NNNNNN code, surfaced in the toast.
  // Generous timeout: this is the first hit of the PO server action, which the
  // dev server compiles on demand.
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /Purchase order PO-\S+ created/ }),
  ).toBeVisible({ timeout: 25000 });
});
