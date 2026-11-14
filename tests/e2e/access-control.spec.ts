import { expect, test } from "@playwright/test";
import { startAs, switchRole, trackErrors } from "./helpers";

test("unassigned doctor gets not-found for another doctor's patient", async ({ page }) => {
  const t = trackErrors(page);
  await startAs(page, "Dr. Elena Park");
  await page.getByRole("row", { name: /Maya Thompson/ }).getByRole("link", { name: "Open Maya Thompson" }).click();
  await expect(page).toHaveURL(/\/doctor\/patients\/[^/?]+/);
  const mayaUrl = page.url();

  await switchRole(page, "Dr. Marcus Bell");
  const res = await page.goto(mayaUrl);
  // Next streams the loading boundary first, so the status can be 200 even though the not-found UI renders.
  expect([200, 404]).toContain(res?.status());
  await expect(page.getByText("Maya Thompson")).toHaveCount(0);
  await expect(page.getByText(/not found|could not be found/i).first()).toBeVisible();
  // Chromium logs the 404 document response itself as a console error; that is expected here.
  t.errors.splice(0, t.errors.length, ...t.errors.filter((e) => !/404/.test(e)));
  t.expectClean();
});

test("patient is redirected away from /doctor; signed-out goes to /login", async ({ page, context }) => {
  const t = trackErrors(page);
  await startAs(page, "Maya Thompson");
  await page.goto("/doctor");
  await expect(page).toHaveURL(/\/patient/);
  await context.clearCookies();
  await page.goto("/patient");
  await expect(page).toHaveURL(/\/login/);
  t.expectClean();
});

test("a patient only sees their own entries", async ({ page }) => {
  const t = trackErrors(page);
  await startAs(page, "Maya Thompson");
  await page.goto("/patient/timeline");
  await expect(page.getByRole("heading", { name: "Your recovery timeline" })).toBeVisible();
  const mayaText = await page.getByRole("main").last().innerText();
  expect(mayaText).not.toMatch(/hip|gallbladder|walker|toddler|desk job/i);
  await switchRole(page, "Daniel Okafor");
  await page.goto("/patient/timeline");
  await expect(page.getByRole("heading", { name: "Your recovery timeline" })).toBeVisible();
  const danText = await page.getByRole("main").last().innerText();
  expect(danText).not.toMatch(/knee|ACL|crutch/i);
  t.expectClean();
});
