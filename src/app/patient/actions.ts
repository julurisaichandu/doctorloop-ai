"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import type { ActionResult, GeneratedSummary, Observation, TimelineEntryView } from "@/lib/domain/types";
import { OBSERVATION_CATEGORIES } from "@/lib/domain/types";
import { toActionResult, validationError } from "@/lib/errors";
import type { ObservationPatch } from "@/lib/data/repository";
import { reprocessEntry } from "@/lib/services/ingest";
import {
  approveEntry,
  createManualEntry,
  regenerateWeeklySummary,
  rejectEntry,
  revokeEntry,
  setObservationRemoved,
  updateEntryText,
  updateObservation,
} from "@/lib/services/patient";

const id = z.string().uuid();
const body = z.string().trim().min(1, "Write something first.").max(20000, "Updates can be at most 20000 characters.");
const occurredAt = z.iso.datetime({ offset: true }).optional();
const note = z.string().trim().max(500).optional();
const contextItems = z.array(z.string().trim().min(1).max(160)).max(8);
const uncertaintyItems = z.array(z.string().trim().min(1).max(200)).max(8);

const observationPatch = z.object({
  category: z.enum(OBSERVATION_CATEGORIES).optional(),
  label: z.string().trim().min(1, "Give the observation a label.").max(80).optional(),
  bodySite: z.string().trim().max(80).nullable().optional(),
  timeDescription: z.string().trim().max(120).nullable().optional(),
  severity: z.number().int().min(0).max(10).nullable().optional(),
  severityText: z.string().trim().max(120).nullable().optional(),
  measureValue: z.number().finite().nullable().optional(),
  measureUnit: z.string().trim().max(40).nullable().optional(),
  context: contextItems.optional(),
  uncertainties: uncertaintyItems.optional(),
});

const PATHS = ["/patient", "/patient/timeline", "/patient/review", "/patient/summary"] as const;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(result.error.issues[0]?.message ?? "Please check your input.");
  return result.data;
}

/** Validates input, authorizes as the signed-in patient, runs the service and refreshes patient pages. */
async function mutate<T>(run: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<T>): Promise<ActionResult<T>> {
  const actor = await requireActor("patient");
  const result = await toActionResult(() => run(actor));
  if (result.ok) for (const path of PATHS) revalidatePath(path);
  return result;
}

export async function createManualEntryAction(input: {
  body: string;
  occurredAt?: string;
}): Promise<ActionResult<TimelineEntryView>> {
  return mutate((actor) => {
    const data = parse(z.object({ body, occurredAt }), input);
    return createManualEntry(actor, data);
  });
}

export async function updateEntryTextAction(input: {
  entryId: string;
  body: string;
}): Promise<ActionResult<TimelineEntryView>> {
  return mutate((actor) => {
    const data = parse(z.object({ entryId: id, body }), input);
    return updateEntryText(actor, data.entryId, { body: data.body });
  });
}

export async function updateObservationAction(input: {
  observationId: string;
  patch: ObservationPatch;
}): Promise<ActionResult<Observation>> {
  return mutate((actor) => {
    const data = parse(z.object({ observationId: id, patch: observationPatch }), input);
    return updateObservation(actor, data.observationId, data.patch);
  });
}

export async function setObservationRemovedAction(input: {
  observationId: string;
  removed: boolean;
}): Promise<ActionResult<Observation>> {
  return mutate((actor) => {
    const data = parse(z.object({ observationId: id, removed: z.boolean() }), input);
    return setObservationRemoved(actor, data.observationId, data.removed);
  });
}

export async function approveEntryAction(input: {
  entryId: string;
  note?: string;
}): Promise<ActionResult<TimelineEntryView>> {
  return mutate((actor) => {
    const data = parse(z.object({ entryId: id, note }), input);
    return approveEntry(actor, data.entryId, data.note);
  });
}

export async function rejectEntryAction(input: {
  entryId: string;
  note?: string;
}): Promise<ActionResult<TimelineEntryView>> {
  return mutate((actor) => {
    const data = parse(z.object({ entryId: id, note }), input);
    return rejectEntry(actor, data.entryId, data.note);
  });
}

export async function revokeEntryAction(input: { entryId: string }): Promise<ActionResult<TimelineEntryView>> {
  return mutate((actor) => {
    const data = parse(z.object({ entryId: id }), input);
    return revokeEntry(actor, data.entryId);
  });
}

export async function reprocessEntryAction(input: { entryId: string }): Promise<ActionResult<TimelineEntryView>> {
  return mutate((actor) => {
    const data = parse(z.object({ entryId: id }), input);
    return reprocessEntry(actor, data.entryId);
  });
}

export async function regenerateWeeklySummaryAction(): Promise<ActionResult<GeneratedSummary>> {
  return mutate((actor) => regenerateWeeklySummary(actor));
}
