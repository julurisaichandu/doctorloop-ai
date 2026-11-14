import { expect, test } from "@playwright/test";
import { approvePending, startAs, switchRole, trackErrors } from "./helpers";

test("simulated voice check-in flows through to the doctor", async ({ page }) => {
  const t = trackErrors(page);
  await startAs(page, "Maya Thompson");
  await page.goto("/patient/check-in");
  await expect(page.getByText(/Simulated check-in/)).toBeVisible();
  await page.getByRole("button", { name: "Start voice check-in" }).click();

  const answers = [
    "My right knee aches about 6 out of 10 this evening.",
    "It started after my physio session this afternoon.",
    "Elevating the leg helps a bit, stairs make it worse.",
    "Should I take extra rest days before my next appointment?",
  ];
  const input = page.getByLabel("Your answer");
  for (const a of answers) {
    await expect(input).toBeEnabled();
    await input.fill(a);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(a).first()).toBeVisible();
  }
  await page.getByRole("button", { name: /Finish & save/ }).click();
  await expect(page.getByText("Your update is ready for review")).toBeVisible();
  await expect(page.getByText(/6\/10 \(self-reported\)/).first()).toBeVisible();

  await page.getByRole("tabpanel").getByRole("link", { name: /Review & share/ }).click();
  await expect(page).toHaveURL(/\/patient\/review/);
  await approvePending(page, "knee aches about 6 out of 10");

  await switchRole(page, "Dr. Elena Park");
  const row = page.getByRole("row", { name: /Maya Thompson/ });
  await expect(row).toContainText(/\d+ new updates?/);
  await expect(row).toContainText("knee aches about 6 out of 10");
  t.expectClean();
});
