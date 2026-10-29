import type { OnlinePreferences } from "../../lib/online/online";

export function OdysseyPreferences({ preferences: p, onChange }: { preferences: OnlinePreferences; onChange: (next: OnlinePreferences) => void }) {
  return <div className="od-preferences">
    <label><span>Music volume <strong>{Math.round(p.music * 100)}%</strong></span><input type="range" min="0" max="1" step=".01" value={p.music} onChange={e => onChange({ ...p, music: Number(e.target.value) })}/></label>
    <label><span>Effects volume <strong>{Math.round(p.effects * 100)}%</strong></span><input type="range" min="0" max="1" step=".01" value={p.effects} onChange={e => onChange({ ...p, effects: Number(e.target.value) })}/></label>
    <label><span>Visual effects <strong>{Math.round(p.visuals * 100)}%</strong></span><input type="range" min="0" max="1" step=".05" value={p.visuals} onChange={e => onChange({ ...p, visuals: Number(e.target.value) })}/><small>Dust, embers, sparks and torch glow. Hazards and warnings are never reduced.</small></label>
    <button className="a-setting-toggle" aria-pressed={p.shake} onClick={() => onChange({ ...p, shake: !p.shake })}><span>Camera shake<small>Screen movement on heavy impacts.</small></span><strong>{p.shake ? "On" : "Off"}</strong></button>
    <button className="a-setting-toggle" aria-pressed={p.contrast} onClick={() => onChange({ ...p, contrast: !p.contrast })}><span>High contrast<small>Brighter labels and stronger panel borders.</small></span><strong>{p.contrast ? "On" : "Off"}</strong></button>
  </div>;
}
