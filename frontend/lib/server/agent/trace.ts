import { randomUUID } from "node:crypto";
import type { AgentTraceEntry } from "@/lib/shared/types";

interface RawToolCall {
  toolCallId?: string;
  toolName: string;
  input: unknown;
}

interface RawToolResult extends RawToolCall {
  output: unknown;
}

interface RawStepResult {
  toolCalls: RawToolCall[];
  toolResults: RawToolResult[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function summariseToolCall(toolName: string, input: unknown): { summary: string; payload: unknown } {
  switch (toolName) {
    case "create_fruit_profile":
      return {
        summary: "Creating a random fruit profile for this session.",
        payload: input,
      };
    case "update_my_profile":
      return {
        summary: "Updating the saved fruit profile with the stats you just gave Clementine.",
        payload: input,
      };
    case "update_looking_for":
      return {
        summary: "Updating what this fruit is looking for in a match.",
        payload: input,
      };
    case "find_matches":
      return {
        summary: "Running the orchard search and reranking candidates by mutual fit.",
        payload: input,
      };
    case "send_message":
      return {
        summary: "Sending an assistant message into the chat.",
        payload: input,
      };
    default:
      return {
        summary: `Calling ${toolName}.`,
        payload: input,
      };
  }
}

function summariseToolResult(toolName: string, output: unknown): { summary: string; payload: unknown } {
  switch (toolName) {
    case "create_fruit_profile": {
      const profile = (output as { profile?: {
        type: string;
        status: string;
        attributesText: string;
        preferencesText: string;
      } }).profile;

      return {
        summary: "Profile created and stored for this session.",
        payload: profile
          ? {
            type: profile.type,
            status: profile.status,
            attributesText: profile.attributesText,
            preferencesText: profile.preferencesText,
          }
          : output,
      };
    }
    case "update_my_profile": {
      const profile = (output as { profile?: {
        status: string;
        attributes: unknown;
        attributesText: string;
      } }).profile;

      return {
        summary: "Saved the fruit's own profile changes.",
        payload: profile
          ? {
            status: profile.status,
            attributes: profile.attributes,
            attributesText: profile.attributesText,
          }
          : output,
      };
    }
    case "update_looking_for": {
      const profile = (output as { profile?: {
        status: string;
        preferences: unknown;
        preferencesText: string;
      } }).profile;

      return {
        summary: "Saved the preference update to the active fruit profile.",
        payload: profile
          ? {
            status: profile.status,
            preferences: profile.preferences,
            preferencesText: profile.preferencesText,
          }
          : output,
      };
    }
    case "find_matches": {
      const matches = (output as { matches?: unknown[] }).matches;

      return {
        summary: "Top candidates ranked and ready for Clementine to explain.",
        payload: matches ? { matches } : output,
      };
    }
    case "send_message": {
      const data = output as { message?: unknown; final?: boolean };
      const message = data.message;

      return {
        summary: data.final
          ? "Final assistant reply saved to the conversation."
          : "Progress update saved to the conversation.",
        payload: message ? { message, final: data.final === true } : output,
      };
    }
    default:
      return {
        summary: `${toolName} returned successfully.`,
        payload: output,
      };
  }
}

export function buildAgentTrace(steps: RawStepResult[]): AgentTraceEntry[] {
  const trace: AgentTraceEntry[] = [];

  for (const step of steps) {
    const resultByCallId = new Map(
      step.toolResults.map((result) => [result.toolCallId, result] as const),
    );

    for (const toolCall of step.toolCalls) {
      const callSummary = summariseToolCall(toolCall.toolName, toolCall.input);
      trace.push({
        id: randomUUID(),
        kind: "tool_call",
        toolName: toolCall.toolName,
        summary: callSummary.summary,
        payload: callSummary.payload,
        createdAt: nowIso(),
      });

      const toolResult = resultByCallId.get(toolCall.toolCallId);
      if (!toolResult) {
        continue;
      }

      const resultSummary = summariseToolResult(
        toolResult.toolName,
        toolResult.output,
      );
      trace.push({
        id: randomUUID(),
        kind: "tool_result",
        toolName: toolResult.toolName,
        summary: resultSummary.summary,
        payload: resultSummary.payload,
        createdAt: nowIso(),
      });
    }
  }

  return trace;
}

export function getLatestToolOutput<T>(
  steps: RawStepResult[],
  toolName: string,
): T | null {
  for (const step of [...steps].reverse()) {
    for (const toolResult of [...step.toolResults].reverse()) {
      if (toolResult.toolName === toolName) {
        return toolResult.output as T;
      }
    }
  }

  return null;
}

export function hasToolResult(steps: RawStepResult[], toolName: string): boolean {
  return getLatestToolOutput(steps, toolName) !== null;
}
