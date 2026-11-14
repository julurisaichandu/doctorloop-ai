# DoctorLoop AI — Design System v2 ("Ink & Signal")

Binding spec for the UI redesign. Goal: an Awwwards-level health product — editorial,
high-contrast, data-rich, calm motion — that does NOT look AI-generated (no teal/slate
SaaS defaults, no purple "AI" gradients, no glassmorphism, no emoji, no stock 3D blobs).
Inspiration patterns (borrow patterns, never copy layouts/assets): Bevel (ring + one-line
summary), Function Health (editorial stat strip, serif italic), Oura (paper + one hard
accent), Linear (mono metadata on calm dark), Granola (raw note → structured), Levels
(annotated lines). Research brief: scratchpad design-refs/BRIEF.md.

## 1. Concept
- **Human vs machine, visibly different.** The patient's own words are set in an
  editorial serif italic (Instrument Serif) on paper. AI output lives in **ink cards**
  with **mono uppercase labels** and a lime spark. Anyone can tell at a glance what the
  patient said vs. what the AI drafted.
- **The loop.** A recurring circular motif (rings, orbit line, loop tracker) shows each
  update travelling Captured → Structured → Reviewed by you → Shared → Seen by care team.
- **One hero metric + 3 supporting per screen, hairline dividers, direct labels, whitespace.**
- **Trust is never hidden behind motion:** private vs shared state is always visible as
  icon + label + color.

## 2. Color tokens (exact values — use CSS variables, never hard-code elsewhere)
| Token | Hex | Use |
|---|---|---|
| `--ink` | #0E0F12 | primary text, dark surfaces (sidebar, AI cards, hero bands), primary buttons |
| `--ink-2` | #1B1D22 | raised dark surface |
| `--ink-3` | #2A2D35 | dark borders / dividers on ink |
| `--paper` | #F4EFE6 | app canvas |
| `--paper-2` | #FBF8F2 | cards on canvas |
| `--paper-3` | #EAE3D6 | subtle panels, hover, skeletons |
| `--hairline` | #DDD4C4 | 1px borders/dividers on paper |
| `--muted` | #6B665D | secondary text on paper (≈5:1) |
| `--muted-ink` | #A9A49A | secondary text on ink (≈7:1) |
| `--lime` | #C8F03C | signature accent: FILL ONLY (ink text on lime ≈13:1); glows/strokes on ink. Never text on paper |
| `--lime-deep` | #5F7D00 | lime-family strokes/text on paper (≥4.5:1) |
| `--vermilion` | #FF4A1C | symptom data fills/strokes, decorative quote marks, text on ink (≈6:1) |
| `--vermilion-deep` | #B8330F | vermilion text on paper (≈5:1) |
| `--cobalt` | #2B3BFF | sleep data, links, Voice source; text OK on paper (≈6.5:1) |
| `--cobalt-soft` | #8C96FF | cobalt on ink |
| `--amber` | #FFB400 | FILL ONLY (ink text): pending status, mood/wound fills |
| `--amber-deep` | #A86F00 | amber strokes/text on paper |
| `--bone` | #8A857B | non-essential decorative strokes only (≈3.4:1) |

Semantic mapping (single source of truth in `src/components/viz/palette.ts`):
- **Categories:** symptom → vermilion · sleep → cobalt · mobility & activity → lime-deep
  (lime fill on ink) · mood & wound → amber-deep (amber fill) · medication, question,
  other → ink.
- **Sources:** Voice → cobalt fill + white text (Mic icon) · Note → paper-3 fill + ink
  text (PenLine) · Vexo → ink fill + lime text (Radio/Sparkles) — Vexo is the sponsor
  highlight. Mode tags ("mock", "simulated") in mono uppercase.
- **Review status (icon + label + color, never color alone):** pending → amber fill, ink
  text, Clock · shared → lime fill, ink text, Check · private → paper-3 fill, ink text,
  Lock. Doctor "New" → cobalt dot + label; "Reviewed" → muted check.
