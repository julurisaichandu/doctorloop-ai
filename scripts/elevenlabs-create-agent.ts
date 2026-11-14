/**
 * Creates (or updates, when ELEVENLABS_AGENT_ID is set) the DoctorLoop check-in agent.
 *
 *   npx tsx --env-file=.env.local scripts/elevenlabs-create-agent.ts
 *
 * Runs outside Next.js, so it reads process.env directly and imports only pure modules.
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import {
  AGENT_NAME,
  buildAgentConversationConfig,
  buildAgentPlatformSettings,
} from "../src/lib/integrations/elevenlabs/agent-config";

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY is not set. Add it to .env.local and run again.");
    process.exit(1);
  }
  const client = new ElevenLabsClient({ apiKey });
  const existingId = process.env.ELEVENLABS_AGENT_ID?.trim();
  const conversationConfig = buildAgentConversationConfig();
  const platformSettings = buildAgentPlatformSettings();

  if (existingId) {
    await client.conversationalAi.agents.update(existingId, {
      name: AGENT_NAME,
      conversationConfig,
      platformSettings,
    });
    console.log(`Updated agent ${existingId}.`);
    return;
  }

  const { agentId } = await client.conversationalAi.agents.create({
    name: AGENT_NAME,
    conversationConfig,
    platformSettings,
  });
  console.log(`Created agent. Add this to .env.local:\nELEVENLABS_AGENT_ID=${agentId}`);
  console.log(
    "Then add a post-call webhook in ElevenLabs settings pointing to /api/webhooks/elevenlabs and set ELEVENLABS_WEBHOOK_SECRET.",
  );
}

main().catch((error: unknown) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
