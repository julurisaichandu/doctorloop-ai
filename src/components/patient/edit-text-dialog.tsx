"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updateEntryTextAction } from "@/app/patient/actions";
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
import { cn } from "@/lib/utils";
import { useServerAction } from "./use-action";

const MAX_LENGTH = 20000;

function EditTextForm({ entryId, initial, onDone }: { entryId: string; initial: string; onDone: () => void }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useServerAction();
  const trimmed = text.trim();
  const tooLong = text.length > MAX_LENGTH;
  const unchanged = trimmed === initial.trim();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    run(() => updateEntryTextAction({ entryId, body: trimmed }), {
      success: "Saved. AI re-structured your update.",
      onSuccess: onDone,
      onError: setError,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Label htmlFor={`edit-${entryId}`} className="sr-only">
        Your words
      </Label>
      <Textarea
        id={`edit-${entryId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        className="max-h-[50dvh] min-h-40 resize-y"
        aria-invalid={tooLong}
      />
      <p className={cn("text-right text-xs text-muted-foreground tabular-nums", tooLong && "text-destructive")}>
        {text.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="submit" className="h-9 rounded-full px-5" disabled={pending || !trimmed || tooLong || unchanged}>
          {pending ? <Spinner /> : null}
          {pending ? "AI is structuring your update…" : "Save and re-run AI"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditTextDialog({ entryId, body }: { entryId: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 rounded-full px-4">
          <Pencil />
          Edit text
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Edit your words</DialogTitle>
          <DialogDescription>
            Saving re-runs the AI on your new text, so structured observations you edited by hand will be replaced.
          </DialogDescription>
        </DialogHeader>
        <EditTextForm entryId={entryId} initial={body} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
