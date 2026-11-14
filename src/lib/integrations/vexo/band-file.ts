import { createHash } from "node:crypto";
import { validationError } from "@/lib/errors";
import type { BareMemory } from "./memory-store";

/**
 * Pure parser for "Vexo band" capture files (text or JSON). No fs, no server-only: it only turns
 * text into recordings. See vexo-band/README.md for the format. Entirely fictional sample data.
 */

export interface BandFile {
  wearer: string | null;
  recordings: BareMemory[];
}

export interface ParseOptions {
  /** Basename used in error messages; a .json extension selects the JSON format. */
  fileName: string;
  /** "Now" for resolving relative times (injectable for tests). */
  now?: Date;
}

const DAY_MS = 86_400_000;
const MAX_DAYS_AGO = 30;

interface RawRecording {
  id?: string;
  title: string | null;
  whenKey: string;
  relative?: { daysAgo: number; hour: number; minute: number };
  absolute?: Date;
  durationMs: number | null;
  body: string;
  where: string;
}

type Parsed = { wearer: string | null; raws: RawRecording[] };

/** Internal: a problem found while reading one line/recording; wrapped into a validationError. */
class Fail extends Error {}

const RELATIVE_RE = /^(?:(today)|(yesterday)|(\d{1,3})\s+days?\s+ago)\s+(\d{1,2}):(\d{2})$/i;
const ABSOLUTE_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|m|h|hr|hrs|hour|hours)$/i;

function checkClock(hour: number, minute: number): void {
  if (hour > 23 || minute > 59) {
    throw new Fail(`"${hour}:${String(minute).padStart(2, "0")}" is not a valid 24-hour time`);
  }
}

function parseWhen(text: string): Pick<RawRecording, "relative" | "absolute"> {
  const value = text.trim();
  const rel = RELATIVE_RE.exec(value);
  if (rel) {
    const daysAgo = rel[1] ? 0 : rel[2] ? 1 : Number(rel[3]);
    if (daysAgo > MAX_DAYS_AGO) throw new Fail(`"${value}": days ago must be between 0 and ${MAX_DAYS_AGO}`);
    const hour = Number(rel[4]);
    const minute = Number(rel[5]);
    checkClock(hour, minute);
    return { relative: { daysAgo, hour, minute } };
  }
  const abs = ABSOLUTE_RE.exec(value);
  if (abs) {
    const [y, mo, d, h, mi, s] = [abs[1], abs[2], abs[3], abs[4], abs[5], abs[6] ?? "0"].map(Number);
    checkClock(h, mi);
    const date = new Date(y, mo - 1, d, h, mi, s, 0);
    if (s > 59 || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
      throw new Fail(`"${value}" is not a real date and time`);
    }
    return { absolute: date };
  }
  throw new Fail(
    `could not read the time "${value}". Use "today 08:14", "yesterday 08:14", "3 days ago 08:14" or "2026-11-10 08:14"`,
  );
}

function parseDuration(text: string): number {
  const match = DURATION_RE.exec(text.trim());
  if (!match) throw new Fail(`could not read the duration "${text.trim()}". Use for example "6 min" or "6m"`);
  const unit = match[2].toLowerCase();
  return Math.round(Number(match[1]) * (unit.startsWith("h") ? 60 : 1) * 60_000);
}

/** Consecutive lines form a paragraph (joined by a space); paragraphs are joined by "\n". */
function paragraphs(lines: string[]): string {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === "") {
      if (current.length) out.push(current.join(" "));
      current = [];
    } else current.push(line);
  }
  if (current.length) out.push(current.join(" "));
  return out.join("\n");
}

function parseText(text: string, fileName: string): Parsed {
  const raws: RawRecording[] = [];
  let wearer: string | null = null;
  let current: { raw: Omit<RawRecording, "body">; lines: string[] } | null = null;
  const finish = () => {
    if (current) raws.push({ ...current.raw, body: paragraphs(current.lines) });
  };

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((full, index) => {
    const lineNo = index + 1;
    const line = full.trim();
    try {
      if (/^##(\s|$)/.test(line)) {
        finish();
        const parts = line.slice(2).split("|").map((part) => part.trim());
        if (parts.length > 3) throw new Fail('a header has at most three parts: "## when | title | duration"');
        if (!parts[0]) throw new Fail('a header needs a time, like "## yesterday 08:14"');
        const when = parseWhen(parts[0]);
        current = {
          raw: {
            title: parts[1] ? parts[1] : null,
            whenKey: parts[0].replace(/\s+/g, " ").toLowerCase(),
            ...when,
            durationMs: parts[2] ? parseDuration(parts[2]) : null,
            where: `line ${lineNo}`,
          },
          lines: [],
        };
        return;
      }
      if (line.startsWith("#")) return; // comment
      if (current) {
        current.lines.push(line);
        return;
      }
      if (line === "") return;
      const wearerMatch = /^wearer\s*:\s*(.*)$/i.exec(line);
      if (wearerMatch) {
        if (!wearerMatch[1].trim()) throw new Fail('"wearer:" needs an e-mail address');
        wearer = wearerMatch[1].trim();
        return;
      }
      throw new Fail('expected "wearer: <email>", a "# comment" or a "## when | title | duration" header');
    } catch (error) {
      if (error instanceof Fail) throw validationError(`${fileName}, line ${lineNo}: ${error.message}.`);
      throw error;
    }
  });
  finish();
  return { wearer, raws };
}

