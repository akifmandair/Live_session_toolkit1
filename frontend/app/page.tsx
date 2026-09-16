"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Brand } from "@/components/Brand";

const HIGHLIGHTS = [
  { title: "Launch in seconds", body: "Spin up a poll or quiz and share a code or QR — no setup for participants." },
  { title: "Live results, instantly", body: "Watch responses roll in over WebSockets while the room is still answering." },
  { title: "Discoverable sessions", body: "Make a session public and let people nearby search and join it directly." },
];

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [isLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.login(email, password);
      login(res.access_token, res.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-paper">
      {/* Left: marketing hero */}
      <div className="relative hidden lg:flex flex-col justify-between bg-ink bg-dot-grid px-12 py-12 overflow-hidden">
        <div className="absolute inset-0 bg-glow pointer-events-none" />
        <div className="relative z-10">
          <Brand size="lg" light />
        </div>
        <div className="relative z-10 max-w-md animate-fade-up">
          <h1 className="font-display text-4xl font-semibold text-white leading-tight mb-4">
            Run live polls & quizzes that feel <span className="gradient-text">instant</span>.
          </h1>
          <p className="text-white/70 text-base mb-8">
            Build interactive sessions in minutes, share a code or QR, and watch
            answers and feedback come in live — automatically graded when it's a quiz.
          </p>
          <ul className="space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-live" />
                <div>
                  <p className="text-white font-medium text-sm">{h.title}</p>
                  <p className="text-white/60 text-sm">{h.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-white/40 text-xs">
          Or browse{" "}
          <Link href="/discover" className="text-white/70 underline hover:text-white">
            public sessions
          </Link>{" "}
          without an account.
        </p>
      </div>

      {/* Right: auth form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Brand size="lg" />
          </div>

          <div className="bg-white rounded-2xl shadow-xl shadow-ink/5 border border-black/5 p-8">
            <h1 className="font-display text-2xl font-semibold text-ink mb-1">Welcome back</h1>
            <p className="text-ink-600/70 text-sm mb-6">Log in to run your next session.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink/80 mb-1" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  placeholder="you@school.edu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink/80 mb-1" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-sm text-wrong">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-signal text-white font-medium py-2.5 text-sm hover:bg-signal-dark transition-colors disabled:opacity-60"
              >
                {submitting ? "Logging in…" : "Log in"}
              </button>
            </form>

            <p className="text-center text-sm text-ink-600/70 mt-6">
              New here?{" "}
              <Link href="/signup" className="text-signal font-medium hover:underline">
                Create an account
              </Link>
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            <Link href="/join" className="text-ink-600/60 hover:text-ink transition-colors">
              Join with a code →
            </Link>
            <span className="text-ink-600/30">·</span>
            <Link href="/discover" className="text-ink-600/60 hover:text-ink transition-colors">
              Discover public sessions →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
