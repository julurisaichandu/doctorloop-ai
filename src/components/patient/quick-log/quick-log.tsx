"use client";

import { ChevronDown, Plus, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BODY_SITES,
  buildSentences,
  EMPTY_QUICK_LOG,
  formatHours,
  hasQuickLogValues,
  MOODS,
  type QuickLogValues,
} from "./sentences";
import { Stepper } from "./stepper";

const NO_SITE = "__none";

/**
 * Optional quick-log composer. It only ever writes plain first-person sentences into the update
 * text (via `onInsert`); the patient edits that text and it remains the only thing submitted.
 */
export function QuickLog({
  onInsert,
  disabled,
}: {
  /** Receives the sentences to append to the textarea. */
  onInsert: (sentences: string[]) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<QuickLogValues>(EMPTY_QUICK_LOG);
  const [justAdded, setJustAdded] = useState(false);
  const set = <K extends keyof QuickLogValues>(key: K, value: QuickLogValues[K]) => {
    setJustAdded(false);
    setValues((v) => ({ ...v, [key]: value }));
  };

  const ready = hasQuickLogValues(values);
  const pct = ((values.discomfort ?? 0) / 10) * 100;
  const panelId = `${uid}-panel`;

  function add() {
    const sentences = buildSentences(values);
    if (sentences.length === 0) return;
    onInsert(sentences);
    setValues(EMPTY_QUICK_LOG);
    setJustAdded(true);
  }

  return (
    <section className="rounded-[20px] border border-hairline bg-paper-3/60" aria-label="Quick log">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 rounded-[20px] px-4 py-3.5 text-left sm:px-5"
      >
        <span>
          <span className="eyebrow block text-muted-foreground">Quick log · optional</span>
          <span className="font-display mt-0.5 block text-2xl leading-tight">Add the numbers, in a tap</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="space-y-6 border-t border-hairline px-4 pt-5 pb-5 sm:px-5">
              {/* Discomfort */}
              <div className="grid gap-5 sm:grid-cols-[1fr_minmax(0,14rem)] sm:items-end">
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <label htmlFor={`${uid}-discomfort`} className="eyebrow text-muted-foreground">
                      Discomfort right now
                    </label>
                    <p className="font-mono" aria-live="polite">
                      <span className={cn("text-3xl leading-none font-medium", values.discomfort === null ? "text-bone" : "text-vermilion-deep")}>
                        {values.discomfort ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground"> / 10</span>
                    </p>
                  </div>
                  <div className="relative mt-3 h-7">
                    <span aria-hidden className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-paper-3 ring-1 ring-hairline ring-inset" />
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full bg-vermilion transition-[width] duration-150"
                      style={{ width: `${pct}%` }}
                    />
                    <input
                      id={`${uid}-discomfort`}
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={values.discomfort ?? 0}
                      disabled={disabled}
                      onChange={(e) => set("discomfort", Number(e.target.value))}
                      aria-valuetext={values.discomfort === null ? "not set" : `${values.discomfort} out of 10`}
                      className={cn(
                        "absolute inset-0 m-0 h-7 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none",
                        "[&::-webkit-slider-runnable-track]:h-7 [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent",
                        "[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-paper-2 [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-ink [&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110",
                        "[&::-moz-range-track]:h-7 [&::-moz-range-track]:bg-transparent",
                        "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-paper-2 [&::-moz-range-thumb]:bg-ink",
                        "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-cobalt focus-visible:[&::-webkit-slider-thumb]:ring-offset-2",
                        values.discomfort === null && "[&::-webkit-slider-thumb]:opacity-60",
                      )}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between px-3 font-mono text-[10px] text-muted-foreground" aria-hidden>
                    {Array.from({ length: 11 }, (_, i) => (
                      <span key={i}>{i}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor={`${uid}-site`} className="eyebrow mb-1.5 block text-muted-foreground">
                    Where
                  </label>
                  <Select
                    value={values.site ?? NO_SITE}
                    onValueChange={(v) => set("site", v === NO_SITE ? null : v)}
                    disabled={disabled}
                  >
                    <SelectTrigger id={`${uid}-site`} className="h-10 w-full rounded-full border-hairline bg-paper-2 px-4">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SITE}>Not specific</SelectItem>
                      {BODY_SITES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-6 border-t border-hairline pt-5 sm:grid-cols-2 sm:gap-8">
                <Stepper
                  id={`${uid}-sleep`}
                  label="Sleep last night"
                  unit="hours"
                  value={values.sleepHours}
                  step={0.5}
                  min={0}
                  max={16}
                  start={7}
                  format={formatHours}
                  onChange={(n) => set("sleepHours", n)}
                  disabled={disabled}
                />
                <Stepper
                  id={`${uid}-activity`}
                  label="Walking today"
                  unit="minutes"
                  value={values.activityMinutes}
                  step={5}
                  min={0}
                  max={600}
                  start={20}
                  onChange={(n) => set("activityMinutes", n)}
                  disabled={disabled}
                />
              </div>

              <div className="border-t border-hairline pt-5">
                <p id={`${uid}-mood`} className="eyebrow text-muted-foreground">
                  How you are feeling
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-labelledby={`${uid}-mood`}>
                  {MOODS.map((m) => {
                    const on = values.mood === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() => set("mood", on ? null : m)}
                        className={cn(
                          "h-9 rounded-full border px-4 text-sm capitalize transition-[background-color,color,transform] active:scale-95",
                          on ? "border-amber bg-amber text-ink" : "border-hairline bg-paper-2 text-ink hover:bg-paper-3",
                        )}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
                <button
                  type="button"
                  onClick={add}
                  disabled={!ready || disabled}
                  className="group/button inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-paper transition-[background-color,transform] hover:bg-ink-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                >
                  <Plus className="size-4" aria-hidden />
                  Add to my update
                </button>
                {ready ? (
                  <button
                    type="button"
                    onClick={() => setValues(EMPTY_QUICK_LOG)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:text-ink"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Clear
                  </button>
                ) : null}
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {justAdded
                    ? "Added as plain sentences. Edit them any time before saving."
                    : "Adds sentences in your own voice. You can edit them; nothing is saved until you press Save."}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
