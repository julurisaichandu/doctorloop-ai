import { notFound } from "next/navigation";
import { isAppError } from "@/lib/errors";

/** Awaits a service call; NOT_FOUND / FORBIDDEN become a 404 page, everything else propagates to the error boundary. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }
}
