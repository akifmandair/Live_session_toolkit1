"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ActivityType, DraftQuestion, QuestionMode, QuestionType } from "@/lib/types";

interface Props {
  token: string;
  sessionId: string;
  initialQuestions?: DraftQuestion[];
  initialTitle?: string;
  onSave: (payload: {
    type: ActivityType;
    title: string;
    questions: DraftQuestion[];
  }) => Promise<void>;
  onCancel: () => void;
}

type Snapshot = DraftQuestion[];

const TYPES: { value: QuestionType; label: string; icon: string }[] = [
  ["short_answer", "Short answer", "—"],
  ["paragraph", "Paragraph", "≡"],
  ["multiple_choice", "Multiple choice", "◉"],
  ["checkboxes", "Checkboxes", "☑"],
  ["dropdown", "Drop-down", "⌄"],
  ["file_upload", "File upload", "↥"],
  ["linear_scale", "Linear scale", "•••"],
  ["rating", "Rating", "☆"],
  ["multiple_choice_grid", "Multiple-choice grid", "⠿"],
  ["checkbox_grid", "Tick box grid", "▦"],
].map(([value, label, icon]) => ({ value: value as QuestionType, label, icon }));

function emptyQuestion(mode: QuestionMode = "quiz"): DraftQuestion {
  return {
    prompt: "",
    question_type: "multiple_choice",
    mode,
    options: [
      { text: "", is_correct: true },
      { text: "", is_correct: false },
      { text: "", is_correct: false },
      { text: "", is_correct: false },
    ],
    settings: {},
  };
}

function normaliseDraft(q: any, mode: QuestionMode): DraftQuestion {
  return {
    prompt: q.prompt || "",
    question_type: q.question_type || "multiple_choice",
    mode: q.mode || mode,
    options: q.options || [],
    settings: q.settings || {},
  };
}

