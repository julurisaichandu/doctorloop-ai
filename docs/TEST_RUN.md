# Test run: rehearse the whole demo

Two ways to check the whole app end to end, with a text file standing in for your Vexo band:

1. **Automated** (`npm run test:run`): a real browser walks the full demo and leaves proof of every step.
2. **Manual** (`npm run dev`): a click-through checklist for rehearsing the live demo yourself.

Everything uses synthetic data. AI output is always unverified.

## 1. The automated run

```bash
npm run test:run            # headless
npm run test:run:headed     # watch the browser (slowed to ~300 ms per action)
```

First time only: `npx playwright install chromium`.

### What it does

1. Builds an isolated copy of the app into `.next-testrun` (your `.next` and dev server are untouched).
2. Deletes `.data/test-run-db.json` so the local demo database reseeds, then serves the build on **port 3200**
   (3000 is your dev server, 3100 is the main e2e suite).
3. Forces the **local demo DB** and the **simulated voice check-in**, whatever is in `.env.local`
   (Supabase and ElevenLabs variables are blanked for the run). OpenAI stays as configured: with a key in
   `.env.local` the run uses real OpenAI end to end, otherwise the rule-based mock AI.
4. Replays the band file (`VEXO_MODE=file`, default `vexo-band/maya-band-capture.txt`) and runs one journey:

| Step | What is checked |
| --- | --- |
| 1 | Landing page renders; sign in as Maya Thompson |
| 2 | Patient overview renders |
| 3 | Typed check-in is processed and waits in Review |
| 4 | Simulated voice check-in is processed |
| 2b | The header Integrations popover shows the AI engine matching `TEST_RUN_AI_MODE` ("Mock AI (rule-based)" or "OpenAI ·") |
| 5 | Import page says "Vexo band replay" and the file name; "Find health-related memories"; the "filtered out" message shows; with the sample file "Lunch with Chloe" (found by its text) plus the first other memory are imported; with `--file` the first two |
| 5b | Review: no "Processing failed"; the Chloe card shows the knee snippet, no "Lisbon", and the privacy receipt (sample file only) |
| 6 | Review & share: every new pending update approved |
| 7 | Weekly summary and weekly report are labeled AI-generated / unverified |
| 8 | Dr. Elena Park: pre-visit summary with source citations; the Vexo record sheet shows Vexo memory, Provenance, Memory id and replay labeling; new updates marked reviewed |
| 9 | Back as Maya: the timeline shows "Seen by care team" with Dr. Elena Park |
| 10 | Dr. Marcus Bell (assigned only to Priya) cannot see Maya, in his list or by opening her URL |

Assertions never depend on exact AI wording, so they hold for both mock and real AI.

### How long

About 1 minute for the build plus 20-30 seconds for the journey with the mock AI. With real OpenAI expect a
few minutes (each extraction and summary is a network call). Test timeout is 5 minutes.

### Flags

Pass flags after `--`: `npm run test:run -- --mock-ai --skip-build`.

| Flag | Meaning |
| --- | --- |
| `--file <path>` | Band file to replay (default `vexo-band/maya-band-capture.txt`). Relative to the project root, or absolute. Fails fast if missing. |
| `--headed` | Show the browser (slowMo ~300 ms). Same as `npm run test:run:headed`. |
| `--skip-build` | Reuse the last `.next-testrun` build (the band file and AI mode are read at runtime, so changing them needs no rebuild; code changes do). |
| `--mock-ai` | Force the rule-based mock AI even if `OPENAI_API_KEY` is set. |

The script prints a header (AI mode, band file, data = local demo DB, voice = simulated), exits with
Playwright's exit code, and restores `next-env.d.ts` and `tsconfig.json`, which `next build` rewrites.

### Where the proof lands

| What | Where |
| --- | --- |
| HTML report (steps, attachments, annotations for band file and AI mode) | `.verification/test-run-report/index.html`; open with `npx playwright show-report .verification/test-run-report` |
| One full-page screenshot per step | `.verification/test-run/NN-name.png` (also attached in the report) |
| Video of the whole journey, trace on failure | `.verification/test-run-results/` |

All of `.verification/` and `.data/` is gitignored and wiped/recreated on each run.

## 2. Manual click-through (live demo rehearsal)

Setup: put this in `.env.local` (restart `npm run dev` after editing), then run `npm run dev`.

```
VEXO_MODE=file
VEXO_FILE_PATH=vexo-band/maya-band-capture.txt
ENABLE_DEMO_ROLE_SWITCHER=true
```

Leave the Supabase and ElevenLabs variables empty for the local demo DB and the simulated voice check-in. Add
`OPENAI_API_KEY` to see real AI; leave it empty for the mock. Open http://localhost:3000.

