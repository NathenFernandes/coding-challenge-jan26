import { readFile } from "node:fs/promises";
import path from "node:path";
import { cosineSimilarity } from "ai";
import {
  communicateAttributes,
  communicatePreferences,
  type Fruit,
  type FruitAttributes,
  type FruitPreferences,
  type FruitType,
  type ShineFactor,
} from "../../../supabase/functions/_shared/generateFruit";
import {
  buildDeterministicNarrative,
  harmonicMean,
  outcomeForScore,
  scoreFruitPair,
  type MatchOutcome,
} from "../../../supabase/functions/_shared/matching";
import {
  ensureSurrealSchema,
  extractResult,
  runSurrealQuery,
  surrealLiteral,
} from "../../../supabase/functions/_shared/surreal";
import type {
  AgentChatMessage,
  AgentReply,
  AgentRequestMessage,
  AgentSessionSnapshot,
  AgentTurnCompletedPayload,
  AgentTurnEventType,
  AgentTurnEventSnapshot,
  AgentTurnSnapshot,
  AgentTurnStatus,
  DashboardData,
  FruitProfileSnapshot,
  MatchCandidateSnapshot,
  MatchRunSnapshot,
  OnboardingStatus,
} from "../shared/types";
import { getSurrealConfig } from "./env";
import {
  embedFruitProfile,
  embedFruitProfiles,
  MATCH_SHORTLIST_SIZE,
  MATCH_VECTOR_EFFORT,
} from "./fruit-embeddings";
import { requestIncomingFruitFromSupabase } from "./supabase-functions";

