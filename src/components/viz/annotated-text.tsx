"use client";

import { useMemo, useState } from "react";
import type { ObservationCategory } from "@/lib/domain/types";
import { renderWithPills } from "@/components/shared/redacted-text";
import { cn } from "@/lib/utils";
import { categoryTone } from "./palette";

export interface Annotation {
  id: string;
  quote: string;
  category: ObservationCategory;
  label: string;
}

/** Lowercase + collapse whitespace, keeping a map from normalized index to original index. */
function normalize(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let prevSpace = true; // trims leading whitespace
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        norm += " ";
        map.push(i);
        prevSpace = true;
      }
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      prevSpace = false;
    }
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

interface Range {
  start: number;
  end: number;
  annotation: Annotation;
}

export function locateAnnotations(text: string, annotations: Annotation[]): Range[] {
  const { norm, map } = normalize(text);
  const ranges: Range[] = [];
  for (const annotation of annotations) {
    const q = normalize(annotation.quote).norm;
    if (!q) continue;
    const idx = norm.indexOf(q);
    if (idx < 0) continue;
    const start = map[idx];
    const end = map[idx + q.length - 1] + 1;
    if (ranges.some((r) => start < r.end && end > r.start)) continue; // skip overlaps
    ranges.push({ start, end, annotation });
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** Patient text with each verbatim observation quote highlighted; hover/focus syncs with the observation list. */
export function AnnotatedText({
  text,
  annotations,
  activeId,
  onActiveChange,
  className,
}: {
  text: string;
  annotations: Annotation[];
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  className?: string;
}) {
  const [internal, setInternal] = useState<string | null>(null);
  const active = activeId !== undefined ? activeId : internal;
  const setActive = (id: string | null) => {
    setInternal(id);
    onActiveChange?.(id);
  };
  const ranges = useMemo(() => locateAnnotations(text, annotations), [text, annotations]);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(...renderWithPills(text.slice(cursor, r.start), `t${i}`));
    const tone = categoryTone(r.annotation.category);
    const isActive = active === r.annotation.id;
    parts.push(
      <mark
        key={`m${r.annotation.id}`}
        tabIndex={0}
        data-annotation-id={r.annotation.id}
        data-active={isActive || undefined}
        aria-label={`${tone.label}: ${r.annotation.label}. Patient said: ${text.slice(r.start, r.end)}`}
        title={`${tone.label}: ${r.annotation.label}`}
        onMouseEnter={() => setActive(r.annotation.id)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(r.annotation.id)}
        onBlur={() => setActive(null)}
        className="rounded-[3px] px-0.5 text-inherit transition-colors duration-150 [box-decoration-break:clone]"
        style={{
          backgroundColor: `color-mix(in oklab, ${tone.fill} ${isActive ? 38 : 22}%, transparent)`,
          borderBottom: `2px solid ${tone.color}`,
        }}
      >
        {renderWithPills(text.slice(r.start, r.end), `m${i}`)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(...renderWithPills(text.slice(cursor), "tail"));

  return <p className={cn("whitespace-pre-wrap", className)}>{parts}</p>;
}
