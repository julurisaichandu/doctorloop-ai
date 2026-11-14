import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/lib/data";
import { getLocalDb, resetLocalDb } from "@/lib/data/local/local-db";
import type { GeneratedSummary } from "@/lib/domain/types";
import { getDoctorPatientDetail, getSharedRecord, listDoctorPatients } from "@/lib/services/doctor";
import {
  approveEntry,
  createManualEntry,
  rejectEntry,
  revokeEntry,
  setObservationRemoved,
  updateEntryText,
  updateObservation,
} from "@/lib/services/patient";
import { KNEE_NOTE, drPark, maya, patientIdOf } from "./support";

const code = (c: string) => expect.objectContaining({ code: c });

const cited = (summary: GeneratedSummary | null): string[] =>
  summary
    ? [
        ...summary.content.mainConcerns,
        ...summary.content.changesSinceEarlier,
        ...summary.content.recoveryActivities,
        ...summary.content.patientQuestions,
      ].flatMap((item) => item.citations)
    : [];

const visibleToPark = async (entryId: string) =>
  (await getDoctorPatientDetail(drPark(), patientIdOf(maya()))).entries.some((v) => v.entry.id === entryId);

beforeEach(() => resetLocalDb());

describe("sharing lifecycle", () => {
  it("approve shares the entry with the doctor and logs an approval", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    expect(created.entry.reviewStatus).toBe("pending_review");
    expect(await visibleToPark(created.entry.id)).toBe(false);

    const approved = await approveEntry(maya(), created.entry.id, "ok to share");
    expect(approved.entry.reviewStatus).toBe("approved");
    expect(approved.entry.reviewedByPatientAt).not.toBeNull();
    expect(await visibleToPark(created.entry.id)).toBe(true);
    expect((await getSharedRecord(drPark(), created.entry.id)).entry.id).toBe(created.entry.id);

    const approvals = getLocalDb().data.approvals.filter((a) => a.journalEntryId === created.entry.id);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ decision: "approved", note: "ok to share", decidedBy: maya().userId });
  });

  it("reject keeps the entry private", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    const rejected = await rejectEntry(maya(), created.entry.id);
    expect(rejected.entry.reviewStatus).toBe("rejected");
    expect(await visibleToPark(created.entry.id)).toBe(false);
    await expect(getSharedRecord(drPark(), created.entry.id)).rejects.toEqual(code("NOT_FOUND"));
    expect(getLocalDb().data.approvals.at(-1)).toMatchObject({
      journalEntryId: created.entry.id,
      decision: "rejected",
    });
  });

  it("revoke hides the entry again and the clinician summary stops citing it", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    await approveEntry(maya(), created.entry.id);
    const whileShared = await getRepository(maya()).getLatestSummary(patientIdOf(maya()), "clinician");
    expect(whileShared?.sourceEntryIds).toContain(created.entry.id);

    const revoked = await revokeEntry(maya(), created.entry.id);
    expect(revoked.entry.reviewStatus).toBe("rejected");
    expect(await visibleToPark(created.entry.id)).toBe(false);
    expect(getLocalDb().data.approvals.at(-1)).toMatchObject({
      journalEntryId: created.entry.id,
      decision: "revoked",
    });

    const after = (await getDoctorPatientDetail(drPark(), patientIdOf(maya()))).summary;
    expect(after?.sourceEntryIds).not.toContain(created.entry.id);
    expect(cited(after)).not.toContain(created.entry.id);
  });

  it("can share a rejected entry later, but not reject an approved one directly", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    await rejectEntry(maya(), created.entry.id);
    expect((await approveEntry(maya(), created.entry.id)).entry.reviewStatus).toBe("approved");
    await expect(rejectEntry(maya(), created.entry.id)).rejects.toEqual(code("CONFLICT"));
    await expect(approveEntry(maya(), created.entry.id)).rejects.toEqual(code("CONFLICT"));
  });

  it("with nothing approved the clinician summary is empty", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    await approveEntry(maya(), created.entry.id);
    const approved = getLocalDb().data.entries.filter(
      (e) => e.patientId === patientIdOf(maya()) && e.reviewStatus === "approved",
    );
    for (const item of approved) await revokeEntry(maya(), item.id);

    const summary = await getRepository(maya()).getLatestSummary(patientIdOf(maya()), "clinician");
    expect(summary?.content.overview).toBe("No patient-approved updates in this period.");
    expect(summary?.sourceEntryIds).toEqual([]);
    const item = (await listDoctorPatients(drPark())).find((p) => p.patient.id === patientIdOf(maya()));
    expect(item?.sharedCount).toBe(0);
  });

  it("editing after approval is a CONFLICT", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    const observation = created.observations[0];
    expect(observation).toBeDefined();
    await approveEntry(maya(), created.entry.id);
    await expect(updateEntryText(maya(), created.entry.id, { body: "changed my mind" })).rejects.toEqual(
      code("CONFLICT"),
    );
    await expect(updateObservation(maya(), observation.id, { label: "Other" })).rejects.toEqual(code("CONFLICT"));
    await expect(setObservationRemoved(maya(), observation.id, true)).rejects.toEqual(code("CONFLICT"));
  });

  it("editing while pending re-extracts and validates patches", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    const observation = created.observations[0];
    const edited = await updateObservation(maya(), observation.id, { severity: 5 });
    expect(edited).toMatchObject({ severity: 5, editedByPatient: true });
    await expect(updateObservation(maya(), observation.id, { severity: 11 })).rejects.toEqual(code("VALIDATION"));
    await expect(createManualEntry(maya(), { body: "   " })).rejects.toEqual(code("VALIDATION"));

    const updated = await updateEntryText(maya(), created.entry.id, { body: "I walked for 20 minutes today." });
    expect(updated.entry).toMatchObject({ body: "I walked for 20 minutes today.", editedByPatient: true });
    expect(updated.observations.every((o) => o.journalEntryId === created.entry.id)).toBe(true);
  });
});
