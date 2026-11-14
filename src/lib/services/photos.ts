import "server-only";

import { assertPatientSelf } from "@/lib/authz/policies";
import { getRepository, getSystemRepository } from "@/lib/data";
import type { Actor, TimelineEntryView } from "@/lib/domain/types";
import { validationError } from "@/lib/errors";
import { normalizePhoto } from "@/lib/photos/image";
import { photoPath, putPhoto, removePhoto } from "@/lib/photos/storage";
import { applyPrivacyFilter, ingestFilteredEntry, normalizeOccurredAt } from "./ingest";
import { buildTimelineViews } from "./views";

const MAX_FUTURE_MS = 5 * 60_000;
const MAX_AGE_MS = 365 * 24 * 3_600_000;

export async function addPhotoEntry(
  actor: Actor,
  input: { photo: Uint8Array; note?: string; occurredAt?: string },
): Promise<TimelineEntryView> {
  const patientId = assertPatientSelf(actor);
  const image = await normalizePhoto(input.photo);

  const occurredAt = normalizeOccurredAt(input.occurredAt);
  const age = Date.now() - new Date(occurredAt).getTime();
  if (age < -MAX_FUTURE_MS) throw validationError("The photo time cannot be in the future.");
  if (age > MAX_AGE_MS) throw validationError("The photo time cannot be more than a year ago.");

  const note = input.note?.trim() ?? "";
  const filtered = note
    ? await applyPrivacyFilter(note, { patientId, trigger: { kind: actor.role, userId: actor.userId } })
    : null;
  const text = filtered?.text.replace(/\s+/g, " ").trim() ?? "";

  const refId = crypto.randomUUID();
  const path = photoPath(patientId, refId);
  await putPhoto(path, image.data);
  try {
    const system = getSystemRepository();
    await system.createSourceRef({
      id: refId,
      patientId,
      provider: "manual",
      mode: "live",
      externalId: null,
      title: null,
      excerpt: null,
      sourceTimestamp: occurredAt,
      retrievedAt: new Date().toISOString(),
      metadata: {
        kind: "photo",
        storagePath: path,
        contentType: image.contentType,
        width: image.width,
        height: image.height,
        byteSize: image.byteSize,
      },
    });
    if (filtered && text) {
      return await ingestFilteredEntry(actor, { ...filtered, text }, { source: "manual", occurredAt, sourceRefId: refId });
    }
    const repo = getRepository(actor);
    const created = await repo.createEntry({
      patientId,
      source: "manual",
      body: "",
      occurredAt,
      reviewStatus: "pending_review",
      reviewedByPatientAt: null,
      processingStatus: "processing",
      processingError: null,
      sourceRefId: refId,
      voiceSessionId: null,
      editedByPatient: false,
    });
    const entry = await system.updateEntry(created.id, { processingStatus: "processed" });
    const [view] = await buildTimelineViews(repo, [entry]);
    return view;
  } catch (error) {
    await removePhoto(path).catch(() => undefined);
    throw error;
  }
}
