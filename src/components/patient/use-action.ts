"use client";

import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/domain/types";

interface RunOptions<T> {
  /** Toast shown on success. Omit for no toast. */
  success?: string;
  onSuccess?: (data: T) => void;
  onError?: (message: string) => void;
}

/** Runs a server action inside a transition, surfacing the safe error message as a toast. */
export function useServerAction() {
  const [pending, startTransition] = useTransition();

  const run = useCallback(<T,>(action: () => Promise<ActionResult<T>>, options: RunOptions<T> = {}) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (options.success) toast.success(options.success);
          options.onSuccess?.(result.data);
        } else {
          toast.error(result.error);
          options.onError?.(result.error);
        }
      } catch {
        const message = "Something went wrong. Please try again.";
        toast.error(message);
        options.onError?.(message);
      }
    });
  }, []);

  return { pending, run };
}
