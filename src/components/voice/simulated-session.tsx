"use client";

import { Mic, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ConnectingPanel,
  DonePanel,
  ErrorPanel,
  IdlePanel,
  SavingPanel,
} from "./status-panels";
import { SIMULATED_ASSISTANT_STEPS, SIMULATED_WRAP_UP, simulatedGreeting } from "./simulated-script";
import { pillOnInk, pillOutline, pillPrimary } from "@/components/patient/quick-log/styles";
import { TranscriptBubbles } from "./transcript-bubbles";
import { useCheckInSession } from "./use-check-in-session";
import { VoiceStage } from "./voice-stage";

const ASSISTANT_DELAY_MS = 600;

/** Minimal typing for the (still vendor-prefixed) Web Speech API; not part of lib.dom. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

export function SimulatedCheckIn({ patientFirstName }: { patientFirstName: string }) {
  const session = useCheckInSession();
  const { phase, begin, markLive, addTurn, finish, fail, abandon } = session;

  const [answers, setAnswers] = useState(0);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const canDictate = useSyncExternalStore(noopSubscribe, () => getSpeechRecognition() !== null, () => false);

  const stopDictation = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      recognitionRef.current?.stop();
    },
    [],
  );

  const wrappedUp = answers >= SIMULATED_ASSISTANT_STEPS.length;

  async function start() {
    setAnswers(0);
    setDraft("");
    const started = await begin();
    const connection = started?.connection;
    if (!connection) return;
    if (connection.mode !== "simulated") {
      fail("The simulated check-in is not available right now. Please use text instead.");
      return;
    }
    addTurn("agent", simulatedGreeting(patientFirstName));
    markLive();
  }

  function send() {
    const text = draft.trim();
    if (!text || wrappedUp) return;
    stopDictation();
    addTurn("patient", text);
    setDraft("");
    const next = answers + 1;
    setAnswers(next);
    timerRef.current = setTimeout(() => {
      addTurn("agent", next < SIMULATED_ASSISTANT_STEPS.length ? SIMULATED_ASSISTANT_STEPS[next] : SIMULATED_WRAP_UP);
    }, ASSISTANT_DELAY_MS);
  }

  function toggleDictation() {
    if (listening) {
      stopDictation();
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const heard = Array.from(event.results, (result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (heard) setDraft((current) => (current ? `${current} ${heard}` : heard));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function end() {
    stopDictation();
    if (timerRef.current) clearTimeout(timerRef.current);
    void finish();
  }

  switch (phase.kind) {
    case "connecting":
      return <ConnectingPanel />;
    case "live": {
      const last = session.turns[session.turns.length - 1];
      const waitingOnAssistant = last?.role === "patient";
      return (
        <div className="space-y-4">
          <VoiceStage
            state={waitingOnAssistant ? "thinking" : "listening"}
            size="sm"
            caption={wrappedUp ? "CHECK-IN COMPLETE" : waitingOnAssistant ? "ASSISTANT REPLYING…" : "YOUR TURN"}
            pulseKey={session.turns.length}
            tag="SIMULATED"
            className="py-7 sm:py-9"
          >
            <p>{wrappedUp ? "Choose Finish & save when you are ready." : "Type your answer below. A scripted assistant replies."}</p>
          </VoiceStage>
          <TranscriptBubbles turns={session.turns} />
          <form
            className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={wrappedUp ? "Check-in complete. Choose Finish & save." : "Type your answer and press Enter"}
              aria-label="Your answer"
              disabled={wrappedUp}
              autoFocus
              maxLength={1000}
              className="font-display h-12 min-w-0 flex-1 rounded-full border-hairline bg-paper-2 px-5 text-xl italic placeholder:text-bone md:text-xl"
            />
            <div className="flex gap-2.5">
              {canDictate && !wrappedUp ? (
                <Button
                  type="button"
                  variant={listening ? "default" : "outline"}
                  onClick={toggleDictation}
                  aria-pressed={listening}
                  className={cn("h-12 flex-1 sm:flex-none", listening ? pillOnInk : pillOutline)}
                >
                  <Mic data-icon="inline-start" aria-hidden />
                  {listening ? "Listening…" : "Speak"}
                </Button>
              ) : null}
              <Button type="submit" disabled={wrappedUp || draft.trim().length === 0} className={cn(pillPrimary, "h-12 flex-1 sm:flex-none")}>
                <Send data-icon="inline-start" aria-hidden />
                Send
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2.5">
            {wrappedUp ? (
              <Button onClick={end} className={pillPrimary}>
                Finish &amp; save
              </Button>
            ) : null}
            <Button variant="outline" onClick={end} className={pillOutline}>
              <Square data-icon="inline-start" aria-hidden />
              End check-in
            </Button>
          </div>
        </div>
      );
    }
    case "saving":
      return <SavingPanel />;
    case "done":
      return <DonePanel entry={phase.entry} onAgain={abandon} />;
    case "error":
      return (
        <ErrorPanel
          message={phase.message}
          onRetry={abandon}
          onRetrySave={phase.canRetrySave ? () => void finish() : undefined}
        />
      );
    default:
      return (
        <IdlePanel
          onStart={start}
          description="A scripted assistant asks a few gentle questions and you type your answers. It does not give medical advice."
        />
      );
  }
}
