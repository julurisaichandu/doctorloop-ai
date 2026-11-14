import { expect, test } from "@playwright/test";
import { approvePending, startAs, switchRole, trackErrors } from "./helpers";

test("mock Vexo import flows through to the doctor", async ({ page }) => {
  const t = trackErrors(page);
  await startAs(page, "Maya Thompson");
  await page.goto("/patient/import");
  await expect(page.getByText(/mock/i).first()).toBeVisible();

  await page.getByRole("button", { name: /Find health-related memories/ }).click();
  await expect(page.getByText(/unrelated memor(y|ies) (was|were) filtered out/)).toBeVisible();
  const boxes = page.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  await boxes.first().click();
  const excerpt = (await page.getByLabel("Excerpt to import (you can trim it)").first().inputValue()).trim();
  const snippet = excerpt.slice(0, 40);
  expect(snippet.length).toBeGreaterThan(10);
  await page.getByRole("button", { name: /Import selected \(1\)/ }).click();

  await expect(page.getByText(/imported/i).first()).toBeVisible();
  await page.goto("/patient/review");
  await expect(page.getByText(/Vexo/).first()).toBeVisible();
  await approvePending(page, snippet);

  await switchRole(page, "Dr. Elena Park");
  await page.getByRole("row", { name: /Maya Thompson/ }).getByRole("link", { name: "Open Maya Thompson" }).click();
  const item = page.locator("li").filter({ hasText: snippet }).filter({ hasText: /Vexo/ }).first();
  await expect(item).toBeVisible();
  await item.getByRole("link", { name: "Open record" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Vexo memory").first()).toBeVisible();
  await expect(sheet.getByText("Provenance")).toBeVisible();
  await expect(sheet.getByText("Memory id")).toBeVisible();
  await expect(sheet.getByText(snippet).first()).toBeVisible();
  t.expectClean();
});
