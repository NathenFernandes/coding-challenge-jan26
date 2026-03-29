import {
  communicateAttributes,
  communicatePreferences,
  generateApple,
  generateOrange,
  type FruitType,
} from "./generateFruit.ts";

export interface IncomingFruitPayload {
  type: FruitType;
  attributes: ReturnType<typeof generateApple>["attributes"];
  preferences: ReturnType<typeof generateApple>["preferences"];
  attributesText: string;
  preferencesText: string;
}

export function buildIncomingFruitPayload(type: FruitType): IncomingFruitPayload {
  const fruit = type === "apple" ? generateApple() : generateOrange();

  return {
    type,
    attributes: fruit.attributes,
    preferences: fruit.preferences,
    attributesText: communicateAttributes(fruit),
    preferencesText: communicatePreferences(fruit),
  };
}
