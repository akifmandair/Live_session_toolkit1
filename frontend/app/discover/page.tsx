"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { TopNav } from "@/components/TopNav";
import { StatusPill } from "@/components/StatusPill";
import { Brand } from "@/components/Brand";
import type { PublicSessionSummary } from "@/lib/types";

function DiscoverGrid({
  sessions,
  loading,
  error,
  onJoin,
}: {
  sessions: PublicSessionSummary[] | null;
  loading: boolean;
  error: string | null;
  onJoin: (code: string) => void;
}) {
  if (error) return <p className="text-sm text-wrong">{error}</p>;
  if (loading || sessions === null) return <p className="text-sm text-ink-600/60">Searching…</p>;
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 p-12 text-center">
        <p className="font-display text-lg text-ink mb-1">No public sessions found</p>
        <p className="text-sm text-ink-600/70">
          Try a different city, or ask your facilitator for a join code instead.
        </p>
      </div>
    );
  }
  return (
    <ul className="grid sm:grid-cols-2 gap-4">
      {sessions.map((s) => (
        <li
          key={s.id}
          className="bg-white rounded-xl border border-black/5 p-5 flex flex-col gap-3 hover:border-signal/40 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-base font-semibold text-ink leading-snug">{s.title}</p>
            <StatusPill status={s.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600/60">
            {(s.city || s.country) && (
              <span className="inline-flex items-center gap-1">
                📍 {[s.city, s.country].filter(Boolean).join(", ")}
              </span>
            )}
            <span>Hosted by {s.facilitator_name}</span>
            <span>
              {s.participant_count} participant{s.participant_count === 1 ? "" : "s"}
            </span>
          </div>
          <button
            onClick={() => onJoin(s.code)}
            className="mt-auto self-start rounded-lg bg-signal text-white text-sm font-medium px-4 py-2 hover:bg-signal-dark transition-colors"
          >
            Join session →
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function DiscoverPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [sessions, setSessions] = useState<PublicSessionSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const results = await api.listPublicSessions({
        q: q.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
      });
      setSessions(results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load public sessions.");
    } finally {
      setLoading(false);
    }
  }

  function handleJoin(code: string) {
    router.push(`/join?code=${code}`);
  }

  return (
    <main className="min-h-screen bg-paper">
      {user ? (
        <TopNav />
      ) : (
        <header className="border-b border-black/5 bg-white/70 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/">
              <Brand />
            </Link>
            <Link href="/" className="text-sm font-medium text-ink-600/70 hover:text-ink transition-colors">
              Log in
            </Link>
          </div>
        </header>
      )}

      <div className="relative overflow-hidden bg-ink bg-dot-grid">
        <div className="absolute inset-0 bg-glow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-10">
          <h1 className="font-display text-3xl font-semibold text-white">Discover live sessions</h1>
          <p className="text-white/60 text-sm mt-1 max-w-lg">
            Search public sessions by topic or location — e.g. "Karachi, Pakistan" — and join
            instantly. No account needed.
          </p>

          <form onSubmit={search} className="mt-6 flex flex-wrap gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by title…"
              className="flex-1 min-w-[180px] rounded-lg border border-white/15 bg-white/10 text-white placeholder:text-white/40 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal-light"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City, e.g. Karachi"
              className="w-40 rounded-lg border border-white/15 bg-white/10 text-white placeholder:text-white/40 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal-light"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country, e.g. Pakistan"
              className="w-44 rounded-lg border border-white/15 bg-white/10 text-white placeholder:text-white/40 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal-light"
            />
            <button
              type="submit"
              className="rounded-lg bg-live text-ink font-semibold px-5 py-2.5 text-sm hover:brightness-95 transition-colors"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <DiscoverGrid sessions={sessions} loading={loading} error={error} onJoin={handleJoin} />
      </div>
    </main>
  );
}
