import type { DashboardData } from "@/lib/shared/types";
import { loadDashboardData } from "@/lib/server/repository";
import { getTriggerQueueSnapshots } from "@/lib/server/trigger-queues";

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [data, triggerQueues] = await Promise.all([
      loadDashboardData(),
      getTriggerQueueSnapshots(),
    ]);

    return {
      ...data,
      triggerQueues,
    };
  } catch {
    return {
      metrics: {
        totalApples: 0,
        totalOranges: 0,
        generatedProfiles: 0,
        totalMatchRuns: 0,
        strongMatchRate: 0,
        averageMutualScore: 0,
      },
      recentMatches: [],
      blockerCounts: [],
      triggerQueues: [],
    };
  }
}