interface StoredFruitRecord {
  id: string;
  type: FruitType;
  source: "seed" | "generated";
  sessionId: string | null;
  active?: boolean;
  onboardingStatus?: OnboardingStatus;
  attributes: FruitAttributes;
  preferences: FruitPreferences;
  selfEmbedding?: number[];
  lookingForEmbedding?: number[];
  attributesText?: string;
  preferencesText?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredFruitSearchRecord extends StoredFruitRecord {
  distance?: number;
}

interface StoredMatchRunRecord {
  id: string;
  sessionId: string;
  requesterFruitId: string;
  bestMatchId: string | null;
  outcome: MatchOutcome;
  topMatches: MatchCandidateSnapshot[];
  narrative: string | null;
  createdAt: string;
}

interface StoredMessageRecord {
  id: string;
  messageId: string;
  sessionId: string;
  role: AgentChatMessage["role"];
  content: string;
  toolName?: string | null;
  payload?: unknown;
  createdAt: string;
}

interface StoredAgentTurnRecord {
  id: string;
  sessionId: string;
  status: AgentTurnStatus;
  requestMessages: AgentRequestMessage[];
  reply: AgentReply | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredAgentTurnEventRecord {
  id: string;
  turnId: string;
  sessionId: string;
  sequence: number;
  type: AgentTurnEventType;
  payload: unknown;
  createdAt: string;
}

export interface PreferencePatchInput {
  resetExistingPreferences?: boolean;
  sizeMin?: number;
  sizeMax?: number;
  weightMin?: number;
  weightMax?: number;
  hasStem?: boolean;
  hasLeaf?: boolean;
  hasWorm?: boolean;
  shineFactors?: ShineFactor[];
  hasChemicals?: boolean;
}

export interface AttributePatchInput {
  size?: number;
  weight?: number;
  hasStem?: boolean;
  hasLeaf?: boolean;
  hasWorm?: boolean;
  shineFactor?: ShineFactor;
  hasChemicals?: boolean;
}

let initialisationPromise: Promise<void> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function normaliseFruitRecord(record: StoredFruitRecord): FruitProfileSnapshot {
  return {
    id: record.id,
    type: record.type,
    status: "profile_generated",
    attributes: record.attributes,
    preferences: record.preferences ?? {},
    attributesText: record.attributesText ?? "",
    preferencesText: record.preferencesText ?? "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normaliseMatchRun(record: StoredMatchRunRecord): MatchRunSnapshot {
  return {
    id: record.id,
    requesterFruitId: record.requesterFruitId,
    bestMatchId: record.bestMatchId,
    outcome: record.outcome,
    topMatches: record.topMatches ?? [],
    narrative: record.narrative ?? null,
    createdAt: record.createdAt,
  };
}

function normaliseConversationMessage(record: StoredMessageRecord): AgentChatMessage {
  return {
    id: record.messageId,
    role: record.role,
    content: record.content,
    createdAt: record.createdAt,
    toolName: record.toolName ?? undefined,
    payload: record.payload,
  };
}

function formatToolContextContent(record: StoredMessageRecord): string {
  const prefix = record.role === "tool_call"
    ? `Context from a previous tool call (${record.toolName ?? "tool"}):`
    : `Context from a previous tool result (${record.toolName ?? "tool"}):`;
  const payload = record.payload == null
    ? "null"
    : JSON.stringify(record.payload, null, 2);

  return [
    prefix,
    record.content,
    payload,
  ].join("\n");
}

function toRequestContextMessage(record: StoredMessageRecord): AgentRequestMessage {
  if (record.role === "user" || record.role === "assistant") {
    return {
      id: record.messageId,
      role: record.role,
      content: record.content,
      createdAt: record.createdAt,
    };
  }

  return {
    id: `${record.messageId}-context`,
    role: "assistant",
    content: formatToolContextContent(record),
    createdAt: record.createdAt,
  };
}

function normaliseAgentTurn(record: StoredAgentTurnRecord): AgentTurnSnapshot {
  return {
    id: record.id,
    sessionId: record.sessionId,
    status: record.status,
    requestMessages: record.requestMessages ?? [],
    reply: record.reply ?? null,
    error: record.error ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normaliseAgentTurnEvent(record: StoredAgentTurnEventRecord): AgentTurnEventSnapshot {
  return {
    id: record.id,
    turnId: record.turnId,
    sessionId: record.sessionId,
    sequence: record.sequence,
    type: record.type,
    payload: record.payload,
    createdAt: record.createdAt,
  };
}

function toFruit(record: Pick<StoredFruitRecord, "type" | "attributes" | "preferences">): Fruit {
  return {
    type: record.type,
    attributes: record.attributes,
    preferences: record.preferences ?? {},
  };
}

function normaliseSimilarityScore(value: number): number {
  const bounded = Math.min(1, Math.max(0, (value + 1) / 2));
  return Math.round(bounded * 1000) / 1000;
}

function isEmbeddingMissing(record: StoredFruitRecord): boolean {
  return !Array.isArray(record.selfEmbedding)
    || record.selfEmbedding.length === 0
    || !Array.isArray(record.lookingForEmbedding)
    || record.lookingForEmbedding.length === 0;
}

async function deactivateActiveProfiles(
  sessionId: string,
  updatedAt: string,
): Promise<void> {
  const config = getSurrealConfig();
  await runSurrealQuery(config, `
    UPDATE fruit
    SET active = false, updatedAt = ${surrealLiteral(updatedAt)}
    WHERE sessionId = ${surrealLiteral(sessionId)} AND active = true;
  `);
}

async function createStoredFruitProfileFromIncomingPayload(
  sessionId: string,
  type: FruitType,
): Promise<FruitProfileSnapshot> {
  const incomingFruit = await requestIncomingFruitFromSupabase(type);
  const embedding = await embedFruitProfile({
    type,
    attributes: incomingFruit.attributes,
    preferences: incomingFruit.preferences,
  });
  const config = getSurrealConfig();
  const createdAt = nowIso();

  await deactivateActiveProfiles(sessionId, createdAt);

  const record = {
    type,
    source: "generated",
    sessionId,
    active: true,
    onboardingStatus: "profile_generated" as OnboardingStatus,
    attributes: incomingFruit.attributes,
    preferences: incomingFruit.preferences,
    selfEmbedding: embedding.selfEmbedding,
    lookingForEmbedding: embedding.lookingForEmbedding,
    attributesText: incomingFruit.attributesText,
    preferencesText: incomingFruit.preferencesText,
    createdAt,
    updatedAt: createdAt,
  };

  const results = await runSurrealQuery<StoredFruitRecord[]>(config, `
    CREATE fruit CONTENT ${surrealLiteral(record)};
  `);
  const rows = extractResult<StoredFruitRecord[]>(results);
  const createdRecord = rows[0];

  if (!createdRecord) {
    throw new Error("SurrealDB did not return the created fruit profile.");
  }

  return normaliseFruitRecord(createdRecord);
}

function mergePreferencePatch(
  existing: FruitPreferences,
  patch: PreferencePatchInput,
): FruitPreferences {
  const next: FruitPreferences = patch.resetExistingPreferences ? {} : { ...existing };

  const size: FruitPreferences["size"] = patch.resetExistingPreferences
    ? undefined
    : existing.size
      ? { ...existing.size }
      : undefined;
  const weight: FruitPreferences["weight"] = patch.resetExistingPreferences
    ? undefined
    : existing.weight
      ? { ...existing.weight }
      : undefined;

  if (patch.sizeMin !== undefined || patch.sizeMax !== undefined) {
    next.size = { ...(size ?? {}) };
    if (patch.sizeMin !== undefined) {
      next.size.min = patch.sizeMin;
    }
    if (patch.sizeMax !== undefined) {
      next.size.max = patch.sizeMax;
    }
  }

  if (patch.weightMin !== undefined || patch.weightMax !== undefined) {
    next.weight = { ...(weight ?? {}) };
    if (patch.weightMin !== undefined) {
      next.weight.min = patch.weightMin;
    }
    if (patch.weightMax !== undefined) {
      next.weight.max = patch.weightMax;
    }
  }

  if (next.size?.min !== undefined && next.size.max !== undefined && next.size.min > next.size.max) {
    throw new Error("Size minimum cannot be greater than size maximum.");
  }

  if (
    next.weight?.min !== undefined
    && next.weight.max !== undefined
    && next.weight.min > next.weight.max
  ) {
    throw new Error("Weight minimum cannot be greater than weight maximum.");
  }

  if (patch.hasStem !== undefined) {
    next.hasStem = patch.hasStem;
  }

  if (patch.hasLeaf !== undefined) {
    next.hasLeaf = patch.hasLeaf;
  }

  if (patch.hasWorm !== undefined) {
    next.hasWorm = patch.hasWorm;
  }

  if (patch.hasChemicals !== undefined) {
    next.hasChemicals = patch.hasChemicals;
  }

  if (patch.shineFactors !== undefined) {
    next.shineFactor = patch.shineFactors.length === 1
      ? patch.shineFactors[0]
      : patch.shineFactors;
  }

  return next;
}

function mergeAttributePatch(
  existing: FruitAttributes,
  patch: AttributePatchInput,
): FruitAttributes {
  const next: FruitAttributes = { ...existing };

  if (patch.size !== undefined) {
    next.size = patch.size;
  }

  if (patch.weight !== undefined) {
    next.weight = patch.weight;
  }

  if (patch.hasStem !== undefined) {
    next.hasStem = patch.hasStem;
  }

  if (patch.hasLeaf !== undefined) {
    next.hasLeaf = patch.hasLeaf;
  }

  if (patch.hasWorm !== undefined) {
    next.hasWorm = patch.hasWorm;
  }

  if (patch.shineFactor !== undefined) {
    next.shineFactor = patch.shineFactor;
  }

  if (patch.hasChemicals !== undefined) {
    next.hasChemicals = patch.hasChemicals;
  }

  if (next.size !== null && (next.size < 2 || next.size > 14)) {
    throw new Error("Size must be between 2 and 14.");
  }

  if (next.weight !== null && (next.weight < 50 || next.weight > 350)) {
    throw new Error("Weight must be between 50 and 350 grams.");
  }

  return next;
}

function convertCandidateSnapshot(candidate: {
  candidateId: string | null;
  candidate: Fruit;
  requesterScore: number;
  candidateScore: number;
  mutualScore: number;
  outcome: MatchOutcome;
  highlights: string[];
  blockers: string[];
  breakdown: {
    requester: MatchCandidateSnapshot["breakdown"]["requester"];
    candidate: MatchCandidateSnapshot["breakdown"]["candidate"];
  };
}): MatchCandidateSnapshot {
  return {
    candidateId: candidate.candidateId ?? "",
    candidateType: candidate.candidate.type,
    requesterScore: candidate.requesterScore,
    candidateScore: candidate.candidateScore,
    mutualScore: candidate.mutualScore,
    outcome: candidate.outcome,
    highlights: candidate.highlights,
    blockers: candidate.blockers,
    breakdown: {
      requester: candidate.breakdown.requester,
      candidate: candidate.breakdown.candidate,
    },
    attributes: candidate.candidate.attributes,
    preferences: candidate.candidate.preferences,
  };
}

async function seedDataPath(): Promise<string> {
  return path.join(process.cwd(), "..", "data", "raw_apples_and_oranges.json");
}

async function ensureSeedData(): Promise<void> {
  const config = getSurrealConfig();
  const countResults = await runSurrealQuery<Array<{ count: number }>>(config, `
    SELECT count() AS count FROM fruit WHERE source = "seed" GROUP ALL;
  `);
  const rows = extractResult<Array<{ count: number }>>(countResults);
  const currentCount = rows[0]?.count ?? 0;
  if (currentCount > 0) {
    return;
  }

  const rawData = await readFile(await seedDataPath(), "utf8");
  const fruits = JSON.parse(rawData) as Fruit[];
  const embeddings = await embedFruitProfiles(
    fruits.map((fruit) => ({
      type: fruit.type,
      attributes: fruit.attributes,
      preferences: fruit.preferences,
    })),
  );
  const statements = fruits.map((fruit, index) => {
    const embedding = embeddings[index];
    const createdAt = new Date(Date.now() - (fruits.length - index) * 60_000).toISOString();
    const record = {
      type: fruit.type,
      source: "seed",
      sessionId: null,
      active: false,
      onboardingStatus: null,
      attributes: fruit.attributes,
      preferences: fruit.preferences,
      selfEmbedding: embedding?.selfEmbedding ?? [],
      lookingForEmbedding: embedding?.lookingForEmbedding ?? [],
      attributesText: communicateAttributes(fruit),
      preferencesText: communicatePreferences(fruit),
      createdAt,
      updatedAt: createdAt,
    };
    return `CREATE fruit CONTENT ${surrealLiteral(record)};`;
  });

  await runSurrealQuery(config, statements.join("\n"));
}

async function ensureFruitEmbeddings(): Promise<void> {
  const config = getSurrealConfig();
  const results = await runSurrealQuery<StoredFruitRecord[]>(config, `
    SELECT * FROM fruit;
  `);
  const rows = extractResult<StoredFruitRecord[]>(results);
  const missing = rows.filter(isEmbeddingMissing);

  if (missing.length === 0) {
    return;
  }

  const embeddings = await embedFruitProfiles(
    missing.map((fruit) => ({
      type: fruit.type,
      attributes: fruit.attributes,
      preferences: fruit.preferences ?? {},
    })),
  );

  const statements = missing.map((fruit, index) => {
    const embedding = embeddings[index];
    return `UPDATE ${fruit.id} MERGE ${surrealLiteral({
      selfEmbedding: embedding?.selfEmbedding ?? [],
      lookingForEmbedding: embedding?.lookingForEmbedding ?? [],
      updatedAt: fruit.updatedAt ?? nowIso(),
    })};`;
  });

  if (statements.length > 0) {
    await runSurrealQuery(config, statements.join("\n"));
  }
}

export async function ensureDatabaseReady(): Promise<void> {
  if (!initialisationPromise) {
    initialisationPromise = (async () => {
      const config = getSurrealConfig();
      await ensureSurrealSchema(config);
      await ensureSeedData();
      await ensureFruitEmbeddings();
    })();
  }

  return initialisationPromise;
}

export async function getActiveProfile(sessionId: string): Promise<FruitProfileSnapshot | null> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const results = await runSurrealQuery<StoredFruitRecord[]>(config, `
    SELECT * FROM fruit
    WHERE sessionId = ${surrealLiteral(sessionId)} AND active = true
    ORDER BY updatedAt DESC
    LIMIT 1;
  `);
  const rows = extractResult<StoredFruitRecord[]>(results);
  const record = rows[0];
  return record ? normaliseFruitRecord(record) : null;
}

export async function createFruitProfile(
  sessionId: string,
  type: FruitType,
): Promise<FruitProfileSnapshot> {
  await ensureDatabaseReady();
  return createStoredFruitProfileFromIncomingPayload(
    sessionId,
    type,
  );
}

export async function updateActiveProfilePreferences(
  sessionId: string,
  patch: PreferencePatchInput,
): Promise<FruitProfileSnapshot> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const activeProfile = await getActiveProfile(sessionId);

  if (!activeProfile) {
    throw new Error("No active fruit profile found for this session.");
  }

  const mergedPreferences = mergePreferencePatch(activeProfile.preferences, patch);
  const updatedFruit: Fruit = {
    type: activeProfile.type,
    attributes: activeProfile.attributes,
    preferences: mergedPreferences,
  };
  const embedding = await embedFruitProfile(updatedFruit);
  const updatedAt = nowIso();

  const results = await runSurrealQuery<StoredFruitRecord>(config, `
    UPDATE ${activeProfile.id}
    MERGE ${surrealLiteral({
      preferences: mergedPreferences,
      lookingForEmbedding: embedding.lookingForEmbedding,
      preferencesText: communicatePreferences(updatedFruit),
      onboardingStatus: "profile_generated",
      updatedAt,
    })};
  `);

  return normaliseFruitRecord(extractResult<StoredFruitRecord>(results));
}

export async function updateActiveProfileAttributes(
  sessionId: string,
  patch: AttributePatchInput,
): Promise<FruitProfileSnapshot> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const activeProfile = await getActiveProfile(sessionId);

  if (!activeProfile) {
    throw new Error("No active fruit profile found for this session.");
  }

  const mergedAttributes = mergeAttributePatch(activeProfile.attributes, patch);
  const updatedFruit: Fruit = {
    type: activeProfile.type,
    attributes: mergedAttributes,
    preferences: activeProfile.preferences,
  };
  const embedding = await embedFruitProfile(updatedFruit);
  const updatedAt = nowIso();

  const results = await runSurrealQuery<StoredFruitRecord>(config, `
    UPDATE ${activeProfile.id}
    MERGE ${surrealLiteral({
      attributes: mergedAttributes,
      selfEmbedding: embedding.selfEmbedding,
      attributesText: communicateAttributes(updatedFruit),
      onboardingStatus: "profile_generated",
      updatedAt,
    })};
  `);

  return normaliseFruitRecord(extractResult<StoredFruitRecord>(results));
}

export async function getLatestMatchRun(sessionId: string): Promise<MatchRunSnapshot | null> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const results = await runSurrealQuery<StoredMatchRunRecord[]>(config, `
    SELECT * FROM match_run
    WHERE sessionId = ${surrealLiteral(sessionId)}
    ORDER BY createdAt DESC
    LIMIT 1;
  `);
  const rows = extractResult<StoredMatchRunRecord[]>(results);
  return rows[0] ? normaliseMatchRun(rows[0]) : null;
}

export async function getAgentSessionSnapshot(
  sessionId: string,
): Promise<AgentSessionSnapshot> {
  const [profile, latestMatch] = await Promise.all([
    getActiveProfile(sessionId),
    getLatestMatchRun(sessionId),
  ]);

  return {
    profile,
    latestMatch,
  };
}

async function shortlistMatchCandidates(
  config: ReturnType<typeof getSurrealConfig>,
  requester: StoredFruitRecord,
): Promise<StoredFruitRecord[]> {
  const oppositeType = requester.type === "apple" ? "orange" : "apple";
  const retrievalLimit = MATCH_SHORTLIST_SIZE * 3;
  const shortlistQuery = (field: "selfEmbedding" | "lookingForEmbedding", embedding: number[]) => `
    SELECT *, vector::distance::knn() AS distance
    FROM fruit
    WHERE type = ${surrealLiteral(oppositeType)}
      AND id != ${requester.id}
      AND ${field} <|${MATCH_SHORTLIST_SIZE},${MATCH_VECTOR_EFFORT}|> ${surrealLiteral(embedding)}
    ORDER BY distance
    LIMIT ${retrievalLimit};
  `;

  const [selfMatches, lookingForMatches] = await Promise.all([
    runSurrealQuery<StoredFruitSearchRecord[]>(config, shortlistQuery("selfEmbedding", requester.lookingForEmbedding ?? [])),
    runSurrealQuery<StoredFruitSearchRecord[]>(config, shortlistQuery("lookingForEmbedding", requester.selfEmbedding ?? [])),
  ]);

  const combined = new Map<string, StoredFruitRecord>();
  for (const candidate of [
    ...extractResult<StoredFruitSearchRecord[]>(selfMatches),
    ...extractResult<StoredFruitSearchRecord[]>(lookingForMatches),
  ]) {
    combined.set(candidate.id, candidate);
  }

  return [...combined.values()].filter(
    (candidate) => (candidate.source === "seed" || candidate.active === true)
      && Array.isArray(candidate.selfEmbedding)
      && candidate.selfEmbedding.length > 0
      && Array.isArray(candidate.lookingForEmbedding)
      && candidate.lookingForEmbedding.length > 0,
  );
}

export async function findMatchesForActiveProfile(
  sessionId: string,
): Promise<MatchRunSnapshot> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const requesterResults = await runSurrealQuery<StoredFruitRecord[]>(config, `
    SELECT * FROM fruit
    WHERE sessionId = ${surrealLiteral(sessionId)} AND active = true
    ORDER BY updatedAt DESC
    LIMIT 1;
  `);
  const requester = extractResult<StoredFruitRecord[]>(requesterResults)[0];

