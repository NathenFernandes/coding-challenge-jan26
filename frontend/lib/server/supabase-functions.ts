import type {
  FruitAttributes,
  FruitPreferences,
  FruitType,
} from "@/lib/shared/types";
import { getSupabaseAnonKey, getSupabaseFunctionsUrl } from "./env";

export interface IncomingFruitFunctionPayload {
  id?: string;
  type: FruitType;
  attributes: FruitAttributes;
  preferences: FruitPreferences;
  attributesText: string;
  preferencesText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFruitPayload(
  value: unknown,
  expectedType: FruitType,
): value is IncomingFruitFunctionPayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === expectedType
    && typeof value.attributesText === "string"
    && typeof value.preferencesText === "string"
    && isRecord(value.attributes)
    && isRecord(value.preferences);
}

export async function requestIncomingFruitFromSupabase(
  type: FruitType,
): Promise<IncomingFruitFunctionPayload> {
  const baseUrl = getSupabaseFunctionsUrl();
  const anonKey = getSupabaseAnonKey();
  const endpoint = `${baseUrl}/get-incoming-${type}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: "{}",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `The Supabase function get-incoming-${type} responded with ${response.status}.`,
      );
    }

    const payload = await response.json();
    if (!isRecord(payload) || !isFruitPayload(payload.fruit, type)) {
      throw new Error(
        `The Supabase function get-incoming-${type} did not return a usable fruit payload yet.`,
      );
    }

    return payload.fruit;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `The Supabase function get-incoming-${type} could not be reached.`,
    );
  }
}
