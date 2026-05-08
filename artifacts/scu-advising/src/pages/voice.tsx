import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Square, Loader2, Volume2, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiUrl } from "@/lib/api";

type Phase = "idle" | "recording" | "thinking" | "speaking" | "error";

interface Turn {
  transcript: string;
  answer: string;
  audioUrl: string;
}

const TIPS = [
  "Try: \"Can I take ENGR 1 and MATH 11 my first quarter?\"",
  "Try: \"How many transfer units can I bring in?\"",
  "Try: \"With a 2.95 GPA, can I overload to 22 units?\"",
  "Try: \"Does AP Calc BC count for MATH 11 and 12?\"",
];

export default function VoiceAdvisor() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickRef = useRef<number | null>(null);
  // Track every URL we create so we can revoke on unmount even if state changes.
  const createdUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const created = createdUrlsRef.current;
    return () => {
      stopStream();
      if (tickRef.current) window.clearInterval(tickRef.current);
      created.forEach((u) => URL.revokeObjectURL(u));
      created.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError(null);
    setPartialTranscript("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone API isn't available in this browser.");
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Prefer WebM (Chrome/Firefox); fall back to MP4 (Safari/iOS).
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void handleAudio(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
      };
      recorderRef.current = rec;
      rec.start();
      setPhase("recording");
      setElapsed(0);
      tickRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setPhase("error");
      stopStream();
    }
  }

  function stopRecording() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    stopStream();
  }

  async function handleAudio(blob: Blob) {
    if (blob.size === 0) {
      setError("Didn't capture any audio. Please try again.");
      setPhase("error");
      return;
    }
    setPhase("thinking");
    try {
      const res = await fetch(getApiUrl("/voice/ask"), {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        transcript: string;
        answer: string;
        audioBase64: string;
        audioMime: string;
      };
      const bin = atob(data.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const audioBlob = new Blob([bytes], { type: data.audioMime });
      const audioUrl = URL.createObjectURL(audioBlob);
      createdUrlsRef.current.add(audioUrl);
      const turn: Turn = {
        transcript: data.transcript,
        answer: data.answer,
        audioUrl,
      };
      // Cap history at 10 turns; revoke URLs that fall off the end.
      setTurns((prev) => {
        const next = [turn, ...prev];
        const dropped = next.slice(10);
        dropped.forEach((d) => {
          URL.revokeObjectURL(d.audioUrl);
          createdUrlsRef.current.delete(d.audioUrl);
        });
        return next.slice(0, 10);
      });
      setPartialTranscript("");
      setPhase("speaking");
      // Auto-play
      window.setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play().catch(() => {
            // Autoplay blocked — leave UI in idle so user can press play
            setPhase("idle");
          });
        }
      }, 50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Voice request failed";
      setError(msg);
      setPhase("error");
    }
  }

  function formatElapsed(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const isRecording = phase === "recording";
  const isBusy = phase === "thinking";
  const buttonLabel = isRecording
    ? "Stop"
    : isBusy
      ? "Thinking…"
      : "Hold to ask";

  return (
    <AppShell>
      <PageHeader
        title="Voice Advisor"
        subtitle="Ask SCU advising questions out loud. Tap the mic, speak naturally, and the advisor will reply by voice."
      />

      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 mt-6">
        <div className="space-y-6">
          <Card className="p-8 flex flex-col items-center text-center">
            <button
              type="button"
              onClick={isRecording ? stopRecording : isBusy ? undefined : startRecording}
              disabled={isBusy}
              className={cn(
                "relative w-40 h-40 rounded-full flex items-center justify-center transition-all shadow-lg focus:outline-none focus:ring-4 focus:ring-primary/30",
                isRecording
                  ? "bg-red-600 text-white scale-105"
                  : isBusy
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:scale-105",
              )}
              aria-label={buttonLabel}
              data-testid="voice-mic-button"
            >
              {isRecording ? (
                <Square className="h-14 w-14" fill="currentColor" />
              ) : isBusy ? (
                <Loader2 className="h-14 w-14 animate-spin" />
              ) : (
                <Mic className="h-14 w-14" />
              )}
              {isRecording && (
                <span className="absolute inset-0 rounded-full ring-4 ring-red-400 animate-ping pointer-events-none" />
              )}
            </button>
            <div className="mt-6 text-lg font-medium">
              {isRecording
                ? `Listening… ${formatElapsed(elapsed)}`
                : isBusy
                  ? "Transcribing & asking the advisor…"
                  : phase === "speaking"
                    ? "Playing answer"
                    : phase === "error"
                      ? "Something went wrong"
                      : "Tap the mic to start"}
            </div>
            {partialTranscript && (
              <p className="mt-2 text-sm text-muted-foreground italic">
                {partialTranscript}
              </p>
            )}
            {error && (
              <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 max-w-md">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span data-testid="voice-error">{error}</span>
              </div>
            )}
            <audio
              ref={audioRef}
              controls
              className="mt-6 w-full max-w-md"
              onEnded={() => setPhase("idle")}
              onPlay={() => setPhase("speaking")}
              data-testid="voice-audio-player"
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Audio is sent to OpenAI Whisper for transcription and to the
              SCU-grounded advisor for an answer. Nothing is stored except the
              transcript shown below.
            </p>
          </Card>

          {turns.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm uppercase tracking-wide text-muted-foreground">
                Conversation history
              </h3>
              {turns.map((t, i) => (
                <Card key={i} className="p-5 space-y-3" data-testid={`voice-turn-${i}`}>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">You said</div>
                    <p className="text-sm font-medium" data-testid={`voice-transcript-${i}`}>
                      "{t.transcript}"
                    </p>
                  </div>
                  <div className="border-t pt-3">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                      <Sparkles className="h-3 w-3" /> Advisor
                    </div>
                    <p className="text-sm whitespace-pre-wrap" data-testid={`voice-answer-${i}`}>
                      {t.answer}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.src = t.audioUrl;
                          audioRef.current.play().catch(() => {});
                        }
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Volume2 className="h-3 w-3" /> Replay answer
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Sample questions
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {TIPS.map((t) => (
                <li key={t} className="leading-snug">
                  {t}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 text-sm text-muted-foreground space-y-2">
            <h3 className="font-semibold text-foreground">How it works</h3>
            <p>1. Press the mic and speak your question.</p>
            <p>2. We transcribe with Whisper and ask the SCU advisor.</p>
            <p>3. The answer plays back automatically as speech.</p>
            <p className="pt-2 text-xs">
              Voice answers are kept short and conversational. For long
              syllabus-style answers, use the typed{" "}
              <a href="/advisor" className="text-primary underline">
                AI Advisor
              </a>
              .
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
