export type FruitType = "apple" | "orange";
export type ShineFactor = "dull" | "neutral" | "shiny" | "extraShiny";
export type OnboardingStatus = "needs_type" | "profile_generated";
export type MatchOutcome = "strong_match" | "best_available" | "no_match";

export interface FruitAttributes {
  size: number | null;
  weight: number | null;
  hasStem: boolean | null;
  hasLeaf: boolean | null;
  hasWorm: boolean | null;
  shineFactor: ShineFactor | null;
  hasChemicals: boolean | null;
}

export interface NumberRange {
  min?: number;
  max?: number;
}

export interface FruitPreferences {
  size?: NumberRange;
  weight?: NumberRange;
  hasStem?: boolean;
  hasLeaf?: boolean;
  hasWorm?: boolean;
  shineFactor?: ShineFactor | ShineFactor[];
  hasChemicals?: boolean;
}

export interface FruitProfileSnapshot {
  id: string;
  type: FruitType;
  status: OnboardingStatus;
  attributes: FruitAttributes;
  preferences: FruitPreferences;
  attributesText: string;
  preferencesText: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchDetailSnapshot {
  field: keyof FruitPreferences;
  score: number;
  weight: number;
  matched: boolean;
  reason: string;
}

export interface MatchCandidateSnapshot {
  candidateId: string;
  candidateType: FruitType;
  requesterScore: number;
  candidateScore: number;
  mutualScore: number;
  outcome: MatchOutcome;
  highlights: string[];
  blockers: string[];
  breakdown: {
    requester: MatchDetailSnapshot[];
    candidate: MatchDetailSnapshot[];
  };
  attributes: FruitAttributes;
  preferences: FruitPreferences;
}

export interface MatchRunSnapshot {
  id: string;
  requesterFruitId: string;
  bestMatchId: string | null;
  outcome: MatchOutcome;
  topMatches: MatchCandidateSnapshot[];
  narrative: string | null;
  createdAt: string;
}

export interface DashboardMetrics {
  totalApples: number;
  totalOranges: number;
  generatedProfiles: number;
  totalMatchRuns: number;
  strongMatchRate: number;
  averageMutualScore: number;
}

export interface TriggerQueueSnapshot {
  name: string;
  running: number;
  queued: number;
  paused: boolean;
  concurrencyLimit: number | null;
  currentConcurrency: number | null;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  recentMatches: MatchRunSnapshot[];
  blockerCounts: Array<{ label: string; count: number }>;
  triggerQueues: TriggerQueueSnapshot[];
}

export interface AgentRequestMessage {
  id?: string;
  role: "assistant" | "user";
  content: string;
  createdAt?: string;
}

export interface AgentTraceEntry {
  id: string;
  kind: "tool_call" | "tool_result";
  toolName: string;
  summary: string;
  payload: unknown;
  createdAt: string;
}

export interface AgentChatMessage {
  id: string;
  role: "assistant" | "user" | "tool_call" | "tool_result";
  content: string;
  createdAt: string;
  toolName?: string;
  payload?: unknown;
}

export interface AgentReply {
  message: string;
  finalMessage: AgentChatMessage | null;
  profile: FruitProfileSnapshot | null;
  latestMatch: MatchRunSnapshot | null;
  trace: AgentTraceEntry[];
}

export interface AgentTurnCompletedPayload {
  status: "completed";
}

export interface AgentTurnTracePayload {
  trace: AgentTraceEntry[];
}

export interface AgentSessionSnapshot {
  profile: FruitProfileSnapshot | null;
  latestMatch: MatchRunSnapshot | null;
}

export type AgentTurnStatus = "queued" | "processing" | "completed" | "failed";
export type AgentTurnEventType = AgentTurnStatus | "assistant_message" | "tool_trace";

export interface AgentTurnSnapshot {
  id: string;
  sessionId: string;
  status: AgentTurnStatus;
  requestMessages: AgentRequestMessage[];
  reply: AgentReply | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTurnEventSnapshot {
  id: string;
  turnId: string;
  sessionId: string;
  sequence: number;
  type: AgentTurnEventType;
  payload: unknown;
  createdAt: string;
}

export interface AgentTurnCreateResponse {
  turnId: string;
  status: AgentTurnStatus;
}