  if (!requester) {
    throw new Error("No active fruit profile found for this session.");
  }

  if (isEmbeddingMissing(requester)) {
    const [embedding] = await embedFruitProfiles([toFruit(requester)]);
    requester.selfEmbedding = embedding?.selfEmbedding ?? [];
    requester.lookingForEmbedding = embedding?.lookingForEmbedding ?? [];
    await runSurrealQuery(config, `
      UPDATE ${requester.id}
      MERGE ${surrealLiteral({
        selfEmbedding: requester.selfEmbedding,
        lookingForEmbedding: requester.lookingForEmbedding,
        updatedAt: requester.updatedAt,
      })};
    `);
  }

  const candidates = await shortlistMatchCandidates(config, requester);
  const requesterFruit = toFruit(requester);
  const ranked = candidates
    .map((candidate) => {
      const structured = scoreFruitPair(requesterFruit, candidate as Fruit & { id?: string });
      const requesterScore = normaliseSimilarityScore(
        cosineSimilarity(requester.lookingForEmbedding ?? [], candidate.selfEmbedding ?? []),
      );
      const candidateScore = normaliseSimilarityScore(
        cosineSimilarity(candidate.lookingForEmbedding ?? [], requester.selfEmbedding ?? []),
      );
      const mutualScore = harmonicMean(requesterScore, candidateScore);
      const semanticHighlights = [
        requesterScore >= 0.8 ? "Their overall profile strongly matches what you are looking for." : null,
        candidateScore >= 0.8 ? "Their stated preferences strongly align with your profile." : null,
      ].filter((value): value is string => Boolean(value));

      return {
        candidate: candidate as Fruit & { id?: string },
        candidateId: candidate.id ?? null,
        requesterScore,
        candidateScore,
        mutualScore,
        outcome: outcomeForScore(mutualScore),
        breakdown: structured.breakdown,
        blockers: structured.blockers,
        highlights: [...new Set([...semanticHighlights, ...structured.highlights])].slice(0, 5),
      };
    })
    .sort((left, right) =>
      right.mutualScore - left.mutualScore
      || right.requesterScore - left.requesterScore
      || right.candidateScore - left.candidateScore
      || left.blockers.length - right.blockers.length
    );

