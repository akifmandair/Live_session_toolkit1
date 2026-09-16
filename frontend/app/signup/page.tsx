"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Brand } from "@/components/Brand";

export default function SignupPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
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
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.register(name, email, password);
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
      <div className="relative hidden lg:flex flex-col justify-between bg-ink bg-dot-grid px-12 py-12 overflow-hidden">
        <div className="absolute inset-0 bg-glow pointer-events-none" />
        <div className="relative z-10">
          <Brand size="lg" light />
        </div>
        <div className="relative z-10 max-w-md animate-fade-up">
          <h1 className="font-display text-4xl font-semibold text-white leading-tight mb-4">
            Your first session is <span className="gradient-text">two minutes</span> away.
          </h1>
          <p className="text-white/70 text-base">
            Create an account, add a poll or quiz, and share the code. Everything
            else — live results, scoring, summaries — is handled for you.
          </p>
        </div>
        <p className="relative z-10 text-white/40 text-xs">Free to use for classrooms and teams.</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Brand size="lg" />
          </div>

          <div className="bg-white rounded-2xl shadow-xl shadow-ink/5 border border-black/5 p-8">
            <h1 className="font-display text-2xl font-semibold text-ink mb-1">Create your account</h1>
            <p className="text-ink-600/70 text-sm mb-6">
              Set up polls, quizzes, and live feedback for your sessions.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink/80 mb-1" htmlFor="name">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  placeholder="Your Name"
                />
              </div>
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
                  placeholder="you@gmail.com"
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
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  placeholder="At least 8 characters"
                />
              </div>

              {error && <p className="text-sm text-wrong">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-signal text-white font-medium py-2.5 text-sm hover:bg-signal-dark transition-colors disabled:opacity-60"
              >
                {submitting ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p className="text-center text-sm text-ink-600/70 mt-6">
              Already have an account?{" "}
              <Link href="/" className="text-signal font-medium hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
