import { DEMO_ACCOUNTS } from "@/lib/demo/seed";
import type { Actor } from "@/lib/domain/types";

/** Builds the Actor a session would resolve to for a demo account (matched by email). */
export function actorByEmail(email: string): Actor {
  const account = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!account) throw new Error(`Unknown demo account ${email}`);
  return {
    userId: account.userId,
    role: account.role,
    fullName: account.fullName,
    email: account.email,
    title: null,
    patientId: account.patientId,
  };
}

export const maya = () => actorByEmail("maya.thompson@example.com");
export const daniel = () => actorByEmail("daniel.okafor@example.com");
export const priya = () => actorByEmail("priya.raman@example.com");
export const drPark = () => actorByEmail("dr.elena.park@example.com");
export const drBell = () => actorByEmail("dr.marcus.bell@example.com");

export const KNEE_NOTE =
  "Tonight my right knee aches about 7 out of 10 after physio and I only slept about 4 hours last night. I want to ask Dr. Park if I should ice it before bed.";

export const patientIdOf = (actor: Actor): string => {
  if (!actor.patientId) throw new Error("not a patient");
  return actor.patientId;
};
