import Link from "next/link";
import { getDashboardData } from "./loader";
import Markdown from "react-markdown";

export const dynamic = "force-dynamic";

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-zinc-200/80 bg-white p-5 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.45)]">
      <p className="text-xs font-mono uppercase tracking-[0.28em] text-zinc-500">
        {title}
      </p>
      <p className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fffdf7,_#fff7ed_45%,_#ffffff)] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 rounded-[30px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_30px_90px_-55px_rgba(15,23,42,0.35)] md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.32em] text-orange-500">
              Orchard metrics
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              Match quality, market pressure, and recent runs.
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
              This dashboard reads directly from SurrealDB-backed fruit records
              and stored match runs. It is built to show whether Clementine is
              finding strong mutual fits rather than one-sided near misses.
            </p>
          </div>
          <Link className="btn-secondary self-start md:self-auto" href="/">
            Back to Clementine
          </Link>
        </header>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            description="All apples currently loaded into the orchard."
            title="Total apples"
            value={data.metrics.totalApples}
          />
          <MetricCard
            description="All oranges currently available for reciprocal matching."
            title="Total oranges"
            value={data.metrics.totalOranges}
          />
          <MetricCard
            description="Generated fruit profiles created through the active onboarding flow."
            title="Generated profiles"
            value={data.metrics.generatedProfiles}
          />
          <MetricCard
            description="Stored ranking runs performed by Clementine."
            title="Match runs"
            value={data.metrics.totalMatchRuns}
          />
          <MetricCard
            description="Share of stored runs whose top candidate cleared the strong-match threshold."
            title="Strong match rate"
            value={`${data.metrics.strongMatchRate}%`}
          />
          <MetricCard
            description="Average mutual score of the top candidate across recent runs."
            title="Avg. mutual score"
            value={`${data.metrics.averageMutualScore}%`}
          />
        </section>

        <section className="rounded-[28px] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)]">
          <p className="text-xs font-mono uppercase tracking-[0.28em] text-sky-600">
            Trigger queues
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
            Background work in flight
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {data.triggerQueues.length > 0 ? data.triggerQueues.map((queue) => (
              <article
                className="rounded-[24px] border border-sky-100 bg-sky-50/60 p-5"
                key={queue.name}
              >
                <p className="text-sm font-semibold text-zinc-900">{queue.name}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-zinc-700">
                  <div>
                    <p className="text-zinc-500">Running</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-950">{queue.running}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Queued</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-950">{queue.queued}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Concurrency</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-950">
                      {queue.currentConcurrency ?? queue.concurrencyLimit ?? "auto"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Status</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-950">
                      {queue.paused ? "Paused" : "Active"}
                    </p>
                  </div>
                </div>
              </article>
            )) : (
              <p className="text-sm leading-7 text-zinc-600">
                Trigger.dev queue stats will appear here once `TRIGGER_SECRET_KEY`
                and `TRIGGER_PROJECT_ID` are configured and the Trigger worker is
                running.
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[28px] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-mono uppercase tracking-[0.28em] text-lime-600">
              Common blockers
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
              Where top matches still struggle
            </h2>

            <div className="mt-6 space-y-3">
              {data.blockerCounts.length > 0 ? data.blockerCounts.map((item) => (
                <div
                  className="rounded-[22px] border border-zinc-100 bg-zinc-50 px-4 py-4"
                  key={item.label}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm leading-6 text-zinc-700">{item.label}</p>
                    <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                      {item.count}
                    </span>
                  </div>
                </div>
              )) : (
                <p className="text-sm leading-7 text-zinc-600">
                  Once a few searches run through the system, Clementine will
                  surface the most common reasons otherwise-good matches fall
                  short.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-mono uppercase tracking-[0.28em] text-orange-500">
              Recent runs
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
              Latest orchard searches
            </h2>

            <div className="mt-6 space-y-4">
              {data.recentMatches.length > 0 ? data.recentMatches.map((match) => {
                const top = match.topMatches[0];
                return (
                  <article
                    className="rounded-[24px] border border-orange-100 bg-orange-50/55 p-5"
                    key={match.id}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {top
                            ? `${Math.round(top.mutualScore * 100)}% mutual fit`
                            : "No candidate stored"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          Outcome: {match.outcome.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="text-sm text-zinc-500">
                        {new Date(match.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {match.narrative ? (
                      <div className="mt-4 text-sm leading-7 text-zinc-700 prose-sm max-w-none prose-zinc">
                        <Markdown>{match.narrative}</Markdown>
                      </div>
                    ) : null}

                    {top?.highlights.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {top.highlights.slice(0, 3).map((highlight) => (
                          <span
                            className="rounded-full border border-orange-200 bg-white px-3 py-2 text-xs text-zinc-700"
                            key={highlight}
                          >
                            {highlight}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              }) : (
                <p className="text-sm leading-7 text-zinc-600">
                  No match runs are stored yet. Start a conversation on the main
                  page to generate a profile and search the orchard.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
