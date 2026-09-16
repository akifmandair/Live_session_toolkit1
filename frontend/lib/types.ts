export interface User { id: string; name: string; email: string; }
export interface AuthResponse { access_token: string; token_type: string; user: User; }
export type SessionStatus = "draft" | "live" | "ended";
export interface SessionSummary { id: string; title: string; code: string; status: SessionStatus; created_at: string; launched_at: string | null; ended_at: string | null; is_public: boolean; city: string | null; country: string | null; }
export interface PublicSessionSummary { id: string; title: string; code: string; status: SessionStatus; city: string | null; country: string | null; facilitator_name: string; participant_count: number; created_at: string; }

export type QuestionType =
  | "short_answer" | "paragraph" | "multiple_choice" | "checkboxes" | "dropdown"
  | "file_upload" | "linear_scale" | "rating" | "multiple_choice_grid" | "checkbox_grid";
export type QuestionMode = "quiz" | "poll";
export interface OptionOut { id: string; text: string; is_correct: boolean; }
export interface QuestionOut {
  id: string; prompt: string; question_type: QuestionType; mode: QuestionMode;
  has_correct_answer: boolean; settings: Record<string, any>; section_title?: string | null;
  section_description?: string | null; options: OptionOut[];
}
export type ActivityType = "poll" | "quiz";
export interface ActivityOut { id: string; type: ActivityType; title: string; is_launched: boolean; is_closed: boolean; questions: QuestionOut[]; }
export interface SessionDetail extends SessionSummary { activities: ActivityOut[]; participant_count: number; }
export interface OptionResult { option_id: string; text: string; is_correct: boolean; vote_count: number; }
export interface QuestionResult { question_id: string; prompt: string; question_type: QuestionType; mode: QuestionMode; total_responses: number; options: OptionResult[]; text_responses: string[]; accuracy_percent: number | null; }
export interface ActivityResults { activity_id: string; title: string; type: ActivityType; questions: QuestionResult[]; }
export interface LeaderboardEntry { participant_id: string; display_name: string; correct_count: number; total_answered: number; }
export interface SessionResults { session_id: string; title: string; activities: ActivityResults[]; leaderboard: LeaderboardEntry[]; }

export interface DraftOption { text: string; is_correct: boolean; }
export interface DraftQuestion {
  prompt: string;
  question_type: QuestionType;
  mode: QuestionMode;
  options: DraftOption[];
  settings: Record<string, any>;
  section_title?: string;
  section_description?: string;
}
export interface ParticipantResult { display_name: string; correct_count: number; total_answered: number; rank: number; total_participants: number; }
export interface GenerateQuestionsResponse { type: ActivityType; questions: DraftQuestion[]; }
export interface AISummary { summary: string; }
