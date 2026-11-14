/**
 * MOCK Vexo memories. Entirely fictional sample data for the demo; nothing here came from
 * a real wearable or from the Vexo service. Unrelated private memories are included on
 * purpose to demonstrate that they are filtered out and never offered for import.
 */

export interface MockMemorySeed {
  id: string;
  title: string;
  excerpt: string;
  /** Whole days before "now" and local hour of day when the memory started. */
  daysAgo: number;
  hour: number;
  durationMinutes: number;
  kind: "memory" | "transcript";
}

const maya: MockMemorySeed[] = [
  { id: "mock-maya-01", title: "After physio session", daysAgo: 1, hour: 15, durationMinutes: 4, kind: "memory",
    excerpt: "My knee has been aching since physio this afternoon, mostly on the inside. It's about a 6 out of 10 when I bend it." },
  { id: "mock-maya-02", title: "Rough night", daysAgo: 2, hour: 2, durationMinutes: 2, kind: "memory",
    excerpt: "I slept maybe four hours last night. The aching woke me up twice and I couldn't get comfortable." },
  { id: "mock-maya-03", title: "Stairs at home", daysAgo: 3, hour: 19, durationMinutes: 3, kind: "memory",
    excerpt: "Still using my crutches on the stairs. Going down is the slow part, my knee feels unsteady." },
  { id: "mock-maya-04", title: "Question for the care team", daysAgo: 4, hour: 20, durationMinutes: 2, kind: "memory",
    excerpt: "I keep wondering whether I should be icing my knee at night when it aches. I want to ask at my next appointment." },
  { id: "mock-maya-05", title: "Exercises this morning", daysAgo: 5, hour: 9, durationMinutes: 6, kind: "transcript",
    excerpt: "Did my physio exercises this morning, the straight leg raises and heel slides. Some stiffness afterwards but it eased off." },
  { id: "mock-maya-06", title: "Planning a birthday dinner", daysAgo: 2, hour: 19, durationMinutes: 8, kind: "memory",
    excerpt: "We're thinking of booking the Italian place on Friday for Sam's birthday dinner. Eight people, maybe a cake from the bakery." },
  { id: "mock-maya-07", title: "Budget call", daysAgo: 3, hour: 11, durationMinutes: 25, kind: "transcript",
    excerpt: "Quarterly budget call with Jordan. We agreed to move the design contractor spend into next quarter and review the numbers on Monday." },
  { id: "mock-maya-08", title: "Show chat", daysAgo: 6, hour: 21, durationMinutes: 10, kind: "memory",
    excerpt: "Talking about the new detective series everyone is watching. The finale twist was good but the middle episodes dragged." },
];

const daniel: MockMemorySeed[] = [
  { id: "mock-daniel-01", title: "Morning walk", daysAgo: 1, hour: 8, durationMinutes: 3, kind: "memory",
    excerpt: "Walked for about thirty minutes around the block this morning. Felt steadier than last week." },
  { id: "mock-daniel-02", title: "Switched to the cane", daysAgo: 2, hour: 10, durationMinutes: 3, kind: "memory",
    excerpt: "I've switched from the walker to the cane for short trips. It feels good to move without the frame." },
  { id: "mock-daniel-03", title: "Hip stiffness", daysAgo: 3, hour: 8, durationMinutes: 2, kind: "memory",
    excerpt: "The hip stiffness is easing. Mornings are about a 2 out of 10 now, it used to be a 5." },
  { id: "mock-daniel-04", title: "Driving question", daysAgo: 4, hour: 15, durationMinutes: 3, kind: "memory",
    excerpt: "I'd like to start driving again but I'm not sure when that's okay. I should ask the surgeon at the check-up." },
  { id: "mock-daniel-05", title: "Rehab exercises", daysAgo: 5, hour: 15, durationMinutes: 7, kind: "transcript",
    excerpt: "Finished the rehab exercises from the physiotherapist. A little soreness in the thigh afterwards, nothing sharp." },
  { id: "mock-daniel-06", title: "Garden centre plans", daysAgo: 2, hour: 13, durationMinutes: 12, kind: "memory",
    excerpt: "Chatting about which tomato varieties to plant and whether the shed needs a fresh coat of paint before summer." },
  { id: "mock-daniel-07", title: "Football chat", daysAgo: 4, hour: 21, durationMinutes: 15, kind: "memory",
    excerpt: "Arguing with Chidi about last night's match and whether the new striker is worth the transfer fee." },
];

const priya: MockMemorySeed[] = [
  { id: "mock-priya-01", title: "Tired again", daysAgo: 1, hour: 14, durationMinutes: 2, kind: "memory",
    excerpt: "I'm so tired today, I had to nap for two hours this afternoon and still feel drained." },
  { id: "mock-priya-02", title: "Worried about work", daysAgo: 2, hour: 20, durationMinutes: 4, kind: "memory",
    excerpt: "I'm worried about going back to work. Sitting at my desk all day sounds like a lot right now." },
  { id: "mock-priya-03", title: "Lifting the toddler", daysAgo: 3, hour: 15, durationMinutes: 3, kind: "memory",
    excerpt: "I can't lift my toddler yet and it's hard. I'm worried about when I'll be able to pick her up again." },
  { id: "mock-priya-04", title: "Short walk", daysAgo: 5, hour: 9, durationMinutes: 3, kind: "memory",
    excerpt: "Went for a slow walk to the corner and back. Some soreness near the incisions but I felt okay overall." },
  { id: "mock-priya-05", title: "Recipe swap", daysAgo: 2, hour: 12, durationMinutes: 9, kind: "memory",
    excerpt: "Swapping recipes with Anika, the lentil soup with the coconut milk was a hit, and she wants the cake recipe too." },
  { id: "mock-priya-06", title: "Reality TV chat", daysAgo: 4, hour: 22, durationMinutes: 11, kind: "memory",
    excerpt: "Discussing the baking competition episode, who should have gone home and the ridiculous cake designs." },
];

/** Keyed by the demo patient's (fictional) e-mail address. */
export const MOCK_MEMORY_SEEDS: Readonly<Record<string, MockMemorySeed[]>> = {
  "maya.thompson@example.com": maya,
  "daniel.okafor@example.com": daniel,
  "priya.raman@example.com": priya,
};
