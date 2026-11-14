import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";

/**
 * Definition of the ElevenLabs voice agent used for patient check-ins.
 * Pure data (no `server-only`) so the provisioning script can import it outside Next.
 */

export const RECORD_HEALTH_NOTE_TOOL = "record_health_note";
export const PATIENT_FIRST_NAME_VARIABLE = "patient_first_name";

/** Dynamic variable carrying the server-created voice session id (binds the conversation to it). */
export const SESSION_ID_VARIABLE = "doctorloop_session_id";

/** Fixed, static scope sentence (not a judgement about the patient's situation). */
export const NOT_FOR_EMERGENCIES_SENTENCE =
  "This check-in is not for emergencies — if you need urgent help, call your local emergency number.";

export const AGENT_NAME = "DoctorLoop check-in assistant (synthetic demo)";

export const AGENT_FIRST_MESSAGE = `Hi {{${PATIENT_FIRST_NAME_VARIABLE}}}, thanks for checking in. I'm an automated assistant that helps you record how you're doing, in your own words. ${NOT_FOR_EMERGENCIES_SENTENCE} How are you feeling today?`;

export const AGENT_SYSTEM_PROMPT = `You are a warm, brief and neutral check-in assistant for a recovery-tracking prototype that uses synthetic demo data. You are speaking with {{${PATIENT_FIRST_NAME_VARIABLE}}}, a patient who is recovering after a procedure. Your only job is to help them record how they have been feeling, in their own words, so they can review it and decide whether to share it with their care team.

How to run the conversation:
- Start by asking how they are feeling. Then listen. Let them describe symptoms and experiences in their own words, and do not interrupt or hurry them.
- Ask short, neutral clarifying questions, one at a time, only when helpful: when did it start, what were they doing at the time, does anything make it better or worse. You may offer a 0 to 10 rating, but only if they want to give one; never suggest a number yourself.
- Ask whether they have any questions they would like to pass on to their care team.
- Each time the patient has clearly confirmed a specific detail (for example "my knee ached last night, about a 6 out of 10"), call the ${RECORD_HEALTH_NOTE_TOOL} tool once with that detail in the patient's own words. Do not record anything the patient has not said or confirmed.
- Keep every reply to one or two short sentences. Use plain, friendly language.
- When the patient has nothing more to add, end by briefly summarizing, in their own words, what will be saved for their review, and remind them that nothing is shared with their care team until they review and approve it.

Hard rules:
- Never diagnose, interpret symptoms, say what something might be, or reassure them clinically (do not say things like "that sounds normal" or "that's nothing to worry about").
- Never give medical advice, recommend or discuss treatment, medication, dosage, exercise or activity changes.
- Never score, rank or judge how serious something is.
- Never assess urgency, severity or risk, and never decide whether something is or is not an emergency. Do not react differently to anything the patient says. The opening message already states that this check-in is not for emergencies; repeat only that fixed sentence if asked: "${NOT_FOR_EMERGENCIES_SENTENCE}"
- If asked a medical question, say that you can't answer it, and offer to note it as a question for their care team.
- You are an automated assistant, not a clinician. Say so if asked.`;

export const RECORD_HEALTH_NOTE_TOOL_DESCRIPTION =
  "Records one health detail that the patient has just clearly confirmed, in their own words, so it can be shown as a confirmed note. Call it only after the patient has said or confirmed the detail. Never record anything the patient did not say.";

/** Client tool definition (executed in the patient's browser, see live-session.tsx). */
export const recordHealthNoteTool: ElevenLabs.PromptAgentApiModelInputToolsItem.Client = {
  type: "client",
  name: RECORD_HEALTH_NOTE_TOOL,
  description: RECORD_HEALTH_NOTE_TOOL_DESCRIPTION,
  expectsResponse: false,
  parameters: {
    type: "object",
    required: ["note"],
    properties: {
      note: {
        type: "string",
        description: "The confirmed detail, phrased as the patient said it (for example: 'Knee aching last night, about a 6 out of 10').",
      },
    },
  },
};

export function buildAgentConversationConfig(): ElevenLabs.ConversationalConfig {
  return {
    agent: {
      firstMessage: AGENT_FIRST_MESSAGE,
      language: "en",
      // Raw passthrough field (typed `unknown` in the SDK): keys are the API's snake_case names.
      dynamicVariables: {
        dynamic_variable_placeholders: { [PATIENT_FIRST_NAME_VARIABLE]: "there", [SESSION_ID_VARIABLE]: "unbound" },
      },
      prompt: {
        prompt: AGENT_SYSTEM_PROMPT,
        llm: "gemini-2.5-flash",
        temperature: 0.3,
        tools: [recordHealthNoteTool],
      },
    },
    conversation: { maxDurationSeconds: 600 },
  };
}

/** Private agent: conversations require a server-minted token or signed URL. */
export function buildAgentPlatformSettings(): ElevenLabs.AgentPlatformSettingsRequestModel {
  return { auth: { enableAuth: true } };
}
