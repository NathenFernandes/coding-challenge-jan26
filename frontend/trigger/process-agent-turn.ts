import { randomUUID } from "node:crypto";
import { task } from "@trigger.dev/sdk";
import { runAgentTurn } from "@/lib/server/agent/orchestrator";
import {
  appendAgentTurnEvent,
  completeAgentTurn,
  failAgentTurn,
  getActiveProfile,
  getAgentTurn,
  getLatestMatchRun,
  markAgentTurnProcessing,
  saveConversationMessages,
  saveMatchNarrative,
} from "@/lib/server/repository";
import type {
  AgentChatMessage,
  AgentReply,
  AgentTurnCompletedPayload,
  AgentTurnTracePayload,
} from "@/lib/shared/types";
import { agentTurnQueue } from "./queues";

function nowIso(): string {
  return new Date().toISOString();
}

export const processAgentTurnTask = task({
  id: "process-agent-turn",
  queue: agentTurnQueue,
  run: async (payload: { sessionId: string; turnId: string }) => {
    const turn = await getAgentTurn(payload.turnId);

    if (!turn) {
      throw new Error("No stored agent turn found for this run.");
    }

    await markAgentTurnProcessing(turn.id);

    try {
      const lastUserMessage = [...turn.requestMessages]
        .reverse()
        .find((message) => message.role === "user") ?? null;
      const profileBefore = await getActiveProfile(payload.sessionId);
      const latestMatchBefore = await getLatestMatchRun(payload.sessionId);
      const turnResult = await runAgentTurn({
        messages: turn.requestMessages,
        profile: profileBefore,
        sessionId: payload.sessionId,
        turnId: turn.id,
      });
      const profileAfter = await getActiveProfile(payload.sessionId);
      const latestMatchAfter = await getLatestMatchRun(payload.sessionId);

      if (
        latestMatchAfter
        && latestMatchAfter.id !== latestMatchBefore?.id
        && turnResult.message
      ) {
        await saveMatchNarrative(latestMatchAfter.id, turnResult.message);
      }

      const messagesToPersist: AgentChatMessage[] = [];
      if (lastUserMessage) {
        messagesToPersist.push({
          id: lastUserMessage.id ?? randomUUID(),
          role: "user",
          content: lastUserMessage.content,
          createdAt: lastUserMessage.createdAt ?? nowIso(),
        });
      }

      messagesToPersist.push(
        ...turnResult.trace.map((entry) => ({
          id: entry.id,
          role: entry.kind,
          content: entry.summary,
          createdAt: entry.createdAt,
          toolName: entry.toolName,
          payload: entry.payload,
        })),
      );

      await saveConversationMessages(payload.sessionId, messagesToPersist);

      const reply: AgentReply = {
        message: turnResult.message,
        finalMessage: turnResult.finalMessage,
        profile: profileAfter,
        latestMatch: latestMatchAfter,
        trace: turnResult.trace,
      };

      const tracePayload: AgentTurnTracePayload = {
        trace: turnResult.trace,
      };
      await appendAgentTurnEvent(turn.id, turn.sessionId, "tool_trace", tracePayload);
      await completeAgentTurn(turn.id, reply);

      return {
        turnId: turn.id,
        completedPayload: { status: "completed" as AgentTurnCompletedPayload["status"] },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent error";
      await failAgentTurn(turn.id, message);
      throw error;
    }
  },
});
