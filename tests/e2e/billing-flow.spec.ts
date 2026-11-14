import { expect, test } from "@playwright/test";
import { approvePending, startAs, switchRole, trackErrors } from "./helpers";

const MAYA_PATIENT_ID = "20000000-0000-4000-8000-000000000001";
const UPDATE =
  "Tonight my right knee aches about 7 out of 10 after physio and I only slept about 4 hours last night. I want to ask Dr. Park if I should ice it before bed.";

test("practice billing: simulated setup, private until shared, invoice now", async ({ page }) => {
  const errors = trackErrors(page);
  await startAs(page, "Dr. Elena Park");

  await page.getByRole("link", { name: "Billing" }).click();
  await page.getByRole("button", { name: "Set up billing" }).click();
  await page.waitForURL(/\/doctor\/billing\/checkout/);
  await page.getByRole("button", { name: "Start billing (simulated)" }).click();
  await page.waitForURL(/\/doctor\/billing\?setup=success/);
  await expect(page.getByText("Billing active")).toBeVisible();

  await switchRole(page, "Maya Thompson");
  await expect(page).toHaveURL(/\/patient$/);
  await expect(page.getByText("Your care team covers DoctorLoop's AI costs")).toBeVisible();
  await page.goto("/patient/check-in?tab=write");
  await page.getByLabel("Your update").fill(UPDATE);
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText("Your update is saved")).toBeVisible();

  await switchRole(page, "Dr. Elena Park");
  await expect(page).toHaveURL(/\/doctor$/);
  await page.goto(`/doctor/billing/statements/${MAYA_PATIENT_ID}`);
  await expect(page.getByRole("heading", { name: "Maya Thompson" })).toBeVisible();
  await expect(page.getByText("Private processing (not itemized)")).toBeVisible();
  await expect(page.getByText(/^[1-9]\d* runs? ·/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Billed", exact: true })).toHaveCount(0);
  const structuredAndBilled = page
    .getByRole("row")
    .filter({ hasText: "Update structuring" })
    .filter({ has: page.getByRole("cell", { name: "Billed", exact: true }) });
  await expect(structuredAndBilled).toHaveCount(0);

  await switchRole(page, "Maya Thompson");
  await expect(page).toHaveURL(/\/patient$/);
  await page.goto("/patient/review");
  await approvePending(page, "ice it before bed");

  await switchRole(page, "Dr. Elena Park");
  await expect(page).toHaveURL(/\/doctor$/);
  await page.goto(`/doctor/billing/statements/${MAYA_PATIENT_ID}`);
  await expect(page.getByRole("cell", { name: "Billed", exact: true }).first()).toBeVisible();
  // The shared update is now an itemized, billed line (it was private before).
  expect(await structuredAndBilled.count()).toBeGreaterThanOrEqual(1);

  await page.goto("/doctor/billing");
  await page.getByRole("button", { name: "Invoice now (demo)" }).click();
  await expect(page.getByRole("cell", { name: "SIM-0001" })).toBeVisible();
  errors.expectClean();
});
