import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startAs, switchRole, trackErrors } from "./helpers";

const OUT = path.join(".verification", "screenshots");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function ready(page: Page) {
  await page.waitForLoadState("networkidle");
  // Charts: wait for recharts SVGs (if any) to be drawn, then let animations finish.
  const charts = page.locator(".recharts-surface");
  if ((await charts.count()) > 0) await expect(charts.first()).toBeVisible();
  await page.waitForTimeout(1200);
}

for (const vp of VIEWPORTS) {
  test(`screenshots: ${vp.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const t = trackErrors(page);
    const shot = async (name: string) => {
      await ready(page);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`), fullPage: true });
    };

    await page.goto("/");
    await shot("landing");
    await page.goto("/login");
    await shot("login");

    await startAs(page, "Maya Thompson");
    await page.goto("/patient");
    await shot("patient-overview");

    // Voice: idle, then mid-conversation.
    await page.goto("/patient/check-in");
    await expect(page.getByRole("button", { name: "Start voice check-in" })).toBeVisible();
    await shot("checkin-voice-idle");
    await page.getByRole("button", { name: "Start voice check-in" }).click();
    const input = page.getByLabel("Your answer");
    await input.fill("My right knee is sore tonight, about a 5 out of 10.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("When did that start", { exact: false })).toBeVisible();
    await shot("checkin-voice-mid");

    // Write tab + success.
    await page.goto("/patient/check-in?tab=write");
    await expect(page.getByLabel("Your update")).toBeVisible();
    await shot("checkin-write");
    await page.getByLabel("Your update").fill("Today my knee felt stiff, about 4 out of 10. I slept about 6 hours and walked for 15 minutes.");
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(page.getByText("Your update is saved")).toBeVisible();
    await shot("checkin-write-success");

    await page.goto("/patient/review");
    await expect(page.getByRole("button", { name: /Approve & share/ }).first()).toBeVisible();
    await shot("review");

    await page.goto("/patient/timeline");
    await shot("timeline");
    await page.goto("/patient/summary");
    await shot("summary");

    // Vexo import.
    await page.goto("/patient/import");
    await shot("import-initial");
    await page.getByRole("button", { name: /Find health-related memories/ }).click();
    await expect(page.getByText(/unrelated memor(y|ies) (was|were) filtered out/)).toBeVisible();
    await shot("import-preview");
    await page.getByRole("checkbox").first().click();
    await page.getByRole("button", { name: /Import selected \(1\)/ }).click();
    await expect(page.getByText(/imported/i).first()).toBeVisible();
    await shot("import-success");

    // Approve one pending entry so the doctor side has fresh data, then switch to Dr. Park.
    await page.goto("/patient/review");
    await page.getByRole("button", { name: /Approve & share/ }).first().click();
    await page.waitForLoadState("networkidle");

    await switchRole(page, "Dr. Elena Park");
    await expect(page.getByRole("link", { name: /Maya Thompson/ }).first()).toBeVisible();
    await shot("doctor-patient-list");

    await page.goto("/doctor");
    const open = page.getByRole("link", { name: /Maya Thompson/ }).first();
    await open.click();
    await expect(page.getByRole("heading", { name: "AI pre-visit summary" })).toBeVisible();
    const detailUrl = page.url();
    await shot("doctor-patient-detail");

    await page.getByRole("link", { name: "Open record" }).first().click();
    await expect(page.getByRole("dialog").getByText("Original patient-approved record")).toBeVisible();
    await shot("record-sheet");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await switchRole(page, "Dr. Marcus Bell");
    await page.goto(detailUrl);
    await expect(page.getByText(/not found|could not be found/i).first()).toBeVisible();
    await shot("bell-not-found");

    t.errors.splice(0, t.errors.length, ...t.errors.filter((e) => !/404/.test(e)));
    t.expectClean();
  });
}
