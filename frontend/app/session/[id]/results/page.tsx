"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { TopNav } from "@/components/TopNav";
import { LiveResultsBars } from "@/components/LiveResultsBars";
import type { SessionResults } from "@/lib/types";

export default function SessionResultsPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [results, setResults] = useState<SessionResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!token || !sessionId) return;
    api
      .getSessionResults(token, sessionId)
      .then(setResults)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load results."));
  }, [token, sessionId]);

  const handleSummarize = useCallback(async () => {
    if (!token || !sessionId) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const res = await api.summarizeSession(token, sessionId);
      setSummary(res.summary);
    } catch (err) {
      setSummaryError(err instanceof ApiError ? err.message : "Couldn't generate a summary.");
    } finally {
      setSummarizing(false);
    }
  }, [token, sessionId]);

  if (isLoading || !user) return null;

  return (
    <main className="min-h-screen bg-paper">
      <TopNav />

      {/* Header banner — same dark gradient treatment used on the session workspace/dashboard */}
      <div className="relative overflow-hidden bg-ink bg-dot-grid">
        <div className="absolute inset-0 bg-glow pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6 py-10">
          <Link href={`/session/${sessionId}`} className="text-sm text-white/50 hover:text-white transition-colors">
            ← Back to session
          </Link>
          <h1 className="font-display text-3xl font-semibold text-white mt-3">
            {results ? `${results.title} — results` : "Results"}
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {error && <p className="text-sm text-wrong mb-4">{error}</p>}

        {!results ? (
          <p className="text-sm text-ink-600/60 py-16 text-center">Loading…</p>
        ) : (
          <>
            <section className="mb-10 rounded-xl border border-signal/20 bg-signal/5 p-5">
              {!summary && !summarizing && (
                <button
                  onClick={handleSummarize}
                  className="text-sm font-medium text-signal hover:underline"
                >
                  ✨ Summarize with AI
                </button>
              )}
              {summarizing && <p className="text-sm text-ink-600/70">Generating summary…</p>}
              {summaryError && <p className="text-sm text-wrong">{summaryError}</p>}
              {summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-signal mb-2">
                    AI summary
                  </p>
                  <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{summary}</p>
                </div>
              )}
            </section>

            {(() => {
              const toughest = results.activities
                .flatMap((a) => a.questions)
                .filter((q) => q.accuracy_percent !== null)
                .sort((a, b) => (a.accuracy_percent ?? 0) - (b.accuracy_percent ?? 0))
                .slice(0, 3);
              if (toughest.length === 0) return null;
              return (
                <section className="mb-10 rounded-xl border border-wrong/20 bg-wrong/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-wrong mb-3">
                    Toughest questions
                  </p>
                  <ul className="space-y-2">
                    {toughest.map((q) => (
                      <li key={q.question_id} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-ink/90">{q.prompt}</span>
                        <span className="shrink-0 font-mono text-ink-600/70">
                          {q.accuracy_percent}% correct
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })()}

            {results.leaderboard.length > 0 && (
              <section className="mb-10">
                <h2 className="font-display text-lg font-semibold text-ink mb-3">Leaderboard</h2>
                <div className="bg-white rounded-xl border border-black/5 divide-y divide-black/5">
                  {results.leaderboard.map((entry, i) => (
                    <div key={entry.participant_id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-ink-600/50 w-5">{i + 1}</span>
                        <span className="text-sm font-medium text-ink">{entry.display_name}</span>
                      </div>
                      <span className="text-sm text-ink-600/70 font-mono">
                        {entry.correct_count}/{entry.total_answered} correct
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-8">
              <h2 className="font-display text-lg font-semibold text-ink">Activity breakdown</h2>
              {results.activities.length === 0 && (
                <p className="text-sm text-ink-600/60">No activities were run in this session.</p>
              )}
              {results.activities.map((activity) => (
                <div key={activity.activity_id} className="bg-white rounded-xl border border-black/5 p-5">
                  <div className="mb-4">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-600/50">
                      {activity.type}
                    </span>
                    <p className="font-display font-semibold text-ink">{activity.title}</p>
                  </div>
                  <div className="space-y-5">
                    {activity.questions.map((q) => (
                      <div key={q.question_id}>
                        <p className="text-sm text-ink/90 mb-2">{q.prompt}</p>
                        {q.options.length > 0 && <LiveResultsBars
                          options={q.options.map((o) => ({ id: o.option_id, text: o.text, is_correct: o.is_correct }))}
                          counts={Object.fromEntries(q.options.map((o) => [o.option_id, o.vote_count]))}
                          showCorrect={q.mode === "quiz"}
                        />}
                        {q.text_responses.length > 0 && (
                          <div className="mt-3 rounded-lg bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600/50 mb-2">Text responses</p>
                            <ul className="space-y-1 text-sm text-ink/80">
                              {q.text_responses.map((answer, i) => <li key={i}>• {answer}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
