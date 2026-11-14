/** Scripted assistant for the simulated check-in. Neutral questions only: no advice, no interpretation. */

import { NOT_FOR_EMERGENCIES_SENTENCE } from "@/lib/integrations/elevenlabs/agent-config";

export const SIMULATED_ASSISTANT_STEPS: readonly string[] = [
  "How are you feeling today?",
  "Thanks for sharing. When did that start, and what were you doing when you noticed it?",
  "Is there anything that makes it better or worse?",
  "Is there anything you would like to ask your care team?",
];

export function simulatedGreeting(firstName: string): string {
  return `Hi ${firstName}, thanks for checking in. This is a scripted, simulated assistant. ${NOT_FOR_EMERGENCIES_SENTENCE} ${SIMULATED_ASSISTANT_STEPS[0]}`;
}

export const SIMULATED_WRAP_UP =
  "Thank you. I will save what you told me, in your own words, so you can review it. Nothing is shared with your care team until you approve it. Choose Finish & save when you are ready.";
