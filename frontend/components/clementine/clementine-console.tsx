"use client";

import { startTransition, useEffect, useRef } from "react";
import { useClementineStore } from "@/lib/client/clementine-store";
import type {
  AgentChatMessage,
  AgentSessionSnapshot,
  AgentTraceEntry,
  AgentTurnCreateResponse,
  AgentTurnCompletedPayload,
  FruitProfileSnapshot,
  MatchRunSnapshot,
} from "@/lib/shared/types";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import {
  createInitialAssistantMessage,
  createTraceMessages,
  createUserMessage,
} from "./message-utils";
import { MessageList } from "./message-list";

interface ClementineConsoleProps {
  sessionId: string | null;
  initialMessages: AgentChatMessage[];
  initialProfile: FruitProfileSnapshot | null;
  initialMatch: MatchRunSnapshot | null;
}

export function ClementineConsole({
  sessionId,
  initialMessages,
  initialProfile,
  initialMatch,
}: ClementineConsoleProps) {
  const activeTurnStreamRef = useRef<EventSource | null>(null);
  const initialAssistantMessageRef = useRef(
    createInitialAssistantMessage(initialProfile),
  );
  const {
    messages,
    isLoading,
    error,
    input,
    bootstrap,
    appendMessages,
    setSnapshot,
    setLoading,
    setError,
    setInput,
  } = useClementineStore();

  useEffect(() => {
    bootstrap({
      sessionId,
      initialMessages: initialMessages.length > 0
        ? initialMessages
        : [initialAssistantMessageRef.current],
      profile: initialProfile,
      latestMatch: initialMatch,
    });
  }, [bootstrap, initialMatch, initialMessages, initialProfile, sessionId]);

  useEffect(() => () => {
    activeTurnStreamRef.current?.close();
  }, []);

  async function fetchSessionSnapshot(): Promise<AgentSessionSnapshot> {
    const response = await fetch("/api/agent/snapshot", {
      method: "GET",
      cache: "no-store",
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to refresh the orchard snapshot.");
    }

    return payload as AgentSessionSnapshot;
  }

  function waitForTurnCompletion(turnId: string): Promise<AgentSessionSnapshot> {
    return new Promise((resolve, reject) => {
      activeTurnStreamRef.current?.close();

      const stream = new EventSource(`/api/agent/turns/${encodeURIComponent(turnId)}/stream`);
      activeTurnStreamRef.current = stream;
      let settled = false;

      const cleanup = () => {
        if (activeTurnStreamRef.current === stream) {
          activeTurnStreamRef.current = null;
        }
        stream.close();
      };

      const rejectWith = (message: string) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error(message));
      };

      stream.addEventListener("completed", (event) => {
        if (settled) {
          return;
        }

        let parsed = false;
        try {
          JSON.parse((event as MessageEvent).data) as AgentTurnCompletedPayload;
          parsed = true;
        } catch {
          rejectWith("The orchard returned a result, but Clementine couldn't read it.");
        }

        if (!parsed) {
          return;
        }

        settled = true;
        cleanup();
        void fetchSessionSnapshot()
          .then(resolve)
          .catch((error) => {
            reject(new Error(error instanceof Error ? error.message : "Failed to refresh the orchard snapshot."));
          });
      });

      stream.addEventListener("assistant_message", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            message?: AgentChatMessage;
          };
          const message = payload.message;

          if (!message || message.role !== "assistant") {
            return;
          }

          const alreadySeen = useClementineStore
            .getState()
            .messages
            .some((entry) => entry.id === message.id);

          if (!alreadySeen) {
            startTransition(() => {
              appendMessages([message]);
            });
          }
        } catch {
          // Ignore malformed interim message events and keep waiting for completion.
        }
      });

      stream.addEventListener("tool_trace", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            trace?: AgentTraceEntry[];
          };
          const trace = payload.trace ?? [];
          if (trace.length === 0) {
            return;
          }

          startTransition(() => {
            appendMessages(createTraceMessages(trace));
          });
        } catch {
          // Ignore malformed trace events and keep waiting for completion.
        }
      });

      stream.addEventListener("failed", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { error?: string };
          rejectWith(payload.error ?? "The orchard stream reported a failure.");
        } catch {
          rejectWith("The orchard stream reported a failure.");
        }
      });

      stream.onerror = () => {
        rejectWith("The orchard stream disconnected before the turn finished.");
      };
    });
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage = createUserMessage(trimmed);
    appendMessages([userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The orchard went quiet for a moment.");
      }

      const turnPayload = payload as AgentTurnCreateResponse;
      const sessionSnapshot = await waitForTurnCompletion(turnPayload.turnId);

      startTransition(() => {
        setSnapshot({
          profile: sessionSnapshot.profile,
          latestMatch: sessionSnapshot.latestMatch,
        });
      });
    } catch (fetchError) {
      const message = fetchError instanceof Error
        ? fetchError.message
        : "I ran into a problem talking to Clementine.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen text-zinc-950 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.18),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(234,179,8,0.14),_transparent_20%),linear-gradient(180deg,_#fff8f1,_#fffdf8_52%,_#ffffff)] px-3 py-3 md:px-5 md:py-5">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-[32px] border border-orange-200/70 bg-white/82 shadow-[0_34px_120px_-64px_rgba(234,88,12,0.55)] backdrop-blur md:min-h-[calc(100vh-2.5rem)]">
        <ChatHeader isLoading={isLoading} />
        <MessageList isLoading={isLoading} messages={messages} />
        <Composer
          error={error}
          input={input}
          isLoading={isLoading}
          onInputChange={setInput}
          onSubmit={() => {
            void sendMessage(input);
          }}
        />
      </section>
    </main>
  );
}
