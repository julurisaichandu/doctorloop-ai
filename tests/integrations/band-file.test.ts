import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { parseBandFile } from "@/lib/integrations/vexo/band-file";
import { classifyHealthRelevance } from "@/lib/integrations/vexo/relevance";

// Saturday 14 Nov 2026, 12:00 local.
const NOW = new Date(2026, 10, 14, 12, 0, 0);
const parse = (text: string, fileName = "band.txt", now = NOW) => parseBandFile(text, { fileName, now });
const local = (iso: string | null) => {
  const d = new Date(iso as string);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

describe("band file text grammar", () => {
  it("parses relative times, optional title/duration, comments and the wearer", () => {
    const band = parse(`# comment
wearer: Maya.Thompson@example.com

## Yesterday 08:14
First line.
# inline comment
Second line.

New paragraph.

## 2 DAYS AGO 21:30 | Evening | 6 min
Hello

## today 07:05 | Early | 6m
Morning

## 3 days ago 09:00 | Empty one |
`);
    expect(band.wearer).toBe("Maya.Thompson@example.com");
    expect(band.recordings).toHaveLength(3); // the empty body is skipped
    const [a, b, c] = band.recordings;
    expect(local(a.startedAt)).toEqual([2026, 11, 13, 8, 14]);
    expect(a.title).toBeNull();
    expect(a.endedAt).toBeNull();
    expect(a.excerpt).toBe("First line. Second line.\nNew paragraph.");
    expect(a.kind).toBe("transcript");
    expect(local(b.startedAt)).toEqual([2026, 11, 12, 21, 30]);
    expect(b.title).toBe("Evening");
    expect(Date.parse(b.endedAt as string) - Date.parse(b.startedAt)).toBe(6 * 60_000);
    expect(local(c.startedAt)).toEqual([2026, 11, 14, 7, 5]);
    expect(Date.parse(c.endedAt as string) - Date.parse(c.startedAt)).toBe(6 * 60_000);
  });

  it("works without a wearer line", () => {
    expect(parse("## yesterday 08:14\nHi").wearer).toBeNull();
  });

  it("rolls a recording that would land in the future back one day", () => {
    const band = parse("## today 15:00\nLater today", "band.txt", NOW);
    expect(local(band.recordings[0].startedAt)).toEqual([2026, 11, 13, 15, 0]);
  });

  it("shifts absolute timestamps by whole days so the newest lands on today", () => {
    const band = parse(`## 2026-01-10 09:00
Earlier
## 2026-01-12T08:30:15 | Newest
Later
## 2026-01-11 22:00
Middle`);
    const [early, newest, mid] = band.recordings;
    expect(local(newest.startedAt)).toEqual([2026, 11, 14, 8, 30]); // 08:30 is before noon: today
    expect(local(early.startedAt)).toEqual([2026, 11, 12, 9, 0]);
    expect(local(mid.startedAt)).toEqual([2026, 11, 13, 22, 0]);
  });

  it("lands the newest absolute recording on yesterday when its time of day is still ahead", () => {
    const band = parse("## 2026-01-12 18:45\nEvening\n## 2026-01-11 07:00\nMorning");
    expect(local(band.recordings[0].startedAt)).toEqual([2026, 11, 13, 18, 45]);
    expect(local(band.recordings[1].startedAt)).toEqual([2026, 11, 12, 7, 0]);
  });

  it("keeps ids stable, independent of the clock, and disambiguates exact duplicates", () => {
    const text = "## yesterday 08:14 | Same\nSame words\n## yesterday 08:14 | Same\nSame words\n";
    const first = parse(text);
    const later = parse(text, "band.txt", new Date(2026, 10, 20, 9, 0, 0));
    expect(first.recordings.map((r) => r.id)).toEqual(later.recordings.map((r) => r.id));
    expect(first.recordings[0].id).toMatch(/^band-[0-9a-f]{12}$/);
    expect(first.recordings[1].id).toBe(`${first.recordings[0].id}-2`);
  });

  it("names the 1-based line of bad input", () => {
    const cases: Array<[string, RegExp]> = [
      ["wearer: a@b.c\n\n## yesterday 25:00\nHi", /band\.txt, line 3/],
      ["## someday 08:14\nHi", /line 1.*could not read the time/],
      ["## 31 days ago 08:14\nHi", /line 1.*between 0 and 30/],
      ["## 2026-02-30 08:14\nHi", /line 1.*not a real date/],
      ["# c\n## yesterday 08:14 | T | soon\nHi", /line 2.*duration/],
      ["stray text\n## yesterday 08:14\nHi", /line 1/],
    ];
    for (const [text, pattern] of cases) {
      try {
        parse(text);
        throw new Error("expected a failure");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("VALIDATION");
        expect((error as AppError).message).toMatch(pattern);
      }
    }
  });
});

describe("band file JSON", () => {
  it("accepts an object with a wearer, when/startedAt and the text aliases", () => {
    const band = parse(
      JSON.stringify({
        wearer: "maya.thompson@example.com",
        recordings: [
          { id: "r1", title: "A", when: "yesterday 08:00", durationMinutes: 5, transcript: "one" },
          { when: "2 days ago 09:00", text: "two" },
          { startedAt: "2026-03-01T10:00:00", endedAt: "2026-03-01T10:04:00", excerpt: "three" },
          { when: "yesterday 10:00", text: "  " },
        ],
      }),
      "band.json",
    );
    expect(band.wearer).toBe("maya.thompson@example.com");
    expect(band.recordings.map((r) => r.excerpt)).toEqual(["one", "two", "three"]);
    expect(band.recordings[0].id).toBe("r1");
    expect(Date.parse(band.recordings[0].endedAt as string) - Date.parse(band.recordings[0].startedAt)).toBe(300_000);
    expect(band.recordings[1].endedAt).toBeNull();
    expect(local(band.recordings[2].startedAt)).toEqual([2026, 11, 14, 10, 0]);
    expect(Date.parse(band.recordings[2].endedAt as string) - Date.parse(band.recordings[2].startedAt)).toBe(240_000);
  });

  it("accepts a bare array and rejects malformed input naming the file", () => {
    expect(parse(JSON.stringify([{ when: "yesterday 08:00", text: "x" }]), "b.json").recordings).toHaveLength(1);
    expect(() => parse("{nope", "b.json")).toThrow(/b\.json: not valid JSON/);
    expect(() => parse(JSON.stringify([{ text: "x" }]), "b.json")).toThrow(/b\.json, recording 1/);
    expect(() => parse(JSON.stringify([{ when: "someday", text: "x" }]), "b.json")).toThrow(/recording 1/);
  });
});

describe("sample band file", () => {
  const text = readFileSync("vexo-band/maya-band-capture.txt", "utf8");

  it("parses with the expected wearer and 11 recordings, none today", () => {
    const band = parse(text, "maya-band-capture.txt");
    expect(band.wearer).toBe("maya.thompson@example.com");
    expect(band.recordings).toHaveLength(11);
    expect(new Set(band.recordings.map((r) => r.id)).size).toBe(11);
    for (const r of band.recordings) expect(Date.parse(r.startedAt)).toBeLessThan(NOW.getTime() - 12 * 3_600_000);
  });

  it("offers exactly 7 recordings and filters 4 as unrelated", () => {
    const { recordings } = parse(text, "maya-band-capture.txt");
    const relevant = recordings.filter((r) => classifyHealthRelevance(`${r.title ?? ""} ${r.excerpt}`).relevant);
    expect(relevant).toHaveLength(7);
    expect(recordings.filter((r) => !relevant.includes(r)).map((r) => r.title).sort()).toEqual([
      "Birthday dinner plans",
      "Groceries",
      "Podcast chat",
      "Work stand-up",
    ]);
  });
});
