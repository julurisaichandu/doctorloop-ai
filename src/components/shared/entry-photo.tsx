"use client";

import type { SourceReference } from "@/lib/domain/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function photoOf(
  ref: SourceReference | null | undefined,
): { src: string; width: number; height: number } | null {
  const md = ref?.metadata;
  if (!ref || md?.kind !== "photo") return null;
  const { width, height } = md;
  if (typeof width !== "number" || typeof height !== "number") return null;
  return { src: `/api/photos/${ref.id}`, width, height };
}

/** Plain <img>: the route is authorized, so next/image's optimizer cannot fetch it. */
export function EntryPhoto({
  photo,
  alt = "Photo added by the patient",
  className,
}: {
  photo: { src: string; width: number; height: number };
  alt?: string;
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={cn("block cursor-zoom-in rounded-xl", className)} aria-label={`${alt}, open full size`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.src}
            alt={alt}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            className="max-h-72 w-auto rounded-xl border object-contain"
          />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(95vw,60rem)] sm:max-w-[min(95vw,60rem)]">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <DialogDescription className="sr-only">Full size view</DialogDescription>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt={alt} className="max-h-[80vh] w-full rounded-xl object-contain" />
      </DialogContent>
    </Dialog>
  );
}
