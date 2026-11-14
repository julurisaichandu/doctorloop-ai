import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRepository } from "@/lib/data/local/local-repository";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { getSystemRepository } from "@/lib/data";
import { activateSimulatedBilling } from "@/lib/services/billing-account";
import { regenerateClinicianSummary } from "@/lib/services/doctor";
import { approveEntry, createManualEntry } from "@/lib/services/patient";
import { drBell, drPark, KNEE_NOTE, maya, patientIdOf, priya } from "./support";

async function newRecords(patientId: string, before: Set<string>) {
  const all = await getSystemRepository().listUsageRecords({ patientId });
  return all.filter((r) => !before.has(r.id));
}
async function snapshot(patientId: string) {
  return new Set((await getSystemRepository().listUsageRecords({ patientId })).map((r) => r.id));
}

describe("usage recording at AI call sites", () => {
  beforeEach(() => resetLocalDb());
  afterEach(() => vi.restoreAllMocks());

  it("a manual check-in records privacy filter, extraction and patient summary usage billed to Dr. Park", async () => {
    const pid = patientIdOf(maya());
    const before = await snapshot(pid);
    const view = await createManualEntry(maya(), { body: KNEE_NOTE });
    const fresh = await newRecords(pid, before);
    const ops = fresh.map((r) => r.operation);
    expect(ops).toEqual(expect.arrayContaining(["privacy_filter", "entry_extraction", "patient_summary"]));
    const extraction = fresh.find((r) => r.operation === "entry_extraction");
    expect(extraction?.journalEntryId).toBe(view.entry.id);
    for (const r of fresh) {
      expect(r.billingStatus).toBe("not_billed");
      expect(r.triggeredBy).toBe("patient");
      expect(r.totalTokens).toBeGreaterThan(0);
    }
    expect(fresh.every((r) => r.billingDoctorId === drPark().userId)).toBe(true);
  });

  it("approving an update records a clinician summary run", async () => {
    const pid = patientIdOf(maya());
    const view = await createManualEntry(maya(), { body: KNEE_NOTE });
    const before = await snapshot(pid);
    await approveEntry(maya(), view.entry.id);
    const fresh = await newRecords(pid, before);
    expect(fresh.map((r) => r.operation)).toContain("clinician_summary");
  });

  it("Dr. Bell regenerating Priya's pre-visit summary is billed to Dr. Bell", async () => {
    const pid = patientIdOf(priya());
    const before = await snapshot(pid);
    await regenerateClinicianSummary(drBell(), pid);
    const fresh = await newRecords(pid, before);
    const rec = fresh.find((r) => r.operation === "clinician_summary");
    expect(rec).toBeDefined();
    expect(rec?.billingDoctorId).toBe(drBell().userId);
    expect(rec?.triggeredBy).toBe("doctor");
  });

  it("after simulated setup, a check-in is billed immediately", async () => {
    await activateSimulatedBilling(drPark());
    const pid = patientIdOf(maya());
    const before = await snapshot(pid);
    await createManualEntry(maya(), { body: KNEE_NOTE });
    const fresh = await newRecords(pid, before);
    expect(fresh.length).toBeGreaterThan(0);
    for (const r of fresh) {
      expect(r.billingStatus).toBe("billed");
      expect(r.billingDoctorId).toBe(drPark().userId);
    }
  });

  it("a privacy-filter run that keeps nothing is still recorded", async () => {
    const pid = patientIdOf(maya());
    const before = await snapshot(pid);
    await expect(
      createManualEntry(maya(), { body: "We need oats and bananas. Chloe is visiting Lisbon." }),
    ).rejects.toThrow();
    const fresh = await newRecords(pid, before);
    expect(fresh.map((r) => r.operation)).toEqual(["privacy_filter"]);
    expect(fresh[0].journalEntryId).toBeNull();
  });

  it("usage recording failures never break a check-in", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(LocalRepository.prototype, "createUsageRecords").mockRejectedValue(new Error("boom"));
    const view = await createManualEntry(maya(), { body: KNEE_NOTE });
    expect(view.entry.processingStatus).toBe("processed");
    expect(errorSpy).toHaveBeenCalledWith("[DoctorLoop] Usage recording failed:", expect.anything());
  });
});
