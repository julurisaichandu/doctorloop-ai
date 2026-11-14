import { SummaryContentSchema } from "@/lib/ai/schemas";
import { callStructured, type OpenAIClientLike } from "@/lib/ai/openai/structured";
import type { Summarizer, SummarizerInput } from "@/lib/ai/types";

export const SUMMARIZER_SYSTEM_PROMPT = `You write a neutral recovery-update summary from a patient's own journal entries. The data is synthetic demo data and the output is labeled "AI-generated, unverified, needs clinician review".

Rules:
- Use ONLY the entries, observations and explicit changes in the JSON input. Do not add facts.
- Every item in mainConcerns, changesSinceEarlier, recoveryActivities and patientQuestions must cite one or more entry ids from the input ("citations"). Cite only ids that appear in the input.
- Quote numbers (e.g. 7/10, 4 hours) only when they appear in the input. Never invent or estimate values.
- Describe changes using the provided explicitChanges; do not interpret them. Do not use words like "worsening", "improving", "concerning", "worrying" or "stable".
- patientQuestions: phrase as the patient's own question.
- dataGaps: missing details worth asking about (from the uncertainties), as short plain sentences.
- Audience "clinician": third person ("Patient reported ..."). Audience "patient": second person ("You reported ...").
- overview: 1-3 neutral sentences about how many updates were shared and the main topics.
- Do NOT diagnose, name conditions, recommend treatment or medication, assess or rate risk, triage, or mention emergencies.`;

const MAX_ENTRY_TEXT = 1500;

export function buildSummarizerUserPrompt(input: SummarizerInput): string {
  return JSON.stringify({
    audience: input.audience,
    patient: { firstName: input.patientFirstName, ...input.patientContext },
    period: { start: input.periodStart, end: input.periodEnd },
    entries: input.entries.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      source: e.source,
      text: e.body.length > MAX_ENTRY_TEXT ? `${e.body.slice(0, MAX_ENTRY_TEXT)}…` : e.body,
    })),
    observations: input.observations.map((o) => ({
      entryId: o.journalEntryId,
      category: o.category,
      label: o.label,
      bodySite: o.bodySite,
      severity: o.severity,
      measure: o.measureValue !== null ? `${o.measureValue} ${o.measureUnit ?? ""}`.trim() : null,
      timeDescription: o.timeDescription,
      context: o.context,
      uncertainties: o.uncertainties,
    })),
    explicitChanges: input.timeline.changes.map((c) => ({
      description: c.description,
      entryIds: [...new Set([c.from.entryId, c.to.entryId])],
    })),
  });
}

export interface OpenAISummarizerOptions {
  client: OpenAIClientLike;
  model: string;
}

export function createOpenAISummarizer({ client, model }: OpenAISummarizerOptions): Summarizer {
  return {
    provider: "openai",
    model,
    summarize(input) {
      return callStructured(client, {
        model,
        name: "recovery_summary",
        schema: SummaryContentSchema,
        system: SUMMARIZER_SYSTEM_PROMPT,
        user: buildSummarizerUserPrompt(input),
      });
    },
  };
}
