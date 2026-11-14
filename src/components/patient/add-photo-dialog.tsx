"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { addPhotoAction } from "@/app/patient/photo-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "./use-action";

const MAX_SIDE = 2048;

/** datetime-local value (YYYY-MM-DDTHH:mm) for a Date, in local time. */
function localValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Downscale to <= 2048px JPEG; falls back to the original file if decoding fails. */
async function downscale(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function AddPhotoDialog() {
  const router = useRouter();
  const { pending, run } = useServerAction();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [max, setMax] = useState("");
  const [preparing, setPreparing] = useState(false);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const now = localValue(new Date());
      setWhen(now);
      setMax(now);
    } else {
      setFile(null);
      setNote("");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setPreparing(true);
    const photo = await downscale(file);
    setPreparing(false);
    const form = new FormData();
    form.set("photo", photo);
    if (note.trim()) form.set("note", note.trim());
    const date = new Date(when);
    if (when && !Number.isNaN(date.getTime())) form.set("occurredAt", date.toISOString());
    run(() => addPhotoAction(form), {
      success: "Photo added to your timeline.",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
    });
  }

  const busy = pending || preparing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full">
          <ImagePlus />
          Add photo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add a photo</DialogTitle>
            <DialogDescription>
              Photos stay private until you share the update. Location data is removed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="photo-file" className="eyebrow text-muted-foreground">
              Photo
            </Label>
            <input
              id="photo-file"
              type="file"
              accept="image/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-full file:border file:border-hairline file:bg-paper file:px-3 file:py-1.5 file:text-sm"
            />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Selected photo preview" className="max-h-56 w-auto rounded-xl border object-contain" />
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="photo-note" className="eyebrow text-muted-foreground">
              Note (optional)
            </Label>
            <Textarea
              id="photo-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              className="rounded-2xl border-hairline bg-paper"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="photo-when" className="eyebrow text-muted-foreground">
              When
            </Label>
            <input
              id="photo-when"
              type="datetime-local"
              value={when}
              max={max}
              onChange={(e) => setWhen(e.target.value)}
              className="h-10 w-full rounded-full border border-hairline bg-paper px-4 text-sm"
            />
          </div>

          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={!file || busy}>
              {busy ? <Spinner /> : null}
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
