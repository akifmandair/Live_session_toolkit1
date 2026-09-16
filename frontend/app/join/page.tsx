"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSessionSocket, type SessionSocketEvent } from "@/lib/useSessionSocket";
import { Brand } from "@/components/Brand";
import type { ParticipantResult, QuestionType } from "@/lib/types";

type LiveQuestion = { id: string; prompt: string; question_type: QuestionType; mode: "poll" | "quiz"; settings: Record<string, any>; options: { id: string; text: string }[] };
type Feedback = { isCorrect: boolean | null };
type Phase = "join" | "lobby" | "question" | "feedback" |"completed"| "ended";

function Card({ children }: { children: React.ReactNode }) { return <div className="w-full max-w-2xl bg-paper rounded-2xl shadow-2xl p-8">{children}</div>; }

function QuestionAnswer({ q, onSubmit, busy }: { q: LiveQuestion; onSubmit: (payload: any) => Promise<void>; busy: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [numeric, setNumeric] = useState<number | null>(null);
  const [grid, setGrid] = useState<Record<string,string>>({});
  const [file, setFile] = useState<File | null>(null);
  const submit = () => onSubmit({ selected_option_ids: selected, option_id: selected[0], text_answer: text || undefined, numeric_answer: numeric ?? undefined, grid_answers: grid, file });

  if (["multiple_choice","checkboxes","dropdown"].includes(q.question_type)) {
    if (q.question_type === "dropdown") return <div className="space-y-4"><select value={selected[0] || ""} onChange={e=>setSelected(e.target.value?[e.target.value]:[])} className="w-full input"><option value="">Choose an answer…</option>{q.options.map(o=><option key={o.id} value={o.id}>{o.text}</option>)}</select><button disabled={!selected.length||busy} onClick={submit} className="primary">Submit answer</button></div>;
    return <div className="space-y-2">{q.options.map(o=><label key={o.id} className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3 cursor-pointer hover:border-signal"><input type={q.question_type === "checkboxes" ? "checkbox" : "radio"} checked={selected.includes(o.id)} onChange={e=>setSelected(q.question_type === "checkboxes" ? (e.target.checked?[...selected,o.id]:selected.filter(x=>x!==o.id)) : [o.id])} /><span>{o.text}</span></label>)}<button disabled={!selected.length||busy} onClick={submit} className="primary mt-3">Submit answer</button></div>;
  }
  if (q.question_type === "short_answer" || q.question_type === "paragraph") return <div className="space-y-3">{q.question_type === "short_answer" ? <input value={text} onChange={e=>setText(e.target.value)} className="input" placeholder="Your answer" /> : <textarea value={text} onChange={e=>setText(e.target.value)} className="input min-h-36" placeholder="Your answer" />}<button disabled={!text.trim()||busy} onClick={submit} className="primary">Submit answer</button></div>;
  if (q.question_type === "file_upload") return <div className="space-y-4"><input type="file" onChange={e=>setFile(e.target.files?.[0] || null)} /><button disabled={!file||busy} onClick={submit} className="primary">Upload & submit</button></div>;
  if (q.question_type === "linear_scale") { const min=q.settings.min??1,max=q.settings.max??5; return <div className="space-y-3"><div className="flex justify-between text-xs text-ink-600/60"><span>{q.settings.minLabel || min}</span><span>{q.settings.maxLabel || max}</span></div><div className="flex gap-2 flex-wrap">{Array.from({length:max-min+1},(_,i)=>i+min).map(n=><button type="button" key={n} onClick={()=>setNumeric(n)} className={`h-11 w-11 rounded-full border ${numeric===n?'bg-signal text-white border-signal':'bg-white'}`}>{n}</button>)}</div><button disabled={numeric===null||busy} onClick={submit} className="primary">Submit answer</button></div>; }
  if (q.question_type === "rating") { const max=q.settings.max??5; return <div className="space-y-4"><div className="flex gap-2 text-4xl">{Array.from({length:max},(_,i)=><button type="button" key={i} onClick={()=>setNumeric(i+1)} className={numeric && numeric>=i+1?'text-signal':'text-ink-600/30'}>★</button>)}</div><button disabled={numeric===null||busy} onClick={submit} className="primary">Submit rating</button></div>; }
  if (q.question_type === "multiple_choice_grid" || q.question_type === "checkbox_grid") { const rows=q.settings.rows||[], cols=q.settings.columns||[]; return <div className="space-y-4 overflow-auto"><table className="w-full text-sm"><thead><tr><th className="text-left p-2"></th>{cols.map((c:string)=><th key={c} className="p-2 text-center">{c}</th>)}</tr></thead><tbody>{rows.map((r:string)=><tr key={r} className="border-t"><td className="p-2 font-medium">{r}</td>{cols.map((c:string)=><td key={c} className="text-center p-2"><input type={q.question_type==='checkbox_grid'?'checkbox':'radio'} name={`grid-${r}`} checked={grid[r]===c} onChange={e=>setGrid(g=>({...g,[r]:e.target.checked?c:""}))}/></td>)}</tr>)}</tbody></table><button disabled={Object.keys(grid).length===0||busy} onClick={submit} className="primary">Submit answer</button></div>; }
  return null;
}

function JoinFlow() {
  const searchParams=useSearchParams();
  const [code,setCode]=useState(searchParams.get("code")||""); const [name,setName]=useState(""); const [participantId,setParticipantId]=useState<string|null>(null); const [error,setError]=useState<string|null>(null); const [joining,setJoining]=useState(false); const [busy,setBusy]=useState(false);
  const [phase,setPhase]=useState<Phase>("join"); const [activityTitle,setActivityTitle]=useState(""); const [queue,setQueue]=useState<LiveQuestion[]>([]); const [feedback,setFeedback]=useState<Feedback|null>(null); const [finalResult,setFinalResult]=useState<ParticipantResult|null>(null);
  const currentQuestion=queue[0]??null;
  const handleSocketEvent=useCallback((evt:SessionSocketEvent)=>{ if(evt.event==='activity_launched'){setActivityTitle(evt.title);setQueue(evt.questions as LiveQuestion[]);setFeedback(null);setPhase('question');} else if(evt.event==='activity_closed'){setQueue([]);setFeedback(null);setPhase('lobby');} else if(evt.event==='session_ended'){setPhase('ended');}},[]);
  useSessionSocket(participantId?code.toUpperCase():null,handleSocketEvent);
  async function handleJoin(e:React.FormEvent){e.preventDefault();setError(null);setJoining(true);try{await api.getSessionByCode(code.toUpperCase());const p=await api.joinSession(code.toUpperCase(),name.trim());setParticipantId(p.id);setPhase('lobby');}catch(err){setError(err instanceof ApiError?err.message:"Couldn't join that session.");}finally{setJoining(false);}}
  async function handleAnswer(payload:any){if(!currentQuestion||!participantId)return;setBusy(true);setError(null);try{let fileUrl:string|undefined;if(payload.file){const up=await api.uploadFile(payload.file);fileUrl=up.url;}const res=await api.submitResponse(currentQuestion.id,{participant_id:participantId,option_id:payload.option_id,selected_option_ids:payload.selected_option_ids,text_answer:payload.text_answer,numeric_answer:payload.numeric_answer,grid_answers:payload.grid_answers,file_url:fileUrl});setFeedback({isCorrect:res.is_correct});setPhase('feedback');}catch(err){setError(err instanceof ApiError?err.message:"Couldn't submit that answer.");}finally{setBusy(false);}}
function handleNext() {
  if (queue.length > 1) {
    setQueue((q) => q.slice(1));
    setFeedback(null);
    setPhase("question");
  } else {
    setQueue([]);
    setFeedback(null);
    setPhase("completed");
  }
}
useEffect(() => {
  if (
    (phase === "completed" || phase === "ended") &&
    code &&
    participantId
  ) {
    api
      .getParticipantResults(code.toUpperCase(), participantId)
      .then(setFinalResult)
      .catch(() => {});
  }
}, [phase, code, participantId]);

  if(!participantId||phase==='join') return <Card><form onSubmit={handleJoin}><h1 className="font-display text-2xl font-semibold text-ink mb-1">Join a session</h1><p className="text-ink-600/70 text-sm mb-6">Enter the code your facilitator shared.</p><div className="space-y-4"><input required value={code} onChange={e=>setCode(e.target.value)} placeholder="Session code" className="w-full input uppercase tracking-widest"/><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" className="w-full input"/>{error&&<p className="text-sm text-wrong">{error}</p>}<button disabled={joining} className="w-full primary">{joining?'Joining…':'Join session'}</button></div></form><p className="text-center text-sm text-ink-600/60 mt-5">Don&apos;t have a code? <a href="/discover" className="text-signal font-medium hover:underline">Discover public sessions</a></p></Card>;
  if (phase === "completed") {
  return (
    <Card>
      <div className="text-center py-6">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-signal/10 flex items-center justify-center text-2xl">
          ✓
        </div>

        <p className="font-display text-2xl font-semibold text-ink mb-2">
          Quiz complete!
        </p>

        <p className="text-sm text-ink-600/70 mb-6">
          Thank you for participating, {name || "participant"}.
        </p>

        {finalResult && (
          <div className="rounded-xl bg-white border p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span>Correct answers</span>
              <b>
                {finalResult.correct_count}/{finalResult.total_answered}
              </b>
            </div>

            <div className="flex justify-between">
              <span>Rank</span>
              <b>
                #{finalResult.rank} of {finalResult.total_participants}
              </b>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
  if(phase==='ended') return <Card><div className="text-center py-4"><p className="font-display text-xl text-ink mb-1">Session ended</p>{finalResult?<><p className="text-sm text-ink-600/70 mb-6">Thanks for taking part, {finalResult.display_name}.</p><div className="rounded-xl bg-white border p-5 space-y-3"><div className="flex justify-between"><span>Correct answers</span><b>{finalResult.correct_count}/{finalResult.total_answered}</b></div><div className="flex justify-between"><span>Rank</span><b>#{finalResult.rank} of {finalResult.total_participants}</b></div></div></>:<p>Thanks for taking part.</p>}</div></Card>;
  if(phase==='lobby'||!currentQuestion) return <Card><div className="text-center py-8"><p className="font-display text-lg text-ink mb-1">You&apos;re in!</p><p className="text-sm text-ink-600/70">Waiting for the facilitator to launch a question…</p></div></Card>;
  if(phase==='feedback'&&feedback) return <Card><div className="text-center py-6"><p className={`font-display text-2xl font-semibold mb-2 ${feedback.isCorrect===null?'text-ink':feedback.isCorrect?'text-correct':'text-wrong'}`}>{feedback.isCorrect===null?'Thanks!':feedback.isCorrect?'Correct!':'Not quite'}</p><p className="text-sm text-ink-600/70 mb-6">{feedback.isCorrect===null?'Your response has been recorded.':feedback.isCorrect?'Nice work.':'Your answer was recorded.'}</p><button onClick={handleNext} className="primary">{queue.length>1?'Next question':'Continue'}</button></div></Card>;
  return <Card><p className="text-xs font-medium uppercase tracking-wide text-ink-600/50 mb-1">{activityTitle}</p><p className="font-display text-lg text-ink mb-5">{currentQuestion.prompt}</p><QuestionAnswer q={currentQuestion} onSubmit={handleAnswer} busy={busy}/>{error&&<p className="text-sm text-wrong mt-4">{error}</p>}</Card>;
}

export default function JoinPage(){return <main className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 gap-8"><Brand size="lg" light/><Suspense fallback={null}><JoinFlow/></Suspense></main>}
