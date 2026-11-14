import { mkdirSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { approvePending, startAs, switchRole, trackErrors } from "../e2e/helpers";

/**
 * Whole-app rehearsal of the demo, as one serial journey. Assertions deliberately avoid exact AI wording
 * so they hold for both the rule-based mock AI and a real OpenAI key.
 */

const BAND_FILE = process.env.TEST_RUN_BAND_FILE ?? "";
const AI_MODE = process.env.TEST_RUN_AI_MODE ?? "mock";
const VEXO_MODE = process.env.TEST_RUN_VEXO_MODE ?? "file";
const BAND_BASENAME = BAND_FILE.split("\\").join("/").split("/").pop() ?? "";
const SHOT_DIR = ".verification/test-run";

const TYPED =
  "Tonight my right knee aches about 7 out of 10 after physio and I only slept about 4 hours last night. I want to ask Dr. Park if I should ice it before bed.";
const TYPED_SNIPPET = "ice it before bed";
const VOICE_ANSWERS = [
  "My right knee aches about 6 out of 10 this evening.",
  "It started after my physio session this afternoon.",
  "Elevating the leg helps a bit, stairs make it worse.",
  "Should I take extra rest days before my next appointment?",
];
const VOICE_SNIPPET = "knee aches about 6 out of 10";

/** The sample capture has a mixed "Lunch with Chloe" recording that exercises the privacy filter. */
const SAMPLE_BAND = VEXO_MODE === "file" && BAND_BASENAME === "maya-band-capture.txt";
const CHLOE_TITLE = "Lunch with Chloe";
const CHLOE_KEPT_SNIPPET = "my knee has been aching all morning";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

let shotNo = 0;
async function shot(page: Page, testInfo: TestInfo, name: string) {
  shotNo += 1;
  const file = `${String(shotNo).padStart(2, "0")}-${name}.png`;
  mkdirSync(SHOT_DIR, { recursive: true });
  const body = await page.screenshot({ path: `${SHOT_DIR}/${file}`, fullPage: true });
  await testInfo.attach(file, { body, contentType: "image/png" });
}

test("whole app: patient to doctor, with a Vexo band replay", async ({ page }, testInfo) => {
  testInfo.annotations.push(
    { type: "band file", description: VEXO_MODE === "file" ? BAND_FILE : `(none, VEXO_MODE=${VEXO_MODE})` },
    { type: "AI mode", description: AI_MODE === "openai" ? "real OpenAI" : "mock (rule-based)" },
    { type: "Vexo mode", description: VEXO_MODE },
  );
  const t = trackErrors(page);
  const vexoSnippets: string[] = [];

  await test.step("1. Landing page renders; sign in as Maya Thompson", async () => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Maya Thompson/ }).first()).toBeVisible();
    await expect(page.getByText(/AI output is unverified/i).first()).toBeVisible();
    await shot(page, testInfo, "landing");
    await startAs(page, "Maya Thompson");
    await expect(page).toHaveURL(/\/patient$/);
  });

  await test.step("2. Patient overview renders", async () => {
    await expect(page.getByRole("heading", { name: /Welcome back, Maya/ })).toBeVisible();
    await expect(page.getByText(/ACL/i).first()).toBeVisible();
    await expect(page.getByText(/next appointment/i).first()).toBeVisible();
    // The AI engine the app displays (Integrations popover in the header) matches the run's AI mode.
    await page.getByRole("button", { name: "Integration status" }).click();
    const popover = page.getByRole("dialog");
    if (AI_MODE === "openai") {
      await expect(popover.getByText(/OpenAI ·/)).toBeVisible();
      await expect(popover.getByText(/Mock AI/)).toHaveCount(0);
    } else {
      await expect(popover.getByText("Mock AI (rule-based)")).toBeVisible();
      await expect(popover.getByText(/OpenAI ·/)).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await shot(page, testInfo, "patient-overview");
  });

  await test.step("3. Typed check-in is processed and waits in Review", async () => {
    await page.goto("/patient/check-in?tab=write");
    await page.getByLabel("Your update").fill(TYPED);
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(page.getByText("Your update is saved")).toBeVisible();
    const reviewLink = page.getByRole("tabpanel").getByRole("link", { name: /Review & share/ });
    await expect(reviewLink).toBeVisible();
    await shot(page, testInfo, "typed-checkin-processed");
    await reviewLink.click();
    await expect(page).toHaveURL(/\/patient\/review/);
    const card = page
      .locator("[id^='entry-']")
      .filter({ hasText: TYPED_SNIPPET })
      .filter({ has: page.getByRole("button", { name: /Approve & share/ }) });
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button", { name: /Approve & share/ })).toBeVisible();
    await shot(page, testInfo, "typed-pending-review");
  });

  await test.step("4. Simulated voice check-in is processed", async () => {
    await page.goto("/patient/check-in");
    await expect(page.getByText(/Simulated check-in/)).toBeVisible();
    await page.getByRole("button", { name: "Start voice check-in" }).click();
    const input = page.getByLabel("Your answer");
    for (const a of VOICE_ANSWERS) {
      await expect(input).toBeEnabled();
      await input.fill(a);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByText(a).first()).toBeVisible();
    }
    await page.getByRole("button", { name: /Finish & save/ }).click();
    await expect(page.getByText("Your update is ready for review")).toBeVisible();
    await shot(page, testInfo, "voice-checkin-processed");
  });

  await test.step("5. Vexo band import: filter, select, import", async () => {
    await page.goto("/patient/import");
    if (VEXO_MODE === "file") {
      await expect(page.getByText(/Vexo band replay/i).first()).toBeVisible();
      await expect(page.getByText(/simulated band data/i).first()).toBeVisible();
      const base = BAND_BASENAME;
      await expect(page.getByText(base).first()).toBeVisible();
    } else {
      await expect(page.getByText(new RegExp(VEXO_MODE, "i")).first()).toBeVisible();
    }
    await shot(page, testInfo, "import-landing");

    await page.getByRole("button", { name: /Find health-related memories/ }).click();
    const boxes = page.getByRole("checkbox");
    await expect(boxes.first()).toBeVisible();
    const filtered = page.getByText(/unrelated memor(y|ies) (was|were) filtered out/);
    // The strip is shown whenever the filter removed something; this band capture always has unrelated recordings.
    await expect(filtered).toBeVisible();
    await shot(page, testInfo, "import-candidates-filtered");

    const total = await boxes.count();
    const excerpts = page.getByLabel("Excerpt to import (you can trim it)");
    const labelOf = async (i: number) => {
      const id = await boxes.nth(i).getAttribute("id");
      return norm(await page.locator(`label[for="${id}"]`).innerText());
    };
    let chosen: number[] = [];
    if (SAMPLE_BAND) {
      // Import "Lunch with Chloe" (found by its text) plus the first other memory.
      const titles = await Promise.all(Array.from({ length: total }, (_, i) => labelOf(i)));
      const chloe = titles.indexOf(CHLOE_TITLE);
      expect(chloe, "the sample capture offers 'Lunch with Chloe'").toBeGreaterThanOrEqual(0);
      const other = titles.findIndex((title) => title !== CHLOE_TITLE);
      chosen = other >= 0 ? [chloe, other] : [chloe];
    } else {
      chosen = Array.from({ length: Math.min(2, total) }, (_, i) => i);
    }
    expect(chosen.length).toBeGreaterThan(0);
    const pick = chosen.length;
    for (const i of chosen) await boxes.nth(i).click();
    for (const i of chosen) {
      const text = norm(await excerpts.nth(i).inputValue());
      expect(text.length).toBeGreaterThan(10);
      // The Chloe recording is stored filtered: its review card shows only the knee sentences.
      if (SAMPLE_BAND && (await labelOf(i)) === CHLOE_TITLE) {
        expect(text).toContain("Lisbon");
        vexoSnippets.push(CHLOE_KEPT_SNIPPET);
      } else {
        vexoSnippets.push(text.slice(0, 40));
      }
    }
    await shot(page, testInfo, "import-selected");
    await page.getByRole("button", { name: new RegExp(`Import selected \\(${pick}\\)`) }).click();
    await expect(page.getByText(/memor(y|ies) imported/i).first()).toBeVisible();
    await shot(page, testInfo, "import-done");
  });

  await test.step("6. Review & share: approve every new pending update", async () => {
    await page.goto("/patient/review");
    await expect(page.getByText(/Vexo/).first()).toBeVisible();
    // No capture left a failed card behind.
    await expect(page.getByText(/processing failed/i)).toHaveCount(0);
    await expect(page.getByText("Could not structure this update")).toHaveCount(0);
    if (SAMPLE_BAND) {
      const chloeCard = page.locator("[id^='entry-']").filter({ hasText: CHLOE_KEPT_SNIPPET });
      await expect(chloeCard).toHaveCount(1);
      await expect(chloeCard).not.toContainText("Lisbon");
      await expect(chloeCard).not.toContainText("Chloe was telling me");
      await expect(chloeCard.getByTestId("privacy-receipt")).toContainText(/Privacy filter · kept \d+ of \d+ sentences?/);
      await expect(chloeCard.getByTestId("privacy-receipt")).toContainText(/removed parts were never saved/);
      await shot(page, testInfo, "review-privacy-receipt");
    }
    await approvePending(page, TYPED_SNIPPET);
    await approvePending(page, VOICE_SNIPPET);
    for (const s of vexoSnippets) await approvePending(page, s);
    await shot(page, testInfo, "review-approved");
  });

  await test.step("7. Summary shows AI output labeled unverified", async () => {
    await page.goto("/patient/summary");
    await page.getByRole("button", { name: /Regenerate/ }).first().click();
    await expect(page.getByText("Summary regenerated.")).toBeVisible();
    await expect(page.getByText(/AI-generated · unverified/).first()).toBeAttached();
    await expect(page.getByRole("heading", { name: "Your weekly recovery summary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What your care team sees" })).toBeVisible();
    await shot(page, testInfo, "patient-summary");
    await page.goto("/patient");
    await expect(page.getByText(/AI weekly report · unverified/)).toBeVisible();
    await expect(page.getByText(/AI DRAFT · UNVERIFIED/).first()).toBeVisible();
    await shot(page, testInfo, "patient-weekly-report");
  });

  let mayaUrl = "";
  await test.step("8. Dr. Elena Park: pre-visit summary, provenance, mark reviewed", async () => {
    await switchRole(page, "Dr. Elena Park");
    await expect(page).toHaveURL(/\/doctor$/);
    const row = page.getByRole("row", { name: /Maya Thompson/ });
    await expect(row).toContainText(/\d+ new updates?/);
    await shot(page, testInfo, "doctor-patient-list");
    await row.getByRole("link", { name: "Open Maya Thompson" }).click();
    await expect(page).toHaveURL(/\/doctor\/patients\/[^/?]+/);
    mayaUrl = page.url();
    await expect(page.getByRole("heading", { name: "AI pre-visit summary" })).toBeVisible();
    await expect(page.getByText(/AI-generated/i).first()).toBeVisible();
    await expect(page.locator('a[aria-label^="Source"]').first()).toBeVisible();
    await shot(page, testInfo, "doctor-previsit-summary");

    // Source citation chips open the original record.
    const chip = page.locator('a[aria-label^="Source"]').first();
    await chip.click();
    await expect(page.getByRole("dialog").getByText("Original patient-approved record")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const targets = [
      { snippet: TYPED_SNIPPET, vexo: false },
      { snippet: VOICE_SNIPPET, vexo: false },
      ...vexoSnippets.map((snippet) => ({ snippet, vexo: true })),
    ];
    let first = true;
    for (const { snippet, vexo } of targets) {
      const item = page.locator("li").filter({ hasText: snippet }).filter({ has: page.getByRole("link", { name: "Open record" }) }).first();
      await expect(item).toBeVisible();
      await item.getByRole("link", { name: "Open record" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByText("Provenance")).toBeVisible();
      if (vexo) {
        await expect(sheet.getByText("Vexo memory").first()).toBeVisible();
        await expect(sheet.getByText("Memory id")).toBeVisible();
        await expect(sheet.getByTestId("privacy-receipt")).toContainText(/Privacy filter · kept \d+ of \d+ sentences?/);
        if (VEXO_MODE === "file") {
          await expect(sheet.getByText(/simulated, replayed from band file/i).first()).toBeVisible();
          await expect(sheet.getByText(BAND_BASENAME).first()).toBeVisible();
        }
        if (first) {
          await shot(page, testInfo, "doctor-vexo-record-provenance");
          first = false;
        }
      }
      await sheet.getByRole("button", { name: "Mark reviewed" }).click();
      await expect(sheet.getByText(/^Reviewed/)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await shot(page, testInfo, "doctor-marked-reviewed");
  });

  await test.step("9. Back to Maya: the loop shows it was seen by Dr. Park", async () => {
    await switchRole(page, "Maya Thompson");
    await page.goto("/patient/timeline");
    const card = page.locator("[id^='entry-']").filter({ hasText: TYPED_SNIPPET }).first();
    await expect(card).toBeVisible();
    await expect(card.getByRole("img", { name: /Seen by care team \(done\): Dr\. Elena Park/ })).toBeVisible();
    await shot(page, testInfo, "patient-seen-by-doctor");
  });

  await test.step("10. Dr. Marcus Bell cannot see Maya", async () => {
    await switchRole(page, "Dr. Marcus Bell");
    await expect(page).toHaveURL(/\/doctor$/);
    await expect(page.getByRole("row", { name: /Priya Raman/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Maya Thompson/ })).toHaveCount(0);
    await shot(page, testInfo, "marcus-patient-list");
    const res = await page.goto(mayaUrl);
    expect([200, 404]).toContain(res?.status());
    await expect(page.getByText("Maya Thompson")).toHaveCount(0);
    await expect(page.getByText(/not found|could not be found/i).first()).toBeVisible();
    for (const s of [TYPED_SNIPPET, VOICE_SNIPPET, ...vexoSnippets]) await expect(page.getByText(s)).toHaveCount(0);
    await shot(page, testInfo, "marcus-blocked");
  });

  // Chromium logs the 404 document response itself as a console error; that is expected in step 10.
  t.errors.splice(0, t.errors.length, ...t.errors.filter((e) => !/404/.test(e)));
  t.expectClean();
});
