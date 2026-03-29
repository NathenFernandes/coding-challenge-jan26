import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  createAgentTurn,
  listRecentRequestMessages,
  saveConversationMessages,
} from "@/lib/server/repository";
import { CLERA_SESSION_COOKIE, createSessionId } from "@/lib/server/session";
import { queueAgentTurn } from "@/lib/server/trigger-jobs";
import type {
  AgentChatMessage,
  AgentRequestMessage,
  AgentTurnCreateResponse,
} from "@/lib/shared/types";

const requestSchema = z.object({
  message: z.object({
    id: z.string().optional(),
    role: z.literal("user"),
    content: z.string().min(1),
    createdAt: z.string().optional(),
  }),
});

function appendSessionCookie(headers: Headers, sessionId: string): void {
  headers.append(
    "Set-Cookie",
    `${CLERA_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  );
}

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get(CLERA_SESSION_COOKIE)?.value;
  let shouldSetCookie = false;

  if (!sessionId) {
    sessionId = createSessionId();
    shouldSetCookie = true;
  }

  try {
    const parsed = requestSchema.parse(await request.json());
    const persistedMessage: AgentChatMessage = {
      id: parsed.message.id ?? randomUUID(),
      role: "user",
      content: parsed.message.content,
      createdAt: parsed.message.createdAt ?? new Date().toISOString(),
    };

    await saveConversationMessages(sessionId, [persistedMessage]);

    const history = await listRecentRequestMessages(sessionId, 25);
    const turn = await createAgentTurn(sessionId, history as AgentRequestMessage[]);
    await queueAgentTurn(sessionId, turn.id);

    const payload: AgentTurnCreateResponse = {
      turnId: turn.id,
      status: turn.status,
    };

    const response = Response.json(payload);
    if (shouldSetCookie) {
      appendSessionCookie(response.headers, sessionId);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent error";
    const response = Response.json(
      { error: message },
      { status: 400 },
    );

    if (shouldSetCookie) {
      appendSessionCookie(response.headers, sessionId);
    }

    return response;
  }
}
