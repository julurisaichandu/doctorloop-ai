# DoctorLoop AI — Product Spec (hackathon MVP)

Source: the original build brief (Vexo hackathon). Earlier drafts used other product
names (e.g. "CareBridge AI"); the product is **DoctorLoop AI** everywhere.

## Product vision
DoctorLoop AI connects patients' everyday health experiences with their doctors.
Patients use Vexo wearable memories, ElevenLabs voice conversations, and manual notes to
record health updates between appointments. AI structures this information into a
timeline and prepares concise summaries. Doctors use a separate dashboard to monitor their
assigned patients, review patient-approved updates, and understand important changes
before appointments.

This is a hackathon prototype. Use fictional patient data only. Do not present the system
as a validated clinical monitoring or diagnostic product.

## Technology requirements
Next.js App Router + TypeScript · Tailwind CSS + shadcn/ui · Supabase (database + role-based
auth) · OpenAI (structured extraction & summarization) · Mastra (AI workflows) · ElevenLabs
Conversational AI (voice check-ins) · Vexo MCP (authorized wearable memory retrieval).
Use current official SDK documentation; do not invent unavailable API methods.

## Feature 1 — Patient dashboard (`/patient`)
- Patient name, recovery information, and next appointment.
- Daily health timeline with chronological entries.
- Self-reported symptom trends and charts.
- Voice check-in button powered by ElevenLabs; manual text-entry fallback.
- Imported Vexo observations, labeled with their sources.
- AI-generated weekly recovery summary.
- Review, edit, approve, or reject information before sharing with doctors.
- Each entry shows a timestamp, source, and review status.

## Feature 2 — Doctor dashboard (`/doctor`)
- View all patients assigned to them; each patient's latest shared update.
- Identify patients with new information awaiting review; search/filter patients.
- Click a patient to see their health timeline, self-reported symptom charts and observations.
- Read an AI-generated pre-visit summary; open the original supporting patient-approved records.
- Mark an update as reviewed.
- Professional, clean healthcare dashboard design. Patient review status is not a medical risk score.

## Feature 3 — AI processing with Mastra and OpenAI
Deterministic Mastra workflow with three stages:
1. **Extraction** — patient notes/transcripts → structured info: reported symptom or
   observation; date and time; self-reported severity only if explicitly stated; relevant
   activities or context; supporting source reference; uncertainty or missing details.
2. **Timeline** — combine observations across days; identify explicit changes over time
   without inventing medical conclusions.
3. **Summary** — concise summary for clinician review: main patient-reported concerns;
   changes since earlier observations; relevant recovery activities; questions the patient
   wants to discuss; citations to original entries.
Return validated JSON using Zod schemas. Clearly distinguish patient statements from
AI-generated summaries. Do not diagnose, prescribe, automatically classify medical risk,
or generate emergency alerts.

## Feature 4 — ElevenLabs voice assistant
Conversational agent in the patient dashboard that asks how the patient is feeling, lets
them describe symptoms in ordinary language, asks neutral clarification questions (e.g.
when something started), saves the transcript and patient-confirmed observations to the
backend, lets the patient end the session, and handles microphone permission, loading and
error states. Use an official ElevenLabs SDK and tool/webhook integration where supported.
If credentials are missing, provide a clearly labeled simulated check-in mode.

## Feature 5 — Vexo integration
Documented Vexo MCP endpoint `https://api.vexoai.com/mcp`; OAuth 2.1 with PKCE and
user-authorized `vexo:read`; memory tools such as `get_context`, `search`,
`get_transcript`; read-only. Patients explicitly initiate an import, preview retrieved
observations, and approve individual health-relevant entries before storing or sharing.
Preserve source timestamps and provenance. Do not silently import unrelated private
conversations. If live OAuth is unavailable, provide a clearly labeled mock Vexo adapter
with fictional memories, with the live integration isolated behind an adapter interface.

## Feature 6 — Database
Tables for: users and roles; patient profiles; doctor-patient assignments; health journal
entries; imported source references; voice check-in sessions; structured observations;
generated summaries; patient sharing approvals; doctor review status. Row-level security:
patients access only their own data; clinicians access only authorized, patient-approved
information from assigned patients. Never expose API keys or OAuth tokens in the frontend.

## Feature 7 — Demo data
Three fictional patients with 5–7 days of sample observations, different trends and
generated summaries:
- Patient A: recovering from knee surgery; increasing discomfort and poor sleep.
- Patient B: recovering from a different procedure; gradual improvement in mobility.
- Patient C: recovering from surgery; fatigue and concerns about returning to normal activities.
Provide a development-only role switcher to demonstrate both dashboards; never use it to
bypass access controls in a deployed application.

## UI design
Modern healthcare SaaS: sidebar navigation, patient overview cards, interactive charts,
chronological event timelines, source and timestamp badges, clean patient detail pages,
responsive layouts, loading/empty/success/error states. Prioritize usability and polish.

## Core demo flow (must work)
1. Open the patient dashboard for Patient A.
2. Record a fictional health update through ElevenLabs or the text fallback.
3. Process it with OpenAI and Mastra.
4. Display the extracted observation in Patient A's timeline.
5. Patient A approves sharing the observation.
6. Open the doctor dashboard; show Patient A's new update.
7. Open Patient A's details; display the updated AI summary with a source reference.
8. Mark the update as reviewed.
The same flow must also work with a mocked Vexo memory import.

## Engineering, security and scope
Build and run the real app; all primary buttons and navigation work; validate server inputs
and enforce authorization server-side; `.env.example`; mock adapters so missing credentials
do not break the demo; basic tests for extraction, permissions, sharing and the main
workflow; build, lint and tests pass; README with setup, integrations, architecture and
limitations. Synthetic data only; AI-generated information labeled unverified and requiring
human review; no autonomous clinical triage; no HIPAA compliance claims. A real deployment
would require additional privacy, security, clinical governance, monitoring and regulatory
assessment.
