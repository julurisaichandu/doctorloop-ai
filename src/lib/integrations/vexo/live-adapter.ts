/**
 * Vexo integration notes (research, 2026-11-13; public unauthenticated GETs only)
 *
 * - MCP server: https://api.vexoai.com/mcp (Streamable HTTP). Without a token it answers
 *   401 with `WWW-Authenticate: Bearer resource_metadata="https://api.vexoai.com/.well-known/
 *   oauth-protected-resource/mcp", scope="vexo:read"`.
 * - Protected-resource metadata (RFC 9728): resource = https://api.vexoai.com/mcp,
 *   authorization_servers = [https://api.vexoai.com], scopes_supported = [vexo:read],
 *   bearer_methods_supported = [header].
 * - Authorization-server metadata (RFC 8414): authorization_endpoint /oauth/authorize,
 *   token_endpoint /oauth/token, registration_endpoint /oauth/register (dynamic client
 *   registration supported), revocation_endpoint /oauth/revoke, code_challenge_methods = [S256],
 *   grant types authorization_code + refresh_token, token_endpoint_auth_methods = [none]
 *   (public clients), and RFC 9207 `iss` is returned on the redirect.
 *   /.well-known/openid-configuration is 404 (not OIDC).
 * - UNKNOWN (needs the Vexo docs/credentials; tool schemas are only visible after auth):
 *   exact input argument names and result shapes of get_context, search, get_transcript.
 *   They are isolated in TOOL_ARGUMENTS below and results are parsed defensively. Adjust
 *   TOOL_ARGUMENTS / FIELD_ALIASES once the real schemas are known.
 * - Only read-only tools are ever called; the allow-list below is enforced in code.
 */
import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import { integrationError, isAppError } from "@/lib/errors";
import { VexoOAuthProvider } from "./oauth-provider";
import type { VexoAdapter, VexoMemory, VexoRangeQuery, VexoTool } from "./types";

const READ_ONLY_TOOLS: readonly VexoTool[] = ["get_context", "search", "get_transcript"];
const DEFAULT_LIMIT = 50;
const CALL_TIMEOUT_MS = 30_000;

/** Single place that maps our parameters to Vexo's tool argument names (unverified). */
const TOOL_ARGUMENTS = {
  search: (p: VexoRangeQuery & { query: string }) => ({
    query: p.query,
    from: p.from,
    to: p.to,
    limit: p.limit ?? DEFAULT_LIMIT,
  }),
  get_context: (p: VexoRangeQuery) => ({ from: p.from, to: p.to, limit: p.limit ?? DEFAULT_LIMIT }),
  get_transcript: (p: { id: string }) => ({ id: p.id }),
} as const;

/** Candidate field names for each logical field (first present wins). */
const FIELD_ALIASES = {
  id: ["id", "memory_id", "memoryId", "transcript_id", "transcriptId", "uuid"],
  title: ["title", "name", "headline"],
  excerpt: ["excerpt", "text", "content", "summary", "transcript", "snippet", "body"],
  startedAt: ["started_at", "startedAt", "start_time", "startTime", "start", "created_at", "createdAt", "timestamp"],
  endedAt: ["ended_at", "endedAt", "end_time", "endTime", "end"],
} as const;

const recordSchema = z.record(z.string(), z.unknown());
const LIST_KEYS = ["memories", "results", "items", "transcripts", "data", "contexts", "context"];

function pick(raw: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return undefined;
}

function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function toText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const joined = value.map((part) => toText(part) ?? "").filter(Boolean).join(" ");
    return joined || null;
  }
  const record = recordSchema.safeParse(value);
  if (record.success) return toText(pick(record.data, FIELD_ALIASES.excerpt));
  return null;
}

