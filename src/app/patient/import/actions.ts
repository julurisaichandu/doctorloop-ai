"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { toActionResult, validationError } from "@/lib/errors";
import {
  importVexoMemories,
  previewVexoImport,
  type VexoImportResult,
  type VexoPreview,
} from "@/lib/services/vexo";

const DAY_MS = 86_400_000;

const previewSchema = z.object({
  days: z.union([z.literal(3), z.literal(7), z.literal(14)]),
  query: z.string().trim().max(120).optional(),
});

const importSchema = z.object({
  items: z
    .array(
      z.object({
        externalId: z.string().min(1).max(200),
        excerpt: z.string().trim().min(1).max(4000),
        query: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function previewVexoAction(input: unknown) {
  return toActionResult<VexoPreview>(async () => {
    const parsed = parseInput(previewSchema, input);
    const actor = await requireActor("patient");
    const to = new Date();
    const from = new Date(to.getTime() - parsed.days * DAY_MS);
    return previewVexoImport(actor, {
      query: parsed.query || undefined,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  });
}

export async function importVexoAction(input: unknown) {
  return toActionResult<VexoImportResult>(async () => {
    const parsed = parseInput(importSchema, input);
    const actor = await requireActor("patient");
    const result = await importVexoMemories(actor, parsed);
    for (const path of ["/patient", "/patient/review", "/patient/timeline", "/patient/import"]) {
      revalidatePath(path);
    }
    return result;
  });
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError("Please check your selection and try again.");
  return result.data;
}
