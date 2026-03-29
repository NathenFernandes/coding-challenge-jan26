"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { ToolTraceCard } from "./tool-trace-card";
import type { AgentChatMessage } from "@/lib/shared/types";

interface MessageListProps {
  isLoading: boolean;
  messages: AgentChatMessage[];
}

export function MessageList({ isLoading, messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  const renderItems: Array<
    | { kind: "message"; key: string; message: AgentChatMessage }
    | { kind: "tool_group"; key: string; messages: AgentChatMessage[] }
  > = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.role === "tool_call" || message.role === "tool_result") {
      const group: AgentChatMessage[] = [message];
      let cursor = index + 1;

      while (cursor < messages.length) {
        const nextMessage = messages[cursor];
        if (!nextMessage || (nextMessage.role !== "tool_call" && nextMessage.role !== "tool_result")) {
          break;
        }
        group.push(nextMessage);
        cursor += 1;
      }

      renderItems.push({
        kind: "tool_group",
        key: group.map((entry) => entry.id).join(":"),
        messages: group,
      });
      index = cursor - 1;
      continue;
    }

    renderItems.push({
      kind: "message",
      key: message.id,
      message,
    });
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  const hasUserMessages = messages.some((m) => m.role === "user");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-7 md:py-6">
      <div className="flex flex-1 flex-col gap-4">
        {renderItems.map((item) =>
          item.kind === "tool_group"
            ? <ToolTraceCard key={item.key} messages={item.messages} />
            : <MessageBubble key={item.key} message={item.message} />
        )}

        {!hasUserMessages && !isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="text-4xl">🍎🍊</span>
            <p className="text-sm text-zinc-500">
              Tell Clementine who you are to get started.
            </p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="self-start rounded-[24px] border border-orange-100 bg-orange-50/85 px-5 py-4 animate-fade-in">
            <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-800/70">
              Clementine
            </p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-400 animate-typing-dot" />
              <span className="h-2 w-2 rounded-full bg-orange-400 animate-typing-dot [animation-delay:0.15s]" />
              <span className="h-2 w-2 rounded-full bg-orange-400 animate-typing-dot [animation-delay:0.3s]" />
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>
    </div>
  );
}
