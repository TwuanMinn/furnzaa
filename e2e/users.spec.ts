import { expect, test } from "@playwright/test";
import { uniq } from "./helpers";

/**
 * Locks down users/actions.ts at runtime — the other module that the dead
 * `export type { ActionResult }` re-export crashed. inviteUserAction creates an
 * isolated new staff user (unique email, never touches the seeded users), so it
 * proves the action runs without disturbing other specs.
 */
test("invites a user (inviteUserAction)", async ({ page }) => {
  await page.goto("/users");
  await page.getByRole("button", { name: "Add user" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.locator("#uf-name").fill(uniq("Smoke Staff"));
  await dialog.locator("#uf-email").fill(`smoke.${Date.now().toString(36)}@furnza.test`);
  // Role defaults to "staff" — no need to touch it.
  await dialog.getByRole("button", { name: "Send invite" }).click();

  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /Invite sent to/ }),
  ).toBeVisible({ timeout: 20000 });
});
