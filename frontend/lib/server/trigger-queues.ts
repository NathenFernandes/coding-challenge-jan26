import { queues } from "@trigger.dev/sdk";
import type { TriggerQueueSnapshot } from "@/lib/shared/types";
import { hasTriggerKey } from "./env";

const CUSTOM_QUEUE_NAMES = [
  "agent-turn-queue",
  "fruit-match-queue",
] as const;

export async function getTriggerQueueSnapshots(): Promise<TriggerQueueSnapshot[]> {
  if (!hasTriggerKey()) {
    return [];
  }

  const results = await Promise.allSettled(
    CUSTOM_QUEUE_NAMES.map((name) =>
      queues.retrieve({
        type: "custom",
        name,
      })
    ),
  );

  return results.flatMap((result, index) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    const queue = result.value;
    return [{
      name: CUSTOM_QUEUE_NAMES[index],
      running: queue.running,
      queued: queue.queued,
      paused: queue.paused,
      concurrencyLimit: queue.concurrencyLimit,
      currentConcurrency: queue.concurrency?.current ?? queue.concurrencyLimit,
    }];
  });
}