/** Normalize one raw Vexo item; returns null when essential fields are missing. */
export function normalizeVexoItem(raw: unknown, tool: VexoTool, query?: string): VexoMemory | null {
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const idValue = pick(item, FIELD_ALIASES.id);
  const id = typeof idValue === "string" || typeof idValue === "number" ? String(idValue) : null;
  const excerpt = toText(pick(item, FIELD_ALIASES.excerpt));
  const startedAt = toIso(pick(item, FIELD_ALIASES.startedAt));
  if (!id || !excerpt || !startedAt) return null;
  const title = toText(pick(item, FIELD_ALIASES.title));
  return {
    id,
    title,
    excerpt,
    startedAt,
    endedAt: toIso(pick(item, FIELD_ALIASES.endedAt)),
    kind: tool === "get_transcript" || "transcript" in item ? "transcript" : "memory",
    provenance: query ? { tool, query } : { tool },
  };
}

function extractRawItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = recordSchema.safeParse(payload);
  if (!record.success) return [];
  for (const key of LIST_KEYS) {
    if (Array.isArray(record.data[key])) return record.data[key];
  }
  return [record.data];
}

const toolResultSchema = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
  content: z
    .array(z.object({ type: z.string(), text: z.string().optional() }).passthrough())
    .optional(),
});

/** Prefer structuredContent; otherwise parse JSON from text content blocks. */
function readToolPayload(result: unknown): unknown {
  const parsed = toolResultSchema.safeParse(result);
  if (!parsed.success) throw integrationError("Vexo returned an unexpected response.");
  if (parsed.data.isError) throw integrationError("Vexo could not complete the request.");
  if (parsed.data.structuredContent !== undefined) return parsed.data.structuredContent;
  const texts = (parsed.data.content ?? []).flatMap((block) => (block.type === "text" && block.text ? [block.text] : []));
  const parts: unknown[] = [];
  for (const text of texts) {
    try {
      parts.push(JSON.parse(text));
    } catch {
      // Non-JSON prose cannot be turned into a verifiable memory; ignore it.
    }
  }
  return parts.length === 1 ? parts[0] : parts.flatMap((part) => extractRawItems(part));
}

/** Live adapter: read-only MCP calls over Streamable HTTP with per-patient OAuth tokens. */
export class LiveVexoAdapter implements VexoAdapter {
  readonly mode = "live" as const;

  async isConnected(userId: string): Promise<boolean> {
    return (await getSystemRepository().getVexoConnection(userId)) !== null;
  }

  async search(userId: string, params: VexoRangeQuery & { query: string }): Promise<VexoMemory[]> {
    const payload = await this.call(userId, "search", TOOL_ARGUMENTS.search(params));
    return this.normalizeAll(payload, "search", params.query);
  }

  async getContext(userId: string, params: VexoRangeQuery): Promise<VexoMemory[]> {
    const payload = await this.call(userId, "get_context", TOOL_ARGUMENTS.get_context(params));
    return this.normalizeAll(payload, "get_context");
  }

  async getTranscript(userId: string, id: string): Promise<VexoMemory | null> {
    const payload = await this.call(userId, "get_transcript", TOOL_ARGUMENTS.get_transcript({ id }));
    const found = this.normalizeAll(payload, "get_transcript").find((memory) => memory.id === id);
    return found ?? null;
  }

  private normalizeAll(payload: unknown, tool: VexoTool, query?: string): VexoMemory[] {
    return extractRawItems(payload).flatMap((raw) => {
      const memory = normalizeVexoItem(raw, tool, query);
      return memory ? [memory] : [];
    });
  }

  private async call(userId: string, tool: VexoTool, args: Record<string, unknown>): Promise<unknown> {
    if (!READ_ONLY_TOOLS.includes(tool)) throw integrationError("Only read-only Vexo tools are allowed.");
    if (!(await this.isConnected(userId))) throw integrationError("Vexo is not connected.");

    const transport = new StreamableHTTPClientTransport(new URL(env.vexoMcpUrl), {
      authProvider: new VexoOAuthProvider(userId),
    });
    const client = new Client({ name: "doctorloop-ai", version: "0.1.0" });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: tool, arguments: args }, undefined, {
        timeout: CALL_TIMEOUT_MS,
      });
      return readToolPayload(result);
    } catch (error) {
      if (isAppError(error)) throw error;
      console.error("[Vexo] MCP call failed:", error instanceof Error ? error.message : error);
      throw integrationError("Could not reach Vexo. Please reconnect or try again.");
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