  const topMatches = ranked.slice(0, 5).map(convertCandidateSnapshot);
  const bestMatchId = topMatches[0]?.candidateId ?? null;
  const outcome = topMatches[0]?.outcome ?? "no_match";
  const createdAt = nowIso();
  const deterministicNarrative = buildDeterministicNarrative(
    requesterFruit,
    ranked,
  );

  const record = {
    sessionId,
    requesterFruitId: requester.id,
    bestMatchId,
    outcome,
    topMatches,
    narrative: deterministicNarrative,
    createdAt,
  };

  const writeResults = await runSurrealQuery<StoredMatchRunRecord[]>(config, `
    CREATE match_run CONTENT ${surrealLiteral(record)};
  `);
  const rows = extractResult<StoredMatchRunRecord[]>(writeResults);
  const createdRun = rows[0];

  if (!createdRun) {
    throw new Error("SurrealDB did not return the created match run.");
  }

  return normaliseMatchRun(createdRun);
}

export async function saveMatchNarrative(
  matchRunId: string,
  narrative: string,
): Promise<void> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  await runSurrealQuery(config, `
    UPDATE ${matchRunId}
    MERGE ${surrealLiteral({ narrative })};
  `);
}

export async function listConversationMessages(
  sessionId: string,
): Promise<AgentChatMessage[]> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const results = await runSurrealQuery<StoredMessageRecord[]>(config, `
    SELECT * FROM message
    WHERE sessionId = ${surrealLiteral(sessionId)}
    ORDER BY createdAt ASC
    LIMIT 500;
  `);
  const rows = extractResult<StoredMessageRecord[]>(results);
  return rows.map(normaliseConversationMessage);
}

