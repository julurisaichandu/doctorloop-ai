import { expect, test } from "@playwright/test";
import { startAs, switchRole, trackErrors } from "./helpers";

const UPDATE =
  "Tonight my right knee aches about 7 out of 10 after physio and I only slept about 4 hours last night. I want to ask Dr. Park if I should ice it before bed.";

test("core demo flow with the text fallback", async ({ page }) => {
  const t = trackErrors(page);
  await startAs(page, "Maya Thompson");

  await expect(page).toHaveURL(/\/patient$/);
  await expect(page.getByRole("heading", { name: /Welcome back, Maya/ })).toBeVisible();
  await expect(page.getByText(/ACL/i).first()).toBeVisible();
  await expect(page.getByText(/next appointment/i).first()).toBeVisible();

  await page.goto("/patient/check-in?tab=write");
  await page.getByLabel("Your update").fill(UPDATE);
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText("Your update is saved")).toBeVisible();
  await expect(page.getByText("7/10 (self-reported)").first()).toBeVisible();
  await expect(page.getByText(/^4 (hours|h|hrs)/).first()).toBeVisible();

  const reviewLink = page.getByRole("tabpanel").getByRole("link", { name: /Review & share/ });
  const href = await reviewLink.getAttribute("href");
  const entryId = href!.split("#entry-")[1];
  expect(entryId).toBeTruthy();
  await reviewLink.click();
  await expect(page).toHaveURL(/\/patient\/review/);
  const card = page.locator(`#entry-${entryId}`);
  await expect(card).toContainText("ice it before bed");
  await card.getByRole("button", { name: /Approve & share/ }).click();
  await expect(card.getByRole("button", { name: /Approve & share/ })).toHaveCount(0);

  await switchRole(page, "Dr. Elena Park");
  await expect(page).toHaveURL(/\/doctor$/);
  const row = page.getByRole("row", { name: /Maya Thompson/ });
  await expect(row).toContainText(/\d+ new updates?/);
  await expect(row).toContainText("ice it before bed");
  const before = Number((await row.innerText()).match(/(\d+) new update/)![1]);

  await row.getByRole("link", { name: "Open Maya Thompson" }).click();
  await expect(page.getByRole("heading", { name: "AI pre-visit summary" })).toBeVisible();
  await expect(page.getByText(/AI-generated/i).first()).toBeVisible();
  const chip = page.locator(`a[href$="record=${entryId}"][aria-label^="Source"]`).first();
  await expect(chip).toBeVisible();
  await chip.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Original patient-approved record")).toBeVisible();
  await expect(sheet.getByText(UPDATE)).toBeVisible();
  await expect(sheet.getByText("Provenance")).toBeVisible();
  await sheet.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(sheet.getByText(/^Reviewed/)).toBeVisible();

  await page.goto("/doctor");
  const after = page.getByRole("row", { name: /Maya Thompson/ });
  if (before > 1) await expect(after).toContainText(`${before - 1} new update`);
  else await expect(after).toContainText("All reviewed");
  t.expectClean();
});
