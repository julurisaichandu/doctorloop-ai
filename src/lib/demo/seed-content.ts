/**
 * Narrative content for the synthetic demo dataset. Everything here is fictional.
 * Entry keys: m1..m8 (Maya), d1..d8 (Daniel), p1..p8 (Priya), oldest first.
 */
import type { EntrySource, ObservationCategory, PrivacyRedactionCategory, ReviewStatus } from "@/lib/domain/types";

export type PatientKey = "maya" | "daniel" | "priya";

export interface ObsDef {
  c: ObservationCategory;
  l: string;
  site?: string;
  /** Verbatim substring of the entry body. */
  q: string;
  /** Time as the patient described it. */
  td?: string;
  /** Set true when observedAt cannot be pinned to the entry time (e.g. "last night"). */
  noTime?: boolean;
  /** [number, verbatim wording] — only when the body states the number. */
  sev?: [number, string];
  /** [value, unit] — only when the body states the quantity. */
  m?: [number, string];
  ctx?: string[];
  unc?: string[];
}

export interface EntryDef {
  key: string;
  patient: PatientKey;
  source: EntrySource;
  /** Either a day offset + UTC "HH:MM", or minutes before now (for the latest entry). */
  when: { daysAgo: number; time: string } | { minsAgo: number };
  status: ReviewStatus;
  /** Manual and vexo entries. Voice entries derive their body from voice.patient. */
  body?: string;
  voice?: { patient: string[]; agent: string[] };
  vexo?: { externalId: string; title: string; suffix: string; query: string };
  /** Seeded privacy filter receipt (counts only) for entries that look like filtered band captures. */
  privacyFilter?: { totalSentences: number; keptSentences: number; redactions: Partial<Record<PrivacyRedactionCategory, number>> };
  note?: string;
  obs: ObsDef[];
}

