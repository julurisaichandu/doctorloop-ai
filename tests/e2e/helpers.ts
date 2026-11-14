import { expect, type Page } from "@playwright/test";

/** Collects console errors and page errors; call `expectClean()` at the end of a test. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return {
    errors,
    expectClean() {
      expect(errors, errors.join("\n")).toEqual([]);
    },
  };
}

export type Who = "Maya Thompson" | "Daniel Okafor" | "Priya Raman" | "Dr. Elena Park" | "Dr. Marcus Bell";

/** Sign in as a demo account via the header role switcher (must already be signed in) or the account cards. */
export async function switchRole(page: Page, who: Who) {
  await page.getByRole("button", { name: /Switch demo account/ }).click();
  await page.getByRole("menuitemcheckbox", { name: new RegExp(who.replace(".", "\.")) }).click();
  await page.waitForURL(/\/(patient|doctor)/);
}

/** Pick an account on "/" and reset demo data through the switcher. Leaves the page signed in as `who`. */
export async function startAs(page: Page, who: Who) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(who.replace(".", "\.")) }).first().click();
  await page.waitForURL(/\/(patient|doctor)/);
  await page.getByRole("button", { name: /Switch demo account/ }).click();
  await page.getByRole("menuitem", { name: /Reset demo data/ }).click();
  await expect(page.getByText("Demo data reset.")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // let recharts animations finish
  await page.waitForTimeout(1200);
}

/** Approve the one pending update on /patient/review whose card matches `text` (seed data has other pending entries). */
export async function approvePending(page: Page, text: string | RegExp) {
  const card = page
    .locator("[id^='entry-']")
    .filter({ hasText: text })
    .filter({ has: page.getByRole("button", { name: /Approve & share/ }) });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: /Approve & share/ }).click();
  await expect(card.getByRole("button", { name: /Approve & share/ })).toHaveCount(0);
}
