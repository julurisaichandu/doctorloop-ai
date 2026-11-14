import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env, getDataBackend } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "entry-photos";
const uuid = z.string().uuid();

export const photoPath = (patientId: string, refId: string): string => `${patientId}/${refId}.jpg`;

function check(photoPathValue: string): string {
  const [patientId, file, ...rest] = photoPathValue.split("/");
  if (rest.length || !file?.endsWith(".jpg") || !uuid.safeParse(patientId).success || !uuid.safeParse(file.slice(0, -4)).success) {
    throw new AppError("INTERNAL", "Invalid photo path.");
  }
  return photoPathValue;
}

const memory = (): Map<string, Uint8Array> => {
  const g = globalThis as { __doctorloopPhotos?: Map<string, Uint8Array> };
  return (g.__doctorloopPhotos ??= new Map());
};
const inMemory = () => env.localDbPath === ":memory:";
const localFile = (p: string) => path.join(path.dirname(env.localDbPath), "photos", p);

let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const { error } = await createSupabaseAdminClient().storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg"],
    });
    if (error && !(String((error as { statusCode?: string }).statusCode) === "409" || /already exists/i.test(error.message))) {
      throw error;
    }
  })().catch((e) => {
    bucketReady = null;
    throw e;
  });
  return bucketReady;
}

export async function putPhoto(photo: string, data: Uint8Array): Promise<void> {
  const p = check(photo);
  if (getDataBackend() === "supabase") {
    await ensureBucket();
    const { error } = await createSupabaseAdminClient()
      .storage.from(BUCKET)
      .upload(p, data, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
  } else if (inMemory()) {
    memory().set(p, data);
  } else {
    await mkdir(path.dirname(localFile(p)), { recursive: true });
    await writeFile(localFile(p), data);
  }
}

export async function readPhoto(photo: string): Promise<Uint8Array | null> {
  const p = check(photo);
  if (getDataBackend() === "supabase") {
    const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(p);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
  if (inMemory()) return memory().get(p) ?? null;
  return readFile(localFile(p)).then((b) => new Uint8Array(b), () => null);
}

export async function removePhoto(photo: string): Promise<void> {
  const p = check(photo);
  if (getDataBackend() === "supabase") {
    await createSupabaseAdminClient().storage.from(BUCKET).remove([p]);
  } else if (inMemory()) {
    memory().delete(p);
  } else {
    await rm(localFile(p), { force: true });
  }
}
