# Vexo band replay files

DoctorLoop AI can replay a text file as if it were the recordings of a Vexo band (the wearable that records the wearer's day). Use it to try the whole app (search, privacy filter, import, AI pipeline, patient approval, doctor review) without a band. **All data here is fictional.**

## Turn it on

In `.env.local`:

```
VEXO_MODE=file
VEXO_FILE_PATH=vexo-band/maya-band-capture.txt
```

`VEXO_FILE_PATH` is relative to the project root (or an absolute path). Without it the sample `maya-band-capture.txt` is used. The file is read again on every request, so edit it and refresh; restart the dev server only after changing the env vars.

The app only ever shows the file's name, never its location. Imported entries are labelled as simulated and replayed from the file, never as live.

## Text format (`.txt`, `.md`, anything that is not `.json`)

```
# A comment (ignored)
wearer: maya.thompson@example.com

## yesterday 08:14 | Morning stiffness | 6 min
My knee is stiff this morning.

It eases after I walk around.
```

- `## <when> | <title> | <duration>` starts a recording. Title and duration are optional: `## yesterday 08:14` is valid.
- Duration: `6 min` or `6m` (also `1h`). Without it the recording has no end time.
- Everything until the next `## ` header is the recording. A blank line starts a new paragraph. Recordings with no text are skipped.
- A line starting with `#` that is not a `## ` header is a comment, anywhere in the file.
- `wearer: <email>` (before the first header) restricts the file to the patient with that account e-mail; everyone else sees no recordings, and the app says the file belongs to another wearer. Leave it out and every patient sees the file.

### Times

Local time, 24-hour clock, case-insensitive:

| Form | Example |
|---|---|
| `today HH:MM` | `today 07:05` |
| `yesterday HH:MM` | `yesterday 21:15` |
| `N days ago HH:MM` (N from 0 to 30) | `3 days ago 15:25` |
| `YYYY-MM-DD HH:MM` (a `T` separator and seconds are fine) | `2026-11-10 08:14` |

Imports only accept the last 31 days, so absolute timestamps are replayed: the whole file shifts by whole days (times of day and the gaps between recordings are kept) so the newest recording lands on today, or yesterday if its time of day has not happened yet. Anything that would still land in the future moves back one day.

Recording ids are derived from the time text, title and words, so they stay the same across refreshes and restarts while you do not change a recording. Editing a recording makes it look new to the importer.

## JSON format (`.json`)

An array, or an object with a wearer:

```json
{
  "wearer": "maya.thompson@example.com",
  "recordings": [
    { "when": "yesterday 08:14", "title": "Morning stiffness", "durationMinutes": 6,
      "transcript": "My knee is stiff this morning." },
    { "startedAt": "2026-11-10T21:15:00", "endedAt": "2026-11-10T21:19:00",
      "text": "Questions for my care team." }
  ]
}
```

Each recording takes `id` (optional), `title`, one of `when` or `startedAt`, optionally `durationMinutes` or `endedAt` (with `startedAt`), and the words in `transcript`, `text` or `excerpt`. `when` uses the text grammar above; `startedAt` is an absolute ISO time that is replayed like absolute text times.

## What gets offered for import

A deterministic keyword filter (`src/lib/integrations/vexo/relevance.ts`) decides which recordings look health-related (pain, sleep, walking, physio, medication, questions for the care team, and so on). Only those are offered to the patient, who can trim each excerpt before importing. Everything else is counted ("N unrelated memories were filtered out") and dropped: unrelated recordings are never stored. The filter makes no clinical judgement, and nothing is shared with a doctor until the patient approves it.

To test the filter, keep some everyday recordings (work, plans, shopping) free of health words. Plain words like "steps", "balance", "drive", "ice cream", "tablet" or "back to work" count as health terms.

## Second layer: the privacy filter

A recording that is offered can still contain other people's chatter. When it is imported, a sentence-level privacy filter keeps only the health-related sentences and hides names, phone numbers, e-mails, addresses, IDs and links before anything is saved (see `docs/PRIVACY_FILTER.md`). If nothing health-related is left, that item is skipped and nothing is stored. Try it with "Lunch with Chloe" (only the two knee sentences remain), "After physio" (an address is hidden) and "Questions for my care team" (a neighbour's name and phone are hidden).

## The sample

`maya-band-capture.txt` is Maya Thompson's last few days of recovery from knee surgery: seven recordings the filter offers (one is a mixed lunch conversation, good for practising trimming) and four unrelated ones.
