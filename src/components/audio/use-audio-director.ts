"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type MutableRefObject, type PointerEvent } from "react";
import type { TrialId } from "../../lib/arcade/arcade";
import type { AudioFrame } from "../../lib/audio/cues";
import { LeadTracker, VoiceRules, hasHeard, markHeard, newVoyage, onceScope, readHeard, writeHeard, type Heard } from "../../lib/audio/director";
import { LINES, PLACES, TRIAL_PLACE, type LineId, type LineKind } from "../../lib/audio/library";
import type { MixerPrefs } from "../../lib/audio/mixer";
import { soundscape } from "../../lib/audio/soundscape";
import { setUiSink } from "../../lib/audio/ui-bus";
import type { VoyageAudio } from "../../lib/audio/voyage-audio";

export type Caption = { id: LineId; role: string; text: string; kind: LineKind };

type Input = {
  audio: MutableRefObject<VoyageAudio | null>;
  screen: string;
  selected: TrialId;
  /** How the shown result ended, or null away from the result screen. */
  outcome: "victory" | "defeat" | "practice" | null;
  /** Sound is actually reaching the speakers. */
  live: boolean;
  voiceOn: boolean;
  mixer: MixerPrefs;
  /** A live line (the bard, a rival, the prologue) is being spoken. */
  speaking: boolean;
  rivalOnline: boolean;
  rivalChecking: boolean;
  /** The rival has prepared for this briefing (its line is written). */
  aiReady: boolean;
  oracleLoading: boolean;
  /** The Lotus race or hunt is chosen: the trained rival, which needs no language model. */
  exhibition: boolean;
  /** The rival's tactic for this briefing, as the game chose it. */
  planId: string;
  /** The round being played, or null. */
  runKey: number | null;
  /** The round's recap: being written, written (it will be spoken), or none coming. */
  recap: "pending" | "text" | "none";
  /** A small dialog (restart, Athena's help, the Oracle's question) is open. */
  dialog: boolean;
};

const seconds = () => performance.now() / 1000;
const SELECTABLE = "button, a[href], select, [role=option], [role=tab], summary";

/**
 * Directs FARSHORE's sound from the real game state: which music and ambience
 * play on each screen, when the recorded narration is heard (once, never on a
 * revisit), when the Oracle speaks (only for something that really happened:
 * a model coming online, a rival that has prepared or changed its tactic, a
 * lead that changed hands), the characters' lines in play, the tension drums,
 * and the interface sounds. Live lines from the language model always have the
 * floor: a recorded line never talks over one, and a live line asked for while
 * a recorded one plays waits for it to finish.
 */
