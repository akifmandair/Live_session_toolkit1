"use client";
import { useEffect, useRef } from "react";
import { wsUrl } from "./api";

export type SessionSocketEvent =
  | { event: "participant_joined"; participant_count: number }
  | { event: "activity_launched"; activity_id: string; title: string; type: "poll" | "quiz"; questions: { id: string; prompt: string; question_type: any; mode: "poll" | "quiz"; settings: Record<string, any>; options: { id: string; text: string }[] }[] }
  | { event: "response_submitted"; question_id: string; total_responses: number; option_counts: Record<string, number> }
  | { event: "activity_closed"; results: unknown }
  | { event: "session_ended" };

export function useSessionSocket(code: string | null, onEvent: (event: SessionSocketEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  useEffect(() => {
    if (!code) return;
    const sessionCode = code;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;
    function connect() {
      socket = new WebSocket(wsUrl(sessionCode));
      socket.onmessage = evt => { try { onEventRef.current(JSON.parse(evt.data)); } catch {} };
      socket.onclose = () => { if (!closedByEffect) reconnectTimer = setTimeout(connect, 1500); };
    }
    connect();
    return () => { closedByEffect = true; if (reconnectTimer) clearTimeout(reconnectTimer); socket?.close(); };
  }, [code]);
}