- **Charts on paper:** vermilion, cobalt, lime-deep, amber-deep, ink (≥3:1 graphics).
  On ink: lime, vermilion, cobalt-soft, amber, paper.
- Data colors never imply good/bad: deltas are neutral ink with ↑/↓ arrows and words
  ("+4 since Nov 7"), never red/green judgement. No risk colors anywhere.
- Map shadcn variables to these tokens in globals.css (`--background: paper`,
  `--foreground: ink`, `--primary: ink`, `--primary-foreground: paper`, `--accent: lime`,
  `--accent-foreground: ink`, `--card: paper-2`, `--border/--input: hairline`,
  `--ring: cobalt`, `--muted-foreground: muted`, `--sidebar: ink`, `--chart-1..5` = chart
  colors above, `--radius: 0.875rem`). Expose Tailwind utilities via `@theme inline`
  (`bg-ink`, `text-paper`, `bg-lime`, `text-vermilion-deep`, `border-hairline`, …).

## 3. Typography
- Display: **Instrument Serif** 400 (normal + italic) → `--font-display`. Page titles
  (40–56px desktop / 32–36px mobile, tracking -0.02em, leading 1.05), section titles
  (28–32px), hero numbers ("Day 19"), patient quotes (italic, 18–22px, leading 1.45).
- UI: **Geist** → `--font-sans` (body 15–16px, leading 1.55; UI labels 13–14px).
- Data: **Geist Mono** → `--font-mono`: eyebrows/labels (11–12px, uppercase, tracking
  0.08em), timestamps, units, metrics, citations. All numbers `tabular-nums`.
- Headline pattern: sans or serif with ONE italic serif emphasis word
  ("Between visits, *nothing gets lost.*").

## 4. Surfaces & layout
- Canvas paper; cards paper-2, 1px hairline border, radius 20px (hero blocks 28px),
  no drop shadows (at most `0 1px 0 hairline`). Ink "bands" (rounded 28px) for hero
  areas inside pages. Grain overlay (SVG feTurbulence, opacity ≤0.06) only on landing
  hero and ink bands.
- Content max-width 1280px, 24px gutters desktop / 16px mobile, 8px spacing grid,
  generous vertical rhythm (sections 48–72px apart).
- Sidebar: ink; nav items paper/80 text; active = lime pill with ink text; badges lime.
- Header: paper, hairline bottom, mono breadcrumb, ink "DEMO DATA" pill with lime dot.
- Buttons: primary = ink bg + paper text (on paper) / lime bg + ink text (on ink);
  secondary = hairline outline; radius full (pill) for primary CTAs; arrow nudges +4px
  on hover; tap scale .97.
- Icons: lucide, stroke 1.5.

## 5. Motion (library `motion`, import from "motion/react")
- Tokens (`src/components/motion/tokens.ts`): `EASE_OUT=[0.22,1,0.36,1]`,
  `EASE_IN=[0.4,0,1,1]`, `SPRING={type:"spring",stiffness:260,damping:30}`,
  `DUR={micro:0.15, base:0.4, reveal:0.6, draw:1.2, count:1.4}`, `STAGGER=0.06`.
- `<MotionConfig reducedMotion="user">` at the root. With reduced motion: no transforms,
  ≤0.2s opacity fades, count-ups show final values, paths/rings render complete,
  marquee and orb static.
- Patterns: scroll reveal (opacity 0→1, y 24→0, 0.6s, once, margin "-10%"); headline
  per-word mask reveal; SVG path/ring draw (pathLength 0→1, 1.2s); count-ups (1.4s,
  only decorative stats — NEVER for review badges/counters or anything e2e asserts);
  marquee (CSS, 35s linear, duplicated content, pause on hover/focus); layout animations
  for approve/share state changes (spring); hover lift 120ms. Calm: no flashing, no
  parallax/zoom, no endless large loops on app screens (landing hero orbit is OK, slow).
