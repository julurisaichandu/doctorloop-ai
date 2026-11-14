import "server-only";

import { createHash } from "node:crypto";
import { listDemoAccounts } from "@/lib/auth/demo";
import { getBandIngestConfig } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import type { PatientProfile, UsageTrigger } from "@/lib/domain/types";
import { isAppError } from "@/lib/errors";
import {
  bandExternalId,
  bandRecordingSchema,
  bandSourceRefId,
  verifyBandSignature,
} from "@/lib/integrations/vexo/band-bridge";
import { classifyHealthRelevance } from "@/lib/integrations/vexo/relevance";
import { applyPrivacyFilter, assertStorableBody, ingestFilteredEntryForPatient } from "@/lib/services/ingest";

/*
 * Signed push from the local Pipecat band bridge. There is no session here: after the explicit
 * authorization (HMAC + the configured band -> wearer mapping) every read and write goes through
 * the system repository (ARCHITECTURE 5.1). Never import getRepository / actor-scoped helpers here.
 */

const DAY_MS = 86_400_000;
const MAX_AGE_DAYS = 31;
const SYSTEM_TRIGGER: UsageTrigger = { kind: "system", userId: null };

export type BandIngestBody =
  | { stored: true; entryId: string }
  | { stored: false; reason: "duplicate" | "not_health_related" | "nothing_kept" }
  | { error: string };

export interface BandIngestResult {
  status: number;
  body: BandIngestBody;
}

const fail = (status: number, error: string): BandIngestResult => ({ status, body: { error } });
const notStored = (reason: "duplicate" | "not_health_related" | "nothing_kept"): BandIngestResult => ({
  status: 200,
  body: { stored: false, reason },
});

/** The configured wearer's patient profile, confirmed against the stored profile (e-mail + role). */
async function resolveWearer(email: string): Promise<PatientProfile | null> {
  const wanted = email.toLowerCase();
  // ponytail: wearer lookup is limited to the demo accounts; add a repository lookup by e-mail when real sign-up exists.
  const account = listDemoAccounts().find((a) => a.email.toLowerCase() === wanted);
  if (!account) return null;
  const system = getSystemRepository();
  const profile = await system.getProfile(account.userId);
  if (!profile || profile.role !== "patient" || profile.email.toLowerCase() !== wanted) return null;
  return system.getPatientByUserId(account.userId);
}

/** Whether an entry of this patient already links the source reference. */
async function isLinked(patientId: string, sourceRefId: string): Promise<boolean> {
  const entries = await getSystemRepository().listEntries(patientId, { source: ["vexo"] });
  return entries.some((e) => e.sourceRefId === sourceRefId);
}

export async function handleBandRecording(
  rawBody: string,
  signatureHeader: string | null,
  now: Date = new Date(),
): Promise<BandIngestResult> {
  const config = getBandIngestConfig();
  if (!config) return fail(503, "Band ingest is not configured.");
  if (!verifyBandSignature(signatureHeader, rawBody, config.secret, now)) {
    return fail(401, "Invalid or expired signature.");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return fail(400, "Body is not valid JSON.");
  }
  const parsed = bandRecordingSchema.safeParse(json);
  if (!parsed.success) return fail(400, "Invalid band recording payload.");
  const rec = parsed.data;
  if (rec.bandNumber !== config.bandNumber) return fail(400, "Unknown band number.");

  const startedMs = Date.parse(rec.startedAt);
  if (startedMs > now.getTime() + DAY_MS || startedMs < now.getTime() - MAX_AGE_DAYS * DAY_MS) {
    return fail(400, "Recording time is out of range.");
  }

  try {
    const patient = await resolveWearer(config.wearerEmail);
    if (!patient) return fail(503, "Band wearer not found.");

    // Idempotency comes before filtering: the privacy filter is billed.
    const system = getSystemRepository();
    const externalId = bandExternalId(rec.bandNumber, rec.recordingId);
    const sourceRefId = bandSourceRefId(externalId);
    const [existing] = await system.listSourceRefs([sourceRefId]);
    // A ref of another patient (the wearer mapping changed) is never re-linked.
    if (existing && (existing.patientId !== patient.id || (await isLinked(patient.id, sourceRefId)))) {
      return notStored("duplicate");
    }
    // existing without an entry = an earlier run crashed after creating the ref: finish it.
    // ponytail: two concurrent retries of a crashed run can both create an entry; add a unique
    // (source_ref_id) index on journal_entries if that ever matters.

    // First server layer: recordings with no health words never reach an AI (docs/PRIVACY_FILTER.md).
    if (!classifyHealthRelevance(rec.transcript).relevant) return notStored("not_health_related");

    const filtered = await applyPrivacyFilter(rec.transcript, { patientId: patient.id, trigger: SYSTEM_TRIGGER });
    if (filtered.text.length === 0) return notStored("nothing_kept");
    const body = filtered.text.replace(/\s+/g, " ").trim();
    assertStorableBody({ ...filtered, text: body });

    if (!existing) {
      try {
        // No free text in source references: the transcript lives only as a hash + length.
        await system.createSourceRef({
          id: sourceRefId,
          patientId: patient.id,
          provider: "vexo",
          mode: rec.mode,
          externalId,
          title: `Band ${rec.bandNumber} conversation`,
          excerpt: null,
          sourceTimestamp: new Date(startedMs).toISOString(),
          retrievedAt: now.toISOString(),
          metadata: {
            tool: "band",
            bandNumber: rec.bandNumber,
            sttProvider: rec.stt.provider,
            sttModel: rec.stt.model,
            gateProvider: rec.gate.provider,
            gateModel: rec.gate.model,
            gateVeryPrivate: rec.gate.veryPrivate,
            gateHealthRelated: rec.gate.healthRelated,
            gateFallback: rec.gate.fallback,
            originalExcerptSha256: createHash("sha256").update(rec.transcript).digest("hex"),
            originalLength: rec.transcript.length,
            trimmed: false,
            privacyFiltered: true,
          },
        });
      } catch (error) {
        // A concurrent request created the ref first; it owns creating the entry.
        if (isAppError(error) && error.code === "CONFLICT") return notStored("duplicate");
        throw error;
      }
    }

    const entry = await ingestFilteredEntryForPatient(
      patient,
      { ...filtered, text: body },
      { source: "vexo", occurredAt: rec.startedAt, sourceRefId },
      { trigger: SYSTEM_TRIGGER },
    );
    return { status: 200, body: { stored: true, entryId: entry.id } };
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION") return fail(400, "Recording could not be stored as an update.");
    // Never log the error object: it could carry transcript text.
    console.error("[DoctorLoop] Band ingest failed:", isAppError(error) ? error.code : (error as Error)?.name);
    return fail(500, "Band ingest failed.");
  }
}
