export type DictationState = "idle" | "starting" | "listening" | "finishing";
export type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
export type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
export type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export type DictationIssue = { title: string; detail: string };

/** Recognition availability does not guarantee that a browser has a working service. */
export function dictationIssue(code: string, brave = false): DictationIssue {
  switch (code) {
    case "not-allowed":
      return { title: "Microphone permission is blocked", detail: "Allow microphone access for this site in your browser's site settings, then try dictation again. You can still type your counsel." };
    case "audio-capture":
      return { title: "Microphone unavailable", detail: "Check that a microphone is connected and selected in your browser, then try again. You can still type your counsel." };
    case "network":
      return { title: "Speech service could not connect", detail: brave
        ? "Brave could not reach a working dictation service. On Windows, choose Type instead, then press Windows + H to use voice typing in the counsel box. You can also try browser dictation in Chrome or type your counsel."
        : "Check your connection and try again. If dictation keeps failing, this browser's speech service may be unavailable. You can try Chrome or type your counsel." };
    case "service-not-allowed":
      return { title: "Speech service unavailable", detail: "This browser has blocked or does not provide the requested dictation service. Try Chrome for browser dictation, or type your counsel here." };
    case "language-not-supported":
      return { title: "English dictation is unavailable", detail: "This browser's speech service does not support the requested English language. You can use another browser or type your counsel." };
    case "no-speech":
      return { title: "No speech was detected", detail: "Try dictation again and wait for “Listening” before speaking. Check your microphone if this keeps happening. You can still type your counsel." };
    case "aborted":
      return { title: "Dictation was interrupted", detail: "Try dictation again, or continue typing your counsel." };
    case "timeout":
      return { title: "Dictation did not respond", detail: "The browser's speech service took too long. Try again, use another browser, or type your counsel." };
    default:
      return { title: "Dictation could not start", detail: "Try again, or type your counsel. Any words already in the text box are unchanged." };
  }
}

type Callbacks = {
  onState: (state: DictationState) => void;
  onTranscript: (text: string) => void;
  onError: (code: string) => void;
};

/** A single utterance, owned until its last result or explicit cancellation. */
export class DictationSession {
  private recognition: SpeechRecognition;
  private callbacks: Callbacks;
  private closed = false;
  private started = false;
  private stopped = false;
  private received = false;
  private finalResults = new Set<number>();
  private timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(recognition: SpeechRecognition, callbacks: Callbacks) {
    this.recognition = recognition;
    this.callbacks = callbacks;
  }

  private deadline(milliseconds: number) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      if (!this.stopped) this.fail("timeout");
      else this.cancel();
    }, milliseconds);
  }

  start() {
    if (this.closed || this.started) return;
    this.started = true;
    const rec = this.recognition;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onstart = () => {
      if (this.closed || this.stopped) return;
      this.deadline(60000);
      this.callbacks.onState("listening");
    };
    rec.onresult = (event) => {
      if (this.closed) return;
      const parts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal || this.finalResults.has(i)) continue;
        this.finalResults.add(i);
        const text = result[0].transcript.trim();
        if (text) parts.push(text);
      }
      if (parts.length) {
        this.received = true;
        this.callbacks.onTranscript(parts.join(" "));
      }
    };
    rec.onerror = ({ error }) => {
      if (this.closed) return;
      if (this.stopped && (error === "aborted" || error === "no-speech")) this.cancel();
      else this.fail(error);
    };
    rec.onend = () => {
      if (this.closed) return;
      if (!this.received && !this.stopped) this.callbacks.onError("no-speech");
      this.finish();
    };
    this.callbacks.onState("starting");
    this.deadline(15000);
    try { rec.start(); }
    catch (error) {
      const name = error instanceof Error ? error.name : "";
      this.fail(name === "NotAllowedError" ? "not-allowed" : name === "NotFoundError" ? "audio-capture" : name === "NotSupportedError" ? "service-not-allowed" : "start-failed");
    }
  }

  stop() {
    if (this.closed || this.stopped) return;
    this.stopped = true;
    this.callbacks.onState("finishing");
    this.deadline(3000);
    try { this.recognition.stop(); }
    catch { this.cancel(); }
  }

  cancel() {
    if (this.closed) return;
    this.finish();
    try { this.recognition.abort(); } catch { /* The browser may have already ended. */ }
  }

  private fail(code: string) {
    if (this.closed) return;
    this.callbacks.onError(code);
    this.cancel();
  }

  private finish() {
    this.closed = true;
    clearTimeout(this.timeout);
    const rec = this.recognition;
    rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
    this.callbacks.onState("idle");
  }
}