- Animate transform/opacity only; never setState per animation frame.

## 6. Shared building blocks (wave 1 — FOUNDATION agent)
`src/components/motion/` ("use client"): `motion-provider.tsx` (`MotionProvider`),
`tokens.ts`, `reveal.tsx` (`Reveal {children, delay?, y?, className?, as?}`),
`stagger.tsx` (`Stagger {children, className?, delay?}` + `StaggerItem`),
`count-up.tsx` (`CountUp {value, decimals?, prefix?, suffix?, className?}` — SSR renders
the final value; animates from 0 only after it scrolls into view), `split-text.tsx`
(`SplitText {text, className?, as?}` per-word mask reveal; italic segments via
`*word*` markup), `draw-path.tsx` (`DrawPath {d, className?, strokeWidth?, delay?}`),
`marquee.tsx` (`Marquee {children, className?, speedSeconds?}`), `glow-card.tsx`
(`GlowCard {children, className?}` cursor-follow radial highlight), `grain.tsx` (`Grain`).
Page enter transitions: `src/app/patient/template.tsx` and `src/app/doctor/template.tsx`
(fade + rise 12px, 0.4s).

`src/components/viz/` : `palette.ts` (category/source/status → token map + chart color
helpers), `ring.tsx` (`Ring {value 0..1, size, thickness, color, trackColor?, children?,
ariaLabel}` — draws in), `sparkline.tsx` (`Sparkline {values: number[], color, width?,
height?, ariaLabel}` — draws in, end dot), `annotated-text.tsx` ("use client";
`AnnotatedText {text, annotations: {id, quote, category, label}[], activeId?,
onActiveChange?, className?}` — highlights each verbatim quote (whitespace-normalised
match, first occurrence, non-overlapping) as a marker: category color at ~22% fill +
2px underline; hover/focus links to the observation; unmatched quotes ignored).

Restyle every file in `src/components/shared/` and `src/components/app-shell/` to this
system without changing their exported props (ARCHITECTURE §6.9): AiGeneratedLabel =
ink pill, mono uppercase "AI DRAFT · UNVERIFIED", lime spark; PatientQuote = serif italic
with large vermilion quote glyph; ObservationItem = category color bar + mono meta +
big mono "7/10" when severity stated; SummaryView = **ink "AI report" card** (paper
text, mono section labels, numbered lime citation chips, overview in serif); EntryCard =
paper card, mono meta row, body via an `EntryEvidence` client subcomponent that renders
`AnnotatedText` linked (hover/focus) to the observation list; SymptomTrendsChart = direct
labels at line ends instead of legends, hairline grid, mono axes, category colors;
EntryTimeline = serif day headers + thin vertical rule + category dots; StatCard = mono
label, big display number (CountUp allowed), optional sparkline slot; PageHeader = mono
eyebrow + display title + muted description. Root layout loads the three fonts and
wraps children in `MotionProvider`.

