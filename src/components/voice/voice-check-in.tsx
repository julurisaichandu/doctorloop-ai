"use client";

import { FlaskConical } from "lucide-react";
import { LiveCheckIn } from "./live-session";
import { SimulatedCheckIn } from "./simulated-session";

export function VoiceCheckIn({
  patientFirstName,
  mode,
}: {
  patientFirstName: string;
  mode: "elevenlabs" | "simulated";
}) {
  return (
    <section aria-label="Voice check-in" className="space-y-4">
      <p className="max-w-xl text-[15px] text-muted-foreground">
        Describe how you are feeling in your own words. This is for recording updates, not for emergencies or medical
        advice.
      </p>
      {mode === "simulated" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-bone bg-paper-2 px-4 py-3">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-deep" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-ink">Simulated check-in — ElevenLabs credentials not configured.</span>{" "}
            A scripted assistant stands in for the voice agent. Your typed answers go through the same review flow.
          </p>
        </div>
      ) : null}
      {mode === "elevenlabs" ? (
        <LiveCheckIn patientFirstName={patientFirstName} />
      ) : (
        <SimulatedCheckIn patientFirstName={patientFirstName} />
      )}
    </section>
  );
}
