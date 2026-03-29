"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { AgentChatMessage } from "@/lib/shared/types";

interface ToolTraceCardProps {
  messages: AgentChatMessage[];
}

function formatToolName(toolName: string | undefined): string {
  return (toolName ?? "tool").replaceAll("_", " ");
}

function formatPayload(payload: unknown): string {
  if (payload == null) return "No payload";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

const PAYLOAD_TRUNCATE_LINES = 8;

function PayloadBlock({ payload }: { payload: unknown }) {
  const text = formatPayload(payload);
  const lines = text.split("\n");
  const isLong = lines.length > PAYLOAD_TRUNCATE_LINES;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayText = !isLong || expanded
    ? text
    : lines.slice(0, PAYLOAD_TRUNCATE_LINES).join("\n") + "\n...";

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-[14px] border border-black/5 bg-zinc-50/90 p-3 pr-16 text-xs leading-6 text-zinc-700">
        {displayText}
      </pre>
      <div className="absolute right-2 top-2 flex gap-1">
        <button
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100"
          onClick={handleCopy}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        {isLong ? (
          <button
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100"
            onClick={() => setExpanded((prev) => !prev)}
            type="button"
          >
            {expanded ? "Less" : "More"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function pairToolMessages(messages: AgentChatMessage[]) {
  const pairs: Array<{
    key: string;
    toolName?: string;
    call?: AgentChatMessage;
    result?: AgentChatMessage;
  }> = [];

  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    if (!current) continue;

    if (current.role === "tool_call") {
      const next = messages[index + 1];
      if (next?.role === "tool_result" && next.toolName === current.toolName) {
        pairs.push({
          key: `${current.id}:${next.id}`,
          toolName: current.toolName,
          call: current,
          result: next,
        });
        index += 1;
        continue;
      }
    }

    pairs.push({
      key: current.id,
      toolName: current.toolName,
      call: current.role === "tool_call" ? current : undefined,
      result: current.role === "tool_result" ? current : undefined,
    });
  }

  return pairs;
}

export function ToolTraceCard({ messages }: ToolTraceCardProps) {
  const pairs = pairToolMessages(messages);
  const completedCount = pairs.filter((pair) => pair.result).length;
  const toolNames = [...new Set(pairs.map((pair) => formatToolName(pair.toolName)))];

  return (
    <details className="self-center w-full max-w-[92%] rounded-[20px] border border-amber-200/80 bg-amber-50/80 shadow-sm animate-fade-in md:max-w-[86%]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm text-zinc-800 marker:hidden">
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-mono uppercase tracking-[0.28em] text-amber-700/80">
            Orchard Steps
          </span>
          <span className="mt-1 truncate font-medium">
            {completedCount > 0
              ? `${completedCount} step${completedCount === 1 ? "" : "s"} saved`
              : `${pairs.length} step${pairs.length === 1 ? "" : "s"} recorded`}
          </span>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 md:flex">
          {toolNames.map((toolName) => (
            <span
              key={toolName}
              className="rounded-full border border-amber-300/80 bg-white/70 px-2.5 py-1 text-[11px] font-medium capitalize text-amber-900"
            >
              {toolName}
            </span>
          ))}
        </div>
      </summary>

      <div className="border-t border-amber-200/80 px-4 py-4">
        <div className="flex flex-col gap-3">
          {pairs.map((pair) => (
            <div
              key={pair.key}
              className="rounded-[16px] border border-black/5 bg-white/75 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold capitalize text-zinc-900">
                  {formatToolName(pair.toolName)}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    pair.result
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-sky-100 text-sky-900",
                  )}
                >
                  {pair.result ? "saved" : "called"}
                </span>
              </div>

              {pair.call ? (
                <div className="mt-3">
                  <p className="text-xs font-mono uppercase tracking-[0.24em] text-zinc-500">
                    Call
                  </p>
                  <div className="mt-1 text-sm leading-6 text-zinc-700">
                    <Markdown>{pair.call.content}</Markdown>
                  </div>
                  <PayloadBlock payload={pair.call.payload} />
                </div>
              ) : null}

              {pair.result ? (
                <div className="mt-3">
                  <p className="text-xs font-mono uppercase tracking-[0.24em] text-zinc-500">
                    Result
                  </p>
                  <div className="mt-1 text-sm leading-6 text-zinc-700">
                    <Markdown>{pair.result.content}</Markdown>
                  </div>
                  <PayloadBlock payload={pair.result.payload} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
