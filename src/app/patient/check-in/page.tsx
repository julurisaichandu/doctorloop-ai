import { ShieldAlert } from "lucide-react";
import { ManualEntryForm } from "@/components/patient/manual-entry-form";
import { ClinicalDisclaimer } from "@/components/shared/clinical-disclaimer";
import { VoiceCheckIn } from "@/components/voice/voice-check-in";
import { requireActor } from "@/lib/auth/session";
import { getIntegrationStatus } from "@/lib/config/env";
import { CheckInTabs } from "./check-in-tabs";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CheckInPage({ searchParams }: { searchParams: SearchParams }) {
  const [actor, params] = await Promise.all([requireActor("patient"), searchParams]);
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const voiceMode = getIntegrationStatus().voice.mode;
  const firstName = actor.fullName.split(" ")[0] ?? actor.fullName;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <header>
        <p className="eyebrow mb-3 flex items-center gap-2 text-muted-foreground">
          <span className="h-px w-5 bg-ink" aria-hidden />
          Check-in
        </p>
        <h1 className="font-display text-4xl leading-[1.05] text-balance sm:text-6xl">
          Daily <em>check-in</em>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          Tell us how your recovery is going. You will review everything before it is shared.
        </p>
      </header>

      <p className="flex items-start gap-3 rounded-2xl border border-hairline bg-paper-2 px-4 py-3 text-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
        <span>
          <span className="eyebrow mr-2 text-ink">Note</span>
          Not for emergencies. If you need urgent help, call your local emergency number.
        </span>
      </p>

      <CheckInTabs
        initialTab={tab === "write" ? "write" : "voice"}
        voice={<VoiceCheckIn patientFirstName={firstName} mode={voiceMode} />}
        write={<ManualEntryForm />}
      />

      <ClinicalDisclaimer variant="patient" />
    </div>
  );
}