export const ENTRY_DEFS: EntryDef[] = [
  // ---------------------------------------------------------------- Maya
  {
    key: "m1",
    patient: "maya",
    source: "manual",
    when: { daysAgo: 6, time: "20:30" },
    status: "approved",
    body: "Day 12 after my surgery. Knee discomfort is about a 3 out of 10 today, mostly a dull ache after physio. I slept about 7 hours last night and I'm using crutches around the house.",
    obs: [
      { c: "symptom", l: "Knee discomfort", site: "right knee", q: "Knee discomfort is about a 3 out of 10 today", td: "today", sev: [3, "about a 3 out of 10"], ctx: ["dull ache", "after physio"], unc: ["Whether the ache is constant or only after exercise not stated"] },
      { c: "sleep", l: "Sleep", q: "I slept about 7 hours last night", td: "last night", noTime: true, m: [7, "hours"] },
      { c: "mobility", l: "Crutch use", q: "I'm using crutches around the house", ctx: ["around the house"] },
    ],
  },
  {
    key: "m2",
    patient: "maya",
    source: "voice",
    when: { daysAgo: 5, time: "09:15" },
    status: "approved",
    voice: {
      patient: [
        "Morning. I did my physio session yesterday and the exercises took about forty minutes.",
        "My knee is a 4 out of 10 this morning.",
        "I slept around 6 hours and woke up twice.",
      ],
      agent: [
        "Good morning, Maya. How have you been getting on since your last check-in?",
        "Thanks for sharing that. How would you describe your knee right now?",
        "And how was your sleep last night?",
        "Thank you. I'll save this so you can review it before anything is shared.",
      ],
    },
    obs: [
      { c: "symptom", l: "Knee discomfort", site: "right knee", q: "My knee is a 4 out of 10 this morning", td: "this morning", sev: [4, "a 4 out of 10"], unc: ["Pain description (dull, sharp) not stated"] },
      { c: "sleep", l: "Sleep", q: "I slept around 6 hours and woke up twice", m: [6, "hours"], ctx: ["woke up twice"], noTime: true },
      { c: "activity", l: "Physiotherapy", q: "I did my physio session yesterday and the exercises took about forty minutes", td: "yesterday", noTime: true },
    ],
  },
  {
    key: "m3",
    patient: "maya",
    source: "vexo",
    when: { daysAgo: 4, time: "18:40" },
    status: "approved",
    body: "Knee feels about a 4 out of 10 after the stairs today. I slept about 5.5 hours last night and had to take the stairs on crutches, slowly. [name] stood behind me in case I slipped.",
    vexo: { externalId: "vexo-mem-maya-0412", title: "Evening knee note", suffix: " Reminder: physio again tomorrow at 10.", query: "knee" },
    privacyFilter: { totalSentences: 6, keptSentences: 3, redactions: { person_name: 1 } },
    obs: [
      { c: "symptom", l: "Knee discomfort", site: "right knee", q: "Knee feels about a 4 out of 10 after the stairs today", td: "today", sev: [4, "about a 4 out of 10"], ctx: ["after the stairs"] },
      { c: "sleep", l: "Sleep", q: "I slept about 5.5 hours last night", td: "last night", noTime: true, m: [5.5, "hours"] },
      { c: "mobility", l: "Crutch use", q: "had to take the stairs on crutches, slowly", ctx: ["stairs"] },
    ],
  },
  {
    key: "m4",
    patient: "maya",
    source: "manual",
    when: { daysAgo: 3, time: "12:10" },
    status: "approved",
    body: "Swelling around the knee looked a bit puffier after my walk today. I'm not sure how much is normal. I iced it for a while and did my leg raises.",
    obs: [
      { c: "symptom", l: "Knee swelling", site: "right knee", q: "Swelling around the knee looked a bit puffier after my walk today", td: "today", ctx: ["after a walk"], unc: ["No measurement of the swelling", "Whether it changed during the day not stated"] },
      { c: "activity", l: "Icing", q: "I iced it for a while", unc: ["Duration not stated"] },
      { c: "activity", l: "Home exercises", q: "did my leg raises" },
    ],
  },
  {
    key: "m5",
    patient: "maya",
    source: "voice",
    when: { daysAgo: 2, time: "21:50" },
    status: "approved",
    voice: {
      patient: [
        "Knee is at a 5 out of 10 tonight and it seems to ache more when I lie down.",
        "I only slept about 5 hours last night.",
        "Is it normal for it to ache more at night?",
      ],
      agent: [
        "Hi Maya. How is your knee feeling this evening?",
        "I see. How did you sleep last night?",
        "Is there anything you would like to ask your care team?",
        "Thank you. I'll save this so you can review it before anything is shared.",
      ],
    },
    obs: [
      { c: "symptom", l: "Knee discomfort", site: "right knee", q: "Knee is at a 5 out of 10 tonight", td: "tonight", sev: [5, "a 5 out of 10"], ctx: ["evening"] },
      { c: "symptom", l: "Aching when lying down", site: "right knee", q: "it seems to ache more when I lie down", ctx: ["lying down", "night"], unc: ["Onset and duration of night aching not stated"] },
      { c: "sleep", l: "Sleep", q: "I only slept about 5 hours last night", td: "last night", noTime: true, m: [5, "hours"] },
      { c: "question", l: "Question about night aching", q: "Is it normal for it to ache more at night?" },
    ],
  },
  {
    key: "m6",
    patient: "maya",
    source: "manual",
    when: { daysAgo: 1, time: "13:40" },
    status: "approved",
    body: "Physio today was tough, the therapist pushed my knee bend and it's a 6 out of 10 now. I'm back on both crutches for the stairs. Honestly I barely slept last night because of the aching.",
    obs: [
      { c: "symptom", l: "Knee discomfort", site: "right knee", q: "the therapist pushed my knee bend and it's a 6 out of 10 now", td: "now", sev: [6, "a 6 out of 10"], ctx: ["after physiotherapy"] },
      { c: "activity", l: "Physiotherapy", q: "Physio today was tough, the therapist pushed my knee bend", td: "today" },
      { c: "mobility", l: "Crutch use", q: "I'm back on both crutches for the stairs", ctx: ["stairs"] },
      { c: "sleep", l: "Sleep", q: "I barely slept last night because of the aching", td: "last night", noTime: true, unc: ["Hours of sleep not stated"] },
    ],
  },
  {
    key: "m7",
    patient: "maya",
    source: "manual",
    when: { daysAgo: 1, time: "20:30" },
    status: "approved",
    body: "Icing helps a little but the ache comes back once I lie down. Should I ice it before bed? I also did 3 sets of heel slides before dinner.",
    obs: [
      { c: "activity", l: "Icing", q: "Icing helps a little", unc: ["Duration and frequency of icing not stated"] },
      { c: "question", l: "Question about icing before bed", q: "Should I ice it before bed?" },
      { c: "activity", l: "Home exercises", q: "I also did 3 sets of heel slides before dinner", m: [3, "sets"], ctx: ["before dinner"] },
    ],
  },
  {
    key: "m8",
    patient: "maya",
    source: "voice",
    when: { minsAgo: 90 },
    status: "pending_review",
    voice: {
      patient: [
        "Another rough night. My knee is a 7 out of 10 right now.",
        "I got about 4.5 hours of sleep and the ache woke me up.",
        "I'm still on crutches and I wanted to mention it before my appointment.",
      ],
      agent: [
        "Hi Maya. How are you feeling today?",
        "Thanks. How did you sleep?",
        "Is there anything else you would like to add?",
        "Thank you. I'll save this so you can review it before anything is shared.",
      ],
    },
    obs: [
      { c: "symptom", l: "Knee discomfort", site: "right knee", q: "My knee is a 7 out of 10 right now", td: "right now", sev: [7, "a 7 out of 10"] },
      { c: "sleep", l: "Sleep", q: "I got about 4.5 hours of sleep", m: [4.5, "hours"], ctx: ["ache woke patient"], noTime: true },
      { c: "mobility", l: "Crutch use", q: "I'm still on crutches" },
    ],
  },

  // -------------------------------------------------------------- Daniel
  {
    key: "d1",
    patient: "daniel",
    source: "manual",
    when: { daysAgo: 6, time: "08:40" },
    status: "approved",
    body: "Walked for 10 minutes with my walker this morning around the block. Hip stiffness is about a 5 out of 10, worst when I first get up. Did my physio exercises and felt a little tired afterwards.",
    obs: [
      { c: "mobility", l: "Walking", q: "Walked for 10 minutes with my walker this morning", td: "this morning", m: [10, "minutes"], ctx: ["around the block"] },
      { c: "symptom", l: "Hip stiffness", site: "left hip", q: "Hip stiffness is about a 5 out of 10", sev: [5, "about a 5 out of 10"], ctx: ["first thing after getting up"] },
      { c: "mobility", l: "Mobility aid", q: "with my walker", ctx: ["walker"] },
    ],
  },
  {
    key: "d2",
    patient: "daniel",
    source: "voice",
    when: { daysAgo: 5, time: "17:30" },
    status: "approved",
    voice: {
      patient: [
        "Did my second walk today, 15 minutes with the walker.",
        "Hip stiffness is a 4 out of 10 this afternoon.",
        "Sleeping okay, I just take a while to get comfortable.",
      ],
      agent: [
        "Hello Daniel. How has your day been?",
        "Good to hear. How is the hip feeling?",
        "And how have you been sleeping?",
        "Thank you. I'll save this so you can review it before anything is shared.",
      ],
    },
    obs: [
      { c: "mobility", l: "Walking", q: "15 minutes with the walker", m: [15, "minutes"] },
      { c: "symptom", l: "Hip stiffness", site: "left hip", q: "Hip stiffness is a 4 out of 10 this afternoon", td: "this afternoon", sev: [4, "a 4 out of 10"] },
      { c: "mobility", l: "Mobility aid", q: "with the walker", ctx: ["walker"] },
      { c: "sleep", l: "Sleep", q: "Sleeping okay, I just take a while to get comfortable", unc: ["Hours of sleep not stated"] },
    ],
  },
  {
    key: "d3",
    patient: "daniel",
    source: "manual",
    when: { daysAgo: 4, time: "11:00" },
    status: "approved",
    body: "Managed 20 minutes of walking today and it felt steadier than last week. Stiffness is a 3 out of 10. I'm still using the walker, but only for longer walks.",
    obs: [
      { c: "mobility", l: "Walking", q: "Managed 20 minutes of walking today", td: "today", m: [20, "minutes"] },
      { c: "symptom", l: "Hip stiffness", site: "left hip", q: "Stiffness is a 3 out of 10", sev: [3, "a 3 out of 10"] },
      { c: "mobility", l: "Mobility aid", q: "I'm still using the walker, but only for longer walks", ctx: ["longer walks"] },
    ],
  },
  {
    key: "d4",
    patient: "daniel",
    source: "vexo",
    when: { daysAgo: 3, time: "19:15" },
    status: "approved",
    body: "Walked 25 minutes today, with the cane indoors and the walker outside. Hip stiffness is about a 3 out of 10 and a bit sore by evening.",
    vexo: { externalId: "vexo-mem-daniel-0388", title: "Evening walk note", suffix: " Reminder: stretch before bed.", query: "walk" },
    obs: [
      { c: "mobility", l: "Walking", q: "Walked 25 minutes today", td: "today", m: [25, "minutes"] },
      { c: "mobility", l: "Mobility aid", q: "the cane indoors and the walker outside", ctx: ["cane indoors", "walker outside"] },
      { c: "symptom", l: "Hip stiffness", site: "left hip", q: "Hip stiffness is about a 3 out of 10", sev: [3, "about a 3 out of 10"], ctx: ["evening"] },
    ],
  },
  {
    key: "d5",
    patient: "daniel",
    source: "manual",
    when: { daysAgo: 2, time: "10:20" },
    status: "approved",
    body: "Tried the stairs once today, going up slowly one step at a time with the rail. It felt okay but I was glad to sit down afterwards. Stiffness is still a 3 out of 10.",
    obs: [
      { c: "mobility", l: "Stairs", q: "Tried the stairs once today, going up slowly one step at a time with the rail", td: "today", ctx: ["using the rail"], unc: ["Going down the stairs not mentioned"] },
      { c: "symptom", l: "Hip stiffness", site: "left hip", q: "Stiffness is still a 3 out of 10", sev: [3, "a 3 out of 10"] },
    ],
  },
  {
    key: "d6",
    patient: "daniel",
    source: "voice",
    when: { daysAgo: 1, time: "09:00" },
    status: "approved",
    voice: {
      patient: [
        "I walked 30 minutes this morning with just the cane.",
        "Hip stiffness is down to a 2 out of 10.",
        "I'm feeling more confident on my feet.",
      ],
      agent: [
        "Good morning, Daniel. How was your walk today?",
        "Great. How is the stiffness in your hip?",
        "Anything else you would like to record?",
        "Thank you. I'll save this so you can review it before anything is shared.",
      ],
    },
    obs: [
      { c: "mobility", l: "Walking", q: "I walked 30 minutes this morning with just the cane", td: "this morning", m: [30, "minutes"] },
      { c: "symptom", l: "Hip stiffness", site: "left hip", q: "Hip stiffness is down to a 2 out of 10", sev: [2, "a 2 out of 10"] },
      { c: "mobility", l: "Mobility aid", q: "with just the cane", ctx: ["cane only"] },
      { c: "mood", l: "Confidence walking", q: "I'm feeling more confident on my feet" },
    ],
  },
  {
    key: "d7",
    patient: "daniel",
    source: "manual",
    when: { daysAgo: 1, time: "20:00" },
    status: "approved",
    body: "When can I drive again? My car has been sitting for five weeks and I miss being independent. I'm using the cane for most things now.",
    obs: [
      { c: "question", l: "Question about driving", q: "When can I drive again?" },
      { c: "mobility", l: "Mobility aid", q: "I'm using the cane for most things now", ctx: ["cane"] },
    ],
  },
  {
    key: "d8",
    patient: "daniel",
    source: "manual",
    when: { minsAgo: 100 },
    status: "approved",
    body: "Slept through the night for the first time since the surgery. Did my physio exercises and a short walk with the cane around the garden. Feeling positive about my appointment next week.",
    obs: [
      { c: "sleep", l: "Sleep", q: "Slept through the night for the first time since the surgery", noTime: true, unc: ["Hours of sleep not stated"] },
      { c: "activity", l: "Physiotherapy", q: "Did my physio exercises" },
      { c: "mobility", l: "Walking", q: "a short walk with the cane around the garden", ctx: ["cane", "garden"], unc: ["Duration not stated"] },
    ],
  },

  // --------------------------------------------------------------- Priya
  {
    key: "p1",
    patient: "priya",
    source: "manual",
    when: { daysAgo: 6, time: "10:00" },
    status: "approved",
    body: "Day 6 after the surgery and I'm exhausted, fatigue is about a 7 out of 10. I nap for around 2 hours in the afternoon and still feel drained. Appetite is low, mostly toast and soup.",
    obs: [
      { c: "symptom", l: "Fatigue", q: "fatigue is about a 7 out of 10", sev: [7, "about a 7 out of 10"] },
      { c: "sleep", l: "Naps", q: "I nap for around 2 hours in the afternoon", m: [2, "hours"], ctx: ["afternoon"] },
      { c: "other", l: "Appetite", q: "Appetite is low, mostly toast and soup", ctx: ["toast", "soup"] },
    ],
  },
  {
    key: "p2",
    patient: "priya",
    source: "voice",
    when: { daysAgo: 5, time: "15:45" },
    status: "approved",
    voice: {
      patient: [
        "Fatigue is still a 7 out of 10 today.",
        "I slept badly and napped for about 2 hours again.",
        "The small cuts are a bit tender when I move.",
      ],
      agent: [
        "Hi Priya. How are you feeling today?",
        "Thanks for telling me. How have your sleep and rest been?",
        "Anything about the incision sites you would like to note?",
        "Thank you. I'll save this so you can review it before anything is shared.",
      ],
    },
    obs: [
      { c: "symptom", l: "Fatigue", q: "Fatigue is still a 7 out of 10 today", td: "today", sev: [7, "a 7 out of 10"] },
      { c: "sleep", l: "Naps", q: "napped for about 2 hours again", m: [2, "hours"] },
      { c: "sleep", l: "Sleep", q: "I slept badly", unc: ["Hours of sleep not stated"], noTime: true },
      { c: "wound", l: "Incision site", site: "abdomen", q: "The small cuts are a bit tender when I move", ctx: ["when moving"], unc: ["Tenderness not rated"] },
    ],
  },
  {
    key: "p3",
    patient: "priya",
    source: "vexo",
    when: { daysAgo: 4, time: "19:30" },
    status: "approved",
    body: "My appetite is coming back a bit, I managed a proper dinner of rice and lentils. Still napping about 2 hours most afternoons. I keep thinking about when I can lift my daughter again, she's 3 and wants to be picked up all the time.",
    vexo: { externalId: "vexo-mem-priya-0291", title: "Evening journal note", suffix: " Saved from my evening journal.", query: "appetite" },
    obs: [
      { c: "other", l: "Appetite", q: "My appetite is coming back a bit, I managed a proper dinner of rice and lentils", ctx: ["dinner"] },
      { c: "sleep", l: "Naps", q: "Still napping about 2 hours most afternoons", m: [2, "hours"], ctx: ["afternoons"] },
      { c: "question", l: "Question about lifting", q: "I keep thinking about when I can lift my daughter again", ctx: ["daughter is 3"] },
    ],
  },
  {
    key: "p4",
    patient: "priya",
    source: "manual",
    when: { daysAgo: 3, time: "21:00" },
    status: "rejected",
    body: "I'm honestly scared I'm letting my family down. My mother-in-law is staying with us and we argued about the childcare, and I cried afterwards. I'd rather keep this one to myself.",
    note: "Kept private - family matter.",
    obs: [
      { c: "mood", l: "Worry about family", q: "I'm honestly scared I'm letting my family down" },
      { c: "other", l: "Family stress", q: "we argued about the childcare", ctx: ["mother-in-law staying"] },
    ],
  },
  {
    key: "p5",
    patient: "priya",
    source: "manual",
    when: { daysAgo: 2, time: "11:15" },
    status: "approved",
    body: "Fatigue is a 6 out of 10 today, a little better than earlier in the week. I napped for about 2 hours. The incision itches a bit at the edges but I can't put a number on it.",
    obs: [
      { c: "symptom", l: "Fatigue", q: "Fatigue is a 6 out of 10 today", td: "today", sev: [6, "a 6 out of 10"] },
      { c: "sleep", l: "Naps", q: "I napped for about 2 hours", m: [2, "hours"] },
      { c: "wound", l: "Incision site", site: "abdomen", q: "The incision itches a bit at the edges", ctx: ["edges of the incision"], unc: ["Itch not rated", "Appearance of the incision not described"] },
    ],
  },
  {
    key: "p6",
    patient: "priya",
    source: "voice",
    when: { daysAgo: 1, time: "13:40" },
    status: "approved",
    voice: {
      patient: [
        "My appetite is mostly back, I had eggs and fruit for breakfast.",
        "The incision itch is mild, mostly in the evenings.",
        "I'm worried about going back to my desk job, with all the sitting and the commute.",
      ],
      agent: [
        "Hello Priya. How has your appetite been?",
        "Good to hear. How are the incision sites?",
        "Is there anything on your mind about the coming weeks?",
        "Thank you. I'll save this so you can review it before anything is shared.",
      ],
    },
    obs: [
      { c: "other", l: "Appetite", q: "My appetite is mostly back, I had eggs and fruit for breakfast", ctx: ["breakfast"] },
      { c: "wound", l: "Incision site", site: "abdomen", q: "The incision itch is mild, mostly in the evenings", ctx: ["evenings"], unc: ["Itch not rated"] },
      { c: "mood", l: "Concern about returning to work", q: "I'm worried about going back to my desk job", ctx: ["sitting", "commute"] },
    ],
  },
  {
    key: "p7",
    patient: "priya",
    source: "manual",
    when: { daysAgo: 1, time: "20:00" },
    status: "approved",
    body: "Fatigue is still about a 6 out of 10. Two questions for the doctor. When is it okay to go back to my desk job? I'm due to start in a week and a half. And when can I lift my daughter again? She's 3 and I've been sitting on the floor to cuddle her.",
    obs: [
      { c: "symptom", l: "Fatigue", q: "Fatigue is still about a 6 out of 10", sev: [6, "about a 6 out of 10"] },
      { c: "question", l: "Question about returning to work", q: "When is it okay to go back to my desk job?", ctx: ["planned start in about a week and a half"] },
      { c: "question", l: "Question about lifting", q: "when can I lift my daughter again?", ctx: ["daughter is 3"] },
    ],
  },
  {
    key: "p8",
    patient: "priya",
    source: "manual",
    when: { minsAgo: 110 },
    status: "pending_review",
    body: "Slept a bit better last night but napped for about 2 hours again. The itch around the incision is mild today. I started a short 10 minute walk each morning.",
    obs: [
      { c: "sleep", l: "Sleep", q: "Slept a bit better last night", td: "last night", noTime: true, unc: ["Hours of sleep not stated"] },
      { c: "sleep", l: "Naps", q: "napped for about 2 hours again", m: [2, "hours"] },
      { c: "wound", l: "Incision site", site: "abdomen", q: "The itch around the incision is mild today", td: "today", unc: ["Itch not rated"] },
      { c: "mobility", l: "Walking", q: "I started a short 10 minute walk each morning", m: [10, "minutes"], ctx: ["each morning"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Summaries. Items are [text, entry keys it cites].
// ---------------------------------------------------------------------------

export type ItemDef = [text: string, keys: string[]];

export interface SummaryDef {
  patient: PatientKey;
  audience: "patient" | "clinician";
  overview: string;
  mainConcerns: ItemDef[];
  changesSinceEarlier: ItemDef[];
  recoveryActivities: ItemDef[];
  patientQuestions: ItemDef[];
  dataGaps: string[];
}

export const SUMMARY_DEFS: SummaryDef[] = [
  // ---- Maya
  {
    patient: "maya",
    audience: "patient",
    overview:
      "You reported knee discomfort rising from 3/10 to 7/10 over the past six days, and sleep of about 7 hours at first and about 4.5 hours most recently. You also described physiotherapy, crutch use and icing.",
    mainConcerns: [
      ["You rated your knee discomfort 3/10, 4/10, 4/10, 5/10, 6/10 and 7/10 across your updates.", ["m1", "m2", "m3", "m5", "m6", "m8"]],
      ["You mentioned swelling around the knee that looked \"a bit puffier\" after a walk.", ["m4"]],
      ["You said the ache seems stronger when you lie down at night.", ["m5", "m7"]],
    ],
    changesSinceEarlier: [
      ["Your reported sleep went from about 7 hours to about 4.5 hours.", ["m1", "m8"]],
      ["Your reported knee discomfort went from 3/10 to 7/10.", ["m1", "m8"]],
    ],
    recoveryActivities: [
      ["You reported physiotherapy sessions, leg raises and heel slides.", ["m2", "m4", "m6", "m7"]],
      ["You reported using crutches, including on the stairs.", ["m1", "m3", "m6", "m8"]],
      ["You reported icing your knee.", ["m4", "m7"]],
    ],
    patientQuestions: [
      ["You asked whether it is normal for the knee to ache more at night.", ["m5"]],
      ["You asked whether you should ice the knee before bed.", ["m7"]],
    ],
    dataGaps: [
      "You did not give hours of sleep in the update where you said you barely slept.",
      "Swelling was mentioned once without a measurement.",
      "When the night-time aching starts and how long it lasts was not described.",
    ],
  },
  {
    patient: "maya",
    audience: "clinician",
    overview:
      "Patient reported right knee discomfort of 3/10 rising to 6/10 across shared updates over six days, and sleep of about 7 hours falling to about 5 hours. Physiotherapy, crutch use and icing were also described.",
    mainConcerns: [
      ["Patient reported knee discomfort of 3/10, 4/10, 4/10, 5/10 and 6/10 across shared updates.", ["m1", "m2", "m3", "m5", "m6"]],
      ["Patient reported swelling around the knee that looked \"a bit puffier\" after a walk, without a measurement.", ["m4"]],
      ["Patient described the ache as returning or increasing when lying down at night.", ["m5", "m7"]],
    ],
    changesSinceEarlier: [
      ["Reported knee discomfort went from 3/10 in the first shared update to 6/10 in the most recent rated update.", ["m1", "m6"]],
      ["Reported sleep went from about 7 hours to about 5 hours; a later update says patient \"barely slept\" without a number.", ["m1", "m5", "m6"]],
    ],
    recoveryActivities: [
      ["Patient reported a physiotherapy session of about forty minutes and a later session where the therapist pushed the knee bend.", ["m2", "m6"]],
      ["Patient reported using crutches at home and on the stairs.", ["m1", "m3", "m6"]],
      ["Patient reported icing the knee, leg raises and 3 sets of heel slides.", ["m4", "m7"]],
    ],
    patientQuestions: [
      ["Patient asked: \"Is it normal for it to ache more at night?\"", ["m5"]],
      ["Patient asked: \"Should I ice it before bed?\"", ["m7"]],
    ],
    dataGaps: [
      "Hours of sleep not stated in the most recent shared update.",
      "Swelling not measured; timing and duration not described.",
      "Onset and duration of the night-time aching not described.",
      "Use of pain medication not mentioned in any shared update.",
    ],
  },
  // ---- Daniel
  {
    patient: "daniel",
    audience: "patient",
    overview:
      "You reported walking time going from 10 to 30 minutes and hip stiffness going from 5/10 to 2/10 over the past six days. You also described moving from your walker to your cane, trying the stairs once and sleeping through the night.",
    mainConcerns: [
      ["You rated your hip stiffness 5/10, 4/10, 3/10, 3/10, 3/10 and 2/10 across your updates.", ["d1", "d2", "d3", "d4", "d5", "d6"]],
    ],
    changesSinceEarlier: [
      ["Your reported walking time went from 10 minutes to 30 minutes.", ["d1", "d6"]],
      ["Your reported hip stiffness went from 5/10 to 2/10.", ["d1", "d6"]],
      ["You described moving from a walker to a cane.", ["d1", "d6", "d7"]],
    ],
    recoveryActivities: [
      ["You reported daily walks and your physiotherapy exercises.", ["d1", "d3", "d8"]],
      ["You reported trying the stairs once, using the rail.", ["d5"]],
      ["You reported sleeping through the night for the first time since the surgery.", ["d8"]],
    ],
    patientQuestions: [["You asked when you can drive again.", ["d7"]]],
    dataGaps: [
      "Hours of sleep were not stated in any update.",
      "The length of your most recent walk was not stated.",
      "Going down the stairs was not mentioned.",
    ],
  },
  {
    patient: "daniel",
    audience: "clinician",
    overview:
      "Patient reported walking time of 10 minutes rising to 30 minutes and hip stiffness of 5/10 falling to 2/10 across shared updates over six days. Mobility aid use was described as a walker at first and a cane in later updates.",
    mainConcerns: [
      ["Patient reported hip stiffness of 5/10, 4/10, 3/10, 3/10, 3/10 and 2/10 across shared updates.", ["d1", "d2", "d3", "d4", "d5", "d6"]],
    ],
    changesSinceEarlier: [
      ["Reported walking time went from 10 minutes to 30 minutes.", ["d1", "d6"]],
      ["Reported hip stiffness went from 5/10 to 2/10.", ["d1", "d6"]],
      ["Patient described using a walker in the first updates and a cane only in later updates.", ["d1", "d6", "d7"]],
    ],
    recoveryActivities: [
      ["Patient reported daily walks and physiotherapy exercises.", ["d1", "d3", "d8"]],
      ["Patient reported trying the stairs once, going up one step at a time with the rail.", ["d5"]],
      ["Patient reported sleeping through the night for the first time since the surgery.", ["d8"]],
    ],
    patientQuestions: [["Patient asked: \"When can I drive again?\"", ["d7"]]],
    dataGaps: [
      "Hours of sleep not stated in any shared update.",
      "Duration of the most recent walk not stated.",
      "Going down the stairs not mentioned.",
    ],
  },
  // ---- Priya
  {
    patient: "priya",
    audience: "patient",
    overview:
      "You reported fatigue of 7/10 early in the week and 6/10 more recently, with naps of about 2 hours. You described your appetite returning and a mild itch at the incision, and you asked about your desk job and lifting your daughter.",
    mainConcerns: [
      ["You rated your fatigue 7/10, 7/10, 6/10 and 6/10 across your updates.", ["p1", "p2", "p5", "p7"]],
      ["You described the incision as tender at first and later as mildly itchy.", ["p2", "p5", "p6", "p8"]],
      ["You mentioned being worried about going back to your desk job.", ["p6", "p7"]],
    ],
    changesSinceEarlier: [
      ["Your reported fatigue went from 7/10 to 6/10.", ["p1", "p7"]],
      ["You described your appetite as low at first and mostly back later.", ["p1", "p3", "p6"]],
    ],
    recoveryActivities: [
      ["You reported afternoon naps of about 2 hours.", ["p1", "p2", "p3", "p5", "p8"]],
      ["You reported starting a short 10 minute walk each morning.", ["p8"]],
    ],
    patientQuestions: [
      ["You asked when it is okay to go back to your desk job.", ["p7"]],
      ["You asked when you can lift your daughter again.", ["p3", "p7"]],
    ],
    dataGaps: [
      "The incision itch was not rated.",
      "Hours of night-time sleep were not stated.",
      "What your desk job and daily childcare involve was not described.",
    ],
  },
  {
    patient: "priya",
    audience: "clinician",
    overview:
      "Patient reported fatigue of 7/10 and later 6/10 across shared updates, with naps of about 2 hours. Appetite was described as low at first and later mostly back. Patient asked about returning to a desk job and lifting a 3-year-old.",
    mainConcerns: [
      ["Patient reported fatigue of 7/10, 7/10, 6/10 and 6/10 across shared updates.", ["p1", "p2", "p5", "p7"]],
      ["Patient described the incision sites as tender when moving and later as mildly itchy, without a rating.", ["p2", "p5", "p6"]],
      ["Patient said she is worried about going back to her desk job.", ["p6", "p7"]],
    ],
    changesSinceEarlier: [
      ["Reported fatigue went from 7/10 to 6/10.", ["p1", "p7"]],
      ["Patient described appetite as low at first and mostly back in a later update.", ["p1", "p3", "p6"]],
    ],
    recoveryActivities: [["Patient reported afternoon naps of about 2 hours.", ["p1", "p2", "p3", "p5"]]],
    patientQuestions: [
      ["Patient asked: \"When is it okay to go back to my desk job?\"", ["p7"]],
      ["Patient asked: \"when can I lift my daughter again?\"", ["p3", "p7"]],
    ],
    dataGaps: [
      "Itch at the incision not rated; appearance not described.",
      "Hours of night-time sleep not stated.",
      "Demands of the desk job and of daily childcare not described.",
    ],
  },
];
