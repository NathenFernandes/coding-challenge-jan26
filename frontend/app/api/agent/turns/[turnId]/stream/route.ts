import { cookies } from "next/headers";
import {
  getAgentTurn,
  listAgentTurnEvents,
} from "@/lib/server/repository";
import { CLERA_SESSION_COOKIE } from "@/lib/server/session";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const POLL_INTERVAL_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ turnId: string }> },
): Promise<Response> {
  const { turnId } = await context.params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(CLERA_SESSION_COOKIE)?.value;

  if (!sessionId) {
    return new Response("Missing session", { status: 401 });
  }

  const turn = await getAgentTurn(turnId);
  if (!turn || turn.sessionId !== sessionId) {
    return new Response("Turn not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const state = { closed: false };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(formatSseEvent(event, payload)));
      };

      const run = async () => {
        let lastSequence = 0;

        try {
          while (!state.closed) {
            const events = await listAgentTurnEvents(turnId, lastSequence);

            for (const event of events) {
              lastSequence = event.sequence;
              send(event.type, event.payload);

              if (event.type === "completed" || event.type === "failed") {
                state.closed = true;
                break;
              }
            }

            if (state.closed) {
              break;
            }

            await sleep(POLL_INTERVAL_MS);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown SSE error";
          send("failed", { error: message });
        } finally {
          controller.close();
        }
      };

      void run();
    },
    cancel() {
      state.closed = true;
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
