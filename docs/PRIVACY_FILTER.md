# Privacy filter (data minimisation)

DoctorLoop keeps only what a care team needs. Everything that is saved as an update passes a privacy filter first, on the server, before anything is stored. Synthetic data only; this is a prototype, not a compliance claim.

## Two layers

1. **Relevance filter (Vexo import).** Whole band recordings with no health words are dropped. They are never stored and never sent to an AI.
2. **Sentence filter (every saved update: typed, voice, Vexo, and edits).** The text is split into numbered sentences. A classifier says which sentences to keep and which spans to hide. Code then builds the stored text from the kept original sentences. The model never writes text, so what is stored is verbatim apart from placeholders.

## What is kept, removed and hidden

- **Kept:** symptoms, pain and ratings, sleep, energy, mood as it relates to recovery, mobility, exercises and physio, medicines and self-care, the wound, questions for the care team, recovery-related limits on daily life, and sentences that only make sense next to a kept one.
- **Removed:** work, plans, entertainment, shopping, small talk, other people's private matters.
- **Hidden inside kept sentences** (shown as pills such as "NAME HIDDEN"): other people's names (clinician names stay), phone numbers, e-mails, street addresses, ID/insurance/card numbers, links.

A deterministic regex safety net runs after either provider, so obvious e-mails, links, phone numbers, long ID numbers and street addresses are hidden even if the model misses them.

## What is stored

Only the filtered text, plus a counts-only receipt per entry: provider, model, sentences seen and kept, and how many items of each type were hidden. The removed text and the original are never stored, logged or returned to a client, and doctors never see them. If nothing health-related is left, nothing is saved. In a Vexo import that item is skipped and the patient is told.

## Engines

With `OPENAI_API_KEY` the classifier is OpenAI (labelled "AI draft · unverified"). Without a key, or if the call fails, a rule-based filter runs ("rule-based"; a failure is marked as a fallback on the receipt).

## Data flow and limits

- In live OpenAI mode the **raw text is sent to OpenAI** to be filtered (synthetic data only).
- Voice check-ins: the raw call transcript and in-call notes are used only to build the filtered update and are not kept (the voice session stores an empty transcript; the post-call webhook only acknowledges). ElevenLabs itself keeps its own conversation history in live mode, according to your ElevenLabs settings.
- Vexo band recordings stay in Vexo (or in the replay file); DoctorLoop stores only the filtered update plus a hash and length of the original.
- Automatic filtering can miss things (an unusual name, an unlabelled detail) or keep a sentence it should not. Patients should review before sharing. No guarantee is made.