function parseJson(text: string, fileName: string): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw validationError(`${fileName}: not valid JSON (${detail}).`);
  }
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  let list: unknown;
  let wearer: string | null = null;
  if (Array.isArray(data)) list = data;
  else if (isObject(data)) {
    list = data.recordings;
    if (data.wearer !== undefined) {
      if (typeof data.wearer !== "string") throw validationError(`${fileName}: "wearer" must be a string.`);
      wearer = data.wearer.trim() || null;
    }
  }
  if (!Array.isArray(list)) {
    throw validationError(`${fileName}: expected an array of recordings or { "recordings": [...] }.`);
  }

  const raws: RawRecording[] = [];
  list.forEach((item, index) => {
    const where = `recording ${index + 1}`;
    const bad = (message: string) => validationError(`${fileName}, ${where}: ${message}.`);
    if (!isObject(item)) throw bad("expected an object");
    const str = (key: string): string | undefined => {
      const v = item[key];
      if (v === undefined || v === null) return undefined;
      if (typeof v !== "string") throw bad(`"${key}" must be a string`);
      return v;
    };
    const body = (str("transcript") ?? str("text") ?? str("excerpt") ?? "").trim();
    const title = str("title")?.trim() || null;
    const id = str("id")?.trim() || undefined;
    let durationMs: number | null = null;
    const minutes = item.durationMinutes;
    if (minutes !== undefined) {
      if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
        throw bad('"durationMinutes" must be a non-negative number');
      }
      durationMs = Math.round(minutes * 60_000);
    }
    const when = str("when");
    const startedAt = str("startedAt");
    const endedAt = str("endedAt");
    if ((when === undefined) === (startedAt === undefined)) throw bad('give exactly one of "when" or "startedAt"');
    let parsed: Pick<RawRecording, "relative" | "absolute">;
    let whenKey: string;
    try {
      if (when !== undefined) {
        parsed = parseWhen(when);
        whenKey = when.replace(/\s+/g, " ").trim().toLowerCase();
        if (endedAt !== undefined) throw new Fail('"endedAt" needs "startedAt"; use "durationMinutes" with "when"');
      } else {
        const ms = Date.parse(startedAt as string);
        if (Number.isNaN(ms)) throw new Fail('"startedAt" is not an ISO date-time');
        parsed = { absolute: new Date(ms) };
        whenKey = startedAt as string;
        if (endedAt !== undefined && durationMs === null) {
          const end = Date.parse(endedAt);
          if (Number.isNaN(end) || end < ms) throw new Fail('"endedAt" must be an ISO date-time after "startedAt"');
          durationMs = end - ms;
        }
      }
    } catch (error) {
      if (error instanceof Fail) throw bad(error.message);
      throw error;
    }
    raws.push({ id, title, whenKey, ...parsed, durationMs, body, where });
  });
  return { wearer, raws };
}

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) =>
  Math.round(
    (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) /
      DAY_MS,
  );

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function shortHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 12);
}

export function parseBandFile(text: string, options: ParseOptions): BandFile {
  const { fileName } = options;
  const now = options.now ?? new Date();
  const { wearer, raws } = /\.json$/i.test(fileName) ? parseJson(text, fileName) : parseText(text, fileName);

  // Absolute timestamps are replayed: shift the whole file by whole calendar days so the newest
  // lands on today (or yesterday when its time of day is still ahead of "now").
  let shiftDays = 0;
  const absolutes = raws.flatMap((raw) => (raw.absolute ? [raw.absolute] : []));
  if (absolutes.length > 0) {
    const newest = absolutes.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
    const landing = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      newest.getHours(),
      newest.getMinutes(),
      newest.getSeconds(),
    );
    const landingDay = landing.getTime() > now.getTime() ? addDays(landing, -1) : landing;
    shiftDays = dayDiff(landingDay, newest);
  }

  const seen = new Map<string, number>();
  const recordings: BareMemory[] = [];
  for (const raw of raws) {
    if (!raw.body) continue;
    let started: Date;
    if (raw.absolute) started = addDays(raw.absolute, shiftDays);
    else {
      const rel = raw.relative!;
      started = addDays(startOfLocalDay(now), -rel.daysAgo);
      started.setHours(rel.hour, rel.minute, 0, 0);
    }
    if (started.getTime() > now.getTime()) started = addDays(started, -1);

    const baseId = raw.id ?? `band-${shortHash(raw.whenKey, raw.title ?? "", raw.body)}`;
    const count = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, count);
    if (raw.id && count > 1) throw validationError(`${fileName}, ${raw.where}: duplicate id "${raw.id}".`);

    recordings.push({
      id: count === 1 ? baseId : `${baseId}-${count}`,
      title: raw.title,
      excerpt: raw.body,
      startedAt: started.toISOString(),
      endedAt: raw.durationMs === null ? null : new Date(started.getTime() + raw.durationMs).toISOString(),
      kind: "transcript",
    });
  }
  return { wearer, recordings };
}
