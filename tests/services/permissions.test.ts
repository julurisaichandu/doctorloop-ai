import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/lib/data";
import { getLocalDb, resetLocalDb } from "@/lib/data/local/local-db";
import type { NewJournalEntry } from "@/lib/data/repository";
import {
  getDoctorOverview,
  getDoctorPatientDetail,
  getSharedRecord,
  listDoctorPatients,
  markAllReviewed,
  markEntryReviewed,
} from "@/lib/services/doctor";
import {
  approveEntry,
  createManualEntry,
  getPatientDashboard,
  listPatientTimeline,
  setObservationRemoved,
  updateEntryText,
  updateObservation,
} from "@/lib/services/patient";
import { KNEE_NOTE, daniel, drBell, drPark, maya, patientIdOf, priya } from "./support";

const forbidden = expect.objectContaining({ code: "FORBIDDEN" });
const notFound = expect.objectContaining({ code: "NOT_FOUND" });

function entryFor(patientId: string, reviewStatus: NewJournalEntry["reviewStatus"]): NewJournalEntry {
  return {
    patientId,
    source: "manual",
    body: "x",
    occurredAt: new Date().toISOString(),
    reviewStatus,
    reviewedByPatientAt: null,
    processingStatus: "processed",
    processingError: null,
    sourceRefId: null,
    voiceSessionId: null,
    editedByPatient: false,
  };
}

beforeEach(() => resetLocalDb());

describe("patient isolation", () => {
  it("patients only see their own timeline", async () => {
    const entries = await listPatientTimeline(maya());
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((v) => v.entry.patientId === patientIdOf(maya()))).toBe(true);
  });

  it("patient B cannot read or modify patient A's data", async () => {
    const timeline = await listPatientTimeline(maya());
    const target = timeline[0];
    const observation = timeline.flatMap((v) => v.observations)[0];

    await expect(updateEntryText(daniel(), target.entry.id, { body: "hijack" })).rejects.toEqual(notFound);
    await expect(approveEntry(daniel(), target.entry.id)).rejects.toEqual(notFound);
    expect(observation).toBeDefined();
    await expect(updateObservation(daniel(), observation.id, { label: "x" })).rejects.toEqual(notFound);
    await expect(setObservationRemoved(daniel(), observation.id, true)).rejects.toEqual(notFound);

    const repo = getRepository(daniel());
    expect(await repo.getEntry(target.entry.id)).toBeNull();
    expect(await repo.listEntries(patientIdOf(maya()))).toEqual([]);
    expect(await repo.getPatient(patientIdOf(maya()))).toBeNull();
  });

  it("actor repositories reject foreign writes and system-only writes", async () => {
    const repo = getRepository(daniel());
    await expect(repo.createEntry(entryFor(patientIdOf(maya()), "pending_review"))).rejects.toEqual(forbidden);
    await expect(repo.replaceObservationsForEntry("any", [])).rejects.toEqual(forbidden);
    await expect(repo.getVexoConnection(daniel().userId)).rejects.toEqual(forbidden);
    await expect(
      repo.createSummary({
        patientId: patientIdOf(daniel()),
        audience: "patient",
        periodStart: "",
        periodEnd: "",
        content: {
          overview: "x",
          mainConcerns: [],
          changesSinceEarlier: [],
          recoveryActivities: [],
          patientQuestions: [],
          dataGaps: [],
        },
        sourceEntryIds: [],
        generatedBy: "mock",
        model: null,
      }),
    ).rejects.toEqual(forbidden);
  });
});

describe("doctor access", () => {
  it("Dr. Bell (assigned to Priya only) gets NOT_FOUND for Maya", async () => {
    await expect(getDoctorPatientDetail(drBell(), patientIdOf(maya()))).rejects.toEqual(notFound);
    const patients = await listDoctorPatients(drBell());
    expect(patients.map((p) => p.patient.id)).toEqual([patientIdOf(priya())]);

    const mayaEntry = getLocalDb().data.entries.find(
      (e) => e.patientId === patientIdOf(maya()) && e.reviewStatus === "approved",
    );
    if (mayaEntry) {
      await expect(getSharedRecord(drBell(), mayaEntry.id)).rejects.toEqual(notFound);
      await expect(markEntryReviewed(drBell(), mayaEntry.id)).rejects.toEqual(notFound);
    }
    await expect(markAllReviewed(drBell(), patientIdOf(maya()))).rejects.toEqual(notFound);
  });

  it("Dr. Park sees approved entries only, never pending or rejected", async () => {
    const pending = await createManualEntry(maya(), { body: KNEE_NOTE });
    const detail = await getDoctorPatientDetail(drPark(), patientIdOf(maya()));
    expect(detail.entries.length).toBeGreaterThan(0);
    expect(detail.entries.every((v) => v.entry.reviewStatus === "approved")).toBe(true);
    expect(detail.entries.some((v) => v.entry.id === pending.entry.id)).toBe(false);
    await expect(getSharedRecord(drPark(), pending.entry.id)).rejects.toEqual(notFound);
    await expect(markEntryReviewed(drPark(), pending.entry.id)).rejects.toEqual(notFound);

    const repo = getRepository(drPark());
    const visible = await repo.listEntries(patientIdOf(maya()));
    expect(visible.every((e) => e.reviewStatus === "approved")).toBe(true);
    // Even directly through the repository an unapproved entry cannot be reviewed.
    await expect(
      repo.upsertDoctorReview({
        doctorId: drPark().userId,
        patientId: patientIdOf(maya()),
        journalEntryId: pending.entry.id,
      }),
    ).rejects.toEqual(forbidden);
  });

  it("doctors cannot read voice sessions, approvals or patient-audience summaries", async () => {
    const repo = getRepository(drPark());
    const { voiceSessions, approvals, summaries } = getLocalDb().data;
    expect(voiceSessions.length).toBeGreaterThan(0);
    for (const session of voiceSessions) {
      expect(await repo.getVoiceSession(session.id)).toBeNull();
    }
    for (const patientId of new Set(approvals.map((a) => a.patientId))) {
      expect(await repo.listSharingApprovals(patientId)).toEqual([]);
    }
    const summary = summaries.find((s) => s.audience === "patient");
    expect(summary).toBeDefined();
    expect(await repo.getLatestSummary(summary!.patientId, "patient")).toBeNull();
  });

  it("doctors cannot use patient services or write entries", async () => {
    await expect(getPatientDashboard(drPark())).rejects.toEqual(forbidden);
    await expect(createManualEntry(drPark(), { body: KNEE_NOTE })).rejects.toEqual(forbidden);
    await expect(
      getRepository(drPark()).createEntry(entryFor(patientIdOf(maya()), "approved")),
    ).rejects.toEqual(forbidden);
  });

  it("patients cannot use doctor services", async () => {
    const [entry] = await listPatientTimeline(maya());
    await expect(markEntryReviewed(maya(), entry.entry.id)).rejects.toEqual(forbidden);
    await expect(markAllReviewed(maya(), patientIdOf(maya()))).rejects.toEqual(forbidden);
    await expect(getDoctorOverview(maya())).rejects.toEqual(forbidden);
    await expect(listDoctorPatients(maya())).rejects.toEqual(forbidden);
  });
});
