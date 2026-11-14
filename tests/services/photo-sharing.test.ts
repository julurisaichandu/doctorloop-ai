import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/domain/types";
import { getRepository, getSystemRepository } from "@/lib/data";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { getSharedRecord } from "@/lib/services/doctor";
import { approveEntry, revokeEntry, updateEntryText } from "@/lib/services/patient";
import { addPhotoEntry } from "@/lib/services/photos";
import { drBell, drPark, KNEE_NOTE, maya } from "./support";

const session = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("@/lib/auth/session", () => ({ getActor: async () => session.actor }));

const { GET } = await import("@/app/api/photos/[photoId]/route");

const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#c86" } }).jpeg().toBuffer();

async function fetchPhoto(as: Actor | null, photoId: string): Promise<Response> {
  session.actor = as;
  return GET(new Request(`http://localhost/api/photos/${photoId}`), { params: Promise.resolve({ photoId }) });
}

beforeEach(() => {
  resetLocalDb();
  session.actor = null;
});

describe("sharing a photo entry with the care team", () => {
  it("a photo-only entry can be approved, is summarized, and reaches the doctor without its storage path", async () => {
    const view = await addPhotoEntry(maya(), { photo: await jpeg() });
    await approveEntry(maya(), view.entry.id);

    const clinician = await getSystemRepository().getLatestSummary(view.entry.patientId, "clinician");
    expect(clinician).not.toBeNull();

    const shared = await getSharedRecord(drPark(), view.entry.id);
    expect(shared.sourceRef?.metadata).toEqual({ kind: "photo", width: 64, height: 48 });
  });

  it("stopping sharing hides the photo from the doctor again; an unassigned doctor never sees it", async () => {
    const view = await addPhotoEntry(maya(), { photo: await jpeg() });
    const refId = view.sourceRef!.id;
    await approveEntry(maya(), view.entry.id);
    expect(await getRepository(drBell()).listSourceRefs([refId])).toHaveLength(0);
    await revokeEntry(maya(), view.entry.id);
    expect(await getRepository(drPark()).listSourceRefs([refId])).toHaveLength(0);
  });

  it("text added later to a pending photo-only entry is filtered and extracted", async () => {
    const view = await addPhotoEntry(maya(), { photo: await jpeg() });
    const updated = await updateEntryText(maya(), view.entry.id, { body: KNEE_NOTE });
    expect(updated.entry.body.length).toBeGreaterThan(0);
    expect(updated.entry.processingStatus).toBe("processed");
    expect(updated.observations.length).toBeGreaterThan(0);
    expect(updated.sourceRef?.metadata.kind).toBe("photo");
  });
});

describe("GET /api/photos/[photoId]", () => {
  it("serves the patient, the assigned doctor only after sharing, and nobody signed out", async () => {
    const view = await addPhotoEntry(maya(), { photo: await jpeg() });
    const id = view.sourceRef!.id;

    const own = await fetchPhoto(maya(), id);
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("image/jpeg");
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect((await sharp(Buffer.from(await own.arrayBuffer())).metadata()).format).toBe("jpeg");

    expect((await fetchPhoto(drPark(), id)).status).toBe(404);
    await approveEntry(maya(), view.entry.id);
    expect((await fetchPhoto(drPark(), id)).status).toBe(200);
    expect((await fetchPhoto(drBell(), id)).status).toBe(404);
    expect((await fetchPhoto(null, id)).status).toBe(401);
    expect((await fetchPhoto(maya(), "not-a-uuid")).status).toBe(404);
  });
});