export async function listRecentRequestMessages(
  sessionId: string,
  limit = 25,
): Promise<AgentRequestMessage[]> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const primaryResults = await runSurrealQuery<StoredMessageRecord[]>(config, `
    SELECT * FROM message
    WHERE sessionId = ${surrealLiteral(sessionId)}
      AND (role = "assistant" OR role = "user")
    ORDER BY createdAt DESC
    LIMIT ${surrealLiteral(limit)};
  `);
  const primaryRows = extractResult<StoredMessageRecord[]>(primaryResults);

  if (primaryRows.length === 0) {
    return [];
  }

  const oldestIncludedAt = primaryRows[primaryRows.length - 1]?.createdAt;
  const enrichedResults = await runSurrealQuery<StoredMessageRecord[]>(config, `
    SELECT * FROM message
    WHERE sessionId = ${surrealLiteral(sessionId)}
      AND createdAt >= ${surrealLiteral(oldestIncludedAt)}
      AND (
        role = "assistant"
        OR role = "user"
        OR (
          (role = "tool_call" OR role = "tool_result")
          AND toolName != "send_message"
        )
      )
    ORDER BY createdAt ASC
    LIMIT 200;
  `);
  const rows = extractResult<StoredMessageRecord[]>(enrichedResults);

  return rows.map(toRequestContextMessage);
}