## 7. Page specs (wave 2)
**Landing `/` + `/login` [LANDING agent]** — ink hero with grain: display headline with
italic emphasis + per-word reveal; animated "loop" orbit SVG (three nodes You · AI · Your
care team, a lime dot travelling slowly along the path); signature demo card where a
patient sentence types in, then quote highlights appear and observation chips fly out
(AnnotatedText); lime pill CTAs. Then: marquee strip of capture channels/principles; "how
it works" sticky-scroll storytelling (4 steps; left sticky captions, right visual changes
with scroll progress) with a simple stacked fallback on mobile/reduced motion; bento grid
(Voice orb, Vexo memory stream with filtered items dissolving, AI structuring, Doctor
cited summary, Consent toggle); editorial stat strip with hairline separators (product
facts only, e.g. "3 ways to capture", "0 items shared without your approval", "Every AI
statement cites its source"); principles; disclaimer; integration status; demo account
cards; footer. Login restyled to match (split layout: ink panel with loop art + form).

**Patient overview `/patient` [OVERVIEW agent]** — ink hero band: serif greeting
("Good evening, Maya." computed client-side), "Day 19 of recovery" hero number, next
appointment countdown, **RecoveryRings** (3 concentric rings: check-in rhythm = days with
≥1 update in the last 7 / 7; shared = approved / total this week; seen by care team =
reviewed shared updates / shared updates) each with a one-line plain-language caption
(Bevel pattern), quick actions (Voice check-in = lime primary). Then: metric tiles (top
tracked series: big mono latest value, unit, sparkline, neutral delta), "Needs your
review" spotlight (annotated preview + CTA), **SymptomHeatCalendar** (last 14 days ×
tracked series, single-hue ramp per series, hatch for "no log", legend, "self-reported"),
**BodyMap** (minimal geometric front-view figure; dots on mentioned body sites sized by
mention count; tooltip/list; label "Where you've mentioned symptoms · self-reported"),
**LoopTracker** for the latest 4 entries (Captured → Structured → Reviewed by you →
Shared → Seen by care team), editorial weekly-report preview, recent activity. Needs the
new `careTeamReview` data (below).

**Capture flows `/patient/check-in` + `/patient/import` [CAPTURE agent]** — Voice: large
**VoiceOrb** (audio-reactive in live mode via the SDK's input/output volume getters if
present in the installed typings, rAF + motion values; gentle breathing in simulated mode;
static meter with reduced motion), state captions, restyled transcript bubbles (patient =
serif italic, assistant = mono label). Write: **Quick log** composer (optional pain
0–10 slider + body site select, sleep-hours stepper, activity-minutes stepper, mood chips)
that inserts plain first-person sentences into the textarea which the patient can edit
before submitting — the patient's text stays the only source; then a "structuring"
moment: AnnotatedText reveal + observation chips stagger in + clear "Review & share" CTA.
Vexo import: "memory stream" visual — on search a scan line sweeps a stack of memory
cards; unrelated memories appear as redacted bars that dissolve with the note "N
unrelated memories filtered out — never stored"; relevant ones slide in as selectable
cards (serif excerpt, mono provenance, matched-term chips); sticky import bar.

**Review, timeline, summaries + doctor polish [CURATION agent]** — Review: annotated
entries, observation editing, "Approve & share" with a satisfying layout animation (card
morphs to shared state, lands in "Recently shared"), sticky status bar ("2 waiting ·
nothing is shared until you approve"). Timeline: serif day headers, segmented filter
pills, mini LoopTracker per entry. Summaries: editorial weekly report (serif title "Week of
Nov 7–13", stat strip, sections with numbered footnote citations) + ink "What your care
team sees" card. Doctor side: adopt the system (ink sidebar, mono meta, serif names), patient
list with lime "new updates" pill and hairline table, detail page with ink AI report,
annotated record sheet. Keep the doctor side calm and professional.

## 8. Data addition (OVERVIEW agent owns it)
`TimelineEntryView.careTeamReview?: { doctorName: string; reviewedAt: string } | null`
— populated in PATIENT views only (latest review of that entry by any assigned doctor),
via the system repository after the patient-self check. Lets patients see their update
was seen ("closing the loop"). Doctors' views keep `doctorReview`.

## 9. Guardrails for every agent
- Preserve exported props/contracts and the accessible names/texts the e2e specs use
  (`grep -rn "getBy" tests/e2e`) — do not edit tests/e2e; if a label must change, keep
  the old accessible name (e.g. via aria-label) and list it in your report.
- No risk/triage language or colors; keep "self-reported" and AI-unverified labels.
- WCAG AA: text ≥4.5:1 (use the *-deep tokens on paper), graphics ≥3:1, focus rings
  visible (cobalt), keyboard reachable, `prefers-reduced-motion` honored.
- Performance: transform/opacity only, lazy-mount offscreen SVG, no WebGL, no huge blurs.
