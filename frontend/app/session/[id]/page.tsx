"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSessionSocket, type SessionSocketEvent } from "@/lib/useSessionSocket";
import { TopNav } from "@/components/TopNav";
import { StatusPill } from "@/components/StatusPill";
import { ActivityBuilder } from "@/components/ActivityBuilder";
import { SessionCodePanel } from "@/components/SessionCodePanel";
import { LiveResultsBars } from "@/components/LiveResultsBars";
import type { ActivityType, DraftQuestion, SessionDetail } from "@/lib/types";

export default function SessionDetailPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false); 
  const [launching, setLaunching] = useState(false);
  const [busyActivityId, setBusyActivityId] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  // question_id -> option_id -> count
  const [liveCounts, setLiveCounts] = useState<Record<string, Record<string, number>>>({});
  const refresh = useCallback(() => {
  if (!token || !sessionId) return;

  api
    .getSession(token, sessionId)
    .then((s) => {
      setSession(s);
      setParticipantCount(s.participant_count);
      setSessionTitle(s.title);
    })
    .catch((err) =>
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't load this session."
      )
    );
}, [token, sessionId]);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [isLoading, user, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSocketEvent = useCallback((evt: SessionSocketEvent) => {
    if (evt.event === "participant_joined") {
      setParticipantCount(evt.participant_count);
    } else if (evt.event === "response_submitted") {
      setLiveCounts((prev) => ({ ...prev, [evt.question_id]: evt.option_counts }));
    } else if (evt.event === "activity_launched" || evt.event === "activity_closed") {
      refresh();
    }
  }, [refresh]);

  useSessionSocket(session?.status === "live" ? session.code : null, handleSocketEvent);
  async function handleSaveTitle() {
  if (!token || !sessionId) return;

  const title = sessionTitle.trim();

  if (!title) {
    setError("Session title cannot be empty.");
    return;
  }

  setSavingTitle(true);

  try {
    await api.updateSession(token, sessionId, { title });
setEditingTitle(false);
refresh();
  } catch (err) {
    setError(
      err instanceof ApiError
        ? err.message
        : "Couldn't update the session title."
    );
  } finally {
    setSavingTitle(false);
  }
}
  async function handleSaveActivity(payload: {
  type: ActivityType;
  title: string;
  questions: DraftQuestion[];
}) 
{
  if (!token || !sessionId) return;

  if (editingActivityId) {
    await api.updateActivity(
      token,
      sessionId,
      editingActivityId,
      payload
    );
  } else {
    await api.createActivity(token, sessionId, payload);
  }

  setShowBuilder(false);
  setEditingActivityId(null);
  refresh();
}

  async function handleLaunchSession() {
    if (!token || !sessionId) return;
    setLaunching(true);
    try {
      await api.launchSession(token, sessionId);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't launch the session.");
    } finally {
      setLaunching(false);
    }
  }

  async function handleEndSession() {
    if (!token || !sessionId) return;
    if (!confirm("End this session? Participants won't be able to submit more responses.")) return;
    await api.endSession(token, sessionId);
    router.push(`/session/${sessionId}/results`);
  }

  async function handleLaunchActivity(activityId: string) {
    if (!token || !sessionId) return;
    setBusyActivityId(activityId);
    try {
      await api.launchActivity(token, sessionId, activityId);
      refresh();
    } finally {
      setBusyActivityId(null);
    }
  }

  async function handleCloseActivity(activityId: string) {
    if (!token || !sessionId) return;
    setBusyActivityId(activityId);
    try {
      await api.closeActivity(token, sessionId, activityId);
      refresh();
    } finally {
      setBusyActivityId(null);
    }
  }

  if (isLoading || !user) return null;
  if (error) {
    return (
      <main className="min-h-screen bg-paper">
        <TopNav />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-wrong mb-4">{error}</p>
          <Link href="/dashboard" className="text-signal font-medium hover:underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="min-h-screen bg-paper">
        <TopNav />
        <p className="text-center text-sm text-ink-600/60 py-16">Loading…</p>
      </main>
    );
  }

  const joinUrl =
    (process.env.NEXT_PUBLIC_PARTICIPANT_URL || "http://localhost:3000/join") + `?code=${session.code}`;
  const launchedActivity = session.activities.find((a) => a.is_launched && !a.is_closed);

  return (
    <main className="min-h-screen bg-paper">
      <TopNav />

      {/* Header banner — same dark gradient treatment as the dashboard */}
      <div className="relative overflow-hidden bg-ink bg-dot-grid">
        <div className="absolute inset-0 bg-glow pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6 py-10">
          <Link href="/dashboard" className="text-sm text-white/50 hover:text-white transition-colors">
            ← All sessions
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4 mt-3">
            <div>
              {editingTitle && session.status === "draft" ? (
                <div className="flex items-center gap-2">
                  <input
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    className="font-display text-3xl font-semibold text-white bg-transparent border-b-2 border-live focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    disabled={savingTitle}
                    className="rounded-lg bg-live text-ink font-semibold px-3 py-2 text-sm hover:brightness-95 transition-colors"
                  >
                    {savingTitle ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setSessionTitle(session.title);
                      setEditingTitle(false);
                    }}
                    className="text-sm text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-3xl font-semibold text-white">{session.title}</h1>
                  {session.status === "draft" && (
                    <button
                      onClick={() => setEditingTitle(true)}
                      className="text-sm text-white/60 hover:text-white hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2">
                <StatusPill status={session.status} />
                <span className="text-sm text-white/60">
                  {participantCount} participant{participantCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {session.status === "draft" && (
              <button
                onClick={handleLaunchSession}
                disabled={launching || session.activities.length === 0}
                title={session.activities.length === 0 ? "Add a poll or quiz first" : undefined}
                className="rounded-lg bg-live text-ink font-semibold px-4 py-2.5 text-sm hover:brightness-95 transition-colors disabled:opacity-50"
              >
                {launching ? "Launching…" : "Launch session"}
              </button>
            )}
            {session.status === "live" && (
              <div className="flex items-center gap-3">
                <Link
                  href={`/session/${session.id}/results`}
                  className="rounded-lg border border-white/30 text-white font-medium px-4 py-2.5 text-sm hover:bg-white/10 transition-colors"
                >
                  View results
                </Link>
                <button
                  onClick={handleEndSession}
                  className="rounded-lg bg-wrong text-white font-medium px-4 py-2.5 text-sm hover:brightness-95 transition-colors"
                >
                  End session
                </button>
              </div>
            )}
            {session.status === "ended" && (
              <Link
                href={`/session/${session.id}/results`}
                className="rounded-lg bg-white text-ink font-medium px-4 py-2.5 text-sm hover:bg-white/90 transition-colors"
              >
                View results
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {session.status === "live" && <SessionCodePanel code={session.code} joinUrl={joinUrl} />}

        <div className={session.status === "live" ? "mt-8 space-y-4" : "space-y-4"}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Polls & quizzes</h2>
            {session.status !== "ended" && !showBuilder && (
              <button
                onClick={() => setShowBuilder(true)}
                className="text-sm font-medium text-signal hover:underline"
              >
                + Add poll or quiz
              </button>
            )}
          </div>

          {showBuilder && token && (
            <ActivityBuilder
  token={token}
  sessionId={sessionId}
  initialQuestions={
    editingActivityId
      ? session.activities
          .find((a) => a.id === editingActivityId)
          ?.questions.map((q) => ({
            prompt: q.prompt,
            question_type: q.question_type as any,
            mode: q.mode as any,
            options: q.options.map((o) => ({
              text: o.text,
              is_correct: o.is_correct,
            })),
            settings: q.settings || {},
            section_title: q.section_title || undefined,
            section_description: q.section_description || undefined,
          }))
      : undefined
  }
  initialTitle={
    editingActivityId
      ? session.activities.find(
          (a) => a.id === editingActivityId
        )?.title
      : undefined
  }
  onSave={handleSaveActivity}
  onCancel={() => {
    setShowBuilder(false);
    setEditingActivityId(null);
  }}
/>

)}

          {session.activities.length === 0 && !showBuilder ? (
            <div className="rounded-xl border border-dashed border-black/15 p-10 text-center">
              <p className="text-sm text-ink-600/70">
                No activities yet. Add a poll or quiz before launching this session.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {session.activities.map((activity) => {
                const isOpen = activity.is_launched && !activity.is_closed;
                return (
                  <li key={activity.id} className="bg-white rounded-xl border border-black/5 p-5 hover:border-signal/40 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-ink-600/50">
                          {activity.type}
                        </span>
                        <p className="font-display font-semibold text-ink">{activity.title}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        {session.status === "draft" && (
                          <button
                            onClick={() => {
                              setEditingActivityId(activity.id);
                              setShowBuilder(true);
                            }}
                            className="text-sm text-signal font-medium hover:underline"
                          >
                            Edit
                          </button>
                        )}
                        {session.status === "live" && (
                          <div className="flex items-center gap-2">
                            {isOpen && (
                              <span className="flex items-center gap-1.5 text-xs font-medium text-live">
                                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" />
                                Open to participants
                              </span>
                            )}
                            {activity.is_closed && (
                              <span className="text-xs font-medium text-ink-600/50">Closed</span>
                            )}
                            {!activity.is_launched && (
                              <button
                                onClick={() => handleLaunchActivity(activity.id)}
                                disabled={busyActivityId === activity.id || !!launchedActivity}
                                title={launchedActivity ? "Close the currently open activity first" : undefined}
                                className="rounded-lg bg-signal text-white text-xs font-medium px-3 py-1.5 hover:bg-signal-dark transition disabled:opacity-50"
                              >
                                Launch
                              </button>
                            )}
                            {isOpen && (
                              <button
                                onClick={() => handleCloseActivity(activity.id)}
                                disabled={busyActivityId === activity.id}
                                className="rounded-lg bg-ink text-white text-xs font-medium px-3 py-1.5 hover:bg-ink-700 transition disabled:opacity-50"
                              >
                                Close
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {activity.questions.map((q) => (
                        <div key={q.id}>
                          <p className="text-sm text-ink/90 mb-2">{q.prompt}</p>
                          {activity.is_launched ? (
                            <LiveResultsBars
                              options={q.options}
                              counts={liveCounts[q.id] ?? {}}
                              showCorrect={q.has_correct_answer}
                            />
                          ) : (
                            <ul className="text-sm text-ink-600/60 space-y-1 pl-3">
                              {q.options.map((o) => (
                                <li key={o.id}>
                                  {o.is_correct && q.has_correct_answer ? "✓ " : "· "}
                                  {o.text}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