export async function saveConversationMessages(
  sessionId: string,
  messages: AgentChatMessage[],
): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  await ensureDatabaseReady();
  const config = getSurrealConfig();

  const statements = messages.map((message) => {
    const record = {
      messageId: message.id,
      sessionId,
      role: message.role,
      content: message.content,
      toolName: message.toolName ?? null,
      payload: message.payload ?? null,
      createdAt: message.createdAt,
    };

    return `UPSERT type::thing("message", ${surrealLiteral(message.id)}) CONTENT ${surrealLiteral(record)};`;
  });

  await runSurrealQuery(config, statements.join("\n"));
}

async function nextAgentTurnEventSequence(
  turnId: string,
): Promise<number> {
  const config = getSurrealConfig();
  const results = await runSurrealQuery<Array<{ count: number }>>(config, `
    SELECT count() AS count FROM agent_turn_event
    WHERE turnId = ${surrealLiteral(turnId)}
    GROUP ALL;
  `);
  const rows = extractResult<Array<{ count: number }>>(results);
  return (rows[0]?.count ?? 0) + 1;
}

export async function appendAgentTurnEvent(
  turnId: string,
  sessionId: string,
  type: AgentTurnEventType,
  payload: unknown,
): Promise<AgentTurnEventSnapshot> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const sequence = await nextAgentTurnEventSequence(turnId);
  const createdAt = nowIso();
  const record = {
    turnId,
    sessionId,
    sequence,
    type,
    payload,
    createdAt,
  };

  const results = await runSurrealQuery<StoredAgentTurnEventRecord[]>(config, `
    CREATE agent_turn_event CONTENT ${surrealLiteral(record)};
  `);
  const rows = extractResult<StoredAgentTurnEventRecord[]>(results);
  const createdEvent = rows[0];

  if (!createdEvent) {
    throw new Error("SurrealDB did not return the created agent turn event.");
  }

  return normaliseAgentTurnEvent(createdEvent);
}

