"use client";
import { RefreshCw, Volume2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { OnlinePreferences } from "../../lib/online/online";
import { QUALITY_LABELS, type Quality, type QualityChoice } from "../../lib/cinema/quality";
import type { VoiceLoad, VoicePrefs, VoiceStatus } from "../../lib/speech/voice";
import { Drawer } from "./chrome";

export type SettingsTab = "sound" | "display" | "ai" | "about";
type RivalInfo = { status: "checking" | "online" | "offline"; message: string; model: string | null; commentary: string | null; oracle?: string | null; embedder?: string | null };

const voiceLabels: Record<VoiceStatus, string> = { checking: "Checking…", loading: "Natural voices, getting ready", neural: "Natural voices", browser: "Browser voices", unavailable: "Browser voices" };
const voiceNotes: Record<VoiceStatus, string> = {
  checking: "Checking which voices are available.",
  loading: "Preparing the natural voices. Until they are ready, your browser reads the lines.",
  neural: "Each character speaks with their own natural voice.",
  browser: "Natural voices are turned off on this server, so your browser reads the lines.",
  unavailable: "The natural voices could not be prepared, so your browser reads the lines. The first run needs an internet connection.",
};

function Toggle({ on, onClick, title, note }: { on: boolean; onClick: () => void; title: string; note?: string }) {
  return <button type="button" role="switch" aria-checked={on} className="cn-toggle" onClick={onClick}>
    <span><b>{title}</b>{note && <small>{note}</small>}</span><i aria-hidden="true" />
  </button>;
}
function Slider({ label, value, onChange, step = 0.01 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return <label className="cn-slider"><span>{label}<output>{Math.round(value * 100)}%</output></span><input type="range" min={0} max={1} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

type Props = {
  open: boolean;
  initialTab: SettingsTab;
  onClose: () => void;
  prefs: OnlinePreferences;
  setPrefs: (update: (p: OnlinePreferences) => OnlinePreferences) => void;
  onToggleSound: () => void;
  voicePrefs: VoicePrefs;
  setVoicePrefs: (update: (v: VoicePrefs) => VoicePrefs) => void;
  voiceStatus: VoiceStatus;
  voiceLoad: VoiceLoad;
  onTestVoice: () => void;
  rival: RivalInfo;
  onCheck: () => void;
  oracleOn: boolean;
  onOracle: () => void;
  quality: QualityChoice;
  resolved: Quality;
  onQuality: (q: QualityChoice) => void;
  systemStill: boolean;
  showcase: ReactNode;
  onCredits: () => void;
};

export function SettingsPanel(p: Props) {
  const [tab, setTab] = useState<SettingsTab>(p.initialTab);
  useEffect(() => { if (p.open) setTab(p.initialTab); }, [p.open, p.initialTab]);
  const online = p.rival.status === "online";
  const tabs: [SettingsTab, string][] = [["sound", "Sound & voice"], ["display", "Display"], ["ai", "AI & Oracle"], ["about", "About"]];
  return <Drawer open={p.open} title="Settings" onClose={p.onClose} wide>
    <div className="cn-settings-tabs" role="tablist" aria-label="Settings sections">
      {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className="cn-tab" onClick={() => setTab(id)}>{label}{tab === id && <i className="cn-tab-line" />}</button>)}
    </div>
    {tab === "sound" && <div className="cn-settings-group" role="tabpanel">
      <Toggle on={p.prefs.sound} onClick={p.onToggleSound} title="Music & sounds" note="Every cue is also shown on screen." />
      <Slider label="Music" value={p.prefs.music} onChange={v => p.setPrefs(o => ({ ...o, music: v }))} />
      <Slider label="Effects" value={p.prefs.effects} onChange={v => p.setPrefs(o => ({ ...o, effects: v }))} />
      <Toggle on={p.voicePrefs.commentary} onClick={() => p.setVoicePrefs(v => ({ ...v, commentary: !v.commentary }))} title="Live commentary" note="The bard and your rival react as you play." />
      <Toggle on={p.voicePrefs.voice} onClick={() => p.setVoicePrefs(v => ({ ...v, voice: !v.voice }))} title="Spoken voice" note={`${voiceLabels[p.voiceStatus]}. ${voiceNotes[p.voiceStatus]}${p.voiceStatus === "loading" && p.voiceLoad.progress > 0 && p.voiceLoad.progress < 1 ? ` ${Math.round(p.voiceLoad.progress * 100)}%${p.voiceLoad.sizeMb ? ` of ${p.voiceLoad.sizeMb} MB` : ""}.` : ""}`} />
      <Slider label="Voice" value={p.voicePrefs.volume} step={0.05} onChange={v => p.setVoicePrefs(o => ({ ...o, volume: v }))} />
      <button type="button" className="cn-ghost" disabled={!p.voicePrefs.voice} onClick={p.onTestVoice}><Volume2 size={16} strokeWidth={1.4} /><span>Test the bard’s voice</span></button>
    </div>}
    {tab === "display" && <div className="cn-settings-group" role="tabpanel">
      <label className="cn-field"><span><b>Graphics</b><small>{p.quality === "auto" ? `Automatic chose ${QUALITY_LABELS[p.resolved]} for this device.` : "Lite shows the painted art instead of 3D worlds."}</small></span>
        <select value={p.quality} onChange={e => p.onQuality(e.target.value as QualityChoice)}>{(Object.keys(QUALITY_LABELS) as QualityChoice[]).map(q => <option key={q} value={q}>{QUALITY_LABELS[q]}</option>)}</select>
      </label>
      <Slider label="Particles & glow" value={p.prefs.visuals} step={0.05} onChange={v => p.setPrefs(o => ({ ...o, visuals: v }))} />
      <Toggle on={p.prefs.still} onClick={() => p.setPrefs(o => ({ ...o, still: !o.still }))} title="Reduced motion" note={`Holds the scenes still and skips the films. Gameplay stays live.${p.systemStill ? " Your device asks for reduced motion; turn this off to see the motion anyway." : ""}`} />
      <Toggle on={p.prefs.shake} onClick={() => p.setPrefs(o => ({ ...o, shake: !o.shake }))} title="Camera shake" note="Screen movement on heavy impacts." />
      <Toggle on={p.prefs.contrast} onClick={() => p.setPrefs(o => ({ ...o, contrast: !o.contrast }))} title="High contrast" note="Brighter text and firmer panel edges." />
      {p.showcase}
    </div>}
    {tab === "ai" && <div className="cn-settings-group" role="tabpanel">
      <div className="cn-model-status" data-status={p.rival.status}>
        <p role="status">{p.rival.message}</p>
        {online && <dl className="cn-facts">
          <div><dt>Commentary</dt><dd>{p.rival.commentary}</dd></div>
          {p.oracleOn && <div><dt>Oracle questions</dt><dd>{p.rival.oracle ?? p.rival.model}</dd></div>}
          {p.oracleOn && <div><dt>Searches the Odyssey with</dt><dd>{p.rival.embedder ? `${p.rival.embedder} + BM25` : "BM25 keywords (no embedding service)"}</dd></div>}
          <div><dt>Voice</dt><dd>{voiceLabels[p.voiceStatus]}</dd></div>
        </dl>}
        <button type="button" className="cn-ghost" disabled={p.rival.status === "checking"} onClick={p.onCheck}><RefreshCw size={15} strokeWidth={1.4} /><span>Check connection</span></button>
      </div>
      <Toggle on={p.oracleOn} onClick={p.onOracle} title="The Oracle’s key" note="Answer a question from Homer’s text before a trial counts." />
      <details className="cn-details"><summary>How to connect a model</summary><ol>
        <li><b>This computer.</b> Install Ollama, run <code>ollama pull qwen3:4b-instruct</code>, set <code>FARSHORE_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions</code> and <code>FARSHORE_MODEL_NAME=qwen3:4b-instruct</code> in <code>.env</code>, then restart the game server.</li>
        <li><b>Google Colab.</b> Open <code>colab/farshore_model_server.ipynb</code> on a T4 GPU, run every cell, and paste the printed <code>FARSHORE_*</code> lines into <code>.env</code>.</li>
        <li><b>Online accounts.</b> Add an OpenAI, Groq or OpenRouter connection under Account.</li>
      </ol></details>
      <p className="cn-note">The Lotus-Eaters race and hunt need no language model: their rival is a trained policy that runs in your browser.</p>
    </div>}
    {tab === "about" && <div className="cn-settings-group" role="tabpanel">
      <p className="cn-drawer-lead">FARSHORE adapts Homer’s <em>Odyssey</em> into eight trials. Progress saves in this browser, or to your account when signed in.</p>
      <button type="button" className="cn-ghost" onClick={p.onCredits}><span>Credits</span></button>
      <a className="cn-ghost" href="/story-sources.md" target="_blank" rel="noreferrer"><span>Story &amp; sources</span></a>
    </div>}
  </Drawer>;
}
