# Band bridge

The band bridge listens to your Vexo Open band. It turns speech into text, keeps only health talk,
and sends it to DoctorLoop. Each kept conversation lands in the app as an entry that waits for the
patient's review.

```
 Vexo band ──Bluetooth/USB──▶ BandSource ──16 kHz PCM──▶ Deepgram (speech to text)
 (Opus mic)                   (this laptop)                     │ final sentences
                                                                ▼
 DoctorLoop app ◀──signed POST── DoctorLoopSink ◀── PrivacyGate ◀── ConversationSegmenter
 /api/integrations/vexo/band     (kept only)        (Gemini or      (silence gap closes
                                                     rules)          a conversation)
```

It is one Pipecat pipeline in `bridge.py`. A conversation ends after a silence (20 s by default),
at 16,000 characters, or when the run ends. The gate drops private or off-topic conversations on
this laptop. They are never sent to the app.

## Safety

- Tell the people near the band before you start. Stop when someone asks.
- The band's solid blue light means the microphone is on. Do not cover it.
- The sound goes over the internet to Deepgram (deepgram.com) to become text. The bridge opts out of
  Deepgram's Model Improvement Program (`mip_opt_out=true`).
- With a Gemini key, the text of each finished conversation goes to Google (Gemini Decisions API).
  On Google's free tier, Google may use that text to improve its products.
- Use synthetic demo conversations only. Never record real patients.
- The bridge never prints a transcript, a key or the secret.

## Setup

