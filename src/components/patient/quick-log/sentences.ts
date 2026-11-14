/** Plain first-person sentences generated from the quick-log controls. The patient edits them freely. */

export const BODY_SITES = [
  "right knee",
  "left knee",
  "right ankle",
  "left ankle",
  "hip",
  "lower back",
  "shoulder",
  "incision area",
] as const;

export const MOODS = ["hopeful", "calm", "okay", "tired", "frustrated", "anxious", "low"] as const;
export type Mood = (typeof MOODS)[number];

export interface QuickLogValues {
  discomfort: number | null;
  site: string | null;
  sleepHours: number | null;
  activityMinutes: number | null;
  mood: Mood | null;
}

export const EMPTY_QUICK_LOG: QuickLogValues = {
  discomfort: null,
  site: null,
  sleepHours: null,
  activityMinutes: null,
  mood: null,
};

export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function buildSentences(v: QuickLogValues): string[] {
  const out: string[] = [];
  if (v.discomfort !== null) {
    const subject = v.site ? `My ${v.site} discomfort` : "My discomfort";
    out.push(`${subject} is about ${v.discomfort} out of 10 right now.`);
  }
  if (v.sleepHours !== null) {
    out.push(
      v.sleepHours === 0
        ? "I did not get much sleep last night."
        : `I slept about ${formatHours(v.sleepHours)} ${v.sleepHours === 1 ? "hour" : "hours"} last night.`,
    );
  }
  if (v.activityMinutes !== null) {
    out.push(
      v.activityMinutes === 0
        ? "I did not get any walking in today."
        : `I walked for ${v.activityMinutes} minutes today.`,
    );
  }
  if (v.mood !== null) out.push(`I'm feeling ${v.mood} today.`);
  return out;
}

export function hasQuickLogValues(v: QuickLogValues): boolean {
  return buildSentences(v).length > 0;
}
