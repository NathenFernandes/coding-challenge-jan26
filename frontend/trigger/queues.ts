import { queue } from "@trigger.dev/sdk";

export const agentTurnQueue = queue({
  name: "agent-turn-queue",
  concurrencyLimit: 2,
});

export const matchQueue = queue({
  name: "fruit-match-queue",
  concurrencyLimit: 2,
});
