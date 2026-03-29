import type { FruitProfileSnapshot } from "@/lib/shared/types";
import { SYSTEM_INSTRUCTIONS } from "./consts";

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getPromptStage(profile: FruitProfileSnapshot | null): string {
  if (!profile) {
    return "needs_type";
  }

  return "profile_generated";
}

function buildImmediateObjective(profile: FruitProfileSnapshot | null): string {
  if (!profile) {
    return "Identify whether the user is an apple or an orange. If they already made that clear, create the profile immediately. Otherwise ask that exact onboarding question once.";
  }

  return "Work from the saved generated profile. Answer recap questions directly from it, help the user refine what they are looking for, and search when they ask.";
}

function buildAllowedTools(profile: FruitProfileSnapshot | null): string[] {
  if (!profile) {
    return ["send_message", "create_fruit_profile"];
  }

  return [
    "send_message",
    "update_my_profile",
    "update_looking_for",
    "find_matches",
  ];
}

export function wantsPreferenceReset(message: string): boolean {
  return /\b(reset|replace|overwrite|start over|clear|wipe)\b/i.test(message);
}

export { SYSTEM_INSTRUCTIONS };

export function buildDynamicPromptContext(profile: FruitProfileSnapshot | null): string {
  const stage = getPromptStage(profile);
  const allowedTools = buildAllowedTools(profile);
  const profileContext = profile
    ? `
Current active fruit contact:
${stringifyForPrompt({
  id: profile.id,
  type: profile.type,
  status: profile.status,
  attributes: profile.attributes,
  preferences: profile.preferences,
  attributesText: profile.attributesText,
  preferencesText: profile.preferencesText,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
})}
    `.trim()
    : "Current active fruit contact:\nnull";

  return `
Current truth:
- profile_exists: ${profile ? "yes" : "no"}
- onboarding_stage: ${stage}
- immediate_objective: ${buildImmediateObjective(profile)}
- allowed_tools_now: ${allowedTools.join(", ")}
${profileContext}
  `.trim();
}

export function buildSystemPrompt(profile: FruitProfileSnapshot | null): string {
  return `${SYSTEM_INSTRUCTIONS}\n\n${buildDynamicPromptContext(profile)}`;
}