1. Install [uv](https://docs.astral.sh/uv/). Then, in `band-bridge/`:

   ```
   uv sync
   ```

2. macOS: allow Bluetooth for your terminal app. The first run asks. You can also allow it in
   System Settings > Privacy & Security > Bluetooth.
3. Put the keys and settings in the repo's `.env` (one folder up). Write them yourself. Never
   paste a key into a chat. Values already set in the environment win over the file.

   | Setting | What it is |
   |---|---|
   | `VEXO_BAND_NUMBER` | The number on your band's bag. Required. The bridge connects only to that band. |
   | `DEEPGRAM_API_KEY` | Your Deepgram key. Needed for the band and `--sim`, not for `--say`. |
   | `GEMINI_API_KEY` | Optional. Without it the rule-based gate decides. |
   | `VEXO_BAND_SECRET` | At least 32 characters. The app uses the same value to check the signature. Not needed with `--dry-run`. |
   | `VEXO_BAND_WEARER` | Used by the app, not the bridge: the patient the entries belong to. |
   | `NEXT_PUBLIC_APP_URL` | The app's address. Default `http://localhost:3000`. |
   | `DEEPGRAM_MODEL` | Default `nova-3`. |
   | `DEEPGRAM_ENDPOINTING_MS` | Default 100. Higher values make sentences arrive late on band audio. |
   | `GATE_PRIVATE_MAX`, `GATE_HEALTH_MIN` | Gate thresholds. Default 0.5 each. |

## Commands

Run these in `band-bridge/`.

| Command | What it does |
|---|---|
| `uv run bridge.py` | The real band over Bluetooth. Double-tap the band first (it blinks blue). |
| `uv run bridge.py --usb` | The real band over a USB data cable. No double-tap needed. |
| `uv run bridge.py --sim fixtures/knee-checkin.opus` | A pretend band plays the file once as its microphone, then the run ends. |
| `uv run bridge.py --say "My knee hurts after physio." --say "..."` | No band and no Deepgram. Each text is one finished conversation. |
| `... --dry-run` | Add to any command. It classifies and prints, but sends nothing to the app. |
| `... --gap 10` | Seconds of silence that close a conversation. Default 20. |

Press Ctrl-C to stop. Ctrl-C does not send the conversation in progress. Wait for the gap to pass
after the last words if you want it sent.

Tests run offline. They need `VEXO_BAND_NUMBER` in the repo `.env` or the environment:

```
uv run pytest -q
```

`fixtures/knee-checkin.opus` is a macOS `say` recording of a made-up health update. It is packed
like the band's microphone. `uv run fixtures/make_fixture.py` rebuilds it.

## What the printed lines mean

| Line | Meaning |
|---|---|
| `gate: no GEMINI_API_KEY, using the rule-based gate` | No Gemini key: the keyword rules decide. |
| `Note: the text of each finished conversation is sent to Google ...` | Gemini is on. Printed before the first call. |
| `connecting to Vexo-HACK-NN over Bluetooth...` | Looking for your band, and only your band. |
| `connected: Vexo-HACK-NN` | The band answered and its number matches `VEXO_BAND_NUMBER`. |
| `loading the sound decoder...` | Loading the Opus decoder. The first time can take a few seconds. |
| `Note: while this runs, everything the band's microphone hears is sent ...` | The microphone is about to turn on. Tell the people near you. |
| `listening: ...` | The microphone is on. The light is solid blue. |
| `heard    12 words (conversation so far: 64 chars)` | Deepgram finished a sentence. The text is not shown. |
| `kept     health_related ... recordingId=... chars=... gate=gemini -> stored` | Sent to the app. The end is the app's answer. |
| `dropped  very_private ... recordingId=... chars=...` | Not sent. The reason is `very_private`, `not_health_related` or `blocked`. |
| `gate: Gemini failed (HTTP 503); the rule-based gate decides this one` | Google was unreachable. The rules decided, and the receipt says `fallback: true`. |
| `lost the band; trying to reconnect ...` / `the band is back; listening again` | The link dropped and came back. |
| `microphone off, band disconnected` | Clean stop. |
| `done: 1 kept, 1 dropped` | Totals for the run. |

The app's answer after `->` is one of these:

- `stored`: a new entry waits for the patient's review.
- `duplicate`: the app already had this recording.
- `not_health_related`: the app's own check found no health content.
- `nothing_kept`: the app's privacy filter removed everything.
- `dry run, not sent`: you used `--dry-run`.
- `rejected (HTTP 401 ...)`: the app refused it, for example a wrong secret or band number. 4xx answers are not retried.
- `not sent (HTTP 500 after 4 tries)`: the app failed. The bridge tried 3 more times, with the same recording id.

## Troubleshooting

| Problem | What to do |
|---|---|
| `Could not see Vexo-HACK-NN` (`not-found-nearby`) | The band takes one Bluetooth connection at a time. Close the dashboard tab and any other program or laptop connected to it. Then double-tap the band and run again within 60 seconds. Or use `--usb`. |
| `This is Vexo-HACK-XX, not Vexo-HACK-NN` (`wrong-band`) | Another band answered. Check the number on your bag and `VEXO_BAND_NUMBER`. Never connect to another team's band. |
| `Transcription needs a Deepgram key: set DEEPGRAM_API_KEY in the repo .env` | Add your Deepgram key to the repo `.env`. `--say` works without it. |
| `Deepgram refused the connection or could not be reached` | Check the key, `DEEPGRAM_MODEL` and the internet connection. |
| `Set VEXO_BAND_NUMBER ...` or `Set VEXO_BAND_SECRET ...` | Add the setting to the repo `.env`. |
| `No band found on USB` | Use a data cable. On a Mac, allow the accessory when macOS asks. |
| `stream-taken` message | Another program on the other link took the microphone. Close it and run again. |

## How the gate decides

With `GEMINI_API_KEY`, the gate asks Pipecat's `GoogleDecisionsClassifier` (model
`gemini-decision-1`) two yes/no questions in one request:

- `very_private`: is it about intimate or romantic relationships, sexual matters, money, bank or
  card details, passwords or codes, legal trouble, or other people's secrets? Routine talk about the
  wearer's own health is not very private.
- `health_related`: is it about the wearer's own symptoms, pain, sleep, mobility, medicines,
  exercises, appointments, or questions for the care team?

The transcript goes inside a fence marked as untrusted text, so instructions spoken into it are
only classified, not followed.

The gate keeps a conversation only if `health_related >= GATE_HEALTH_MIN` and
`very_private < GATE_PRIVATE_MAX`. Both default to 0.5.

When Gemini fails:

- A safety block (HTTP 400 `safety`, `prohibited_content`, `blocklist`, `image_safety` or
  `content_blocked`, or a reply with `block_reason`) drops the conversation. So does a reply with no
  usable answer.
- A timeout, a network error or another HTTP error falls back to the rule-based gate. The receipt
  says `fallback: true`.

Without a key, the rule-based gate uses two short keyword lists, one for private topics and one for
health words. Each scores 0 or 1, and the same thresholds apply.

Each kept conversation carries a gate receipt to the app: provider, model, both scores and the
fallback flag. The app then runs its own privacy filter, and the patient reviews every entry.
