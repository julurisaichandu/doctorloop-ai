"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cancelVoiceSessionAction,
  completeVoiceSessionAction,
  startVoiceSessionAction,
} from "@/app/patient/check-in/voice-actions";
import type { TimelineEntryView, TranscriptTurn } from "@/lib/domain/types";
import { MAX_TURN_CHARS, MAX_TURNS } from "@/lib/integrations/elevenlabs/transcript";
import type { VoiceConnection } from "@/lib/integrations/elevenlabs/types";

export type CheckInPhase =
  | { kind: "idle" }
  | { kind: "requesting-mic" }
  | { kind: "mic-denied" }
  | { kind: "connecting" }
  | { kind: "live" }
  | { kind: "saving" }
  | { kind: "done"; entry: TimelineEntryView | null }
  | { kind: "error"; message: string; canRetrySave: boolean };

/**
 * State shared by the live (ElevenLabs) and simulated check-ins: transcript, confirmed notes,
 * server session lifecycle (start / complete / cancel) and the visible phase.
 */
export function useCheckInSession() {
  const [phase, setPhase] = useState<CheckInPhase>({ kind: "idle" });
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [notes, setNotes] = useState<string[]>([]);

  const sessionIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const turnsRef = useRef<TranscriptTurn[]>([]);
  const notesRef = useRef<string[]>([]);
  const savingRef = useRef(false);

  const addTurn = useCallback((role: TranscriptTurn["role"], text: string) => {
    const trimmed = text.trim().slice(0, MAX_TURN_CHARS);
    if (!trimmed || turnsRef.current.length >= MAX_TURNS) return;
    const next = [...turnsRef.current, { role, text: trimmed, at: new Date().toISOString() }];
    turnsRef.current = next;
    setTurns(next);
  }, []);

  const addNote = useCallback((note: string) => {
    const trimmed = note.trim().slice(0, 500);
    if (!trimmed || notesRef.current.length >= 50) return;
    notesRef.current = [...notesRef.current, trimmed];
    setNotes(notesRef.current);
  }, []);

  const hasPatientWords = useCallback(() => turnsRef.current.some((turn) => turn.role === "patient"), []);

  const fail = useCallback((message: string, canRetrySave = false) => {
    toast.error(message);
    setPhase({ kind: "error", message, canRetrySave });
  }, []);

  const clearSession = useCallback(() => {
    sessionIdRef.current = null;
    conversationIdRef.current = null;
    turnsRef.current = [];
    notesRef.current = [];
    savingRef.current = false;
    setTurns([]);
    setNotes([]);
  }, []);

  /** Creates the server-side session. Returns the connection details, or null after showing an error. */
  const begin = useCallback(async (): Promise<{ connection: VoiceConnection; sessionId: string } | null> => {
    clearSession();
    setPhase({ kind: "connecting" });
    const result = await startVoiceSessionAction();
    if (!result.ok) {
      fail(result.error);
      return null;
    }
    sessionIdRef.current = result.data.session.id;
    return { connection: result.data.connection, sessionId: result.data.session.id };
  }, [clearSession, fail]);

  const setConversationId = useCallback((conversationId: string | null) => {
    if (conversationId) conversationIdRef.current = conversationId;
  }, []);

  /** Moves from "connecting" to "live" (no-op in any other phase). */
  const markLive = useCallback(() => {
    setPhase((current) => (current.kind === "connecting" ? { kind: "live" } : current));
  }, []);

  /** Saves the check-in. Safe to call more than once: only the first call runs until it fails. */
  const finish = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || savingRef.current) return;
    savingRef.current = true;
    setPhase({ kind: "saving" });
    const result = await completeVoiceSessionAction({
      sessionId,
      transcript: turnsRef.current,
      externalConversationId: conversationIdRef.current,
      confirmedNotes: notesRef.current,
    });
    if (!result.ok) {
      savingRef.current = false;
      fail(result.error, true);
      return;
    }
    sessionIdRef.current = null;
    setPhase({ kind: "done", entry: result.data.entry });
    if (!result.data.entry) toast.message("No spoken details were captured, so nothing was saved.");
  }, [fail]);

  /** Startup failed or was cancelled: cancel the server session (best effort) and show the outcome. */
  const abortStartup = useCallback(
    (message: string | null) => {
      const sessionId = sessionIdRef.current;
      if (sessionId && !savingRef.current) void cancelVoiceSessionAction(sessionId);
      sessionIdRef.current = null;
      conversationIdRef.current = null;
      if (message) fail(message);
      else setPhase({ kind: "idle" });
    },
    [fail],
  );

  /** Abandons an unfinished session on the server (best effort) and returns to idle. */
  const abandon = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (sessionId && !savingRef.current) void cancelVoiceSessionAction(sessionId);
    clearSession();
    setPhase({ kind: "idle" });
  }, [clearSession]);

  // Leaving the page mid-check-in must not leave an active session behind.
  useEffect(
    () => () => {
      const sessionId = sessionIdRef.current;
      if (sessionId && !savingRef.current) void cancelVoiceSessionAction(sessionId);
    },
    [],
  );

  return {
    phase,
    setPhase,
    turns,
    notes,
    addTurn,
    addNote,
    hasPatientWords,
    begin,
    markLive,
    setConversationId,
    finish,
    fail,
    abandon,
    abortStartup,
  };
}

export type CheckInSession = ReturnType<typeof useCheckInSession>;
