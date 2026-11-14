"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { updateObservationAction } from "@/app/patient/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { Observation, ObservationCategory } from "@/lib/domain/types";
import { OBSERVATION_CATEGORIES } from "@/lib/domain/types";
import type { ObservationPatch } from "@/lib/data/repository";
import { useServerAction } from "./use-action";

const MAX_CHIPS = 8;

const blankToNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

function parseNumber(value: string): number | null | "invalid" {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : "invalid";
}

function ChipEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (value && !values.includes(value) && values.length < MAX_CHIPS) onChange([...values, value]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-xs"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={160}
          disabled={values.length >= MAX_CHIPS}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim() || values.length >= MAX_CHIPS}>
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}

function ObservationForm({ observation, onDone }: { observation: Observation; onDone: () => void }) {
  const [label, setLabel] = useState(observation.label);
  const [category, setCategory] = useState<ObservationCategory>(observation.category);
  const [bodySite, setBodySite] = useState(observation.bodySite ?? "");
  const [severity, setSeverity] = useState(observation.severity?.toString() ?? "");
  const [severityText, setSeverityText] = useState(observation.severityText ?? "");
  const [measureValue, setMeasureValue] = useState(observation.measureValue?.toString() ?? "");
  const [measureUnit, setMeasureUnit] = useState(observation.measureUnit ?? "");
  const [timeDescription, setTimeDescription] = useState(observation.timeDescription ?? "");
  const [context, setContext] = useState(observation.context);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useServerAction();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const severityNumber = parseNumber(severity);
    const measureNumber = parseNumber(measureValue);
    if (!label.trim()) return setError("Give the observation a short label.");
    if (severityNumber === "invalid" || (severityNumber !== null && (!Number.isInteger(severityNumber) || severityNumber < 0 || severityNumber > 10))) {
      return setError("Severity must be a whole number from 0 to 10, or left blank.");
    }
    if (measureNumber === "invalid") return setError("Measure value must be a number, or left blank.");
    setError(null);

    const patch: ObservationPatch = {
      label: label.trim(),
      category,
      bodySite: blankToNull(bodySite),
      severity: severityNumber,
      severityText: blankToNull(severityText),
      measureValue: measureNumber,
      measureUnit: blankToNull(measureUnit),
      timeDescription: blankToNull(timeDescription),
      context,
    };
    run(() => updateObservationAction({ observationId: observation.id, patch }), {
      success: "Observation updated.",
      onSuccess: onDone,
      onError: setError,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="obs-label">Label</Label>
          <Input id="obs-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ObservationCategory)}>
            <SelectTrigger id="obs-category" className="w-full capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBSERVATION_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-site">Body site</Label>
          <Input id="obs-site" value={bodySite} onChange={(e) => setBodySite(e.target.value)} maxLength={80} placeholder="e.g. right knee" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-time">When, in your words</Label>
          <Input id="obs-time" value={timeDescription} onChange={(e) => setTimeDescription(e.target.value)} maxLength={120} placeholder="e.g. last night" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-severity">Severity (0-10)</Label>
          <Input id="obs-severity" inputMode="numeric" value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="Leave blank if you did not give a number" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-severity-text">Severity wording</Label>
          <Input id="obs-severity-text" value={severityText} onChange={(e) => setSeverityText(e.target.value)} maxLength={120} placeholder="e.g. about a 6 out of 10" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-measure">Measure value</Label>
          <Input id="obs-measure" inputMode="decimal" value={measureValue} onChange={(e) => setMeasureValue(e.target.value)} placeholder="e.g. 6" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-unit">Measure unit</Label>
          <Input id="obs-unit" value={measureUnit} onChange={(e) => setMeasureUnit(e.target.value)} maxLength={40} placeholder="e.g. hours" />
        </div>
      </div>
      <ChipEditor label="Context" values={context} onChange={setContext} placeholder="e.g. after physiotherapy" />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="submit" className="h-9 rounded-full px-5" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ObservationEditDialog({ observation }: { observation: Observation }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-full" aria-label={`Edit ${observation.label}`}>
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Edit observation</DialogTitle>
          <DialogDescription>
            Correct anything the AI got wrong. Only add a severity or measure if you actually stated one.
          </DialogDescription>
        </DialogHeader>
        <ObservationForm observation={observation} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
