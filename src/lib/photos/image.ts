import "server-only";

import sharp from "sharp";
import { isAppError, validationError } from "@/lib/errors";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export interface NormalizedPhoto {
  data: Buffer;
  width: number;
  height: number;
  contentType: "image/jpeg";
  byteSize: number;
}

/** Validates an upload and re-encodes it as a bounded JPEG. sharp drops EXIF/GPS on output. */
export async function normalizePhoto(input: Uint8Array): Promise<NormalizedPhoto> {
  if (input.byteLength > MAX_PHOTO_BYTES) throw validationError("Photos can be at most 10 MB.");
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
    const { format } = await image.metadata();
    if (format === "heif") throw validationError("HEIC photos are not supported yet. Share the photo as JPEG.");
    if (!format || !ALLOWED_FORMATS.has(format)) throw validationError("Upload a JPEG, PNG or WebP photo.");
    const { data, info } = await image
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, contentType: "image/jpeg", byteSize: data.byteLength };
  } catch (error) {
    if (isAppError(error)) throw error;
    throw validationError("That file is not a valid photo.");
  }
}
