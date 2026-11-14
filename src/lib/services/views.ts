import "server-only";

import { getSystemRepository } from "@/lib/data";
import type { Repository } from "@/lib/data/repository";
import type { DoctorReview, JournalEntry, Observation, SourceReference, TimelineEntryView } from "@/lib/domain/types";

/** Metadata keys that are safe to show to doctors (no free text from the patient). */
const DOCTOR_VISIBLE_SOURCE_METADATA = ["tool", "query", "mcpServer", "replayFile", "trimmed", "transcriptSource"] as const;

/** Doctor-facing copy of a source reference: no excerpt, whitelisted metadata only. */
export function sanitizeSourceRefForDoctor(ref: SourceReference): SourceReference {
  const metadata: Record<string, unknown> = {};
  for (const key of DOCTOR_VISIBLE_SOURCE_METADATA) {
    if (key in ref.metadata) metadata[key] = ref.metadata[key];
  }
  return { ...ref, excerpt: null, metadata };
}

export interface TimelineViewOptions {
  /** Include observations the patient removed (default: active only). */
  includeRemoved?: boolean;
  /** Doctor views: attach this doctor's review record (or null) to every entry. */
  doctorId?: string;
  /**
   * PATIENT views only: attach `careTeamReview` (latest review of each approved entry by any
   * assigned doctor). Reads through the system repository, so callers MUST have passed the
   * patient-self check first. Never combine with `doctorId`.
   */
  withCareTeamReview?: boolean;
}

/** entryId -> latest review by any currently assigned doctor (approved entries only). */
async function latestCareTeamReviews(
  patientId: string,
  entryIds: Set<string>,
): Promise<Map<string, { doctorName: string; reviewedAt: string }>> {
  const system = getSystemRepository();
  const careTeam = await system.listCareTeam(patientId);
  const out = new Map<string, { doctorName: string; reviewedAt: string }>();
  await Promise.all(
    careTeam.map(async (doctor) => {
      for (const r of await system.listDoctorReviews(doctor.id, patientId)) {
        if (r.patientId !== patientId || !entryIds.has(r.journalEntryId)) continue;
        const prev = out.get(r.journalEntryId);
        if (!prev || r.reviewedAt > prev.reviewedAt) {
          out.set(r.journalEntryId, { doctorName: doctor.fullName, reviewedAt: r.reviewedAt });
        }
      }
    }),
  );
  return out;
}

/**
 * Joins entries with their observations, source references and (for doctors) review
 * records. Everything is read through `repo`, so an actor repository applies its
 * visibility rules to the joined rows too. Entry order is preserved.
 */
export async function buildTimelineViews(
  repo: Repository,
  entries: JournalEntry[],
  opts: TimelineViewOptions = {},
): Promise<TimelineEntryView[]> {
  const patientIds = [...new Set(entries.map((e) => e.patientId))];

  const observationsByEntry = new Map<string, Observation[]>();
  const reviewsByEntry = new Map<string, DoctorReview>();
  await Promise.all(
    patientIds.map(async (patientId) => {
      const entryIds = entries.filter((e) => e.patientId === patientId).map((e) => e.id);
      const observations = await repo.listObservations(patientId, {
        entryIds,
        includeRemoved: opts.includeRemoved,
      });
      for (const o of observations) {
        const list = observationsByEntry.get(o.journalEntryId) ?? [];
        list.push(o);
        observationsByEntry.set(o.journalEntryId, list);
      }
      if (opts.doctorId) {
        for (const r of await repo.listDoctorReviews(opts.doctorId, patientId)) {
          reviewsByEntry.set(r.journalEntryId, r);
        }
      }
    }),
  );

  const refIds = [...new Set(entries.flatMap((e) => (e.sourceRefId ? [e.sourceRefId] : [])))];
  const refs: SourceReference[] = refIds.length > 0 ? await repo.listSourceRefs(refIds) : [];
  const refsById = new Map(refs.map((r) => [r.id, r]));

  const careReviews = new Map<string, { doctorName: string; reviewedAt: string }>();
  if (opts.withCareTeamReview && !opts.doctorId) {
    await Promise.all(
      patientIds.map(async (patientId) => {
        const approved = new Set(
          entries.filter((e) => e.patientId === patientId && e.reviewStatus === "approved").map((e) => e.id),
        );
        if (approved.size === 0) return;
        for (const [id, review] of await latestCareTeamReviews(patientId, approved)) careReviews.set(id, review);
      }),
    );
  }

  return entries.map((entry) => {
    const view: TimelineEntryView = {
      entry,
      observations: observationsByEntry.get(entry.id) ?? [],
      sourceRef: null,
      privacyFilter: entry.privacyFilter ?? null,
    };
    const ref = entry.sourceRefId ? refsById.get(entry.sourceRefId) : undefined;
    if (ref) view.sourceRef = opts.doctorId ? sanitizeSourceRefForDoctor(ref) : ref;
    if (opts.withCareTeamReview && !opts.doctorId) view.careTeamReview = careReviews.get(entry.id) ?? null;
    if (opts.doctorId) view.doctorReview = reviewsByEntry.get(entry.id) ?? null;
    return view;
  });
}
