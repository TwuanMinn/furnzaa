import { expect, test, type Page } from "@playwright/test";
import { uniq } from "./helpers";

/** Logs a 2-star walk-in feedback (category/channel/severity keep their defaults). */
async function createFeedback(page: Page, walkInName: string) {
  await page.goto("/feedback");
  await page.getByRole("button", { name: "Log feedback" }).click();

  await page.getByRole("radio", { name: "2 stars" }).click();
  await expect(page.getByRole("radio", { name: "2 stars" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByLabel("Walk-in customer name").fill(walkInName);
  await expect(page.getByLabel("Walk-in customer name")).toHaveValue(walkInName);
  await page.locator("#fb-comments").fill("Smoke test: the print arrived scratched.");
  await expect(page.locator("#fb-comments")).toHaveValue(/scratched/);

  await page.getByRole("button", { name: "Save feedback" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("logs new customer feedback", async ({ page }) => {
  const name = uniq("Smoke Walkin");
  await createFeedback(page, name);
  await expect(page.locator("tbody tr").filter({ hasText: name }).first()).toBeVisible();
});

test("assigns and resolves a feedback", async ({ page }) => {
  const name = uniq("Smoke Walkin");
  await createFeedback(page, name);

  await page.locator("tbody tr").filter({ hasText: name }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  // Assign → status flips to In progress.
  await sheet.getByLabel("Assign to").click();
  await page.getByRole("option", { name: /Sara/ }).click();
  await sheet.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(sheet.getByText("In progress").first()).toBeVisible();

  // Resolve with a note → status flips to Resolved.
  await sheet.getByRole("button", { name: "Resolve", exact: true }).click();
  await page.locator("#fb-resolution-note").fill("Replaced the part and apologised.");
  await page.getByRole("button", { name: "Resolve feedback" }).click();
  await expect(sheet.getByText("Resolved").first()).toBeVisible();
});
