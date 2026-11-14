/** Connection details sent to the browser to start a live conversation (short-lived; no API key). */
export type VoiceConnection =
  | { mode: "elevenlabs"; agentId: string; conversationToken: string | null; signedUrl: string | null }
  | { mode: "simulated" };
