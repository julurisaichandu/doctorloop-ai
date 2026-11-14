import { ExtractionResultSchema, type PipelineEntry } from "@/lib/ai/schemas";
import { callStructured, type OpenAIClientLike } from "@/lib/ai/openai/structured";
import type { ObservationExtractor } from "@/lib/ai/types";

export const EXTRACTOR_SYSTEM_PROMPT = `You extract structured observations from ONE patient-written recovery journal entry. The data is synthetic demo data.

Rules:
- Extract only what the patient explicitly stated. Never infer, guess or add information.
- patientQuote must be copied verbatim (exact characters) from the entry text. Use the shortest sentence or phrase that supports the observation.
- severity (0-10) ONLY when the patient stated an explicit numeric rating such as "7/10" or "seven out of ten". Otherwise severity and severityText must be null. Words like "really bad" or "terrible" are NOT a rating.
- measureValue/measureUnit ONLY when a number was stated (e.g. "slept 4 hours" -> 4 / "hours"). Otherwise null.
- observedAt: an ISO-8601 UTC datetime only if the wording ("last night", "yesterday", "this morning") can be resolved unambiguously against the entry timestamp provided; otherwise null. Always copy the patient's time wording into timeDescription when present.
- label: a short neutral label that keeps the patient's wording (e.g. "Knee discomfort", "Sleep", "Walking"). Never a diagnosis.
- category: symptom, sleep, mobility, activity, mood, medication (mention only), wound, question (things the patient wants to ask their care team), or other.
- context: activities or circumstances the patient linked to the observation (e.g. "after physiotherapy").
- uncertainties: missing details worth asking about, such as "Intensity not stated", "Timing not stated", "Duration not stated".
- One observation per distinct finding. Do not duplicate.
- Do NOT diagnose, name conditions, give treatment or medication advice, assess risk, triage, or comment on urgency.
- sourceEntryId must equal the entry id provided.
- If nothing health-relevant was stated, return an empty list.`;

export interface OpenAIExtractorOptions {
  client: OpenAIClientLike;
  model: string;
}

export function buildExtractorUserPrompt(entry: PipelineEntry): string {
  return [
    `Entry id: ${entry.id}`,
    `Entry timestamp (UTC): ${entry.occurredAt}`,
    `Source: ${entry.source}`,
    "Entry text:",
    '"""',
    entry.body,
    '"""',
  ].join("\n");
}

export function createOpenAIExtractor({ client, model }: OpenAIExtractorOptions): ObservationExtractor {
  return {
    provider: "openai",
    model,
    async extract(entry: PipelineEntry) {
      const result = await callStructured(client, {
        model,
        name: "observation_extraction",
        schema: ExtractionResultSchema,
        system: EXTRACTOR_SYSTEM_PROMPT,
        user: buildExtractorUserPrompt(entry),
      });
      return result.observations;
    },
  };
}
