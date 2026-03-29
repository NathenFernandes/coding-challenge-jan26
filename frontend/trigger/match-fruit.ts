import { task } from "@trigger.dev/sdk";
import { findMatchesForActiveProfile } from "@/lib/server/repository";
import { matchQueue } from "./queues";

export const matchFruitTask = task({
  id: "match-fruit",
  queue: matchQueue,
  run: async (payload: { sessionId: string }) => {
    const matchRun = await findMatchesForActiveProfile(payload.sessionId);

    return {
      matchRun,
    };
  },
});
