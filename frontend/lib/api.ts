import type {
  ActivityOut,
  ActivityResults,
  AISummary,
  AuthResponse,
  GenerateQuestionsResponse,
  ParticipantResult,
  PublicSessionSummary,
  SessionDetail,
  SessionResults,
  SessionSummary,
  DraftQuestion,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // response had no JSON body — fall back to statusText
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  listSessions: (token: string) => request<SessionSummary[]>("/sessions", {}, token),

  createSession: (
    token: string,
    payload: { title: string; is_public?: boolean; city?: string; country?: string }
  ) =>
    request<SessionSummary>(
      "/sessions",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  listPublicSessions: (params: { q?: string; city?: string; country?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.city) search.set("city", params.city);
    if (params.country) search.set("country", params.country);
    const qs = search.toString();
    return request<PublicSessionSummary[]>(`/sessions/public${qs ? `?${qs}` : ""}`);
  },

  getSession: (token: string, sessionId: string) =>
    request<SessionDetail>(`/sessions/${sessionId}`, {}, token),

  launchSession: (token: string, sessionId: string) =>
    request<SessionSummary>(`/sessions/${sessionId}/launch`, { method: "POST" }, token),

  endSession: (token: string, sessionId: string) =>
    request<SessionSummary>(`/sessions/${sessionId}/end`, { method: "POST" }, token),

  deleteSession: (token: string, sessionId: string) =>
  request<void>(`/sessions/${sessionId}`, { method: "DELETE" }, token),
  
  updateSession: (
  token: string,
  sessionId: string,
  payload: { title: string; is_public?: boolean; city?: string; country?: string }
) =>
  request<SessionSummary>(
    `/sessions/${sessionId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    token
  ),
reuseSession: (token: string, sessionId: string) =>
  request<SessionSummary>(
    `/sessions/${sessionId}/reuse`,
    { method: "POST" },
    token
  ),


  createActivity: (
    token: string,
    sessionId: string,
    payload: {
      type: "poll" | "quiz";
      title: string;
      questions: { prompt: string; question_type: string; mode: "poll" | "quiz"; options: { text: string; is_correct: boolean }[]; settings?: Record<string, any>; section_title?: string; section_description?: string }[];
    }
  ) =>
    request<ActivityOut>(
      `/sessions/${sessionId}/activities`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),
  
  launchActivity: (token: string, sessionId: string, activityId: string) =>
    request<ActivityOut>(
      `/sessions/${sessionId}/activities/${activityId}/launch`,
      { method: "POST" },
      token
    ),

  closeActivity: (token: string, sessionId: string, activityId: string) =>
    request<ActivityResults>(
      `/sessions/${sessionId}/activities/${activityId}/close`,
      { method: "POST" },
      token
    ),

  getActivityResults: (token: string, sessionId: string, activityId: string) =>
    request<ActivityResults>(
      `/sessions/${sessionId}/activities/${activityId}/results`,
      {},
      token
    ),

  getSessionResults: (token: string, sessionId: string) =>
    request<SessionResults>(`/sessions/${sessionId}/results`, {}, token),

  generateQuestions: (
    token: string,
    sessionId: string,
    payload: {
      topic: string;
      type: "poll" | "quiz";
      count: number;
      options_per_question: number;
      source_material?: string;
    }
  ) =>
    request<GenerateQuestionsResponse>(
      `/sessions/${sessionId}/activities/generate`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),
  updateActivity: (
  token: string,
  sessionId: string,
  activityId: string,
  payload: {
    type: "poll" | "quiz";
    title: string;
    questions: DraftQuestion[];
  }
) =>
  request<ActivityOut>(
    `/sessions/${sessionId}/activities/${activityId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    token
  ),
  summarizeSession: (token: string, sessionId: string) =>
    request<AISummary>(`/sessions/${sessionId}/results/summary`, { method: "POST" }, token),

  // ---------- Participant (public, no auth token) ----------

  getSessionByCode: (code: string) => request<SessionSummary>(`/sessions/by-code/${code}`),

  joinSession: (code: string, displayName: string) =>
    request<{ id: string; display_name: string; session_id: string }>(
      `/sessions/by-code/${code}/join`,
      { method: "POST", body: JSON.stringify({ display_name: displayName }) }
    ),

  submitResponse: (questionId: string, payload: {
    participant_id: string; option_id?: string; selected_option_ids?: string[]; text_answer?: string;
    numeric_answer?: number; grid_answers?: Record<string, any>; file_url?: string;
  }) =>
    request<{ id: string; question_id: string; option_id: string | null; answer_data: Record<string, any>; is_correct: boolean | null }>(
      `/questions/${questionId}/responses`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  uploadFile: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/uploads`, { method: "POST", body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch {}
      throw new ApiError(detail, res.status);
    }
    return res.json() as Promise<{ url: string; filename: string }>;
  },

  getParticipantResults: (code: string, participantId: string) =>
    request<ParticipantResult>(`/sessions/by-code/${code}/participants/${participantId}/results`),
};

export function wsUrl(code: string): string {
  const httpBase = API_BASE.replace(/^http/, "ws");
  return `${httpBase}/ws/session/${code}`;
}
