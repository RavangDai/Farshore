"use client";
import { BookOpen, Gamepad2, Swords, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { difficultyNames, trials, type ArcadeSave, type Difficulty, type TrialId } from "../../lib/arcade/arcade";
import { RACE_LAYOUTS } from "../../lib/encounters/lotus-layouts";
import { fieldNotes } from "../../lib/story/field-notes";
import { TRIAL_COPY, TRIAL_LOOKS, chapterOf } from "../../lib/cinema/scenes";
import { ChapterTitle, Cta, DifficultySelect, Drawer, Subtitle, Wordmark } from "./chrome";
import { LaurelBranch } from "./icons";

export type BriefMode = "story" | "race" | "hunt" | "practice";

const MODE_LABELS: Record<BriefMode, string> = { story: "Story", race: "AI Race", hunt: "Hunt", practice: "Practice" };

type Props = {
  id: TrialId;
  save: ArcadeSave;
  difficulty: Difficulty;
  mode: BriefMode;
  still: boolean;
  corner: ReactNode;
  status: ReactNode;
  headingRef: RefObject<HTMLElement | null>;
  /** Whether the chosen mode can start now, and what to say on the button when it cannot. */
  ready: boolean;
  holdLabel: string;
  oracleFirst: boolean;
  garden: string;
  taunt: { speaker: string; text: string } | null;
  rival: { character: string; tactic: string; reason: string; effect: string; models: { commentary: string | null; oracle: string | null } };
  trainedMeta: { label: string; steps: number } | null;
  onMode: (m: BriefMode) => void;
  onGarden: (g: string) => void;
  onDifficulty: (d: Difficulty) => void;
  onBegin: () => void;
  onBlocked: () => void;
  onBack: () => void;
  onHear: () => void;
};

export function Briefing(props: Props) {
  const { id, save, difficulty, mode, still, corner, status, headingRef, ready, holdLabel, oracleFirst, garden, taunt, rival, trainedMeta } = props;
  const [drawer, setDrawer] = useState<"controls" | "lore" | "rival" | null>(null);
  const trial = trials.find(t => t.id === id)!, copy = TRIAL_COPY[id];
  const modes: BriefMode[] = id === "lotus" ? ["story", "race", "hunt", "practice"] : ["story", "practice"];
  const best = save.records[id].bests[difficulty];
  const exhibition = mode === "race" || mode === "hunt";
  const beginLabel = !ready ? holdLabel : mode === "race" ? "Begin race" : mode === "hunt" ? "Begin hunt" : mode === "practice" ? "Begin practice" : "Begin trial";
  const beginSub = !ready ? undefined : mode === "story" ? (oracleFirst ? "The Oracle asks first" : "Counts toward your voyage") : exhibition ? "Exhibition · not saved" : "Not saved";
  const chapter = trials.findIndex(t => t.id === id) + 1;
  return <main className="cn-screen cn-brief" style={{ "--cn-accent": TRIAL_LOOKS[id].accent } as CSSProperties}>
    <header className="cn-topbar"><Wordmark onClick={props.onBack} back />{corner}</header>
    <section className="cn-brief-panel cn-glass">
      <span className="cn-ceremonial cn-ruled">{chapterOf(id)}</span>
      <ChapterTitle lines={[copy.short]} still={still} headingRef={headingRef} revealKey={id} className="cn-title-brief" />
      <div className="cn-divider" aria-hidden="true"><i /><LaurelBranch size={16} flip /><LaurelBranch size={16} /><i /></div>
      <p className="cn-objective cn-objective-lead">{copy.objective}</p>
      <div className="cn-tabs cn-segmented" role="tablist" aria-label="How to play this trial">
        {modes.map(m => <button key={m} type="button" role="tab" aria-selected={mode === m} className="cn-tab" onClick={() => props.onMode(m)}>
          {mode === m && <motion.i layoutId="cn-tab-line" className="cn-tab-line" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}<span>{MODE_LABELS[m]}</span>
        </button>)}
      </div>
      <div className="cn-brief-status">{status}</div>
      <div className="cn-brief-fields">
        <div className="cn-brief-field"><span aria-hidden="true">Difficulty</span><DifficultySelect value={difficulty} onChange={props.onDifficulty} bare /></div>
        {exhibition && <div className="cn-brief-field"><span aria-hidden="true">Garden</span><label className="cn-select cn-select-garden"><span className="sr-only">Garden</span>
          <select value={garden} onChange={e => props.onGarden(e.target.value)}>{RACE_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}<option value="fresh">A new garden</option></select>
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
        </label></div>}
        {best && mode === "story" && <p className="cn-best"><span className={`cn-medal-dot ${best.medal}`} />{best.medal} · best {best.score.toLocaleString()}</p>}
      </div>
      <Cta laurels={ready} onClick={ready ? props.onBegin : props.onBlocked} className="cn-cta-begin" sub={beginSub} kbd={ready ? "Enter" : undefined} wide>{beginLabel}</Cta>
      <nav className="cn-brief-links" aria-label="More about this trial">
        <button type="button" onClick={() => setDrawer("controls")}><Gamepad2 size={17} strokeWidth={1.4} aria-hidden="true" /><span>Controls</span></button><i aria-hidden="true" />
        <button type="button" onClick={() => setDrawer("lore")}><BookOpen size={17} strokeWidth={1.4} aria-hidden="true" /><span>Lore</span></button><i aria-hidden="true" />
        <button type="button" onClick={() => setDrawer("rival")}><Swords size={16} strokeWidth={1.4} aria-hidden="true" /><span>{exhibition ? "Trained rival" : "Rival"}</span></button>
      </nav>
    </section>
    {!exhibition && taunt && <Subtitle speaker={taunt.speaker} text={taunt.text} action={<button type="button" className="cn-hear" onClick={props.onHear} aria-label={`Hear ${taunt.speaker}`}><Volume2 size={16} strokeWidth={1.5} /></button>} />}
    <Drawer open={drawer === "controls"} title="Controls" onClose={() => setDrawer(null)}>
      <p className="cn-drawer-lead">{trial.controls}</p>
      <div className="cn-keys">{fieldNotes[id].keys.map(k => <kbd key={k}>{k}</kbd>)}</div>
      {exhibition && <p className="cn-note">{mode === "race" ? "Race on your own board while the trained rival runs its twin. Arrow keys or WASD move Odysseus." : "You steer the guardians; the trained Odysseus plays the garden. Arrows move your hunter, Tab swaps to the other, Space summons or dismisses the third."}</p>}
      <p className="cn-note">Escape pauses. F toggles fullscreen.{(id === "cyclops" || id === "sirens" || id === "bow") ? " F3 shows how your rival is deciding." : ""}</p>
    </Drawer>
    <Drawer open={drawer === "lore"} title={`${copy.short} · Book ${trial.book}`} onClose={() => setDrawer(null)}>
      <p className="cn-drawer-lead">{trial.story}</p>
      {trial.homer !== trial.story && <p>{trial.homer}</p>}
      <p className="cn-note">{trial.adaptation}</p>
      <a className="cn-link" href={`https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap${trial.book === "IX" ? "09" : trial.book === "X" ? "10" : trial.book === "XII" ? "12" : trial.book === "V" ? "05" : "21"}`} target="_blank" rel="noreferrer">Read the episode in Homer’s Odyssey</a>
    </Drawer>
    <Drawer open={drawer === "rival"} title={exhibition ? "The trained rival" : rival.character} onClose={() => setDrawer(null)}>
      {exhibition ? <>
        <p className="cn-drawer-lead">{mode === "race" ? "Odysseus’ rival on the second board is a policy trained by reinforcement learning (PPO) in this very garden’s rules." : "The Odysseus you hunt is the same trained policy, now the quarry. His sprint and leap are game rules; his route choices are the model’s."}</p>
        <dl className="cn-facts">
          <div><dt>Model</dt><dd>{trainedMeta ? `${trainedMeta.label} · ${(trainedMeta.steps / 1e6).toFixed(1)}M training steps` : "PPO policy (loads when the race starts)"}</dd></div>
          <div><dt>Runs</dt><dd>In your browser, with ONNX Runtime Web. No server, no language model.</dd></div>
          <div><dt>Fallback</dt><dd>None. If the model cannot load, the race says so and offers a retry; it never swaps in a scripted rival.</dd></div>
          <div><dt>Guardians</dt><dd>{rival.tactic}: game rules, identical on both boards.</dd></div>
        </dl>
      </> : <>
        <p className="cn-drawer-lead"><strong>{rival.tactic}.</strong> {rival.effect}</p>
        <p className="cn-note">{rival.reason}</p>
        <dl className="cn-facts">
          <div><dt>Tactic</dt><dd>Chosen by the game’s rules from your last two attempts. No model decides it.</dd></div>
          <div><dt>Commentary</dt><dd>{rival.models.commentary ?? "No model connected"}</dd></div>
          <div><dt>Oracle</dt><dd>{rival.models.oracle ?? "No model connected"}</dd></div>
          <div><dt>Difficulty</dt><dd>{difficultyNames[difficulty]}</dd></div>
        </dl>
        {taunt && <blockquote className="cn-quote">“{taunt.text}”<button type="button" className="cn-hear" onClick={props.onHear} aria-label={`Hear ${rival.character}`}><Volume2 size={16} strokeWidth={1.5} /></button></blockquote>}
      </>}
      <p className="cn-note">Chapter {chapter} of 8.</p>
    </Drawer>
  </main>;
}
