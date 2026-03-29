import { generateText, stepCountIs } from "ai";
import type {
  AgentChatMessage,
  AgentReply,
  AgentRequestMessage,
  FruitProfileSnapshot,
} from "@/lib/shared/types";
import { getAgentModel, hasGatewayKey } from "@/lib/server/env";
import { getActiveProfile } from "@/lib/server/repository";
import {
  buildSystemPrompt,
} from "./prompt";
import { buildAgentTrace, getLatestToolOutput } from "./trace";
import { createAgentTools } from "./tools";

const MISSING_FINAL_MESSAGE_ERROR = "Clementine did not send a final message.";

type GenerateTextLikeResult = {
  text: string;
  steps: Array<{
    toolCalls: Array<{
      toolCallId?: string;
      toolName: string;
      input: unknown;
    }>;
    toolResults: Array<{
      toolCallId?: string;
      toolName: string;
      input: unknown;
      output: unknown;
    }>;
  }>;
};

type SendMessageOutput = {
  sent: boolean;
  final: boolean;
  message: AgentChatMessage;
};

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildCorrectionInstructions(trace: AgentReply["trace"]): string {
  const priorTrace = trace.length > 0
    ? stringifyForPrompt(
      trace.map((entry) => ({
        kind: entry.kind,
        toolName: entry.toolName,
        summary: entry.summary,
        payload: entry.payload,
      })),
    )
    : "[]";

  return [
    "Correction:",
    "- Your previous attempt did not finish correctly.",
    "- You must end this turn now by calling send_message with final: true.",
    "- Do not send plain assistant text outside the tool.",
    "- Do not repeat work that already completed unless absolutely necessary.",
    "- Use the current saved state and the prior tool activity below to compose the final reply.",
    "",
    `Prior tool activity from the failed attempt:\n${priorTrace}`,
  ].join("\n");
}

interface GenerateAgentResultInput {
  messages: AgentRequestMessage[];
  profile: FruitProfileSnapshot | null;
  sessionId: string;
  turnId: string;
  lastUserMessage: string;
  correctionInstructions?: string;
  maxSteps?: number;
}

async function generateAgentResult({
  messages,
  profile,
  sessionId,
  turnId,
  lastUserMessage,
  correctionInstructions,
  maxSteps = 6,
}: GenerateAgentResultInput): Promise<GenerateTextLikeResult> {
  const buildSystem = (currentProfile: FruitProfileSnapshot | null) => {
    const base = buildSystemPrompt(currentProfile);
    return correctionInstructions
      ? `${base}\n\n${correctionInstructions}`
      : base;
  };

  return generateText({
    model: getAgentModel(),
    system: buildSystem(profile),
    temperature: 0.2,
    stopWhen: stepCountIs(maxSteps),
    prepareStep: async ({ stepNumber }) => {
      if (stepNumber === 0) {
        return {
          system: buildSystem(profile),
        };
      }

      const refreshedProfile = await getActiveProfile(sessionId);
      return {
        system: buildSystem(refreshedProfile),
      };
    },
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    tools: createAgentTools({
      sessionId,
      turnId,
      lastUserMessage,
    }),
  }) as Promise<GenerateTextLikeResult>;
}

export interface RunAgentTurnInput {
  messages: AgentRequestMessage[];
  profile: FruitProfileSnapshot | null;
  sessionId: string;
  turnId: string;
}

export async function runAgentTurn({
  messages,
  profile,
  sessionId,
  turnId,
}: RunAgentTurnInput): Promise<Pick<AgentReply, "message" | "trace" | "finalMessage">> {
  if (!hasGatewayKey()) {
    throw new Error("AI gateway is not configured.");
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const firstResult = await generateAgentResult({
    messages: messages.map((message) => ({
      ...message,
    })),
    profile,
    sessionId,
    turnId,
    lastUserMessage,
  });

  let trace = buildAgentTrace(firstResult.steps);
  let finalMessage = getLatestToolOutput<SendMessageOutput>(
    firstResult.steps,
    "send_message",
  );

  if (!finalMessage || finalMessage.final !== true || !finalMessage.message?.content?.trim()) {
    const correctiveResult = await generateAgentResult({
      messages,
      profile: await getActiveProfile(sessionId),
      sessionId,
      turnId,
      lastUserMessage,
      correctionInstructions: buildCorrectionInstructions(trace),
      maxSteps: 3,
    });

    trace = [...trace, ...buildAgentTrace(correctiveResult.steps)];
    finalMessage = getLatestToolOutput<SendMessageOutput>(
      correctiveResult.steps,
      "send_message",
    );
  }

  if (!finalMessage || finalMessage.final !== true || !finalMessage.message?.content?.trim()) {
    throw new Error(MISSING_FINAL_MESSAGE_ERROR);
  }

  return {
    message: finalMessage.message.content.trim(),
    finalMessage: finalMessage.message,
    trace,
  };
}
