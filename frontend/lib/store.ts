import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

// =============================================================================
// DISCLAIMER
// =============================================================================
// This store structure is just a STARTING POINT. Feel free to:
// - Completely redesign the state shape
// - Remove types/fields that don't fit your solution
// - Add your own types and actions
// - Use a different state management approach entirely
//
// The types below are examples based on what we imagined - your implementation
// may look completely different, and that's great!
// =============================================================================

// =============================================================================
// TYPES (Examples - modify or replace these!)
// =============================================================================

export interface Apple {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  preferences: Record<string, unknown>;
  createdAt: Date;
}

export interface Orange {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  preferences: Record<string, unknown>;
  createdAt: Date;
}

export interface Match {
  id: string;
  appleId: string;
  orangeId: string;
  score: number;
  status: "pending" | "confirmed" | "rejected";
  createdAt: Date;
}

export interface Conversation {
  id: string;
  type: "apple" | "orange";
  fruitId: string;
  messages: ConversationMessage[];
  status: "active" | "completed" | "error";
  createdAt: Date;
}

export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: Date;
}

// =============================================================================
// STORE STATE
// =============================================================================

interface MatchmakingState {
  apples: Apple[];
  oranges: Orange[];
  matches: Match[];
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  setApples: (apples: Apple[]) => void;
  setOranges: (oranges: Orange[]) => void;
  addMatch: (match: Match) => void;
  setActiveConversation: (id: string | null) => void;
  addConversation: (conversation: Conversation) => void;
  addMessageToConversation: (
    conversationId: string,
    message: ConversationMessage,
  ) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState = {
  apples: [],
  oranges: [],
  matches: [],
  conversations: [],
  activeConversationId: null,
  isLoading: false,
  error: null,
};

// =============================================================================
// STORE
// =============================================================================

export const useMatchmakingStore = create<MatchmakingState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setApples: (apples) => set({ apples }),

        setOranges: (oranges) => set({ oranges }),

        addMatch: (match) =>
          set((state) => ({
            matches: [...state.matches, match],
          })),

        setActiveConversation: (id) => set({ activeConversationId: id }),

        addConversation: (conversation) =>
          set((state) => ({
            conversations: [...state.conversations, conversation],
          })),

        addMessageToConversation: (conversationId, message) =>
          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === conversationId
                ? { ...conv, messages: [...conv.messages, message] }
                : conv
            ),
          })),

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        reset: () => set(initialState),
      }),
      {
        name: "matchmaking-storage",
        partialize: (state) => ({
          conversations: state.conversations,
          matches: state.matches,
        }),
      },
    ),
    { name: "MatchmakingStore" },
  ),
);

// =============================================================================
// SELECTORS
// =============================================================================

export const selectActiveConversation = (state: MatchmakingState) =>
  state.conversations.find((c) => c.id === state.activeConversationId);

export const selectMatchCount = (state: MatchmakingState) =>
  state.matches.length;

export const selectSuccessRate = (state: MatchmakingState) => {
  const confirmed = state.matches.filter((m) => m.status === "confirmed").length;
  return state.matches.length > 0
    ? Math.round((confirmed / state.matches.length) * 100)
    : 0;
};
