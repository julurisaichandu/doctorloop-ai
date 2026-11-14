"use client";

import { useState, useTransition } from "react";
import { AlertCircle, SearchX, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { pillOnInk, pillPrimary } from "@/components/patient/quick-log/styles";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { importVexoAction, previewVexoAction } from "@/app/patient/import/actions";
import type { VexoImportResult, VexoPreview } from "@/lib/services/vexo";
import { cn } from "@/lib/utils";
import { ImportSuccess } from "./import-success";
import { isValidExcerpt, MemoryCandidate } from "./memory-candidate";
import { FilteredStrip, MemoryScan } from "./memory-stream";

const PRESETS = [3, 7, 14] as const;
const KEYWORD_IDEAS = ["knee", "sleep", "walking", "pain"] as const;
type Days = (typeof PRESETS)[number];

export function ImportWorkspace({ connected, replayFile }: { connected: boolean; replayFile?: string }) {
  const [days, setDays] = useState<Days>(7);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<VexoPreview | null>(null);
  const [previewId, setPreviewId] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [excerpts, setExcerpts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VexoImportResult | null>(null);
  const [searching, startSearch] = useTransition();
  const [importing, startImport] = useTransition();

  const chosen = (preview?.candidates ?? []).filter(
    (c) => selected[c.id] && !c.alreadyImported && isValidExcerpt(excerpts[c.id] ?? "", c.excerpt),
  );

  function runPreview() {
    setError(null);
    startSearch(async () => {
      const response = await previewVexoAction({ days, query: query.trim() || undefined });
      if (!response.ok) {
        setError(response.error);
        toast.error(response.error);
        return;
      }
      setPreview(response.data);
      setPreviewId((n) => n + 1);
      setSelected({});
      setExcerpts(Object.fromEntries(response.data.candidates.map((c) => [c.id, c.excerpt])));
    });
  }

  function runImport() {
    setError(null);
    startImport(async () => {
      const response = await importVexoAction({
        items: chosen.map((c) => ({
          externalId: c.id,
          excerpt: excerpts[c.id] ?? c.excerpt,
          query: c.provenance.query,
        })),
      });
      if (!response.ok) {
        setError(response.error);
        toast.error(response.error);
        return;
      }
      setResult(response.data);
      setPreview(null);
      toast.success("Imported for your review. Nothing is shared yet.");
    });
  }

  if (result) {
    return <ImportSuccess result={result} onReset={() => setResult(null)} />;
  }

  const count = chosen.length;

  return (
    <div className="space-y-5">
      <form
        className="rounded-[28px] border border-hairline bg-paper-2 p-5 sm:p-7"
        onSubmit={(event) => {
          event.preventDefault();
          runPreview();
        }}
      >
        <p className="eyebrow text-muted-foreground">Memory stream</p>
        <h2 className="font-display mt-2 text-3xl leading-[1.1]">
          What should we <em>look for?</em>
        </h2>

        <div className="mt-6 grid gap-6 md:grid-cols-[auto_1fr] md:gap-8">
          <div className="space-y-2">
            <span className="eyebrow block text-muted-foreground" id="vexo-range-label">
              Time range
            </span>
            <div role="group" aria-labelledby="vexo-range-label" className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => {
                const on = days === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(preset)}
                    className={cn(
                      "h-10 rounded-full border px-4 text-sm font-medium transition-[background-color,color,transform] active:scale-95",
                      on ? "border-ink bg-ink text-paper" : "border-hairline bg-paper text-ink hover:bg-paper-3",
                    )}
                  >
                    Last {preset} days
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <label className="eyebrow block text-muted-foreground" htmlFor="vexo-query">
              Keywords (optional)
            </label>
            <Input
              id="vexo-query"
              value={query}
              maxLength={120}
              placeholder="e.g. knee, sleep, walking"
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 rounded-full border-hairline bg-paper px-4"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5" role="group" aria-label="Keyword ideas">
              {KEYWORD_IDEAS.map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => setQuery(word)}
                  className="h-7 rounded-full border border-hairline px-3 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-paper-3 hover:text-ink"
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-hairline pt-5">
          <Button type="submit" size="lg" className={pillPrimary} disabled={searching || !connected}>
            {searching ? <Spinner /> : <Sparkles />} Find health-related memories
          </Button>
          <p className="text-xs text-muted-foreground">Read-only. Nothing is stored until you import.</p>
          {replayFile ? (
            <p className="eyebrow text-muted-foreground">Band replay · {replayFile}</p>
          ) : null}
        </div>
      </form>

      {!connected ? (
        <Note title={replayFile ? "Band file not available" : "Vexo is not connected"} tone="info">
          {replayFile
            ? "The band replay file cannot be used (see the connection card above), so there is nothing to search."
            : "Connect your Vexo account above to search your memories."}
        </Note>
      ) : null}

      {error ? (
        <Note title="Something went wrong" tone="error">
          {error}
        </Note>
      ) : null}

      {searching ? <MemoryScan /> : null}

      {preview && !searching ? (
        <>
          <FilteredStrip key={previewId} count={preview.excludedCount} />
          {preview.candidates.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No health-related memories found"
              description="Try a longer time range or different keywords."
            />
          ) : (
            <div className="space-y-3">
              <p className="eyebrow text-muted-foreground">
                {preview.candidates.length === 1 ? "1 relevant memory" : `${preview.candidates.length} relevant memories`}
              </p>
              {preview.candidates.map((candidate, index) => (
                <MemoryCandidate
                  key={candidate.id}
                  index={index}
                  candidate={candidate}
                  selected={Boolean(selected[candidate.id])}
                  excerpt={excerpts[candidate.id] ?? candidate.excerpt}
                  onSelectedChange={(value) => setSelected((prev) => ({ ...prev, [candidate.id]: value }))}
                  onExcerptChange={(value) => setExcerpts((prev) => ({ ...prev, [candidate.id]: value }))}
                />
              ))}
            </div>
          )}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[28px] bg-ink p-3 pl-6 text-paper">
            <p className="flex items-baseline gap-2" aria-live="polite">
              <span className="font-mono text-2xl leading-none text-lime">{count}</span>
              <span className="eyebrow text-muted-ink">{count === 1 ? "memory selected" : "memories selected"}</span>
            </p>
            <Button onClick={runImport} disabled={count === 0 || importing} className={cn(pillOnInk, "h-11")}>
              {importing ? <Spinner /> : null} Import selected ({count})
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Note({ title, tone, children }: { title: string; tone: "info" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-2xl border bg-paper-2 px-4 py-3.5",
        tone === "error" ? "border-vermilion" : "border-hairline",
      )}
    >
      <AlertCircle
        className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-vermilion-deep" : "text-ink")}
        strokeWidth={1.5}
        aria-hidden
      />
      <div className="text-sm">
        <p className="eyebrow text-ink">{title}</p>
        <p className="mt-1 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
