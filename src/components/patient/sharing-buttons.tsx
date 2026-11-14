"use client";

import { Share2, ShieldOff } from "lucide-react";
import { revokeEntryAction, approveEntryAction } from "@/app/patient/actions";
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
import { useServerAction } from "./use-action";

/** Approved entry -> private, after confirmation. */
export function StopSharingButton({ entryId }: { entryId: string }) {
  const { pending, run } = useServerAction();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-full px-3.5" disabled={pending}>
          {pending ? <Spinner /> : <ShieldOff />}
          Stop sharing
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl font-normal">Stop sharing this update?</AlertDialogTitle>
          <AlertDialogDescription>
            Your care team will no longer see it, and their summary will be rebuilt without it. You can share it again
            later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Keep sharing</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-full"
            onClick={() => run(() => revokeEntryAction({ entryId }), { success: "Update is now private." })}
          >
            Stop sharing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Private entry -> shared with the care team. */
export function ShareEntryButton({ entryId }: { entryId: string }) {
  const { pending, run } = useServerAction();
  return (
    <Button
      size="sm"
      className="h-8 rounded-full px-3.5"
      disabled={pending}
      onClick={() => run(() => approveEntryAction({ entryId }), { success: "Shared with your care team." })}
    >
      {pending ? <Spinner /> : <Share2 />}
      Share with care team
    </Button>
  );
}
