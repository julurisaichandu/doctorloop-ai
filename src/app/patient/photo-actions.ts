"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/domain/types";
import { toActionResult, validationError } from "@/lib/errors";
import { addPhotoEntry } from "@/lib/services/photos";

const PATHS = ["/patient", "/patient/timeline", "/patient/review", "/patient/summary"] as const;
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);

const schema = z.object({
  photo: z
    .instanceof(File, { message: "Choose a photo." })
    .refine((f) => f.size >= 1 && f.size <= 10 * 1024 * 1024, "Photos must be between 1 byte and 10 MB."),
  note: z.preprocess(blank, z.string().trim().max(4000, "Notes can be at most 4000 characters.").optional()),
  occurredAt: z.preprocess(blank, z.iso.datetime({ offset: true }).optional()),
});

export async function addPhotoAction(formData: FormData): Promise<ActionResult<{ entryId: string }>> {
  const actor = await requireActor("patient");
  const result = await toActionResult(async () => {
    const parsed = schema.safeParse({
      photo: formData.get("photo"),
      note: formData.get("note"),
      occurredAt: formData.get("occurredAt"),
    });
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Please check your input.");
    const { photo, note, occurredAt } = parsed.data;
    const view = await addPhotoEntry(actor, { photo: new Uint8Array(await photo.arrayBuffer()), note, occurredAt });
    return { entryId: view.entry.id };
  });
  if (result.ok) for (const path of PATHS) revalidatePath(path);
  return result;
}
