/** Browser microphone helpers for the live voice check-in. */

export type MicResult = { ok: true } | { ok: false; reason: "denied" | "unavailable"; message: string };

const DENIED_MESSAGE = "Microphone access was blocked. Allow it in your browser settings, or use text instead.";

async function isPermissionDenied(): Promise<boolean> {
  try {
    if (!navigator.permissions) return false;
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state === "denied";
  } catch {
    // Not every browser supports querying the microphone permission.
    return false;
  }
}

/** Checks the permission state, then briefly opens the microphone so the browser prompt appears before connecting. */
export async function requestMicrophone(): Promise<MicResult> {
  if (await isPermissionDenied()) return { ok: false, reason: "denied", message: DENIED_MESSAGE };
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: "unavailable",
      message: "This browser cannot access a microphone. Please use text instead.",
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return { ok: true };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { ok: false, reason: "denied", message: DENIED_MESSAGE };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return { ok: false, reason: "unavailable", message: "No microphone was found. Connect one, or use text instead." };
    }
    return { ok: false, reason: "unavailable", message: "The microphone could not be started. Please try again." };
  }
}
