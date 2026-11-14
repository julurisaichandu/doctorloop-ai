"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { toActionResult, validationError } from "@/lib/errors";
import {
  activateSimulatedBilling,
  cancelSimulatedBilling,
  invoiceNow,
  openBillingPortal,
  startBillingSetup,
} from "@/lib/services/billing-account";
import { getPatientUsageStatementCsv } from "@/lib/services/billing-views";
import { retryUsageSync } from "@/lib/services/billing-usage";

const statementInputSchema = z.object({
  patientId: z.uuid(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

export async function startBillingSetupAction() {
  return toActionResult(async () => {
    const actor = await requireActor("doctor");
    const { redirectTo } = await startBillingSetup(actor);
    revalidatePath("/doctor/billing");
    return { redirectTo };
  });
}

export async function activateSimulatedBillingAction() {
  return toActionResult(async () => {
    const actor = await requireActor("doctor");
    await activateSimulatedBilling(actor);
    revalidatePath("/doctor/billing");
    return { redirectTo: "/doctor/billing?setup=success" };
  });
}

export async function cancelSimulatedBillingAction() {
  return toActionResult(async () => {
    const actor = await requireActor("doctor");
    await cancelSimulatedBilling(actor);
    revalidatePath("/doctor/billing");
  });
}

export async function openBillingPortalAction() {
  return toActionResult(async () => {
    const actor = await requireActor("doctor");
    const { redirectTo } = await openBillingPortal(actor);
    revalidatePath("/doctor/billing");
    return { redirectTo };
  });
}

export async function invoiceNowAction() {
  return toActionResult(async () => {
    const actor = await requireActor("doctor");
    const { invoiceNumber } = await invoiceNow(actor);
    revalidatePath("/doctor/billing");
    return { invoiceNumber };
  });
}

export async function retryUsageSyncAction() {
  return toActionResult(async () => {
    const actor = await requireActor("doctor");
    const result = await retryUsageSync(actor);
    revalidatePath("/doctor/billing");
    return { retried: result.retried, failed: result.failed };
  });
}

export async function downloadStatementCsvAction(input: { patientId: string; from?: string; to?: string }) {
  return toActionResult(async () => {
    const parsed = statementInputSchema.safeParse(input);
    if (!parsed.success) throw validationError("Invalid statement request.");
    const actor = await requireActor("doctor");
    const { patientId, from, to } = parsed.data;
    const { filename, csv } = await getPatientUsageStatementCsv(actor, patientId, { from, to });
    return { filename, csv };
  });
}