export function useAudioDirector(input: Input) {
  const { audio, screen, selected, outcome, live } = input;
  const [caption, setCaption] = useState<Caption | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const heard = useRef<Heard>({ device: [], voyage: [] });
  const rules = useRef(new VoiceRules());
  const pendingLine = useRef<{ id: LineId; valid: () => boolean } | null>(null);
  const pendingSpeech = useRef<(() => void) | null>(null);
  const round = useRef<{ key: number; lead: LeadTracker; giantSaid: boolean; rescues: number; tension: number; over: boolean } | null>(null);
  const lastPlans = useRef(new Map<TrialId, string>());
  const unavailableSaid = useRef(false);
  const hovered = useRef<Element | null>(null);

  useEffect(() => { heard.current = readHeard(); }, []);

  /** Speaks a recorded line if the rules allow it now; resolves true if it played to the end. */
  const say = useCallback(async (id: LineId, valid: () => boolean = () => true): Promise<boolean> => {
    const a = latest.current.audio.current, now = seconds(), line = LINES[id];
    if (!a || !latest.current.voiceOn || !valid()) return false;
    if (line.kind === "narration" && !latest.current.mixer.narration) return false;
    if (onceScope(id) && hasHeard(heard.current, id)) return false;
    if (!rules.current.allow(id, now)) return false;
    // A live line has the floor; a recorded one never talks over it.
    if (latest.current.speaking) return false;
    if (a.narrating && line.kind !== "narration") { pendingLine.current = { id, valid }; return false; }
    const result = await a.narrate(id, {
      onStart: () => {
        rules.current.record(id, seconds());
        if (onceScope(id)) { heard.current = markHeard(heard.current, id); writeHeard(heard.current); }
        setCaption({ id, role: line.role, text: line.subtitle, kind: line.kind });
      },
    });
    // Refused because another recorded line won the race to start: wait for it rather than be lost.
    if (result === "refused") {
      if (a.narrating && a.narrating !== id && line.kind !== "narration") pendingLine.current = { id, valid };
      return false;
    }
    setCaption(c => (c?.id === id ? null : c));
    // Whatever waited for this line now has its turn: a live line first, then a queued Oracle line.
    const speech = pendingSpeech.current;
    pendingSpeech.current = null;
    if (speech) speech();
    else {
      const next = pendingLine.current;
      pendingLine.current = null;
      if (next && next.valid()) void say(next.id, next.valid);
    }
    return result === "done";
  }, []);

  /** Runs a live line now, or as soon as a recorded line has finished (only the latest waits). */
  const speakLive = useCallback((speak: () => void) => {
    if (latest.current.audio.current?.narrating) pendingSpeech.current = speak;
    else speak();
  }, []);

  /** A new voyage hears its chapter narration again. */
  const resetVoyage = useCallback(() => { heard.current = newVoyage(heard.current); writeHeard(heard.current); }, []);

  // Interface sounds requested by components (the glass drawers).
  useEffect(() => {
    setUiSink(name => latest.current.audio.current?.uiSound(name));
    return () => setUiSink(null);
  }, []);

  // ---------------------------------------------------------- the soundscape
  const outcomeKey = outcome ?? "";
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (screen === "play") {
      const s = soundscape("play", selected);
      a.setMusic(s.music, s.musicLevel);
      // In play the ambience loop sits back; the simulation's own beds and cues carry the scene.
      a.setAmbience(s.ambience, { level: 0.65, identity: false });
      return;
    }
    a.setTension(0);
    a.setLoops({});
    const s = soundscape(screen, selected, outcome);
    const apply = () => { a.setMusic(s.music, s.musicLevel); a.setAmbience(s.ambience, { identity: s.identity }); a.setScene(s.scene); };
    // The carousel lets the ambience settle on an island rather than flicker through each card.
    if (screen !== "trials") { apply(); return; }
    const t = window.setTimeout(apply, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selected, outcomeKey, live]);

  // Fetch what a trial will need while its briefing is read.
  useEffect(() => {
    if (!live || (screen !== "brief" && screen !== "trials")) return;
    const place = TRIAL_PLACE[selected], chapter = PLACES[place].narration;
    const character: LineId | null = selected === "circe" ? "circe-challenge" : selected === "sirens" ? "sirens-warning" : selected === "cyclops" ? "cyclops-approach" : selected === "lotus" ? "sailor-rescued" : null;
    audio.current?.preload(place, screen === "brief" ? [chapter, "oracle-ready", "oracle-path", character].filter((l): l is LineId => !!l) : []);
  }, [audio, screen, selected, live]);

  // A recorded line belongs to its screen: leaving the screen ends it.
  useEffect(() => () => {
    audio.current?.stopNarration();
    pendingLine.current = null;
    setCaption(null);
  }, [audio, screen]);

  // -------------------------------------------------------------- narration
  // The opening: once per device, on the main menu, once a gesture has let sound play.
  useEffect(() => {
    if (screen !== "title" || !live || hasHeard(heard.current, "intro")) return;
    const t = window.setTimeout(() => void say("intro", () => latest.current.screen === "title"), 1500);
    return () => clearTimeout(t);
  }, [screen, live, say]);

  // Arrival at a trial: its chapter, once per voyage, as the title settles.
  useEffect(() => {
    if (screen !== "brief" || !live) return;
    const chapter = PLACES[TRIAL_PLACE[selected]].narration;
    if (!chapter || hasHeard(heard.current, chapter)) return;
    const t = window.setTimeout(() => void say(chapter, () => latest.current.screen === "brief" && latest.current.selected === selected), 900);
    return () => clearTimeout(t);
  }, [screen, selected, live, say]);

  // The homecoming, once per voyage.
  useEffect(() => {
    if (screen !== "ending" || !live) return;
    const t = window.setTimeout(() => void say("homecoming", () => latest.current.screen === "ending"), 1400);
    return () => clearTimeout(t);
  }, [screen, live, say]);

  // Victory and defeat: the stinger has already played; the narration follows
  // only when no recap is being written (the model's own words come first).
  const resultSaid = useRef<string | null>(null);
  useEffect(() => {
    if (screen !== "result" || !live || (outcome !== "victory" && outcome !== "defeat")) return;
    const key = `${input.runKey}:${outcome}`;
    if (outcome === "victory" && resultSaid.current !== key + ":chime") {
      resultSaid.current = key + ":chime";
      // The trial is complete: its checkpoint seals on the chart.
      window.setTimeout(() => { if (latest.current.screen === "result") latest.current.audio.current?.uiSound("checkpoint-complete"); }, 2900);
    }
    if (input.recap !== "none" || resultSaid.current === key) return;
    const t = window.setTimeout(() => {
      resultSaid.current = key;
      void say(outcome === "victory" ? "victory" : "defeat", () => latest.current.screen === "result" && latest.current.recap === "none");
    }, 3600);
    return () => clearTimeout(t);
  }, [screen, outcome, live, input.recap, input.runKey, say]);

  // ------------------------------------------------------- AI made audible
  // A model has come online.
  const wasOnline = useRef(false);
  useEffect(() => {
    if (input.rivalOnline && !wasOnline.current) audio.current?.uiSound("oracle-activate");
    wasOnline.current = input.rivalOnline;
  }, [audio, input.rivalOnline]);

  // The Oracle has started writing a question.
  useEffect(() => { if (input.oracleLoading) audio.current?.uiSound("oracle-thinking"); }, [audio, input.oracleLoading]);

  // The rival has prepared for this briefing: ready, or (if its tactic changed since the last round here) a new path.
  useEffect(() => {
    if (screen !== "brief" || !input.aiReady || !input.rivalOnline || input.exhibition || !live) return;
    const before = lastPlans.current.get(selected);
    const line: LineId = before !== undefined && before !== input.planId ? "oracle-path" : "oracle-ready";
    void say(line, () => latest.current.screen === "brief" && latest.current.selected === selected && latest.current.aiReady);
  }, [screen, selected, input.aiReady, input.rivalOnline, input.exhibition, input.planId, live, say]);

  // The Lotus race and hunt need no language model; when none is connected the Oracle says so, once.
  useEffect(() => {
    if (screen !== "brief" || !input.exhibition || input.rivalOnline || input.rivalChecking || !live || unavailableSaid.current) return;
    // After the chapter has begun, so the Oracle's line follows it instead of being cut short by it.
    const t = window.setTimeout(() => {
      unavailableSaid.current = true;
      void say("oracle-unavailable", () => latest.current.screen === "brief" && latest.current.exhibition && !latest.current.rivalOnline);
    }, 1800);
    return () => clearTimeout(t);
  }, [screen, input.exhibition, input.rivalOnline, input.rivalChecking, live, say]);

  // A round begins: the rival takes up the challenge.
  useEffect(() => {
    if (screen !== "play" || input.runKey === null) return;
    const key = input.runKey;
    round.current = { key, lead: new LeadTracker(seconds()), giantSaid: false, rescues: 0, tension: 0, over: false };
    lastPlans.current.set(selected, input.planId);
    audio.current?.sample("trial-start");
    // The lines this round may earn, fetched now (a retry skips the briefing that would have fetched them).
    const lines: LineId[] = selected === "cyclops" ? ["cyclops-approach"] : selected === "lotus" ? ["sailor-rescued", "oracle-player-lead", "oracle-rival-lead"] : selected === "circe" || selected === "bow" ? ["oracle-player-lead", "oracle-rival-lead"] : [];
    audio.current?.preload(TRIAL_PLACE[selected], lines);
    const character: LineId | null = selected === "circe" ? "circe-challenge" : selected === "sirens" ? "sirens-warning" : null;
    if (!character) return;
    const t = window.setTimeout(() => void say(character, () => latest.current.screen === "play" && latest.current.runKey === key), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, input.runKey]);

  // Dialogs are glass panels too.
  const dialogWas = useRef(input.dialog);
  useEffect(() => {
    if (dialogWas.current !== input.dialog) audio.current?.uiSound(input.dialog ? "glass-open" : "glass-close");
    dialogWas.current = input.dialog;
  }, [audio, input.dialog]);

  /** Each simulation step: tension from the real pursuit, and the lines its events earn. */
  const onFrame = useCallback((frame: AudioFrame) => {
    const r = round.current, a = latest.current.audio.current;
    if (!r || !a || latest.current.screen !== "play") return;
    const tension = Math.max(frame.loops.giant ?? 0, (frame.loops.whirlpool ?? 0) * 0.8);
    if (Math.abs(tension - r.tension) > 0.03) { r.tension = tension; a.setTension(tension); }
    // Once the round is decided, its characters have nothing more to say.
    if (frame.cues.some(c => c.sound === "victory" || c.sound === "defeat")) { r.over = true; a.setTension(0); }
    if (r.over) return;
    const sel = latest.current.selected, valid = () => latest.current.screen === "play" && round.current === r && !r.over;
    if (sel === "cyclops" && !r.giantSaid && (frame.loops.giant ?? 0) >= 0.7) { r.giantSaid = true; void say("cyclops-approach", valid); }
    if (sel === "lotus" && frame.cues.some(c => c.sound === "rescue")) {
      r.rescues++;
      // The third sailor ends the rescue; the first two earn a word from Odysseus.
      if (r.rescues <= 2) void say("sailor-rescued", valid);
    }
    if (frame.lead) {
      const line = r.lead.update(frame.lead, seconds());
      if (line) void say(line, valid);
    }
  }, [say]);

  // ------------------------------------------------------- interface sounds
  const onPointerOver = useCallback((e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as HTMLElement).closest?.(SELECTABLE) ?? null;
    if (el === hovered.current) return;
    hovered.current = el;
    if (el && !(el as HTMLButtonElement).disabled) latest.current.audio.current?.uiSound("ui-hover");
  }, []);

  const onClickCapture = useCallback((e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.(SELECTABLE);
    if (!el || (el as HTMLButtonElement).disabled || el.matches("select")) return;
    const back = el.matches('[aria-label="Back"], [aria-label="Close"], [aria-label="Main menu"]');
    latest.current.audio.current?.uiSound(back ? "ui-back" : "ui-select");
  }, []);

  return { caption, onFrame, speakLive, resetVoyage, onPointerOver, onClickCapture };
}
