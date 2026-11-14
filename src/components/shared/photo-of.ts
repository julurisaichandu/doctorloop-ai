import type { SourceReference } from "@/lib/domain/types";

/** The photo of a photo entry's source reference (served by the authorizing /api/photos route), or null. */
export function photoOf(
  ref: SourceReference | null | undefined,
): { src: string; width: number; height: number } | null {
  const md = ref?.metadata;
  if (!ref || md?.kind !== "photo") return null;
  const { width, height } = md;
  if (typeof width !== "number" || typeof height !== "number") return null;
  return { src: `/api/photos/${ref.id}`, width, height };
}
