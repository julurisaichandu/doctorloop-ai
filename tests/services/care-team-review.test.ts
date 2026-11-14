import { beforeEach, describe, expect, it } from "vitest";
import { getDoctorPatientDetail, markEntryReviewed } from "@/lib/services/doctor";
import { approveEntry, createManualEntry, getPatientDashboard, listPatientTimeline, rejectEntry } from "@/lib/services/patient";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { KNEE_NOTE, daniel, drPark, maya, patientIdOf } from "./support";

beforeEach(() => resetLocalDb());

describe("careTeamReview on patient views", () => {
  it("shows the doctor and time on an approved entry once a doctor reviewed it", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    await approveEntry(maya(), created.entry.id);

    const before = (await listPatientTimeline(maya())).find((v) => v.entry.id === created.entry.id);
    expect(before?.careTeamReview).toBeNull();

    await markEntryReviewed(drPark(), created.entry.id);
    const after = (await listPatientTimeline(maya())).find((v) => v.entry.id === created.entry.id);
    expect(after?.careTeamReview).toMatchObject({ doctorName: expect.stringContaining("Park") });
    expect(Date.parse(after!.careTeamReview!.reviewedAt)).not.toBeNaN();

    const dash = await getPatientDashboard(maya());
    expect(dash.recentEntries.find((v) => v.entry.id === created.entry.id)?.careTeamReview).not.toBeNull();
  });

  it("never shows it for pending or private entries", async () => {
    const pending = await createManualEntry(maya(), { body: KNEE_NOTE });
    const priv = await createManualEntry(maya(), { body: KNEE_NOTE });
    await rejectEntry(maya(), priv.entry.id);
    const views = await listPatientTimeline(maya());
    for (const id of [pending.entry.id, priv.entry.id]) {
      expect(views.find((v) => v.entry.id === id)?.careTeamReview).toBeNull();
    }
  });

  it("does not leak to other patients and is absent from doctor views", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    await approveEntry(maya(), created.entry.id);
    await markEntryReviewed(drPark(), created.entry.id);

    const danielViews = await listPatientTimeline(daniel());
    expect(danielViews.every((v) => v.entry.patientId === patientIdOf(daniel()))).toBe(true);
    expect(danielViews.some((v) => v.entry.id === created.entry.id)).toBe(false);

    const detail = await getDoctorPatientDetail(drPark(), patientIdOf(maya()));
    expect(detail.entries.every((v) => v.careTeamReview === undefined)).toBe(true);
    expect(detail.entries.find((v) => v.entry.id === created.entry.id)?.doctorReview).not.toBeNull();
  });
});
