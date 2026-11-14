"use client";

import { useMemo, useState } from "react";
import type { ObservationCategory } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { categoryTone } from "./palette";

type Side = "R" | "L" | "C";
type Part =
  | "head"
  | "neck"
  | "shoulder"
  | "chest"
  | "abdomen"
  | "elbow"
  | "wrist"
  | "hip"
  | "thigh"
  | "knee"
  | "calf"
  | "ankle";

/** Anchor y per body part; x per side. Patient's right is on the viewer's left. */
const Y: Record<Part, number> = {
  head: 40,
  neck: 74,
  shoulder: 104,
  chest: 134,
  abdomen: 196,
  elbow: 160,
  wrist: 218,
  hip: 262,
  thigh: 306,
  knee: 350,
  calf: 390,
  ankle: 424,
};
const CENTER_ONLY: Part[] = ["head", "neck", "chest", "abdomen"];
const ARM_X: Partial<Record<Part, [number, number]>> = {
  shoulder: [72, 168],
  elbow: [53, 187],
  wrist: [53, 187],
};
const LEG_X: [number, number] = [97, 143];

const PART_LABEL: Record<Part, string> = {
  head: "Head",
  neck: "Neck",
  shoulder: "Shoulder",
  chest: "Chest",
  abdomen: "Abdomen / incision",
  elbow: "Elbow",
  wrist: "Wrist / hand",
  hip: "Hip",
  thigh: "Thigh",
  knee: "Knee",
  calf: "Calf / shin",
  ankle: "Ankle / foot",
};

const PATTERNS: [RegExp, Part][] = [
  [/incision|abdom|stomach|belly|surgical|scar/, "abdomen"],
  [/chest|rib|sternum/, "chest"],
  [/neck|throat/, "neck"],
  [/head|face|jaw/, "head"],
  [/shoulder/, "shoulder"],
  [/elbow/, "elbow"],
  [/wrist|hand|finger|thumb/, "wrist"],
  [/hip|groin|pelvi/, "hip"],
  [/thigh|hamstring|quad/, "thigh"],
  [/knee|patella/, "knee"],
  [/calf|shin/, "calf"],
  [/ankle|foot|feet|heel|toe/, "ankle"],
  [/leg/, "thigh"],
];

export function parseBodySite(site: string): { part: Part; side: Side } | null {
  const s = site.toLowerCase();
  const hit = PATTERNS.find(([re]) => re.test(s));
  if (!hit) return null;
  const part = hit[1];
  if (CENTER_ONLY.includes(part)) return { part, side: "C" };
  const side: Side = /\bright\b|\br\b/.test(s) ? "R" : /\bleft\b|\bl\b/.test(s) ? "L" : "C";
  return { part, side };
}

function anchor(part: Part, side: Side): { x: number; y: number } {
  if (CENTER_ONLY.includes(part) || side === "C") return { x: 120, y: Y[part] };
  const pair = ARM_X[part] ?? LEG_X;
  return { x: side === "R" ? pair[0] : pair[1], y: Y[part] };
}

interface Mention {
  key: string;
  part: Part;
  side: Side;
  label: string;
  count: number;
  category: ObservationCategory;
  x: number;
  y: number;
}

export function aggregateBodySites(observations: { bodySite: string | null; category: ObservationCategory }[]): {
  mentions: Mention[];
  other: number;
} {
  const map = new Map<string, Mention & { cats: Map<ObservationCategory, number> }>();
  let other = 0;
  for (const o of observations) {
    if (!o.bodySite) continue;
    const parsed = parseBodySite(o.bodySite);
    if (!parsed) {
      other += 1;
      continue;
    }
    const key = `${parsed.part}:${parsed.side}`;
    const base = PART_LABEL[parsed.part];
    const label =
      parsed.side === "R" ? `Right ${base.toLowerCase()}` : parsed.side === "L" ? `Left ${base.toLowerCase()}` : base;
    const cur = map.get(key) ?? {
      key,
      ...parsed,
      label,
      count: 0,
      category: o.category,
      ...anchor(parsed.part, parsed.side),
      cats: new Map<ObservationCategory, number>(),
    };
    cur.count += 1;
    cur.cats.set(o.category, (cur.cats.get(o.category) ?? 0) + 1);
    map.set(key, cur);
  }
  const mentions: Mention[] = [...map.values()].map(({ cats, ...m }) => ({
    ...m,
    category: [...cats.entries()].sort((a, b) => b[1] - a[1])[0][0],
  }));
  return { mentions: mentions.sort((a, b) => b.count - a.count), other };
}

