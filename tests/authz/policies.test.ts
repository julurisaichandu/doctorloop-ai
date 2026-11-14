import { describe, expect, it } from "vitest";
import {
  assertDoctor,
  assertPatientSelf,
  canAccessSharingApprovals,
  canCreateSourceRef,
  canAccessVoiceSession,
  canDoctorReview,
  canEditEntry,
  canEditObservation,
  canReadEntry,
  canReadObservation,
  canReadSourceRef,
  canReadSummary,
  canTransition,
} from "@/lib/authz/policies";
import type { Actor, ReviewStatus } from "@/lib/domain/types";

const base = { fullName: "X", email: "x@example.com", title: null };
const patient: Actor = { ...base, userId: "u-p1", role: "patient", patientId: "p1" };
const doctor: Actor = { ...base, userId: "u-d1", role: "doctor", patientId: null };
const STATUSES: ReviewStatus[] = ["pending_review", "approved", "rejected"];

describe("assertions", () => {
  it("assertPatientSelf returns the patient id and rejects doctors", () => {
    expect(assertPatientSelf(patient)).toBe("p1");
    expect(() => assertPatientSelf(doctor)).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("assertDoctor rejects patients", () => {
    expect(() => assertDoctor(doctor)).not.toThrow();
    expect(() => assertDoctor(patient)).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });
});

describe("entries", () => {
  it.each(STATUSES)("patient reads own %s entry, not others", (reviewStatus) => {
    expect(canReadEntry(patient, { patientId: "p1", reviewStatus }, false)).toBe(true);
    expect(canReadEntry(patient, { patientId: "p2", reviewStatus }, false)).toBe(false);
  });

  it.each([
    ["pending_review", true, false],
    ["approved", true, true],
    ["rejected", true, false],
    ["pending_review", false, false],
    ["approved", false, false],
    ["rejected", false, false],
  ] as const)("doctor reads %s entry (assigned=%s): %s", (reviewStatus, assigned, expected) => {
    expect(canReadEntry(doctor, { patientId: "p1", reviewStatus }, assigned)).toBe(expected);
  });

  it("only the owner edits, and only while pending_review", () => {
    expect(canEditEntry(patient, { patientId: "p1", reviewStatus: "pending_review" })).toBe(true);
    expect(canEditEntry(patient, { patientId: "p1", reviewStatus: "approved" })).toBe(false);
    expect(canEditEntry(patient, { patientId: "p2", reviewStatus: "pending_review" })).toBe(false);
    expect(canEditEntry(doctor, { patientId: "p1", reviewStatus: "pending_review" })).toBe(false);
  });

  it("transition rules", () => {
    expect(canTransition("pending_review", "approved")).toBe(true);
    expect(canTransition("pending_review", "rejected")).toBe(true);
    expect(canTransition("approved", "rejected")).toBe(true);
    expect(canTransition("rejected", "approved")).toBe(true);
    expect(canTransition("approved", "pending_review")).toBe(false);
    expect(canTransition("rejected", "pending_review")).toBe(false);
    expect(canTransition("approved", "approved")).toBe(false);
  });
});

describe("observations", () => {
  const active = { patientId: "p1", status: "active" as const };
  const removed = { patientId: "p1", status: "removed" as const };

  it("patient reads own including removed", () => {
    expect(canReadObservation(patient, removed, { reviewStatus: "pending_review" }, false)).toBe(true);
  });

  it("doctor reads only active observations of approved entries when assigned", () => {
    expect(canReadObservation(doctor, active, { reviewStatus: "approved" }, true)).toBe(true);
    expect(canReadObservation(doctor, removed, { reviewStatus: "approved" }, true)).toBe(false);
    expect(canReadObservation(doctor, active, { reviewStatus: "pending_review" }, true)).toBe(false);
    expect(canReadObservation(doctor, active, { reviewStatus: "approved" }, false)).toBe(false);
  });

  it("patient edits only while the parent entry is pending", () => {
    expect(canEditObservation(patient, active, { reviewStatus: "pending_review" })).toBe(true);
    expect(canEditObservation(patient, active, { reviewStatus: "approved" })).toBe(false);
    expect(canEditObservation(doctor, active, { reviewStatus: "pending_review" })).toBe(false);
  });
});

describe("source refs, voice, summaries, approvals, reviews", () => {
  it("source refs: doctor needs an approved linking entry and assignment", () => {
    expect(canReadSourceRef(doctor, { patientId: "p1" }, true, true)).toBe(true);
    expect(canReadSourceRef(doctor, { patientId: "p1" }, false, true)).toBe(false);
    expect(canReadSourceRef(doctor, { patientId: "p1" }, true, false)).toBe(false);
    expect(canReadSourceRef(patient, { patientId: "p1" }, false, false)).toBe(true);
  });

  it("voice sessions are patient-only", () => {
    expect(canAccessVoiceSession(patient, { patientId: "p1" })).toBe(true);
    expect(canAccessVoiceSession(patient, { patientId: "p2" })).toBe(false);
    expect(canAccessVoiceSession(doctor, { patientId: "p1" })).toBe(false);
  });

  it("doctors read clinician summaries of assigned patients only", () => {
    expect(canReadSummary(doctor, { patientId: "p1", audience: "clinician" }, true)).toBe(true);
    expect(canReadSummary(doctor, { patientId: "p1", audience: "patient" }, true)).toBe(false);
    expect(canReadSummary(doctor, { patientId: "p1", audience: "clinician" }, false)).toBe(false);
    expect(canReadSummary(patient, { patientId: "p1", audience: "patient" }, false)).toBe(true);
    expect(canReadSummary(patient, { patientId: "p1", audience: "clinician" }, false)).toBe(true);
  });

  it("doctors never read superseded clinician summaries", () => {
    const old = { patientId: "p1", audience: "clinician" as const, supersededAt: "2026-11-13T00:00:00.000Z" };
    expect(canReadSummary(doctor, old, true)).toBe(false);
    expect(canReadSummary(patient, old, false)).toBe(true);
  });

  it("no actor may create source references (system only)", () => {
    expect(canCreateSourceRef(patient, "p1")).toBe(false);
    expect(canCreateSourceRef(doctor, "p1")).toBe(false);
  });

  it("sharing approvals are visible to the owning patient only", () => {
    expect(canAccessSharingApprovals(patient, "p1")).toBe(true);
    expect(canAccessSharingApprovals(patient, "p2")).toBe(false);
    expect(canAccessSharingApprovals(doctor, "p1")).toBe(false);
  });

  it("doctor review needs assignment and an approved entry", () => {
    expect(canDoctorReview(doctor, { reviewStatus: "approved" }, true)).toBe(true);
    expect(canDoctorReview(doctor, { reviewStatus: "pending_review" }, true)).toBe(false);
    expect(canDoctorReview(doctor, { reviewStatus: "approved" }, false)).toBe(false);
    expect(canDoctorReview(patient, { reviewStatus: "approved" }, true)).toBe(false);
  });
});
