import { Mastra } from "@mastra/core/mastra";
import { healthUpdateWorkflow } from "@/mastra/workflows/health-update";
import { privacyFilterWorkflow } from "@/mastra/workflows/privacy-filter";

/**
 * Mastra instance for DoctorLoop. No storage, telemetry or logger side effects: the
 * workflow keeps no snapshots, so nothing is persisted or sent anywhere.
 */
export const mastra = new Mastra({
  workflows: { healthUpdateWorkflow, privacyFilterWorkflow },
  logger: false,
});
