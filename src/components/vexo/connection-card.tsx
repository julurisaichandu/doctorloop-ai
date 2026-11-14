import { Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pillOnInk, pillOutlineOnInk } from "@/components/patient/quick-log/styles";
import type { VexoStatus } from "@/lib/services/vexo";
import { cn } from "@/lib/utils";

// Fixed decorative bar heights (percent): a "memory stream" waveform, never real data.
const WAVE = [28, 52, 38, 74, 46, 88, 58, 34, 66, 42, 80, 50, 30, 62, 44, 72] as const;

export function ConnectionCard({ status }: { status: VexoStatus }) {
  const replay = status.mode === "file";
  const tag = replay
    ? status.connected
      ? "BAND REPLAY"
      : "NOT CONNECTED"
    : status.mode === "mock"
      ? "MOCK"
      : status.connected
        ? "LIVE"
        : "NOT CONNECTED";
  const lit = status.mode === "mock" || status.connected;
  return (
    <section className="grain relative overflow-hidden rounded-[28px] bg-ink p-6 text-paper sm:p-7">
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-muted-ink">Vexo connection</p>
          <span
            className={cn(
              "eyebrow inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium",
              lit ? "bg-lime text-ink" : "border border-ink-3 text-muted-ink",
            )}
          >
            <span className={cn("size-1.5 rounded-full", lit ? "bg-ink" : "bg-muted-ink")} aria-hidden />
            {tag}
          </span>
        </div>

        <div className="mt-5 flex h-14 items-end gap-1.5" aria-hidden>
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={cn("w-full rounded-full", i % 5 === 2 && lit ? "bg-lime" : "bg-ink-3")}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>

        <p className="font-display mt-5 text-2xl leading-[1.2]">{status.label}</p>
        <p className="mt-2 text-sm text-muted-ink">
          {replay
            ? status.connected
              ? `Vexo band replay: recordings are replayed from the file ${status.replayFile}. This is simulated band data, and no Vexo account is contacted.`
              : `Vexo band replay: the band file ${status.replayFile} cannot be used right now. Fix the file or VEXO_FILE_PATH and refresh.`
            : status.mode === "mock"
              ? "Demo mode: sample memories are fictional and no Vexo account is contacted."
              : "Connect your Vexo account to import wearable memories."}
        </p>

        {status.mode === "live" ? (
          <div className="mt-5">
            {status.connected ? (
              <form method="post" action="/api/integrations/vexo/disconnect">
                <Button type="submit" variant="outline" className={pillOutlineOnInk}>
                  <Link2Off /> Disconnect
                </Button>
              </form>
            ) : (
              <Button asChild className={pillOnInk}>
                <a href="/api/integrations/vexo/connect">
                  <Link2 /> Connect Vexo
                </a>
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
