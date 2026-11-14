"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  PATIENT_FIRST_NAME_VARIABLE,
  RECORD_HEALTH_NOTE_TOOL,
  SESSION_ID_VARIABLE,
} from "@/lib/integrations/elevenlabs/agent-config";
import { pillOutlineOnInk } from "@/components/patient/quick-log/styles";
import { requestMicrophone } from "./mic";
import {
  ConnectingPanel,
  DonePanel,
  ErrorPanel,
  IdlePanel,
  MicDeniedPanel,
  RequestingMicPanel,
  SavingPanel,
} from "./status-panels";
import { ConfirmedNoteChips, TranscriptBubbles } from "./transcript-bubbles";
import { useCheckInSession } from "./use-check-in-session";
import { VoiceStage } from "./voice-stage";

const noteToolArgs = z.object({ note: z.string() });

export function LiveCheckIn({ patientFirstName }: { patientFirstName: string }) {
  return (
    <ConversationProvider>
      <LiveCheckInInner patientFirstName={patientFirstName} />
    </ConversationProvider>
  );
}

function LiveCheckInInner({ patientFirstName }: { patientFirstName: string }) {
  const session = useCheckInSession();
  const { phase, setPhase, addTurn, addNote, begin, markLive, setConversationId, finish, fail, abandon, abortStartup } = session;

  const leavingRef = useRef(false);
  const connectingRef = useRef(false);
  const endSessionRef = useRef<() => void>(() => {});
  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      setConversationId(conversationId);
      connectingRef.current = false;
      markLive();
    },
    onMessage: ({ role, message }) => addTurn(role === "user" ? "patient" : "agent", message),
    // Ends by the agent, the patient or a dropped connection all save what was captured so far.
    onDisconnect: (details) => {
      if (leavingRef.current) return;
      if (details.reason === "error") toast.warning("The connection was interrupted. Saving what was captured.");
      void finish();
    },
    onError: (message) => {
      console.error("[voice] conversation error:", message);
      // A startup failure must not leave the panel on "Connecting…".
      if (connectingRef.current && !leavingRef.current) {
        connectingRef.current = false;
        endSessionRef.current();
        abortStartup("Could not connect the voice check-in. Please try again or use text instead.");
      }
    },
    clientTools: {
      [RECORD_HEALTH_NOTE_TOOL]: (parameters: unknown) => {
        const parsed = noteToolArgs.safeParse(parameters);
        if (!parsed.success) return "Could not record that note.";
        addNote(parsed.data.note);
        return "Note recorded.";
      },
    },
  });

  // End the call if the patient navigates away mid-check-in (the session hook cancels the server session).
  useEffect(() => {
    endSessionRef.current = conversation.endSession;
  });
  useEffect(() => {
    leavingRef.current = false;
    return () => {
      leavingRef.current = true;
      endSessionRef.current();
    };
  }, []);

  async function start() {
    setPhase({ kind: "requesting-mic" });
    const mic = await requestMicrophone();
    if (!mic.ok) {
      if (mic.reason === "denied") setPhase({ kind: "mic-denied" });
      else fail(mic.message);
      return;
    }

    const started = await begin();
    if (!started) return;
    connectingRef.current = true;
    const { connection, sessionId } = started;
    if (connection.mode !== "elevenlabs") {
      abortStartup("Voice is not available right now. Please use text instead.");
      return;
    }

    // Binds the conversation to the server-created session (verified server-side on completion).
    const dynamicVariables = { [PATIENT_FIRST_NAME_VARIABLE]: patientFirstName, [SESSION_ID_VARIABLE]: sessionId };
    try {
      if (connection.conversationToken) {
        conversation.startSession({
          conversationToken: connection.conversationToken,
          connectionType: "webrtc",
          dynamicVariables,
          userId: sessionId,
        });
      } else if (connection.signedUrl) {
        conversation.startSession({
          signedUrl: connection.signedUrl,
          connectionType: "websocket",
          dynamicVariables,
          userId: sessionId,
        });
      } else {
        abortStartup("Voice is not available right now. Please use text instead.");
      }
    } catch (error) {
      console.error("[voice] startSession failed:", error);
      abortStartup("Could not connect the voice check-in. Please try again or use text instead.");
    }
  }

  function cancelConnecting() {
    connectingRef.current = false;
    leavingRef.current = true; // suppress the disconnect handler's save
    conversation.endSession();
    leavingRef.current = false;
    abortStartup(null);
  }

  function end() {
    conversation.endSession();
    void finish();
  }

  switch (phase.kind) {
    case "idle":
      return (
        <IdlePanel
          onStart={start}
          description="Talk through how you are feeling in your own words. The assistant asks a few gentle questions and does not give medical advice."
        />
      );
    case "requesting-mic":
      return <RequestingMicPanel />;
    case "mic-denied":
      return <MicDeniedPanel onRetry={start} />;
    case "connecting":
      return <ConnectingPanel onCancel={cancelConnecting} />;
    case "live": {
      const speaking = conversation.isSpeaking;
      return (
        <div className="space-y-4">
          <VoiceStage
            state={speaking ? "speaking" : "listening"}
            size="sm"
            caption={speaking ? "ASSISTANT SPEAKING" : "LISTENING"}
            getLevels={() => ({ input: conversation.getInputVolume(), output: conversation.getOutputVolume() })}
            tag="LIVE"
            className="py-7 sm:py-9"
          >
            <p>{speaking ? "You can interrupt at any time." : "Speak naturally. Take your time."}</p>
            <Button variant="outline" size="lg" onClick={end} className={pillOutlineOnInk}>
              <Square data-icon="inline-start" aria-hidden />
              End check-in
            </Button>
          </VoiceStage>
          <TranscriptBubbles turns={session.turns} />
          <ConfirmedNoteChips notes={session.notes} />
        </div>
      );
    }
    case "saving":
      return <SavingPanel />;
    case "done":
      return <DonePanel entry={phase.entry} onAgain={abandon} />;
    case "error":
      return <ErrorPanel message={phase.message} onRetry={abandon} onRetrySave={phase.canRetrySave ? () => void finish() : undefined} />;
  }
}
