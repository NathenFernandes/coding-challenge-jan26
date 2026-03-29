import type {
  AgentChatMessage,
  AgentTraceEntry,
  FruitProfileSnapshot,
} from "@/lib/shared/types";

function nowIso(): string {
  return new Date().toISOString();
}

export function createAssistantMessage(content: string): AgentChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: nowIso(),
  };
}

export function createUserMessage(content: string): AgentChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: nowIso(),
  };
}

export function createTraceMessages(trace: AgentTraceEntry[]): AgentChatMessage[] {
  return trace.map((entry) => ({
    id: entry.id,
    role: entry.kind,
    content: entry.summary,
    createdAt: entry.createdAt,
    toolName: entry.toolName,
    payload: entry.payload,
  }));
}

export function createInitialAssistantMessage(
  initialProfile: FruitProfileSnapshot | null,
): AgentChatMessage {
  return createAssistantMessage(
    initialProfile
      ? `Welcome back. I still have your ${initialProfile.type} profile on file. Ask what I have on file, tell me what to update, or have me search again.`
      : "Hey there! I am Clementine the AI agent that finds your perfect pair. Before we start are you an apple or an orange?",
  );
}
