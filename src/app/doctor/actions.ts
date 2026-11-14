"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { toActionResult, validationError } from "@/lib/errors";
import {
  markAllReviewed,
  markEntryReviewed,
  regenerateClinicianSummary,
} from "@/lib/services/doctor";

const idSchema = z.uuid();

function parseId(input: unknown): string {
  const result = idSchema.safeParse(input);
  if (!result.success) throw validationError("Invalid identifier.");
  return result.data;
}

function revalidateDoctorViews(patientId: string) {
  revalidatePath("/doctor");
  revalidatePath(`/doctor/patients/${patientId}`);
}

export async function markEntryReviewedAction(entryId: string) {
  return toActionResult(async () => {
    const id = parseId(entryId);
    const actor = await requireActor("doctor");
    const review = await markEntryReviewed(actor, id);
    revalidateDoctorViews(review.patientId);
    return { reviewedAt: review.reviewedAt };
  });
}

export async function markAllReviewedAction(patientId: string) {
  return toActionResult(async () => {
    const id = parseId(patientId);
    const actor = await requireActor("doctor");
    const count = await markAllReviewed(actor, id);
    revalidateDoctorViews(id);
    return { count };
  });
}

export async function regenerateClinicianSummaryAction(patientId: string) {
  return toActionResult(async () => {
    const id = parseId(patientId);
    const actor = await requireActor("doctor");
    const summary = await regenerateClinicianSummary(actor, id);
    revalidateDoctorViews(id);
    return { generatedAt: summary.createdAt };
  });
}
