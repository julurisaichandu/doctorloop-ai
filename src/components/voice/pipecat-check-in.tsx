"use client";

import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { Mic, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { completePipecatCheckInAction } from "@/app/patient/check-in/voice-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { TranscriptTurn } from "@/lib/domain/types";
import { MAX_TURN_CHARS, MAX_TURNS } from "@/lib/integrations/elevenlabs/transcript";
import { requestMicrophone } from "./mic";
import { TranscriptBubbles } from "./transcript-bubbles";

type Phase = "idle" | "connecting" | "live" | "finishing" | "done" | "error";

/** Check-in call on the Pipecat voice agent (WebRTC). Only the agent URL reaches the browser. */
export function PipecatCheckIn({
  url,
  patientFirstName,
  procedure,
  recoveryStage,
}: {
  url: string;
  patientFirstName: string;
  procedure: string;
  recoveryStage: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<PipecatClient | null>(null);
  const turnsRef = useRef<TranscriptTurn[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const giveUpRef = useRef<number | null>(null);
  const stopGiveUp = useCallback(() => {
    if (giveUpRef.current !== null) window.clearTimeout(giveUpRef.current);
    giveUpRef.current = null;
  }, []);
  const goto = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const addTurn = useCallback((role: TranscriptTurn["role"], text: string) => {
    const clean = text.trim().slice(0, MAX_TURN_CHARS);
    if (!clean || turnsRef.current.length >= MAX_TURNS) return;
    turnsRef.current = [...turnsRef.current, { role, text: clean, at: new Date().toISOString() }];
    setTurns(turnsRef.current);
  }, []);

  const finish = useCallback(async () => {
    if (phaseRef.current === "finishing" || phaseRef.current === "done") return;
    goto("finishing");
    const result = await completePipecatCheckInAction({ transcript: turnsRef.current });
    if (!result.ok) {
      setError(result.error);
      goto("error");
      return;
    }
    goto("done");
    router.refresh();
  }, [goto, router]);

  // Hang up when the patient navigates away; nothing is saved in that case.
  useEffect(
    () => () => {
      const client = clientRef.current;
      clientRef.current = null;
      void client?.disconnect().catch(() => {});
      stopGiveUp();
    },
    [stopGiveUp],
  );

  async function start() {
    setError(null);
    turnsRef.current = [];
    setTurns([]);
    goto("connecting");

    const mic = await requestMicrophone();
    if (!mic.ok) {
      setError(mic.message);
      goto("error");
      return;
    }

    const client = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      callbacks: {
        onUserTranscript: (data) => {
          if (data.final) addTurn("patient", data.text);
        },
        onBotOutput: (data) => {
          const kind = data.output_type ?? data.aggregated_by;
          // Words and tokens duplicate the sentence that carries them.
          if (kind === "word" || kind === "token" || kind?.startsWith("expression")) return;
          addTurn("agent", data.text);
        },
        onBotStartedSpeaking: () => setSpeaking(true),
        onBotStoppedSpeaking: () => setSpeaking(false),
        onConnected: stopGiveUp,
        onBotReady: () => {
          stopGiveUp();
          goto("live");
        },
        // The bot (or a dropped connection) ended the call: save what was captured.
        onDisconnected: () => {
          setSpeaking(false);
          if (phaseRef.current === "live") void finish();
        },
        onError: (message) => {
          stopGiveUp();
          console.error("[pipecat] error:", message);
          if (phaseRef.current === "connecting") {
            setError("Could not connect the voice check-in. Please try again or use text instead.");
            goto("error");
            void client.disconnect().catch(() => {});
          }
        },
      },
    });
    clientRef.current = client;

    // The transport never connected (agent down or refusing the call): give up instead of spinning.
    stopGiveUp();
    giveUpRef.current = window.setTimeout(() => {
      giveUpRef.current = null;
      if (phaseRef.current !== "connecting") return;
      console.error("[pipecat] no answer in 15 s: is voice-agent running with DEEPGRAM_API_KEY and OPENAI_API_KEY?");
      setError("The voice agent did not answer. Please try again, or write your update instead.");
      goto("error");
      void client.disconnect().catch(() => {});
    }, 15_000);

    try {
      await client.startBotAndConnect({
        endpoint: `${url}/start`,
        requestData: { transport: "webrtc", body: { firstName: patientFirstName, procedure, recoveryStage } },
      });
    } catch (e) {
      console.error("[pipecat] connect failed:", e);
      if (phaseRef.current === "connecting") {
        setError("Could not connect the voice check-in. Please try again or use text instead.");
        goto("error");
      }
    }
  }

  async function end() {
    stopGiveUp();
    const client = clientRef.current;
    goto("finishing");
    await client?.disconnect().catch(() => {});
    phaseRef.current = "live"; // let finish() run once
    await finish();
  }

  return (
    <section aria-label="Voice check-in" className="space-y-4">
      <p className="max-w-xl text-[15px] text-muted-foreground">
        Describe how you are feeling in your own words. This is for recording updates, not for emergencies or medical
        advice. The transcript is captured in your browser and is unverified until you review it.
      </p>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {phase === "done" ? (
        <div className="space-y-3 rounded-[28px] border border-hairline bg-paper-2 p-5">
          <p className="font-medium">Your check-in was saved for review.</p>
          <Link href="/patient/review" className={buttonVariants({ variant: "default" })}>
            Review it now
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {phase === "live" ? (
            <Button onClick={() => void end()}>
              <Square /> End call
            </Button>
          ) : (
            <Button onClick={() => void start()} disabled={phase === "connecting" || phase === "finishing"}>
              <Mic />
              {phase === "connecting" ? "Connecting…" : phase === "finishing" ? "Saving…" : "Start call"}
            </Button>
          )}
          {phase === "live" ? (
            <span className="eyebrow text-muted-foreground" role="status">
              {speaking ? "Assistant speaking" : "Listening"}
            </span>
          ) : null}
        </div>
      )}

      {phase !== "idle" ? <TranscriptBubbles turns={turns} /> : null}
    </section>
  );
}