export function ActivityBuilder({
  token,
  sessionId,
  initialQuestions,
  initialTitle,
  onSave,
  onCancel,
}: Props) { 
const [questions, setQuestions] = useState<DraftQuestion[]>(
  initialQuestions && initialQuestions.length > 0
    ? initialQuestions.map((q) => normaliseDraft(q, q.mode || "quiz"))
    : [emptyQuestion("quiz")]
    );
 const [activityTitle, setActivityTitle] = useState(
  initialTitle || "Live activity"
);  
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(3);
  const [aiSourceMaterial, setAiSourceMaterial] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [theme, setTheme] = useState("#4f46e5");
  const [preview, setPreview] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState<number | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const importRef = useRef<HTMLInputElement>(null);

  const commit = (next: Snapshot) => {
    setHistory((h) => [...h.slice(-30), questions]);
    setFuture([]);
    setQuestions(next);
  };

  const updateQuestion = (index: number, patch: Partial<DraftQuestion>) => {
    commit(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };
  const updateSettings = (index: number, patch: Record<string, any>) => {
    const q = questions[index];
    updateQuestion(index, { settings: { ...q.settings, ...patch } });
  };
  const updateOption = (qi: number, oi: number, text: string) => {
    const next = questions.map((q, i) => i !== qi ? q : ({ ...q, options: q.options.map((o, j) => j === oi ? { ...o, text } : o) }));
    commit(next);
  };
  const setCorrect = (qi: number, oi: number, checked: boolean) => {
    const q = questions[qi];
    const nextOptions = q.options.map((o, j) => ({ ...o, is_correct: q.question_type === "checkboxes" ? (j === oi ? checked : o.is_correct) : j === oi }));
    commit(questions.map((x, i) => i === qi ? { ...x, options: nextOptions } : x));
  };
  const addOption = (qi: number) => {
    const q = questions[qi];
    if (q.options.length >= 8) return;
    commit(questions.map((x, i) => i === qi ? { ...x, options: [...x.options, { text: "", is_correct: false }] } : x));
  };
  const removeOption = (qi: number, oi: number) => {
    const q = questions[qi];
    if (q.options.length <= 2) return;
    commit(questions.map((x, i) => i === qi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x));
  };
  const addQuestion = (mode: QuestionMode = "quiz") => commit([...questions, emptyQuestion(mode)]);
  const removeQuestion = (i: number) => { if (questions.length > 1) commit(questions.filter((_, j) => j !== i)); };
  const addSection = () => {
    const q = emptyQuestion("quiz");
    q.section_title = `Section ${new Set(questions.map(x => x.section_title).filter(Boolean)).size + 1}`;
    q.section_description = "";
    commit([...questions, q]);
  };

  function changeType(index: number, type: QuestionType) {
    const q = questions[index];
    let options = q.options;
    if (["multiple_choice", "checkboxes", "dropdown"].includes(type)) {
      options = options.length >= 2 ? options : [{ text: "", is_correct: true }, { text: "", is_correct: false }];
    } else if (["multiple_choice_grid", "checkbox_grid"].includes(type)) {
      options = ["Column 1", "Column 2", "Column 3"].map((text, i) => ({ text, is_correct: i === 0 }));
    } else options = [];
    updateQuestion(index, { question_type: type, options, settings: { ...q.settings, ...(type === "linear_scale" ? { min: 1, max: 5, minLabel: "", maxLabel: "" } : {}), ...(type === "rating" ? { max: 5 } : {}), ...(type.includes("grid") ? { rows: ["Row 1", "Row 2"], columns: ["Column 1", "Column 2", "Column 3"] } : {}) } });
    setShowTypeMenu(null);
  }

  function undo() {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, questions]);
    setQuestions(prev);
  }
  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, questions]);
    setQuestions(next);
  }

  async function handleGenerate() {
    if (!aiTopic.trim()) return setAiError("Enter a topic first.");
    setAiError(null); setGenerating(true);
    try {
      const res = await api.generateQuestions(token, sessionId, {
        topic: aiTopic.trim(),
        type: "quiz",
        count: aiCount,
        options_per_question: 4,
        source_material: aiSourceMaterial.trim() || undefined,
      });
      commit(res.questions.map((q) => normaliseDraft(q, "quiz")));
      setShowAI(false);
    } catch (err) { setAiError(err instanceof ApiError ? err.message : "Couldn't generate questions."); }
    finally { setGenerating(false); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let imported: any[];
      if (file.name.toLowerCase().endsWith(".json")) imported = JSON.parse(text);
      else imported = text.split(/\r?\n/).filter(Boolean).map((line) => ({ prompt: line, options: [{ text: "", is_correct: true }, { text: "", is_correct: false }] }));
      if (!Array.isArray(imported) || imported.length === 0) throw new Error("No questions found");
      commit(imported.slice(0, 20).map((q) => normaliseDraft(q, "quiz")));
      setError(null);
    } catch { setError("Import failed. Use a JSON array or one question per line."); }
    e.target.value = "";
  }

  async function uploadForQuestion(index: number, file: File) {
    try {
      const result = await api.uploadFile(file);
      updateSettings(index, { uploaded_file_name: result.filename, file_url: result.url });
    } catch (err) { setError(err instanceof ApiError ? err.message : "Upload failed."); }
  }

  function validateQuestion(q: DraftQuestion) {
    if (!q.prompt.trim()) return "Every question needs a prompt.";
    if (["multiple_choice", "checkboxes", "dropdown"].includes(q.question_type) && q.options.some(o => !o.text.trim())) return "Every option needs text.";
    if (q.mode === "quiz" && ["multiple_choice", "dropdown", "checkboxes"].includes(q.question_type) && !q.options.some(o => o.is_correct)) return `Mark a correct answer for: \"${q.prompt}\"`;
    if (q.mode === "quiz" && ["short_answer", "paragraph"].includes(q.question_type) && !String(q.settings.correct_answer || "").trim()) return `Add the correct answer for: \"${q.prompt}\"`;
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);

  if (questions.length < 1 || questions.length > 20) {
    return setError("You can create between 1 and 20 questions.");
  }

  for (const q of questions) {
    const msg = validateQuestion(q);
    if (msg) return setError(msg);
  }

  setSubmitting(true);

  try {
    await onSave({
      type: "quiz",
      title: activityTitle.trim() || "Live activity",
      questions,
    });
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Couldn't save this activity."
    );
    setSubmitting(false);
  }
}

  const countLabel = useMemo(() => `${questions.length}/20 questions`, [questions.length]);

  return (
    <form onSubmit={handleSubmit} className="bg-[#f8f9fa] rounded-2xl border border-black/10 overflow-hidden" style={{ "--accent": theme } as React.CSSProperties}>
      <div className="bg-white border-b border-black/10 px-5 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button type="button" title="Add question" onClick={() => addQuestion()} className="tool">＋</button>
        <button type="button" title="Import questions" onClick={() => importRef.current?.click()} className="tool">⇥</button>
        <button type="button" title="Add title/text section" onClick={addSection} className="tool font-bold">Tᵀ</button>
        <button type="button" title="Add image URL" onClick={() => { const url = prompt("Image URL"); if (url) updateSettings(questions.length - 1, { image_url: url }); }} className="tool">▧</button>
        <button type="button" title="Add video URL" onClick={() => { const url = prompt("YouTube/video URL"); if (url) updateSettings(questions.length - 1, { video_url: url }); }} className="tool">▶</button>
        <span className="h-7 w-px bg-black/10 mx-1" />
        <button type="button" title="Theme" onClick={() => setTheme(theme === "#4f46e5" ? "#0f766e" : "#4f46e5")} className="tool">◉</button>
        <button type="button" title="Preview" onClick={() => setPreview(true)} className="tool">◉</button>
        <button type="button" title="Undo" onClick={undo} disabled={!history.length} className="tool disabled:opacity-30">↶</button>
        <button type="button" title="Redo" onClick={redo} disabled={!future.length} className="tool disabled:opacity-30">↷</button>
        <button type="button" title="Copy participant link" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/join`)} className="tool">🔗</button>
        <button type="button" title="Share" onClick={() => navigator.clipboard?.writeText(window.location.href)} className="tool">♙+</button>
        <input ref={importRef} type="file" accept=".json,.txt" className="hidden" onChange={handleImport} />
        <div className="ml-auto text-xs text-ink-600/60 font-mono">{countLabel}</div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-7 space-y-4">
        <div className="bg-white rounded-xl border-t-8 p-6 shadow-sm" style={{ borderTopColor: theme }}>
<div className="flex items-center justify-between gap-4">
  <div className="flex-1">
    <input
      value={activityTitle}
      onChange={(e) => setActivityTitle(e.target.value)}
      placeholder="Activity title"
      className="w-full text-2xl font-semibold text-ink border-0 border-b border-black/10 focus:outline-none focus:border-[var(--accent)] pb-2"
    />

    <p className="text-sm text-ink-600/60 mt-2">
      Quiz is the default. Each question can independently be changed to a poll.
    </p>
  </div>
</div>          <p className="text-sm text-ink-600/60 mt-1">Quiz is the default. Each question can independently be changed to a poll.</p>
        </div>

        {showAI && (
          <div className="bg-white rounded-xl border border-black/10 p-4 space-y-3">
            <div className="flex gap-2">
              <input value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="Topic, e.g. Data Structures" className="flex-1 input" />
              <select value={aiCount} onChange={e => setAiCount(Number(e.target.value))} className="input w-28">{Array.from({length:20},(_,i)=>i+1).map(n=><option key={n}>{n}</option>)}</select>
            </div>
            <textarea
              value={aiSourceMaterial}
              onChange={e => setAiSourceMaterial(e.target.value)}
              placeholder="Paste your slides/notes — optional. Questions will be based on this content instead of just the topic."
              className="input min-h-24 w-full"
            />
            {aiError && <p className="text-xs text-wrong">{aiError}</p>}
            <div className="flex gap-2"><button type="button" onClick={handleGenerate} disabled={generating} className="primary">{generating ? "Generating…" : "Generate with AI"}</button><button type="button" onClick={() => setShowAI(false)} className="secondary">Cancel</button></div>
          </div>
        )}
        {!showAI && <button type="button" onClick={() => setShowAI(true)} className="text-sm font-medium text-signal hover:underline">✨ Generate questions with AI</button>}

        {questions.map((q, qi) => (
          <div key={qi} className="bg-white rounded-xl border border-black/10 shadow-sm p-5 space-y-4">
            {q.section_title !== undefined && (
              <div className="border-b border-black/10 pb-4">
                <input value={q.section_title} onChange={e => updateQuestion(qi, { section_title: e.target.value })} className="w-full text-xl font-semibold border-0 border-b border-black/10 focus:outline-none focus:border-[var(--accent)]" placeholder="Section title" />
                <input value={q.section_description || ""} onChange={e => updateQuestion(qi, { section_description: e.target.value })} className="w-full mt-2 text-sm border-0 focus:outline-none" placeholder="Section description (optional)" />
              </div>
            )}
            <div className="flex gap-3 items-start">
              <span className="mt-3 text-xs font-mono text-ink-600/50">Q{qi + 1}</span>
              <div className="flex-1">
                <input value={q.prompt} onChange={e => updateQuestion(qi, { prompt: e.target.value })} placeholder="Question prompt" className="w-full text-lg border-0 border-b border-black/10 pb-2 focus:outline-none focus:border-[var(--accent)]" />
                <div className="flex items-center gap-2 mt-3">
                  <div className="relative">
                    <button type="button" onClick={() => setShowTypeMenu(showTypeMenu === qi ? null : qi)} className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white min-w-52 text-left">{TYPES.find(t => t.value === q.question_type)?.icon} &nbsp; {TYPES.find(t => t.value === q.question_type)?.label} ▾</button>
                    {showTypeMenu === qi && <div className="absolute left-0 top-11 z-20 w-64 bg-white rounded-xl border shadow-xl p-1 max-h-80 overflow-auto">{TYPES.map(t => <button key={t.value} type="button" onClick={() => changeType(qi, t.value)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm">{t.icon} &nbsp; {t.label}</button>)}</div>}
                  </div>
                  <div className="ml-auto flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                    <button type="button" onClick={() => updateQuestion(qi, { mode: "quiz" })} className={`px-3 py-1.5 rounded-md ${q.mode === "quiz" ? "bg-white shadow-sm" : "text-ink-600/60"}`}>Quiz</button>
                    <button type="button" onClick={() => updateQuestion(qi, { mode: "poll" })} className={`px-3 py-1.5 rounded-md ${q.mode === "poll" ? "bg-white shadow-sm" : "text-ink-600/60"}`}>Poll</button>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => removeQuestion(qi)} className="text-xs text-ink-600/40 hover:text-wrong">Remove</button>
            </div>

            {q.question_type === "short_answer" && <div><input className="input max-w-md" placeholder="Participant's short answer" disabled /><div className="text-xs text-ink-600/50 mt-2">{q.mode === "quiz" && <input value={q.settings.correct_answer || ""} onChange={e => updateSettings(qi,{correct_answer:e.target.value})} className="input" placeholder="Correct answer (for automatic evaluation)" />}</div></div>}
            {q.question_type === "paragraph" && <div><textarea className="input min-h-24" placeholder="Participant's paragraph response" disabled />{q.mode === "quiz" && <input value={q.settings.correct_answer || ""} onChange={e => updateSettings(qi,{correct_answer:e.target.value})} className="input mt-2" placeholder="Exact correct answer (optional for evaluation)" />}</div>}
            {["multiple_choice","checkboxes","dropdown"].includes(q.question_type) && <div className="space-y-2">{q.options.map((o,oi)=><div key={oi} className="flex items-center gap-2"><input type={q.question_type === "checkboxes" ? "checkbox" : "radio"} checked={o.is_correct} onChange={e => q.mode === "quiz" && setCorrect(qi,oi,e.target.checked)} disabled={q.mode !== "quiz"} /><input value={o.text} onChange={e=>updateOption(qi,oi,e.target.value)} placeholder={`Option ${oi+1}`} className="input flex-1" /><button type="button" onClick={()=>removeOption(qi,oi)} className="text-ink-600/40 hover:text-wrong">×</button></div>)}{q.options.length<8 && <button type="button" onClick={()=>addOption(qi)} className="text-sm text-signal font-medium">+ Add option</button>}</div>}
            {q.question_type === "file_upload" && <div className="rounded-lg border border-dashed border-black/20 p-5"><p className="text-sm font-medium">Participants will upload a file</p><p className="text-xs text-ink-600/50 mt-1">Maximum 10 MB per file.</p><input type="file" className="mt-3 text-sm" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadForQuestion(qi,f)}} /></div>}
            {q.question_type === "linear_scale" && <div className="space-y-3"><div className="flex gap-3"><input type="number" value={q.settings.min ?? 1} onChange={e=>updateSettings(qi,{min:Number(e.target.value)})} className="input w-24" /><input type="number" value={q.settings.max ?? 5} onChange={e=>updateSettings(qi,{max:Number(e.target.value)})} className="input w-24" /></div><div className="flex justify-between text-xs text-ink-600/60"><span>Low label <input value={q.settings.minLabel||""} onChange={e=>updateSettings(qi,{minLabel:e.target.value})} className="input inline-block w-32" /></span><span>High label <input value={q.settings.maxLabel||""} onChange={e=>updateSettings(qi,{maxLabel:e.target.value})} className="input inline-block w-32" /></span></div>{q.mode === "quiz" && <input type="number" value={q.settings.correct_value ?? ""} onChange={e=>updateSettings(qi,{correct_value:Number(e.target.value)})} className="input" placeholder="Correct scale value" />}</div>}
            {q.question_type === "rating" && <div className="space-y-3"><div className="flex gap-2 text-3xl">{Array.from({length:q.settings.max||5},(_,i)=><button type="button" key={i} onClick={()=>updateSettings(qi,{correct_value:i+1})}>☆</button>)}</div>{q.mode === "quiz" && <input type="number" min="1" max={q.settings.max||5} value={q.settings.correct_value ?? ""} onChange={e=>updateSettings(qi,{correct_value:Number(e.target.value)})} className="input" placeholder="Correct rating" />}</div>}
            {(q.question_type === "multiple_choice_grid" || q.question_type === "checkbox_grid") && <div className="space-y-3"><p className="text-xs text-ink-600/50">Rows</p>{(q.settings.rows||[]).map((r:string,i:number)=><input key={i} value={r} onChange={e=>updateSettings(qi,{rows:(q.settings.rows||[]).map((x:string,j:number)=>j===i?e.target.value:x)})} className="input" />)}<button type="button" onClick={()=>updateSettings(qi,{rows:[...(q.settings.rows||[]),`Row ${(q.settings.rows||[]).length+1}`]})} className="text-sm text-signal">+ Add row</button><p className="text-xs text-ink-600/50">Columns</p>{(q.settings.columns||[]).map((c:string,i:number)=><input key={i} value={c} onChange={e=>updateSettings(qi,{columns:(q.settings.columns||[]).map((x:string,j:number)=>j===i?e.target.value:x)})} className="input" />)}<button type="button" onClick={()=>updateSettings(qi,{columns:[...(q.settings.columns||[]),`Column ${(q.settings.columns||[]).length+1}`]})} className="text-sm text-signal">+ Add column</button></div>}

            {q.settings.image_url && <img src={q.settings.image_url} alt="Question media" className="max-h-48 rounded-lg object-contain" />}
            {q.settings.video_url && <a href={q.settings.video_url} target="_blank" rel="noreferrer" className="text-sm text-signal underline">Open video preview</a>}
          </div>
        ))}

        <div className="flex justify-center gap-3 py-2">
          <button type="button" onClick={() => questions.length < 20 && addQuestion()} disabled={questions.length >= 20} className="rounded-full bg-white border border-black/10 px-5 py-2.5 text-sm font-medium shadow-sm disabled:opacity-40">＋ Add question</button>
          <button type="button" onClick={addSection} disabled={questions.length >= 20} className="rounded-full bg-white border border-black/10 px-5 py-2.5 text-sm font-medium shadow-sm disabled:opacity-40">＋ Add section</button>
        </div>
        {error && <p className="text-sm text-wrong bg-red-50 rounded-lg p-3">{error}</p>}
        <div className="flex gap-3 pt-2"><button type="submit" disabled={submitting} className="primary">
  {submitting ? "Saving…" : initialQuestions?.length ? "Save changes" : "Save activity"}
</button><button type="button" onClick={onCancel} className="secondary">Cancel</button></div>
      </div>

      {preview && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-5" onClick={()=>setPreview(false)}><div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-auto p-6" onClick={e=>e.stopPropagation()}><div className="flex justify-between mb-5"><h3 className="font-display text-xl font-semibold">Participant preview</h3><button type="button" onClick={()=>setPreview(false)}>✕</button></div>{questions.map((q,i)=><div key={i} className="mb-6"><p className="font-medium mb-3">{i+1}. {q.prompt || "Untitled question"}</p><div className="space-y-2">{q.options.map((o,j)=><div key={j} className="border rounded-lg p-3 text-sm">{o.text || `Option ${j+1}`}</div>)}</div></div>)}</div></div>}

      <style jsx>{`.tool{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;font-size:20px;color:#5f6368}.tool:hover{background:#f1f3f4}.input{border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:9px 11px;font-size:14px;outline:none;background:white}.input:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 15%,transparent)}.primary{border-radius:8px;background:var(--accent);color:white;font-weight:600;padding:10px 16px;font-size:14px}.secondary{border-radius:8px;background:white;border:1px solid rgba(0,0,0,.1);font-weight:500;padding:10px 16px;font-size:14px}`}</style>
    </form>
  );
}
