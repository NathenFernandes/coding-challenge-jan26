import { embedMany, gateway } from "ai";
import type {
  FruitAttributes,
  FruitPreferences,
  FruitType,
  ShineFactor,
} from "../../../supabase/functions/_shared/generateFruit";
import { getEmbeddingModel, hasGatewayKey } from "./env";

export const FRUIT_EMBEDDING_DIMENSION = 256;
export const MATCH_SHORTLIST_SIZE = 24;
export const MATCH_VECTOR_EFFORT = 80;

interface FruitEmbeddingInput {
  type: FruitType;
  attributes: FruitAttributes;
  preferences: FruitPreferences;
}

export interface FruitEmbeddingPair {
  selfEmbedding: number[];
  lookingForEmbedding: number[];
}

function oppositeFruitType(type: FruitType): FruitType {
  return type === "apple" ? "orange" : "apple";
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) {
    return "unknown";
  }

  return value ? "yes" : "no";
}

function formatNullableNumber(value: number | null, unit: string): string {
  if (value === null) {
    return "unknown";
  }

  return `${value}${unit}`;
}

function formatShine(value: ShineFactor | null): string {
  return value ?? "unknown";
}

function formatRange(
  range: FruitPreferences["size"] | FruitPreferences["weight"],
  unit: string,
): string {
  if (!range) {
    return "open";
  }

  if (range.min !== undefined && range.max !== undefined) {
    return `${range.min}${unit} to ${range.max}${unit}`;
  }

  if (range.min !== undefined) {
    return `at least ${range.min}${unit}`;
  }

  if (range.max !== undefined) {
    return `at most ${range.max}${unit}`;
  }

  return "open";
}

function formatWantedBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return "open";
  }

  return value ? "yes" : "no";
}

function formatWantedShine(value: FruitPreferences["shineFactor"]): string {
  if (value === undefined) {
    return "open";
  }

  return Array.isArray(value) ? value.join(", ") : value;
}

function buildSelfEmbeddingText({ type, attributes }: FruitEmbeddingInput): string {
  return [
    `Fruit type: ${type}.`,
    `Size: ${formatNullableNumber(attributes.size, " units")}.`,
    `Weight: ${formatNullableNumber(attributes.weight, "g")}.`,
    `Stem present: ${formatNullableBoolean(attributes.hasStem)}.`,
    `Leaf present: ${formatNullableBoolean(attributes.hasLeaf)}.`,
    `Has worm: ${formatNullableBoolean(attributes.hasWorm)}.`,
    `Shine: ${formatShine(attributes.shineFactor)}.`,
    `Has chemicals: ${formatNullableBoolean(attributes.hasChemicals)}.`,
  ].join(" ");
}

function buildLookingForEmbeddingText({ type, preferences }: FruitEmbeddingInput): string {
  return [
    `Looking for fruit type: ${oppositeFruitType(type)}.`,
    `Preferred size: ${formatRange(preferences.size, " units")}.`,
    `Preferred weight: ${formatRange(preferences.weight, "g")}.`,
    `Stem preferred: ${formatWantedBoolean(preferences.hasStem)}.`,
    `Leaf preferred: ${formatWantedBoolean(preferences.hasLeaf)}.`,
    `Worm preferred: ${formatWantedBoolean(preferences.hasWorm)}.`,
    `Shine preferred: ${formatWantedShine(preferences.shineFactor)}.`,
    `Chemical treatment preferred: ${formatWantedBoolean(preferences.hasChemicals)}.`,
  ].join(" ");
}

function getEmbeddingModelHandle() {
  if (!hasGatewayKey()) {
    throw new Error("AI gateway is not configured for fruit embeddings.");
  }

  return gateway.textEmbeddingModel(getEmbeddingModel());
}

export async function embedFruitProfiles(
  inputs: FruitEmbeddingInput[],
): Promise<FruitEmbeddingPair[]> {
  if (inputs.length === 0) {
    return [];
  }

  const values = inputs.flatMap((input) => [
    buildSelfEmbeddingText(input),
    buildLookingForEmbeddingText(input),
  ]);

  const result = await embedMany({
    model: getEmbeddingModelHandle(),
    values,
    providerOptions: {
      openai: {
        dimensions: FRUIT_EMBEDDING_DIMENSION,
      },
    },
  });

  return inputs.map((_, index) => ({
    selfEmbedding: result.embeddings[index * 2],
    lookingForEmbedding: result.embeddings[index * 2 + 1],
  }));
}

export async function embedFruitProfile(
  input: FruitEmbeddingInput,
): Promise<FruitEmbeddingPair> {
  const [result] = await embedFruitProfiles([input]);
  if (!result) {
    throw new Error("Failed to generate fruit embeddings.");
  }

  return result;
}
