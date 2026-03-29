import { tasks } from "@trigger.dev/sdk";
import { hasTriggerKey } from "./env";
import type { processAgentTurnTask } from "@/trigger/process-agent-turn";

function assertTriggerConfigured(): void {
  if (!hasTriggerKey()) {
    throw new Error(
      "Trigger.dev is not configured yet. Add TRIGGER_SECRET_KEY and TRIGGER_PROJECT_ID to frontend/.env.local.",
    );
  }
}

export async function queueAgentTurn(
  sessionId: string,
  turnId: string,
): Promise<void> {
  assertTriggerConfigured();
  await tasks.trigger<typeof processAgentTurnTask>("process-agent-turn", {
    sessionId,
    turnId,
  });
}
