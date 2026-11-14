import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/lib/data";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { readPhoto } from "@/lib/photos/storage";
import { approveEntry } from "@/lib/services/patient";
import { addPhotoEntry } from "@/lib/services/photos";
import { drPark, KNEE_NOTE, maya } from "./support";

const jpeg = (withGps = false) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: "#c86" } })
    .withExif(withGps ? { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 46/1 30/1" } } : {})
    .jpeg()
    .toBuffer();

beforeEach(() => resetLocalDb());

describe("addPhotoEntry", () => {
  it("creates a pending manual entry linked to a photo ref", async () => {
    const view = await addPhotoEntry(maya(), { photo: await jpeg(), note: KNEE_NOTE });
    expect(view.entry).toMatchObject({ source: "manual", reviewStatus: "pending_review" });
    expect(view.sourceRef?.metadata).toMatchObject({ kind: "photo", width: 64, height: 48 });
  });

  it("strips GPS EXIF from the stored bytes", async () => {
    const input = await jpeg(true);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const view = await addPhotoEntry(maya(), { photo: input });
    const stored = await readPhoto(String(view.sourceRef?.metadata.storagePath));
    expect(stored).not.toBeNull();
    expect((await sharp(stored!).metadata()).exif).toBeUndefined();
  });

  it("accepts a photo without a note", async () => {
    const view = await addPhotoEntry(maya(), { photo: await jpeg() });
    expect(view.entry.body).toBe("");
    expect(view.entry.processingStatus).toBe("processed");
  });

  it("rejects non-image bytes", async () => {
    await expect(addPhotoEntry(maya(), { photo: new Uint8Array([1, 2, 3, 4]) })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("hides the photo ref from a doctor until the patient approves", async () => {
    const view = await addPhotoEntry(maya(), { photo: await jpeg() });
    const refId = view.sourceRef!.id;
    expect(await getRepository(drPark()).listSourceRefs([refId])).toHaveLength(0);
    await approveEntry(maya(), view.entry.id);
    expect(await getRepository(drPark()).listSourceRefs([refId])).toHaveLength(1);
  });
});
