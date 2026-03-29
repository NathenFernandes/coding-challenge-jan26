"use client";

interface ChatHeaderProps {
  isLoading: boolean;
}

export function ChatHeader({ isLoading }: ChatHeaderProps) {
  return (
    <header className="border-b border-orange-200/70 bg-white/80 px-5 py-3.5 backdrop-blur md:px-7">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-base">
            🍊
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-950">
              Clementine
            </h1>
            <p className="text-xs text-zinc-500">
              Fruit matchmaker
            </p>
          </div>
        </div>

        {isLoading ? (
          <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-medium text-orange-700 animate-pulse-subtle">
            Working...
          </span>
        ) : null}
      </div>
    </header>
  );
}
