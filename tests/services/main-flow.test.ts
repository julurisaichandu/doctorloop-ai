import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { getDoctorPatientDetail, listDoctorPatients, markEntryReviewed } from "@/lib/services/doctor";
import { approveEntry, createManualEntry } from "@/lib/services/patient";
import { KNEE_NOTE, drPark, maya, patientIdOf } from "./support";

beforeEach(() => resetLocalDb());

async function mayaListItem() {
  const items = await listDoctorPatients(drPark());
  const item = items.find((i) => i.patient.id === patientIdOf(maya()));
  if (!item) throw new Error("Maya missing from Dr. Park's list");
  return item;
}

describe("core demo flow", () => {
  it("patient records, approves, doctor reviews", async () => {
    const before = await mayaListItem();

    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    expect(created.entry).toMatchObject({
      reviewStatus: "pending_review",
      source: "manual",
      processingStatus: "processed",
    });
    expect(created.observations.length).toBeGreaterThan(0);
    expect(created.observations.some((o) => o.severity === 7)).toBe(true);

    await approveEntry(maya(), created.entry.id);

    const shared = await mayaListItem();
    expect(shared.unreviewedCount).toBe(before.unreviewedCount + 1);
    expect(shared.latestShared?.entry.id).toBe(created.entry.id);

    const detail = await getDoctorPatientDetail(drPark(), patientIdOf(maya()));
    const items = detail.summary
      ? [
          ...detail.summary.content.mainConcerns,
          ...detail.summary.content.changesSinceEarlier,
          ...detail.summary.content.recoveryActivities,
          ...detail.summary.content.patientQuestions,
        ]
      : [];
    expect(items.some((item) => item.citations.includes(created.entry.id))).toBe(true);
    expect(detail.entries.find((v) => v.entry.id === created.entry.id)?.doctorReview).toBeNull();

    const review = await markEntryReviewed(drPark(), created.entry.id);
    expect(review).toMatchObject({ doctorId: drPark().userId, journalEntryId: created.entry.id });

    expect((await mayaListItem()).unreviewedCount).toBe(before.unreviewedCount);
  });
});
