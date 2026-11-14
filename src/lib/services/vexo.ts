import "server-only";
import { createHash } from "node:crypto";
import { assertPatientSelf } from "@/lib/authz/policies";
import { env } from "@/lib/config/env";
import { getRepository, getSystemRepository } from "@/lib/data";
import type { Actor, TimelineEntryView } from "@/lib/domain/types";
import { validationError } from "@/lib/errors";
import { getVexoAdapter } from "@/lib/integrations/vexo";
import { bandFileName, FileVexoAdapter } from "@/lib/integrations/vexo/file-adapter";
import { classifyHealthRelevance } from "@/lib/integrations/vexo/relevance";
import type { VexoMemory } from "@/lib/integrations/vexo/types";
import { revokeVexoTokens } from "@/lib/integrations/vexo/oauth-flow";
import { applyPrivacyFilter, assertStorableBody, ingestFilteredEntry } from "@/lib/services/ingest";
import { refreshPatientSummary } from "@/lib/services/summaries";

const MAX_RANGE_DAYS = 31;
const DAY_MS = 86_400_000;
const MAX_IMPORT_ITEMS = 20;
const FETCH_LIMIT = 50;

export interface VexoStatus {
  mode: "mock" | "live" | "file";
  connected: boolean;
  label: string;
  /** File mode only: basename of the replayed band file (never a full path). */
  replayFile?: string;
}

export interface VexoCandidate extends VexoMemory {
  matchedTerms: string[];
  alreadyImported: boolean;
}

export interface VexoPreview {
  candidates: VexoCandidate[];
  excludedCount: number;
  mode: "mock" | "live" | "file";
}

export interface VexoImportItem {
  externalId: string;
  /** The (possibly patient-trimmed) excerpt to import. */
  excerpt: string;
  /** Keywords used when the memory was found; recorded as provenance. */
  query?: string;
}

export interface VexoImportResult {
  entries: TimelineEntryView[];
  skippedExternalIds: string[];
  /** Selected memories where the privacy filter kept nothing: no source reference or entry was created. */
  filteredOutExternalIds: string[];
}

const normalizeSpace = (text: string) => text.replace(/\s+/g, " ").trim();

export async function getVexoStatus(actor: Actor): Promise<VexoStatus> {
  assertPatientSelf(actor);
  const adapter = getVexoAdapter();
  if (adapter instanceof FileVexoAdapter) {
    const state = await adapter.inspect(actor.userId);
    const connected = !state.error && !state.wearerMismatch;
    const label = state.error
      ? `Vexo band replay — ${state.error}`
      : state.wearerMismatch
        ? `Vexo band replay — ${state.fileName} belongs to another wearer`
        : `Vexo band replay — ${state.fileName} (simulated band data)`;
    return { mode: "file", connected, label, replayFile: state.fileName };
  }
  const connected = await adapter.isConnected(actor.userId);
  const label =
    adapter.mode === "mock"
      ? "Mock Vexo memories — fictional sample data"
      : connected
        ? "Connected to Vexo (read-only)"
        : "Not connected";
  return { mode: adapter.mode, connected, label };
}

