import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRepository, getSystemRepository } from "@/lib/data";
import { getLocalDb, resetLocalDb } from "@/lib/data/local/local-db";
import { getDoctorPatientDetail, getSharedRecord } from "@/lib/services/doctor";
import { approveEntry, createManualEntry, getPatientDashboard, listPatientTimeline, updateEntryText } from "@/lib/services/patient";
import { importVexoMemories, previewVexoImport } from "@/lib/services/vexo";
import { completeVoiceSession, startVoiceSession } from "@/lib/services/voice";
import { drPark, maya, patientIdOf } from "./support";

const DAY_MS = 86_400_000;
const range = () => ({ from: new Date(Date.now() - 14 * DAY_MS).toISOString(), to: new Date().toISOString() });

const NOISY =
  "My right knee aches about 6 out of 10 tonight. Jordan Blake called me on 617-555-0142 about the quarterly budget. The new sofa arrives on Saturday.";

const saved = { mode: process.env.VEXO_MODE, file: process.env.VEXO_FILE_PATH };

beforeEach(() => {
  resetLocalDb();
  process.env.VEXO_MODE = "file";
  delete process.env.VEXO_FILE_PATH;
});

afterEach(() => {
  for (const [key, value] of [
    ["VEXO_MODE", saved.mode],
    ["VEXO_FILE_PATH", saved.file],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("manual entries", () => {
  it("stores only the filtered body plus a counts-only receipt", async () => {
    const view = await createManualEntry(maya(), { body: NOISY });
    expect(view.entry.body).toBe("My right knee aches about 6 out of 10 tonight.");
    expect(view.privacyFilter).toEqual(view.entry.privacyFilter);
    expect(view.privacyFilter).toMatchObject({
      provider: "mock",
      model: null,
      totalSentences: 3,
      keptSentences: 1,
      redactions: {},
    });
    expect(Object.keys(view.privacyFilter ?? {}).sort()).toEqual(
      ["filteredAt", "keptSentences", "model", "provider", "redactions", "totalSentences"],
    );
  });

  it("never stores removed sentences or redacted details anywhere in the local DB", async () => {
    const body =
      "My right knee aches about 6 out of 10 tonight. Ask Dr. Park, and my neighbour Linda Okoro (617-555-0142, linda.o@example.com) can drive me. The quarterly budget review moved to Friday.";
    const view = await createManualEntry(maya(), { body });
    expect(view.entry.body).toBe(
      "My right knee aches about 6 out of 10 tonight. Ask Dr. Park, and my neighbour [name] ([phone], [email]) can drive me.",
    );
    expect(view.privacyFilter?.redactions).toEqual({ person_name: 1, phone: 1, email: 1 });

    await approveEntry(maya(), view.entry.id);
    const everything = JSON.stringify(getLocalDb().data);
    for (const gone of ["quarterly budget", "Linda", "Okoro", "617-555", "555-0142", "linda.o", "Friday"]) {
      expect(everything).not.toContain(gone);
    }
    expect(everything).toContain("[name]");
  });

  it("asks to rephrase when nothing health-related is left, and saves nothing", async () => {
    const before = (await listPatientTimeline(maya())).length;
    await expect(createManualEntry(maya(), { body: "We need oats and bananas. Chloe is visiting Lisbon." })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Nothing related to your health or recovery was found, so nothing was saved.",
    });
    expect((await listPatientTimeline(maya())).length).toBe(before);
  });

  it("accepts up to 20,000 raw chars but the filtered body must still fit 8,000", async () => {
    const filler = "My knee aches a little today. ".repeat(300); // ~9,000 chars, all kept
    await expect(createManualEntry(maya(), { body: filler })).rejects.toThrow(/trim it/i);
    const mostlyNoise = `${"The quarterly budget moved again. ".repeat(500)}My knee aches today.`; // ~17,000 chars
    const view = await createManualEntry(maya(), { body: mostlyNoise });
    expect(view.entry.body).toBe("My knee aches today.");
    await expect(createManualEntry(maya(), { body: "x".repeat(20_001) })).rejects.toThrow(/20000/);
  });
});

describe("edits re-filter", () => {
  it("filters a changed body again, updates the receipt and re-extracts", async () => {
    const created = await createManualEntry(maya(), { body: "My knee aches about 5 out of 10." });
    const updated = await updateEntryText(maya(), created.entry.id, {
      body: "My knee aches about 7 out of 10. The new sofa is blue. My friend Sam Reed texted 617-555-0199.",
    });
    expect(updated.entry.body).toBe("My knee aches about 7 out of 10.");
    expect(updated.privacyFilter).toMatchObject({ totalSentences: 3, keptSentences: 1 });
    expect(updated.entry.editedByPatient).toBe(true);
    expect(updated.observations.some((o) => o.severity === 7)).toBe(true);
    expect(JSON.stringify(getLocalDb().data)).not.toMatch(/sofa|Sam Reed|0199/);
  });

  it("rejects an edit with nothing left and keeps the old text", async () => {
    const created = await createManualEntry(maya(), { body: "My knee aches about 5 out of 10." });
    await expect(updateEntryText(maya(), created.entry.id, { body: "Nice weather." })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const [view] = (await listPatientTimeline(maya())).filter((v) => v.entry.id === created.entry.id);
    expect(view.entry.body).toBe("My knee aches about 5 out of 10.");
  });

  it("keeps the receipt when only the time changes", async () => {
    const created = await createManualEntry(maya(), { body: NOISY });
    const moved = await updateEntryText(maya(), created.entry.id, { occurredAt: new Date(Date.now() - 3600_000).toISOString() });
    expect(moved.privacyFilter).toEqual(created.privacyFilter);
  });
});

describe("voice", () => {
  it("filters patient turns before the entry is created", async () => {
    const { session } = await startVoiceSession(maya());
    const result = await completeVoiceSession(maya(), session.id, {
      transcript: [
        { role: "agent", text: "How is your knee?", at: null },
        { role: "patient", text: "My knee is a 5 out of 10 today. My neighbour Linda Okoro can call 617-555-0142 about my appointment.", at: null },
        { role: "patient", text: "I am also planning a holiday to Lisbon next spring.", at: null },
      ],
      confirmedNotes: ["Knee 5/10; Linda Okoro may drive me to the appointment"],
    });
    expect(result.entry?.entry.body).toBe("My knee is a 5 out of 10 today. My neighbour [name] can call [phone] about my appointment.");
    expect(result.entry?.privacyFilter).toMatchObject({ keptSentences: 2, totalSentences: 3 });

    // The raw call transcript and in-call notes are never persisted: only the filtered entry is.
    const stored = await getSystemRepository().getVoiceSession(session.id);
    expect(stored?.transcript).toEqual([]);
    expect(stored?.confirmedNotes).toEqual([]);
    expect(JSON.stringify(getLocalDb().data)).not.toMatch(/Lisbon|Linda|Okoro|617-555-0142|How is your knee/);
  });

  it("creates no entry or source reference when nothing health-related was said", async () => {
    const { session } = await startVoiceSession(maya());
    await expect(
      completeVoiceSession(maya(), session.id, {
        transcript: [{ role: "patient", text: "Remind me to buy oats.", at: null }],
        confirmedNotes: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(getLocalDb().data.sourceRefs.filter((r) => r.externalId === null && r.provider === "elevenlabs")).toHaveLength(0);
  });
});

describe("vexo import", () => {
  it("'Lunch with Chloe' stores only the knee sentences with a receipt and privacyFiltered metadata", async () => {
    const preview = await previewVexoImport(maya(), range());
    const lunch = preview.candidates.find((c) => c.title === "Lunch with Chloe");
    expect(lunch).toBeDefined();
    const result = await importVexoMemories(maya(), { items: [{ externalId: lunch!.id, excerpt: lunch!.excerpt }] });
    expect(result.filteredOutExternalIds).toEqual([]);
    const [view] = result.entries;
    expect(view.entry.body).toBe(
      "Oh, and my knee has been aching all morning and I'm a bit worried about it. It is around a 6 out of 10 today.",
    );
    expect(view.entry.body).not.toMatch(/Chloe|Lisbon|balcony/);
    expect(view.privacyFilter).toMatchObject({ totalSentences: 7, keptSentences: 2 });
    const refs = await getRepository(maya()).listSourceRefs([view.entry.sourceRefId as string]);
    expect(refs[0].excerpt).toBeNull();
    expect(refs[0].metadata.privacyFiltered).toBe(true);
    expect(JSON.stringify(getLocalDb().data)).not.toMatch(/Lisbon|balcony|reorganisation/);
  });

  it("hides the neighbour, phone and address in the other recordings", async () => {
    const preview = await previewVexoImport(maya(), range());
    const items = preview.candidates
      .filter((c) => ["After physio", "Questions for my care team"].includes(c.title ?? ""))
      .map((c) => ({ externalId: c.id, excerpt: c.excerpt }));
    expect(items).toHaveLength(2);
    const result = await importVexoMemories(maya(), { items });
    const bodies = result.entries.map((e) => e.entry.body).join("\n");
    expect(bodies).toContain("[address]");
    expect(bodies).toContain("[phone]");
    expect(bodies).toContain("[name]");
    expect(bodies).toContain("Dr. Park");
    expect(bodies).not.toMatch(/Beacon|Linda|Okoro|617/);
    const everything = JSON.stringify(getLocalDb().data);
    expect(everything).not.toMatch(/Beacon Street|Linda Okoro|617-555/);
  });

  it("skips an item with nothing kept without failing the batch, creating no source ref or entry", async () => {
    const preview = await previewVexoImport(maya(), range());
    const lunch = preview.candidates.find((c) => c.title === "Lunch with Chloe")!;
    const stairs = preview.candidates.find((c) => c.title === "Stairs at home")!;
    // The patient trimmed the memory down to the part that is only about Chloe.
    const chloeOnly = "Chloe was telling me about her new manager and the reorganisation at her company.";
    const refsBefore = getLocalDb().data.sourceRefs.length;
    const entriesBefore = getLocalDb().data.entries.length;

    const result = await importVexoMemories(maya(), {
      items: [
        { externalId: lunch.id, excerpt: chloeOnly },
        { externalId: stairs.id, excerpt: stairs.excerpt },
      ],
    });
    expect(result.filteredOutExternalIds).toEqual([lunch.id]);
    expect(result.entries).toHaveLength(1);
    expect(getLocalDb().data.sourceRefs.length).toBe(refsBefore + 1);
    expect(getLocalDb().data.entries.length).toBe(entriesBefore + 1);
    // Nothing was stored for it, so it can still be imported later.
    expect(JSON.stringify(getLocalDb().data)).not.toContain("reorganisation");
    const again = await importVexoMemories(maya(), { items: [{ externalId: lunch.id, excerpt: lunch.excerpt }] });
    expect(again.entries).toHaveLength(1);
  });
});

describe("what doctors see", () => {
  it("shows the filtered text and the counts-only receipt, never anything removed", async () => {
    const view = await createManualEntry(maya(), {
      body: "My knee aches about 6 out of 10. My neighbour Linda Okoro said call 617-555-0142 about my appointment. The sofa is blue.",
    });
    await approveEntry(maya(), view.entry.id);

    const record = await getSharedRecord(drPark(), view.entry.id);
    expect(record.entry.body).toBe(
      "My knee aches about 6 out of 10. My neighbour [name] said call [phone] about my appointment.",
    );
    expect(record.privacyFilter).toMatchObject({ totalSentences: 3, keptSentences: 2, redactions: { person_name: 1, phone: 1 } });
    const detail = await getDoctorPatientDetail(drPark(), patientIdOf(maya()));
    const listed = detail.entries.find((e) => e.entry.id === view.entry.id);
    expect(listed?.privacyFilter?.keptSentences).toBe(2);
    expect(JSON.stringify([record, detail])).not.toMatch(/Linda|Okoro|617|sofa/);
  });

  it("shows the seeded Maya band entry with its receipt", async () => {
    const detail = await getDoctorPatientDetail(drPark(), patientIdOf(maya()));
    const seeded = detail.entries.find((e) => e.entry.body.includes("[name]"));
    expect(seeded?.privacyFilter).toMatchObject({ provider: "mock", redactions: { person_name: 1 } });
    const dash = await getPatientDashboard(maya());
    expect(dash.recentEntries.some((e) => e.privacyFilter !== null)).toBe(true);
  });
});

describe("the receipt is system-only", () => {
  it("the patient repository can neither create an entry with a receipt nor patch one", async () => {
    const view = await createManualEntry(maya(), { body: "My knee aches about 6 out of 10." });
    const receipt = { ...view.privacyFilter!, keptSentences: 99 };
    const actorRepo = getRepository(maya());
    await expect(actorRepo.updateEntry(view.entry.id, { privacyFilter: receipt })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(actorRepo.updateEntry(view.entry.id, { privacyFilter: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      actorRepo.createEntry({
        patientId: patientIdOf(maya()),
        source: "manual",
        body: "x",
        occurredAt: new Date().toISOString(),
        reviewStatus: "pending_review",
        reviewedByPatientAt: null,
        processingStatus: "processing",
        processingError: null,
        sourceRefId: null,
        voiceSessionId: null,
        editedByPatient: false,
        privacyFilter: receipt,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const stored = await getSystemRepository().getEntry(view.entry.id);
    expect(stored?.privacyFilter?.keptSentences).toBe(1);
  });
});