const radius = (n: number) => Math.min(16, 5 + 2.6 * Math.sqrt(n));

/** Minimal geometric front-view pictogram with mentioned body sites. Dot size = mention count. */
export function BodyMap({
  observations,
}: {
  observations: { bodySite: string | null; category: ObservationCategory }[];
}) {
  const { mentions, other } = useMemo(() => aggregateBodySites(observations), [observations]);
  const [active, setActive] = useState<string | null>(null);
  const shape = { fill: "var(--paper-2)", stroke: "var(--bone)", strokeWidth: 1.25 } as const;

  return (
    <figure className="m-0 grid gap-6 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-center">
      <svg
        viewBox="0 0 240 460"
        className="mx-auto h-auto w-full max-w-[200px] overflow-visible"
        role="group"
        aria-label="Body map, front view. R and L are from your perspective."
      >
        <circle cx="120" cy="40" r="26" {...shape} />
        <rect x="112" y="64" width="16" height="22" rx="6" {...shape} />
        <rect x="74" y="84" width="92" height="172" rx="30" {...shape} />
        <rect x="40" y="92" width="26" height="152" rx="13" {...shape} />
        <rect x="174" y="92" width="26" height="152" rx="13" {...shape} />
        <rect x="76" y="250" width="42" height="196" rx="21" {...shape} />
        <rect x="122" y="250" width="42" height="196" rx="21" {...shape} />
        {/* Side markers: the patient's right is on the viewer's left. */}
        {(["R", "L"] as const).map((s) => (
          <g key={s}>
            <circle cx={s === "R" ? 14 : 226} cy="40" r="11" fill="none" stroke="var(--ink)" strokeWidth="1" />
            <text
              x={s === "R" ? 14 : 226}
              y="44"
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink)"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {s}
            </text>
          </g>
        ))}
        {mentions.map((m) => {
          const tone = categoryTone(m.category);
          const r = radius(m.count);
          const on = active === m.key;
          return (
            <g
              key={m.key}
              tabIndex={0}
              role="img"
              aria-label={`${m.label}: mentioned ${m.count} ${m.count === 1 ? "time" : "times"}, self-reported`}
              onMouseEnter={() => setActive(m.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(m.key)}
              onBlur={() => setActive(null)}
              className="cursor-default outline-none"
            >
              <circle cx={m.x} cy={m.y} r={r + 6} fill={tone.color} opacity={0.18} className="motion-safe:animate-pulse" />
              <circle
                cx={m.x}
                cy={m.y}
                r={r}
                fill={tone.color}
                stroke={on ? "var(--ink)" : "var(--paper-2)"}
                strokeWidth={on ? 2 : 1.5}
              />
            </g>
          );
        })}
      </svg>
      <div className="min-w-0">
        {mentions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No body sites mentioned in your recent updates.</p>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {mentions.map((m) => {
              const tone = categoryTone(m.category);
              return (
                <li key={m.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(m.key)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(m.key)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      "flex w-full items-center gap-3 py-2.5 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-cobalt",
                      active === m.key && "bg-paper-3/60",
                    )}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: tone.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{m.label}</span>
                      <span className="eyebrow block text-[10px] text-muted-foreground">
                        {m.side === "C" && !CENTER_ONLY.includes(m.part) ? "Side not stated · " : ""}
                        {tone.label}
                      </span>
                    </span>
                    <span className="font-mono text-sm text-ink tabular-nums">{m.count}x</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {other > 0 ? (
          <p className="eyebrow mt-2 text-[10px] text-muted-foreground">
            + {other} other site mention{other === 1 ? "" : "s"}
          </p>
        ) : null}
        <figcaption className="eyebrow mt-4 text-[10px] text-muted-foreground">
          Where you&apos;ve mentioned symptoms · self-reported
          <br />
          R / L are from your perspective
        </figcaption>
      </div>
    </figure>
  );
}