export async function createAgentTurn(
  sessionId: string,
  requestMessages: AgentRequestMessage[],
): Promise<AgentTurnSnapshot> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const createdAt = nowIso();
  const record = {
    sessionId,
    status: "queued" as AgentTurnStatus,
    requestMessages,
    reply: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
  };

  const results = await runSurrealQuery<StoredAgentTurnRecord[]>(config, `
    CREATE agent_turn CONTENT ${surrealLiteral(record)};
  `);
  const rows = extractResult<StoredAgentTurnRecord[]>(results);
  const createdTurn = rows[0];

  if (!createdTurn) {
    throw new Error("SurrealDB did not return the created agent turn.");
  }

  const turn = normaliseAgentTurn(createdTurn);
  await appendAgentTurnEvent(turn.id, turn.sessionId, "queued", {
    status: "queued",
  });

  return turn;
}

export async function getAgentTurn(
  turnId: string,
): Promise<AgentTurnSnapshot | null> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const results = await runSurrealQuery<StoredAgentTurnRecord[]>(config, `
    SELECT * FROM ${turnId} LIMIT 1;
  `);
  const rows = extractResult<StoredAgentTurnRecord[]>(results);
  return rows[0] ? normaliseAgentTurn(rows[0]) : null;
}

export async function listAgentTurnEvents(
  turnId: string,
  afterSequence = 0,
): Promise<AgentTurnEventSnapshot[]> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const results = await runSurrealQuery<StoredAgentTurnEventRecord[]>(config, `
    SELECT * FROM agent_turn_event
    WHERE turnId = ${surrealLiteral(turnId)}
      AND sequence > ${surrealLiteral(afterSequence)}
    ORDER BY sequence ASC
    LIMIT 200;
  `);
  const rows = extractResult<StoredAgentTurnEventRecord[]>(results);
  return rows.map(normaliseAgentTurnEvent);
}