function parseRange(from: string, to: string): { from: string; to: string } {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw validationError("Choose a valid date range.");
  if (toMs <= fromMs) throw validationError("The end of the range must be after its start.");
  if (toMs - fromMs > MAX_RANGE_DAYS * DAY_MS) {
    throw validationError(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);
  }
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

/** External ids of Vexo memories this patient has already imported. */
async function importedExternalIds(actor: Actor, patientId: string): Promise<Set<string>> {
  const repo = getRepository(actor);
  const entries = await repo.listEntries(patientId, { source: ["vexo"] });
  const refIds = entries.flatMap((entry) => (entry.sourceRefId ? [entry.sourceRefId] : []));
  const refs = await repo.listSourceRefs(refIds);
  return new Set(refs.flatMap((ref) => (ref.provider === "vexo" && ref.externalId ? [ref.externalId] : [])));
}

/**
 * Read-only preview. Only health-relevant memories are returned; everything else is
 * counted and dropped. Nothing is persisted.
 */
export async function previewVexoImport(
  actor: Actor,
  input: { query?: string; from: string; to: string },
): Promise<VexoPreview> {
  const patientId = assertPatientSelf(actor);
  const range = parseRange(input.from, input.to);
  const query = input.query?.trim();
  const adapter = getVexoAdapter();

  const memories = query
    ? await adapter.search(actor.userId, { ...range, query, limit: FETCH_LIMIT })
    : await adapter.getContext(actor.userId, { ...range, limit: FETCH_LIMIT });

  const imported = await importedExternalIds(actor, patientId);
  const candidates: VexoCandidate[] = [];
  for (const memory of memories) {
    const { relevant, matchedTerms } = classifyHealthRelevance(`${memory.title ?? ""} ${memory.excerpt}`);
    if (relevant) candidates.push({ ...memory, matchedTerms, alreadyImported: imported.has(memory.id) });
  }
  return { candidates, excludedCount: memories.length - candidates.length, mode: adapter.mode };
}

/** Re-fetch one item and make sure it is a real, recent, health-relevant memory of this patient. */
async function verifyItem(userId: string, item: VexoImportItem): Promise<VexoMemory> {
  const original = await getVexoAdapter().getTranscript(userId, item.externalId);
  if (!original) throw validationError("One of the selected memories could not be found in Vexo.");

  const startedMs = Date.parse(original.startedAt);
  const now = Date.now();
  if (startedMs > now + DAY_MS || startedMs < now - MAX_RANGE_DAYS * DAY_MS) {
    throw validationError("One of the selected memories is outside the importable date range.");
  }
  if (!classifyHealthRelevance(`${original.title ?? ""} ${original.excerpt}`).relevant) {
    throw validationError("Only health-related memories can be imported.");
  }
  const trimmed = normalizeSpace(item.excerpt);
  if (!trimmed || !normalizeSpace(original.excerpt).includes(trimmed)) {
    throw validationError("The excerpt must be taken from the original memory. Trim it, don't rewrite it.");
  }
  return original;
}

/**
 * Import the patient's explicitly selected memories. Each item is re-verified against
 * Vexo, stored with provenance, and run through the normal ingest pipeline. Entries start
 * as pending_review: nothing is shared until the patient approves it.
 */
export async function importVexoMemories(
  actor: Actor,
  input: { items: VexoImportItem[] },
): Promise<VexoImportResult> {
  const patientId = assertPatientSelf(actor);
  if (input.items.length < 1 || input.items.length > MAX_IMPORT_ITEMS) {
    throw validationError(`Select between 1 and ${MAX_IMPORT_ITEMS} memories to import.`);
  }

  const imported = await importedExternalIds(actor, patientId);
  const seen = new Set<string>();
  const skipped: string[] = [];
  const toImport: Array<{ item: VexoImportItem; original: VexoMemory }> = [];

  for (const item of input.items) {
    if (imported.has(item.externalId) || seen.has(item.externalId)) {
      skipped.push(item.externalId);
      continue;
    }
    seen.add(item.externalId);
    toImport.push({ item, original: await verifyItem(actor.userId, item) });
  }

  const adapter = getVexoAdapter();
  const system = getSystemRepository();
  const entries: TimelineEntryView[] = [];
  const filteredOut: string[] = [];
  for (const { item, original } of toImport) {
    const query = item.query?.trim() || undefined;
    // Second privacy layer: each item is filtered exactly once, before anything is stored.
    const filtered = await applyPrivacyFilter(item.excerpt, {
      patientId,
      trigger: { kind: actor.role, userId: actor.userId },
    });
    if (filtered.text.length === 0) {
      filteredOut.push(original.id);
      continue;
    }
    const body = normalizeSpace(filtered.text);
    assertStorableBody({ ...filtered, text: body });
    const trimmedByPatient = normalizeSpace(item.excerpt) !== original.excerpt;
    // No free text in source references: the original lives only as a hash + length.
    const sourceRef = await system.createSourceRef({
      patientId,
      provider: "vexo",
      // A replayed file is simulated data: no MCP server was contacted.
      mode: adapter.mode === "file" ? "simulated" : adapter.mode,
      externalId: original.id,
      title: original.title,
      excerpt: null,
      sourceTimestamp: original.startedAt,
      retrievedAt: new Date().toISOString(),
      metadata: {
        tool: query ? "search" : "get_context",
        ...(query ? { query } : {}),
        ...(adapter.mode === "file" ? { replayFile: bandFileName() } : { mcpServer: env.vexoMcpUrl }),
        originalExcerptSha256: createHash("sha256").update(original.excerpt).digest("hex"),
        originalLength: original.excerpt.length,
        trimmed: trimmedByPatient,
        privacyFiltered: true,
      },
    });
    entries.push(
      await ingestFilteredEntry(
        actor,
        { ...filtered, text: body },
        { source: "vexo", occurredAt: original.startedAt, sourceRefId: sourceRef.id },
        { summarize: false },
      ),
    );
  }
  if (entries.length > 0) await refreshPatientSummary(patientId, { trigger: { kind: "patient", userId: actor.userId } });
  return { entries, skippedExternalIds: skipped, filteredOutExternalIds: filteredOut };
}

export async function disconnectVexo(actor: Actor): Promise<void> {
  assertPatientSelf(actor);
  await revokeVexoTokens(actor.userId);
  await getSystemRepository().deleteVexoConnection(actor.userId);
}
