"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AiProvider, Observation } from "@/lib/domain/types";
import { AnnotatedText, type Annotation } from "@/components/viz/annotated-text";
import { AiGeneratedLabel } from "./ai-generated-label";
import { ObservationItem } from "./observation-item";
import { PatientQuote } from "./patient-quote";

/**
 * The patient's words with highlighted quotes, linked (hover/focus) to the structured
 * observation list so every AI statement can be traced to its source sentence.
 */
export function EntryEvidence({
  body,
  observations,
  meta,
  aiProvider,
  aiModel,
}: {
  body: string;
  observations: Observation[];
  /** Shown directly under the quote (edited flag, provenance...). */
  meta?: ReactNode;
  aiProvider?: AiProvider;
  aiModel?: string | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const annotations: Annotation[] = useMemo(
    () =>
      observations
        .filter((o) => o.patientQuote)
        .map((o) => ({ id: o.id, quote: o.patientQuote, category: o.category, label: o.label })),
    [observations],
  );

  return (
    <>
      <div className="mt-4">
        {body ? (
          <PatientQuote>
            <AnnotatedText text={body} annotations={annotations} activeId={activeId} onActiveChange={setActiveId} />
          </PatientQuote>
        ) : null}
        {meta}
      </div>

      {observations.length > 0 ? (
        <section className="mt-5" aria-label="Structured observations">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h4 className="eyebrow text-muted-foreground">Structured observations</h4>
            <AiGeneratedLabel compact provider={aiProvider} model={aiModel} />
          </div>
          <div className="space-y-2">
            {observations.map((o) => (
              <ObservationItem
                key={o.id}
                observation={o}
                active={activeId === o.id}
                onActiveChange={(on) => setActiveId(on ? o.id : null)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