| # | Do | Expect |
| --- | --- | --- |
| 1 | On the landing page choose **Maya Thompson**; in the account menu pick **Reset demo data** | "Demo data reset." and the overview "Welcome back, Maya" |
| 2 | Read the overview | ACL recovery context, next appointment, an "AI weekly report - unverified" section |
| 3 | **Check-in**, Write tab: type a note (for example "knee aches 7 out of 10 after physio, should I ice it?"), **Save update** | "Your update is saved", with a **Review & share** link |
| 4 | **Check-in**, Voice tab: **Start voice check-in**, answer the four questions, **Finish & save** | A "Simulated check-in" label, then "Your update is ready for review" |
| 5 | **Import**: confirm the page says **Vexo band replay** and your file name | The band file name is shown |
| 6 | Press **Find health-related memories** | A strip of redacted bars dissolves into "N unrelated memories were filtered out - never stored." The 7 or so health-related recordings are listed; the work stand-up, birthday dinner and similar are not |
| 7 | **Privacy filter:** tick the mixed "Lunch with Chloe" memory (leave its excerpt as is) | "1 memory selected" |
| 8 | Tick one more memory, press **Import selected (2)** | "2 memories imported" and a note that nothing is shared yet |
| 8b | On **Review & share**, read the Chloe card | Only the knee sentences, no "Lisbon"; "Privacy filter · kept 2 of 7 sentences · removed parts were never saved" with a "rule-based" tag; the physio and care-team memories show ADDRESS HIDDEN, PHONE HIDDEN and NAME HIDDEN pills; no "Processing failed" on any card |
| 9 | **Review & share**: approve each new update (typed, voice, the two Vexo ones) | Each card loses its Approve button; the update shows as Shared |
| 10 | **Summaries**: press **Regenerate** | "Summary regenerated." Both summaries carry the AI-generated, unverified label and cite your own words |
| 11 | Account menu, switch to **Dr. Elena Park**; open **Maya Thompson** | "N new updates" on her row; the **AI pre-visit summary** with an AI-generated label and numbered source chips |
| 12 | Click a source chip | A sheet with "Original patient-approved record" |
| 13 | Open the **Lunch with Chloe** record (the Vexo update) | **Vexo memory**, **Provenance**, **Memory id**, replay labeling, only the two knee sentences (nothing about Lisbon) and the "Privacy filter · kept 2 of 7 sentences" receipt |
| 14 | **Mark reviewed** on each new update | "Reviewed ..." replaces the button; the list shows "All reviewed" |
| 15 | Switch back to **Maya Thompson**, open **Timeline** | Each reviewed update's progress shows "Seen by care team" with Dr. Elena Park and a time |
| 16 | Switch to **Dr. Marcus Bell** | Only Priya Raman is listed |
| 17 | Paste Maya's doctor URL (`/doctor/patients/<id>`, copied in step 11) | "Patient not found or not assigned to you", no Maya data |

## 3. Using your own band file

Point `VEXO_FILE_PATH` (or `--file`) at your own capture. The accepted formats (plain text with `##` headers or
JSON), date syntax and the wearer line are described in [`vexo-band/README.md`](../vexo-band/README.md).

```bash
npm run test:run -- --file path/to/my-band.txt
```

The automated journey needs at least one health-related recording and at least one unrelated one (it asserts the
"filtered out" message) within the last 7 days, the import page's default range. It selects the first two
health-related candidates and imports them. The wearer must match the demo patient, Maya Thompson
(`maya.thompson@example.com`).

## 4. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Band file not found` | Check the `--file` path (relative to the project root, or absolute). |
| `--skip-build needs an earlier build` | Run once without `--skip-build`. |
| Port 3200 already in use | Another test run is still alive. Stop that process; the run never reuses an existing server. |
| `Executable doesn't exist` from Playwright | `npx playwright install chromium`. |
| Build fails | Run `npm run typecheck` first; the error is almost always a type or syntax error in `src/`. |
| Step 5 cannot find the "filtered out" message or any candidates | The band file has nothing health-related, nothing unrelated, or recordings older than 7 days. Fix the file or see section 3. |
| Run is slow or times out with AI | Real OpenAI calls take seconds each. Use `--mock-ai` for a fast, deterministic run. |
| Your dev server shows odd data after a run | It should not: the run uses its own build and `.data/test-run-db.json`. Reload, or **Reset demo data**. |
| `tsconfig.json` or `next-env.d.ts` changed | The script restores them in a `finally`; if you killed it mid-build, restore them from version control. |
| Edits to `.env.local` ignored in dev | Restart `npm run dev`; Next reads env files on start. |
| The step-8 assertion about replay labeling fails | The record sheet must show "replay" or "simulated" next to the Vexo provenance in file mode. |
