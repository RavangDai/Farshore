import type { CSSProperties } from "react";

type IconProps = { size?: number; className?: string; style?: CSSProperties };

export function Trident({ size = 34, className }: IconProps) {
  return <svg className={className} width={size * 0.6} height={size} viewBox="0 0 30 50" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4v42M15 4l-2.6 5h5.2zM6 10c0 8 3 11 9 11s9-3 9-11M6 10l-2 3M6 10l2 3M24 10l-2 3M24 10l2 3M11 46h8" />
  </svg>;
}

/** One branch of laurel. Mirror it with `flip` for the other side. */
export function LaurelBranch({ size = 28, flip = false, className, style }: IconProps & { flip?: boolean }) {
  return <svg className={className} style={{ ...style, transform: `${style?.transform ?? ""} ${flip ? "scaleX(-1)" : ""}` }} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" fill="currentColor">
    <path d="M33 36C22 33 12 25 9 6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    {[[10, 9, -40], [12, 15, -30], [15, 21, -20], [19, 26, -10], [24, 30, 0], [29, 33, 10]].map(([x, y, r], i) => <g key={i}>
      <ellipse cx={x - 4} cy={y} rx="4.2" ry="1.7" transform={`rotate(${r - 35} ${x - 4} ${y})`} />
      <ellipse cx={x + 2} cy={y - 3} rx="4.2" ry="1.7" transform={`rotate(${r + 40} ${x + 2} ${y - 3})`} />
    </g>)}
  </svg>;
}

/** A full victory wreath; every leaf is its own path so the reveal can stagger them. */
export function LaurelWreath({ size = 180, className }: IconProps) {
  const leaves: { x: number; y: number; r: number; side: number }[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.62 + i * 0.085);
    leaves.push({ x: 100 + side * Math.cos(a) * -72, y: 104 + Math.sin(a) * 72 - 8, r: side * (i * 11 - 30), side });
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
    <defs><linearGradient id="cn-wreath" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7e2a8" /><stop offset=".55" stopColor="#e4bf79" /><stop offset="1" stopColor="#9a6d34" /></linearGradient></defs>
    <path className="cn-wreath-stem" d="M64 168C30 140 26 82 54 46M136 168c34-28 38-86 10-122" fill="none" stroke="url(#cn-wreath)" strokeWidth="2.2" strokeLinecap="round" />
    {leaves.map((l, i) => <g key={i} className="cn-wreath-leaf" transform={`translate(${l.x} ${l.y}) rotate(${l.r + (l.side < 0 ? 200 : -20)})`}>
      <path d="M0 0c8-6 20-6 26 0-6 6-18 6-26 0z" fill="url(#cn-wreath)" />
      <path d="M0 0c-4-10-2-20 6-26 4 10 2 20-6 26z" fill="url(#cn-wreath)" opacity=".85" />
    </g>)}
    <path d="M86 172l14-10 14 10" fill="none" stroke="url(#cn-wreath)" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

export function CompassRose({ size = 120, className }: IconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke="currentColor">
    <circle cx="60" cy="60" r="38" strokeWidth=".8" opacity=".6" />
    <circle cx="60" cy="60" r="30" strokeWidth=".6" opacity=".4" strokeDasharray="2 3" />
    <path d="M60 8l6 46-6 6-6-6zM60 112l-6-46 6-6 6 6zM8 60l46-6 6 6-6 6zM112 60l-46 6-6-6 6-6z" fill="currentColor" fillOpacity=".18" strokeWidth=".9" />
    <path d="M60 8l6 46-6 6z" fill="currentColor" fillOpacity=".65" stroke="none" />
    <path d="M60 30l3 27-3 3-3-3zM60 90l-3-27 3-3 3 3zM30 60l27-3 3 3-3 3zM90 60l-27 3-3-3 3-3z" transform="rotate(45 60 60)" strokeWidth=".7" />
    {[["N", 60, 4], ["S", 60, 119], ["W", 2, 62], ["E", 118, 62]].map(([l, x, y]) => <text key={l as string} x={x as number} y={y as number} fontSize="9" textAnchor="middle" fill="currentColor" stroke="none" style={{ fontFamily: "var(--cn-font-title)" }}>{l}</text>)}
  </svg>;
}

/** A Corinthian helmet: the difficulty mark. */
export function Helmet({ size = 18, className }: IconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
    <path d="M5 13c0-5 3-9 7.5-9S20 7 20 12v6l-3 2v-6h-2.5v6H11v-6H8.5" />
    <path d="M12.5 4c-1-2 1-3 3-2.5 3 1 5 4 5.5 7" />
    <path d="M5 13l3 1M14.5 9.5h4" />
  </svg>;
}

/** The eight trials as stars of one constellation; cleared stars burn gold. */
export function Constellation({ done, active, className }: { done: boolean[]; active?: number; className?: string }) {
  const pts = done.map((_, i) => [14 + i * 30, 14 + (i % 2 ? -5 : 5) * (i % 3 === 0 ? 0.4 : 1)] as const);
  return <svg className={className} viewBox={`0 0 ${30 * done.length + 2} 28`} aria-hidden="true">
    <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth=".8" opacity=".45" />
    {pts.map(([x, y], i) => <g key={i} data-done={done[i] || undefined} data-active={i === active || undefined} className="cn-star">
      <circle cx={x} cy={y} r={done[i] ? 3.6 : 3} fill={done[i] ? "currentColor" : "var(--cn-obsidian)"} stroke="currentColor" strokeWidth="1.1" />
      {done[i] && <circle cx={x} cy={y} r="7" fill="currentColor" opacity=".18" />}
    </g>)}
  </svg>;
}

/** The Oracle's sigil: a Delphic eye inside a ring of rays. Its state is styled by the parent. */
export function SigilGlyph({ size = 22 }: { size?: number }) {
  return <svg className="cn-sigil-glyph" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round">
    <g className="cn-sigil-rays" strokeWidth="1.2">{Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <line key={i} x1={16 + Math.cos(a) * 12.2} y1={16 + Math.sin(a) * 12.2} x2={16 + Math.cos(a) * 15} y2={16 + Math.sin(a) * 15} />; })}</g>
    <circle cx="16" cy="16" r="9.5" strokeWidth="1.1" opacity=".75" />
    <path className="cn-sigil-eye" d="M9 16c2.2-3.2 4.6-4.6 7-4.6s4.8 1.4 7 4.6c-2.2 3.2-4.6 4.6-7 4.6S11.2 19.2 9 16z" strokeWidth="1.2" />
    <circle className="cn-sigil-pupil" cx="16" cy="16" r="2.1" fill="currentColor" stroke="none" />
  </svg>;
}

/** Ornamental rule with a central diamond. */
export function Rule({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 240 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0 5h108M132 5h108" stroke="currentColor" strokeWidth=".8" /><path d="M120 1l4 4-4 4-4-4z" fill="currentColor" /></svg>;
}
