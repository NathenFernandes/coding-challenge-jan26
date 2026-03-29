"use client";

import Markdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { AgentChatMessage } from "@/lib/shared/types";

interface MessageBubbleProps {
  message: AgentChatMessage;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";

  return (
    <article
      className={cn(
        "group max-w-[88%] rounded-[24px] px-5 py-4 text-sm leading-7 shadow-sm animate-fade-in md:max-w-[82%]",
        isAssistant
          ? "self-start border border-orange-100 bg-orange-50/85 text-zinc-800"
          : "self-end border border-zinc-950 bg-zinc-950 text-white",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-mono uppercase tracking-[0.25em] opacity-70">
          {isAssistant ? "Clementine" : "You"}
        </span>
        {message.createdAt ? (
          <span className="text-[10px] font-mono text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
            {relativeTime(message.createdAt)}
          </span>
        ) : null}
      </div>
      <div className={cn("prose-sm max-w-none", isAssistant ? "prose-zinc" : "prose-invert")}>
        <Markdown
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto">
                <table className={cn(
                  "w-full text-xs border-collapse",
                  isAssistant ? "text-zinc-700" : "text-zinc-200",
                )}>
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className={cn(
                "border-b text-left text-[11px] uppercase tracking-wider",
                isAssistant ? "border-orange-200 text-zinc-500" : "border-zinc-700 text-zinc-400",
              )}>
                {children}
              </thead>
            ),
            th: ({ children }) => <th className="px-2 py-1.5 font-medium">{children}</th>,
            td: ({ children }) => (
              <td className={cn(
                "border-b px-2 py-1.5",
                isAssistant ? "border-orange-100" : "border-zinc-800",
              )}>
                {children}
              </td>
            ),
            ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            hr: () => (
              <hr className={cn(
                "my-3",
                isAssistant ? "border-orange-200" : "border-zinc-700",
              )} />
            ),
          }}
        >
          {message.content}
        </Markdown>
      </div>
    </article>
  );
}
