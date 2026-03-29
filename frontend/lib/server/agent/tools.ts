import { randomUUID } from "node:crypto";
import { logger } from "@trigger.dev/sdk";
import { tool } from "ai";
import { z } from "zod";
import {
  appendAgentTurnEvent,
  createFruitProfile,
  getActiveProfile,
  saveConversationMessages,
  updateActiveProfileAttributes,
  updateActiveProfilePreferences,
} from "@/lib/server/repository";
import { matchFruitTask } from "@/trigger/match-fruit";
import { wantsPreferenceReset } from "./prompt";
import { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT } from "./consts";

export interface AgentToolContext {
  sessionId: string;
  turnId: string;
  lastUserMessage: string;
}

async function requireActiveProfile(sessionId: string) {
  const profile = await getActiveProfile(sessionId);
  if (!profile) {
    throw new Error("The fruit profile was saved, but Clementine could not reload it.");
  }

  return profile;
}

export function createAgentTools({ sessionId, turnId, lastUserMessage }: AgentToolContext) {
  return {
    create_fruit_profile: tool({
      description:
        'Create a random apple or orange profile for the active session. Example: if the user says "I am an apple", call this with { "type": "apple" }.',
      inputSchema: z.object({
        type: z.enum(["apple", "orange"]),
      }),
      execute: async ({ type }) => {
        await createFruitProfile(sessionId, type);
        const profile = await requireActiveProfile(sessionId);
        return {
          profile,
          nextStep: "ask_what_they_are_looking_for",
        };
      },
    }),
    update_my_profile: tool({
      description:
        'Update the active fruit\'s own attributes when the user is describing or correcting themselves. Example: "I weigh 220 grams" -> { "weight": 220 }.',
      inputSchema: z.object({
        size: z.number().min(2).max(14).optional(),
        weight: z.number().min(50).max(350).optional(),
        hasStem: z.boolean().optional(),
        hasLeaf: z.boolean().optional(),
        hasWorm: z.boolean().optional(),
        shineFactor: z.enum(["dull", "neutral", "shiny", "extraShiny"]).optional(),
        hasChemicals: z.boolean().optional(),
      }),
      execute: async (input) => {
        await updateActiveProfileAttributes(sessionId, input);
        const profile = await requireActiveProfile(sessionId);

        return {
          profile,
          nextStep: "confirm_profile_update",
        };
      },
    }),
    update_looking_for: tool({
      description:
        'Update the active fruit profile\'s preferences based on what the user is looking for. Example: "I want someone shiny and under 180 grams" -> { "shineFactors": ["shiny"], "weightMax": 180 }.',
      inputSchema: z.object({
        resetExistingPreferences: z.boolean().optional(),
        sizeMin: z.number().min(2).max(14).optional(),
        sizeMax: z.number().min(2).max(14).optional(),
        weightMin: z.number().min(50).max(350).optional(),
        weightMax: z.number().min(50).max(350).optional(),
        hasStem: z.boolean().optional(),
        hasLeaf: z.boolean().optional(),
        hasWorm: z.boolean().optional(),
        shineFactors: z.array(
          z.enum(["dull", "neutral", "shiny", "extraShiny"]),
        ).max(4).optional(),
        hasChemicals: z.boolean().optional(),
      }),
      execute: async (input) => {
        await updateActiveProfilePreferences(sessionId, {
          ...input,
          resetExistingPreferences: input.resetExistingPreferences === true
            ? wantsPreferenceReset(lastUserMessage)
            : false,
        });
        const profile = await requireActiveProfile(sessionId);

        return {
          profile,
          nextStep: "confirm_preferences_or_match",
        };
      },
    }),
    send_message: tool({
      description:
        "Send a user-facing assistant message into the active chat. Use final:false for interim progress updates and final:true for the final reply of the turn.",
      inputSchema: z.object({
        content: z.string().min(1).max(4000),
        final: z.boolean().optional(),
      }),
      execute: async ({ content, final }) => {
        return logger.trace("send_message", async (span) => {
          span.setAttribute("session.id", sessionId);
          span.setAttribute("turn.id", turnId);
          span.setAttribute("message.length", content.length);
          span.setAttribute("message.final", final === true);

          const message = {
            id: randomUUID(),
            role: "assistant" as const,
            content,
            createdAt: new Date().toISOString(),
          };

          await saveConversationMessages(sessionId, [message]);
          await appendAgentTurnEvent(turnId, sessionId, "assistant_message", {
            message,
          });

          return {
            sent: true,
            final: final === true,
            message,
          };
        });
      },
    }),
    find_matches: tool({
      description:
        `Find the best available matches for the active fruit profile and return a ranked shortlist. Pass "limit" to control how many candidates are returned (1–${MAX_MATCH_LIMIT}, default ${DEFAULT_MATCH_LIMIT}). Example: "find me a match" -> { "limit": 5 }.`,
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_MATCH_LIMIT)
          .optional()
          .describe(`Number of top matches to return (1–${MAX_MATCH_LIMIT}, default ${DEFAULT_MATCH_LIMIT}).`),
      }),
      execute: async ({ limit }) => {
        const effectiveLimit = limit ?? DEFAULT_MATCH_LIMIT;
        const result = await matchFruitTask.triggerAndWait({
          sessionId,
        });

        if (!result.ok) {
          throw new Error("Trigger.dev match-fruit task failed.");
        }

        const matchRun = result.output.matchRun;
        return {
          matchRun: {
            id: matchRun.id,
            outcome: matchRun.outcome,
            topMatches: matchRun.topMatches.map((m) => ({
              attributes: m.attributes,
              preferences: m.preferences,
              candidateType: m.candidateType,
              mutualScore: Math.round(m.mutualScore * 100),
              requesterScore: Math.round(m.requesterScore * 100),
              candidateScore: Math.round(m.candidateScore * 100),
              outcome: m.outcome,
              highlights: m.highlights,
              blockers: m.blockers,
              requesterBreakdown: m.breakdown.requester,
              candidateBreakdown: m.breakdown.candidate,
            })),
          },
          matches: matchRun.topMatches.slice(0, effectiveLimit).map((m) => ({
            attributes: m.attributes,
            preferences: m.preferences,
            candidateType: m.candidateType,
            mutualScore: Math.round(m.mutualScore * 100),
            requesterScore: Math.round(m.requesterScore * 100),
            candidateScore: Math.round(m.candidateScore * 100),
            outcome: m.outcome,
            highlights: m.highlights,
            blockers: m.blockers,
            requesterBreakdown: m.breakdown.requester,
            candidateBreakdown: m.breakdown.candidate,
          })),
          nextStep: "present_matches",
        };
      },
    }),
  };
}
