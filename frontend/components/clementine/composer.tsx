"use client";

import type { KeyboardEvent } from "react";

interface ComposerProps {
  error: string | null;
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}

export function Composer({
  error,
  input,
  isLoading,
  onInputChange,
  onSubmit,
}: ComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="shrink-0 border-t border-orange-200/70 bg-white/90 px-4 py-3 md:px-7">
      <div className="flex items-end gap-3">
        <textarea
          className="min-h-[48px] max-h-[160px] flex-1 resize-none rounded-[20px] border border-orange-100 bg-orange-50/45 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-orange-300 focus:bg-white"
          disabled={isLoading}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Clementine..."
          rows={1}
          value={input}
        />
        <button
          className="btn-primary shrink-0 rounded-[16px] px-5 py-3"
          disabled={isLoading}
          onClick={onSubmit}
          type="button"
        >
          Send
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      ) : (
        <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.24em] text-zinc-400">
          Enter to send &middot; Shift+Enter for new line
        </p>
      )}
    </div>
  );
}
