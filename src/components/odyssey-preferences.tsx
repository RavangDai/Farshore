import type { OnlinePreferences } from "../lib/online";

export function OdysseyPreferences({ preferences: p, onChange }: { preferences: OnlinePreferences; onChange: (next: OnlinePreferences) => void }) {
  return <div className="od-preferences">
    <label><span>Music volume <strong>{Math.round(p.music * 100)}%</strong></span><input type="range" min="0" max="1" step=".01" value={p.music} onChange={e => onChange({ ...p, music: Number(e.target.value) })}/></label>
    <label><span>Effects volume <strong>{Math.round(p.effects * 100)}%</strong></span><input type="range" min="0" max="1" step=".01" value={p.effects} onChange={e => onChange({ ...p, effects: Number(e.target.value) })}/></label>
    <button className="a-setting-toggle" aria-pressed={p.contrast} onClick={() => onChange({ ...p, contrast: !p.contrast })}><span>High contrast<small>Brighter labels and stronger panel borders.</small></span><strong>{p.contrast ? "On" : "Off"}</strong></button>
  </div>;
}
