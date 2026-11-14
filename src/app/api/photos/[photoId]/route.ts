import { z } from "zod";
import { getActor } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { readPhoto } from "@/lib/photos/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  if (!z.string().uuid().safeParse(photoId).success) return new Response("Not found", { status: 404 });
  const actor = await getActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });

  // Authorization: RLS (Supabase) or policies (local) decide whether this actor can see the ref.
  const [ref] = await getRepository(actor).listSourceRefs([photoId]);
  if (!ref || ref.metadata.kind !== "photo") return new Response("Not found", { status: 404 });
  const bytes = await readPhoto(String(ref.metadata.storagePath));
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
