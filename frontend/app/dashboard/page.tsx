"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { TopNav } from "@/components/TopNav";
import { StatusPill } from "@/components/StatusPill";
import type { SessionSummary } from "@/lib/types";

export default function DashboardPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!token) return;
    api
      .listSessions(token)
      .then(setSessions)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your sessions."));
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !title.trim()) return;
    setCreating(true);
    try {
      const session = await api.createSession(token, {
        title: title.trim(),
        is_public: isPublic,
        city: isPublic ? city.trim() : undefined,
        country: isPublic ? country.trim() : undefined,
      });
      router.push(`/session/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the session.");
      setCreating(false);
    }
  }

  async function handleReuse(sessionId: string) {
    if (!token) return;
    try {
      const copy = await api.reuseSession(token, sessionId);
      router.push(`/session/${copy.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reuse this session.");
    }
  }

  async function handleDelete(sessionId: string, sessionTitle: string) {
    if (!token) return;
    if (!confirm(`Delete "${sessionTitle}"? This cannot be undone.`)) return;
    try {
      await api.deleteSession(token, sessionId);
      setSessions((current) => (current ? current.filter((s) => s.id !== sessionId) : current));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete the session.");
    }
  }

  if (isLoading || !user) return null;

  const liveCount = sessions?.filter((s) => s.status === "live").length ?? 0;

  return (
    <main className="min-h-screen bg-paper">
      <TopNav />

      {/* Header banner */}
      <div className="relative overflow-hidden bg-ink bg-dot-grid">
        <div className="absolute inset-0 bg-glow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-10">
          <p className="text-white/50 text-sm mb-1">Welcome back, {user.name.split(" ")[0]}</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold text-white">Your sessions</h1>
              <p className="text-white/60 text-sm mt-1 max-w-md">
                Create a session, add polls and quizzes, then share a code — or make it
                public so people can find and join it themselves.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/join")}
                className="rounded-lg border border-white/20 text-white font-medium px-4 py-2.5 text-sm hover:bg-white/10 transition-colors"
              >
                Join with code
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-lg bg-live text-ink font-semibold px-4 py-2.5 text-sm hover:brightness-95 transition-colors"
              >
                + New session
              </button>
            </div>
          </div>
          {sessions && sessions.length > 0 && (
            <div className="flex gap-6 mt-6 text-sm">
              <span className="text-white/70">
                <b className="text-white font-display">{sessions.length}</b> total
              </span>
              <span className="text-white/70">
                <b className="text-live font-display">{liveCount}</b> live now
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-6 flex items-center justify-between rounded-xl border border-signal/15 bg-signal/5 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-ink">Looking for a session, not hosting one?</p>
            <p className="text-xs text-ink-600/60 mt-0.5">Browse public sessions people nearby have opened up.</p>
          </div>
          <Link
            href="/discover"
            className="shrink-0 rounded-lg bg-white border border-signal/30 text-signal text-sm font-medium px-4 py-2 hover:bg-signal hover:text-white transition-colors"
          >
            Discover sessions →
          </Link>
        </div>

        {error && <p className="text-sm text-wrong mb-4">{error}</p>}

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-8 bg-white rounded-xl border border-black/5 p-5 space-y-4 animate-fade-up"
          >
            <div>
              <label className="block text-sm font-medium text-ink/80 mb-1" htmlFor="title">
                Session title
              </label>
              <input
                id="title"
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Networking Basics — Week 4"
                className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-black/10 px-4 py-3 cursor-pointer hover:border-signal/40">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-signal"
              />
              <span>
                <span className="block text-sm font-medium text-ink">List this session publicly</span>
                <span className="block text-xs text-ink-600/60 mt-0.5">
                  Anyone can find and join it on the Discover page by city/country — no code needed.
                </span>
              </span>
            </label>

            {isPublic && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink/80 mb-1" htmlFor="city">
                    City
                  </label>
                  <input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Karachi"
                    className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/80 mb-1" htmlFor="country">
                    Country
                  </label>
                  <input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Pakistan"
                    className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-ink text-white font-medium px-4 py-2.5 text-sm hover:bg-ink-700 transition-colors disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-600/70 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {sessions === null ? (
          <p className="text-sm text-ink-600/60">Loading…</p>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 p-12 text-center">
            <p className="font-display text-lg text-ink mb-1">No sessions yet</p>
            <p className="text-sm text-ink-600/70">
              Create your first session to start building polls and quizzes.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="bg-white rounded-xl border border-black/5 p-5 flex items-center justify-between hover:border-signal/40 hover:shadow-sm transition-all"
              >
                <button onClick={() => router.push(`/session/${s.id}`)} className="flex-1 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-base font-semibold text-ink">{s.title}</p>
                    {s.is_public && (
                      <span className="rounded-full bg-signal/10 text-signal text-[11px] font-medium px-2 py-0.5">
                        Public{s.city ? ` · ${s.city}${s.country ? `, ${s.country}` : ""}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-600/60 mt-1 font-mono">Code {s.code}</p>
                  <p className="text-xs text-ink-600/50 mt-1">
                    Created{" "}
                    {new Date(s.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </button>

                <div className="flex items-center gap-3 ml-4">
                  <StatusPill status={s.status} />

                  {s.status === "ended" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReuse(s.id)}
                        className="rounded-lg border border-signal/30 text-signal text-xs font-medium px-3 py-1.5 hover:bg-signal/5"
                      >
                        Edit & use again
                      </button>
                      <button
                        onClick={() => handleDelete(s.id, s.title)}
                        className="rounded-lg border border-wrong/20 text-wrong text-xs font-medium px-3 py-1.5 hover:bg-wrong/5"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
