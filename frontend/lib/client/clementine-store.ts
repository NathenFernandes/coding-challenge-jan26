import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentChatMessage,
  FruitProfileSnapshot,
  MatchRunSnapshot,
} from "@/lib/shared/types";

interface MatchmakingState {
  sessionId: string | null;
  messages: AgentChatMessage[];
  profile: FruitProfileSnapshot | null;
  latestMatch: MatchRunSnapshot | null;
  isLoading: boolean;
  error: string | null;
  input: string;
  bootstrap: (data: {
    sessionId: string | null;
    initialMessages: AgentChatMessage[];
    profile: FruitProfileSnapshot | null;
    latestMatch: MatchRunSnapshot | null;
  }) => void;
  appendMessages: (messages: AgentChatMessage[]) => void;
  setSnapshot: (data: {
    profile: FruitProfileSnapshot | null;
    latestMatch: MatchRunSnapshot | null;
  }) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setInput: (input: string) => void;
  resetMessages: (initialMessage: AgentChatMessage) => void;
}

const initialState = {
  sessionId: null,
  messages: [],
  profile: null,
  latestMatch: null,
  isLoading: false,
  error: null,
  input: "",
};

function mergeMessagesById(
  currentMessages: AgentChatMessage[],
  incomingMessages: AgentChatMessage[],
): AgentChatMessage[] {
  const merged = new Map<string, AgentChatMessage>();

  for (const message of [...currentMessages, ...incomingMessages]) {
    merged.set(message.id, message);
  }

  return [...merged.values()].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export const useClementineStore = create<MatchmakingState>()(
  persist(
    (set) => ({
      ...initialState,
      bootstrap: ({ sessionId, initialMessages, profile, latestMatch }) =>
        set((state) => ({
          sessionId,
          messages: state.sessionId !== sessionId
            ? initialMessages
            : mergeMessagesById(state.messages, initialMessages),
          profile: state.sessionId !== sessionId ? profile : (state.profile ?? profile),
          latestMatch: state.sessionId !== sessionId
            ? latestMatch
            : (state.latestMatch ?? latestMatch),
        })),
      appendMessages: (messages) =>
        set((state) => ({
          messages: mergeMessagesById(state.messages, messages),
        })),
      setSnapshot: ({ profile, latestMatch }) =>
        set({
          profile,
          latestMatch,
        }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setInput: (input) => set({ input }),
      resetMessages: (initialMessage) =>
        set({
          messages: [initialMessage],
          error: null,
        }),
    }),
    {
      name: "clera-matchmaking-store",
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as {
          sessionId?: string | null;
          messages?: Array<Omit<AgentChatMessage, "role"> & {
            role?: string;
            toolCall?: { name?: string; result?: unknown };
          }>;
          profile?: FruitProfileSnapshot | null;
          latestMatch?: MatchRunSnapshot | null;
        };
        const messages: AgentChatMessage[] = (state.messages ?? []).map((message) =>
          message.role === "tool"
            ? {
              ...message,
              role: "tool_result",
              toolName: message.toolCall?.name,
              payload: message.toolCall?.result,
            }
            : {
              ...message,
              role: message.role === "assistant" || message.role === "user"
                || message.role === "tool_call" || message.role === "tool_result"
                ? message.role
                : "assistant",
            }
        );

        return {
          sessionId: state.sessionId ?? null,
          messages,
          profile: state.profile ?? null,
          latestMatch: state.latestMatch ?? null,
        };
      },
      partialize: (state) => ({
        sessionId: state.sessionId,
        messages: state.messages,
        profile: state.profile,
        latestMatch: state.latestMatch,
      }),
    },
  ),
);