export async function markAgentTurnProcessing(
  turnId: string,
): Promise<void> {
  await ensureDatabaseReady();
  const turn = await getAgentTurn(turnId);

  if (!turn) {
    throw new Error("No stored agent turn found.");
  }

  const config = getSurrealConfig();
  const updatedAt = nowIso();
  await runSurrealQuery(config, `
    UPDATE ${turnId}
    MERGE ${surrealLiteral({
      status: "processing",
      updatedAt,
    })};
  `);

  await appendAgentTurnEvent(turnId, turn.sessionId, "processing", {
    status: "processing",
  });
}

export async function completeAgentTurn(
  turnId: string,
  reply: AgentReply,
): Promise<void> {
  await ensureDatabaseReady();
  const turn = await getAgentTurn(turnId);

  if (!turn) {
    throw new Error("No stored agent turn found.");
  }

  const config = getSurrealConfig();
  const updatedAt = nowIso();
  await runSurrealQuery(config, `
    UPDATE ${turnId}
    MERGE ${surrealLiteral({
      status: "completed",
      reply,
      error: null,
      updatedAt,
    })};
  `);

  const completedPayload: AgentTurnCompletedPayload = {
    status: "completed",
  };

  await appendAgentTurnEvent(turnId, turn.sessionId, "completed", completedPayload);
}

export async function failAgentTurn(
  turnId: string,
  error: string,
): Promise<void> {
  await ensureDatabaseReady();
  const turn = await getAgentTurn(turnId);

  if (!turn) {
    throw new Error("No stored agent turn found.");
  }

  const config = getSurrealConfig();
  const updatedAt = nowIso();
  await runSurrealQuery(config, `
    UPDATE ${turnId}
    MERGE ${surrealLiteral({
      status: "failed",
      error,
      updatedAt,
    })};
  `);

  await appendAgentTurnEvent(turnId, turn.sessionId, "failed", {
    error,
  });
}

export async function loadDashboardData(): Promise<DashboardData> {
  await ensureDatabaseReady();
  const config = getSurrealConfig();
  const [fruitResults, matchResults] = await Promise.all([
    runSurrealQuery<StoredFruitRecord[]>(config, `
      SELECT * FROM fruit;
    `),
    runSurrealQuery<StoredMatchRunRecord[]>(config, `
      SELECT * FROM match_run ORDER BY createdAt DESC LIMIT 20;
    `),
  ]);

  const fruits = extractResult<StoredFruitRecord[]>(fruitResults);
  const matches = extractResult<StoredMatchRunRecord[]>(matchResults);
  const totalApples = fruits.filter((fruit) => fruit.type === "apple").length;
  const totalOranges = fruits.filter((fruit) => fruit.type === "orange").length;
  const generatedProfiles = fruits.filter((fruit) => fruit.source === "generated").length;
  const strongMatches = matches.filter((match) => match.outcome === "strong_match").length;
  const averageMutualScore = matches.length === 0
    ? 0
    : Math.round(
      (matches.reduce((sum, match) => sum + (match.topMatches[0]?.mutualScore ?? 0), 0) / matches.length)
        * 100,
    );

  const blockerCounts = new Map<string, number>();
  for (const match of matches) {
    for (const blocker of match.topMatches[0]?.blockers ?? []) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
  }

  return {
    metrics: {
      totalApples,
      totalOranges,
      generatedProfiles,
      totalMatchRuns: matches.length,
      strongMatchRate: matches.length === 0 ? 0 : Math.round((strongMatches / matches.length) * 100),
      averageMutualScore,
    },
    recentMatches: matches.map(normaliseMatchRun),
    blockerCounts: [...blockerCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
    triggerQueues: [],
  };
}
