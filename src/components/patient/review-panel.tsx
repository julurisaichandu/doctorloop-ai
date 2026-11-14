"use client";

import { useState } from "react";
import { ArrowRight, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { approveEntryAction, rejectEntryAction, setObservationRemovedAction } from "@/app/patient/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { categoryTone } from "@/components/viz/palette";
import type { Observation, TimelineEntryView } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { EditTextDialog } from "./edit-text-dialog";
import { ObservationEditDialog } from "./observation-editor";
import { useServerAction } from "./use-action";

function ObservationRow({
  observation,
  removed,
  onToggle,
  busy,
}: {
  observation: Observation;
  removed: boolean;
  onToggle: () => void;
  busy: boolean;
}) {
  const tone = categoryTone(observation.category);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className={cn("size-2 shrink-0 rounded-full", tone.dot, removed && "opacity-40")} aria-hidden />
        <span className={cn("text-sm", removed ? "text-muted-foreground line-through" : "font-medium")}>
          {observation.label}
        </span>
      </span>
      <div className="flex items-center gap-1">
        {removed ? null : <ObservationEditDialog observation={observation} />}
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onToggle} disabled={busy}>
          {removed ? <RotateCcw /> : <Trash2 />}
          {removed ? "Restore" : "Remove"}
        </Button>
      </div>
    </li>
  );
}

/** Edit, remove and decide on one pending entry. */
export function ReviewPanel({ item, onApproved }: { item: TimelineEntryView; onApproved?: () => void }) {
  const { entry, observations } = item;
  const [removed, setRemoved] = useState<Observation[]>([]);
  const toggle = useServerAction();
  const decide = useServerAction();
  const processing = entry.processingStatus === "processing";

  const remove = (o: Observation) =>
    toggle.run(() => setObservationRemovedAction({ observationId: o.id, removed: true }), {
      success: `Removed "${o.label}".`,
      onSuccess: () => setRemoved((list) => [...list, o]),
    });

  const restore = (o: Observation) =>
    toggle.run(() => setObservationRemovedAction({ observationId: o.id, removed: false }), {
      success: `Restored "${o.label}".`,
      onSuccess: () => setRemoved((list) => list.filter((r) => r.id !== o.id)),
    });

  const restorable = removed.filter((r) => !observations.some((o) => o.id === r.id));

  return (
    <div className="space-y-5">
      {observations.length + restorable.length > 0 ? (
        <section aria-label="Edit observations">
          <h4 className="eyebrow mb-1 text-muted-foreground">Fix or remove what the AI picked up</h4>
          <ul className="divide-y divide-hairline">
            {observations.map((o) => (
              <ObservationRow key={o.id} observation={o} removed={false} onToggle={() => remove(o)} busy={toggle.pending} />
            ))}
            {restorable.map((o) => (
              <ObservationRow key={o.id} observation={o} removed onToggle={() => restore(o)} busy={toggle.pending} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <EditTextDialog entryId={entry.id} body={entry.body} />
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row sm:items-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-11 rounded-full px-5 text-[15px]" disabled={decide.pending}>
                <EyeOff />
                Keep private
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-2xl font-normal">
                  Keep this update private?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Your care team will not see it. You can still share it later from the Recently decided list.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full"
                  onClick={() => decide.run(() => rejectEntryAction({ entryId: entry.id }), { success: "Kept private." })}
                >
                  Keep private
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            className="group/approve h-11 rounded-full px-6 text-[15px]"
            disabled={decide.pending || processing}
            onClick={() =>
              decide.run(() => approveEntryAction({ entryId: entry.id }), {
                success: "Shared with your care team.",
                onSuccess: () => onApproved?.(),
              })
            }
          >
            {decide.pending ? <Spinner /> : null}
            Approve &amp; share
            {decide.pending ? null : (
              <ArrowRight className="transition-transform duration-150 group-hover/approve:translate-x-1" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
