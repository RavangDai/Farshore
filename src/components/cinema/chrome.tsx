"use client";
import gsap from "gsap";
import { ChevronDown, CircleUser, FlaskConical, Settings, Volume2, VolumeX, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { difficultyNames, type Difficulty } from "../../lib/arcade/arcade";
import { Helmet, LaurelBranch, SigilGlyph } from "./icons";

// A long frame (a world compiling, a voice decoding) should let a reveal finish, not crawl through it.
if (typeof window !== "undefined") gsap.ticker.lagSmoothing(0);

export type SigilState = "online" | "offline" | "thinking" | "rival" | "trained";

/**
 * The Oracle's sigil: one small mark for the AI's real state. Connected and
 * idle, unavailable, writing something right now, or (in play) a rival acting.
 * The words beside it say which model, never what it is "thinking".
 */
export function OracleSigil({ state, label, detail, onClick, compact = false }: { state: SigilState; label: string; detail?: string; onClick?: () => void; compact?: boolean }) {
  const body = <><SigilGlyph size={compact ? 22 : 24} />{!compact && <span className="cn-sigil-text"><b>{label}</b>{detail && <small>{detail}</small>}</span>}</>;
  return <span className="cn-sigil-wrap" role="status" aria-live="polite">
    {onClick
      ? <button type="button" className="cn-sigil" data-state={state} data-compact={compact || undefined} onClick={onClick} aria-label={`${label}${detail ? `. ${detail}` : ""}`} data-tip={compact ? label : undefined}>{body}</button>
      : <span className="cn-sigil" data-state={state} data-compact={compact || undefined} aria-label={`${label}${detail ? `. ${detail}` : ""}`}>{body}</span>}
  </span>;
}

export function IconButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return <button type="button" className="cn-icon-btn" onClick={onClick} aria-label={label} data-tip={label} aria-pressed={pressed}>{children}</button>;
}

/** The corner cluster every menu screen shares: sound, AI Lab, account, settings, and the Oracle. */
export function CornerIcons({ sound, onSound, onLab, account, onSettings, sigil }: { sound: boolean; onSound: () => void; onLab?: () => void; account?: { name: string | null; label: string; open: () => void }; onSettings: () => void; sigil: ReactNode }) {
  return <div className="cn-corner">
    {sigil}
    <span className="cn-corner-rule" aria-hidden="true" />
    <IconButton label={sound ? "Mute music and sounds" : "Turn on music and sounds"} pressed={sound} onClick={onSound}>{sound ? <Volume2 size={20} strokeWidth={1.4} /> : <VolumeX size={20} strokeWidth={1.4} />}</IconButton>
    {onLab && <IconButton label="AI Lab" onClick={onLab}><FlaskConical size={19} strokeWidth={1.4} /></IconButton>}
    {account && <IconButton label={account.name ? `${account.name} · ${account.label}` : "Sign in to save online"} onClick={account.open}><CircleUser size={20} strokeWidth={1.4} /></IconButton>}
    <IconButton label="Settings" onClick={onSettings}><Settings size={20} strokeWidth={1.4} /></IconButton>
  </div>;
}

/** The bronze call to action. Laurels for the ceremonial ones. */
export function Cta({ children, sub, icon, onClick, disabled, laurels, className = "", kbd, wide }: { children: ReactNode; sub?: ReactNode; icon?: ReactNode; onClick: () => void; disabled?: boolean; laurels?: boolean; className?: string; kbd?: string; wide?: boolean }) {
  return <button type="button" className={`cn-cta ${className}`} data-laurels={laurels || undefined} data-wide={wide || undefined} onClick={onClick} disabled={disabled}>
    <span className="cn-cta-sheen" aria-hidden="true" />
    {laurels && <LaurelBranch className="cn-cta-laurel" size={30} />}
    {icon}
    <span className="cn-cta-text"><b>{children}</b>{sub && <small>{sub}</small>}</span>
    {laurels && <LaurelBranch className="cn-cta-laurel" size={30} flip />}
    {kbd && <kbd className="cn-kbd" aria-hidden="true">{kbd}</kbd>}
  </button>;
}

/** A chapter title whose lines rise into place (GSAP); still mode shows them at once. */
export function ChapterTitle({ lines, still, className = "", headingRef, revealKey }: { lines: string[]; still: boolean; className?: string; headingRef?: RefObject<HTMLElement | null>; revealKey?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (headingRef) (headingRef as { current: HTMLElement | null }).current = ref.current;
  });
  useLayoutEffect(() => {
    if (still || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".cn-line > span", { yPercent: 105, opacity: 0, filter: "blur(6px)" }, { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 1.15, ease: "power4.out", stagger: 0.11, delay: 0.08 });
    }, ref);
    return () => ctx.revert();
  }, [revealKey ?? lines.join("|"), still]);
  return <h1 ref={ref} tabIndex={-1} className={`cn-chapter-title ${className}`}>{lines.map((l, i) => <span key={`${l}-${i}`} className="cn-line"><span>{l}</span></span>)}</h1>;
}

export function DifficultySelect({ value, onChange, compact, bare }: { value: Difficulty; onChange: (d: Difficulty) => void; compact?: boolean; bare?: boolean }) {
  return <label className="cn-select" data-compact={compact || undefined} data-bare={bare || undefined}>
    {!bare && <Helmet size={18} />}
    <span className="sr-only">Difficulty</span>
    <select value={value} onChange={e => onChange(e.target.value as Difficulty)}>
      {(["easy", "normal", "hard"] as Difficulty[]).map(d => <option key={d} value={d}>{difficultyNames[d]}</option>)}
    </select>
    <ChevronDown size={15} aria-hidden="true" />
  </label>;
}

/**
 * A side drawer for everything optional: lore, controls, the rival's plan,
 * detailed results. Traps focus, closes on Escape, returns focus on close.
 */
export function Drawer({ open, title, onClose, children, side = "right", wide = false, label }: { open: boolean; title: string; onClose: () => void; children: ReactNode; side?: "right" | "left"; wide?: boolean; label?: string }) {
  const panel = useRef<HTMLElement>(null), opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement;
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])") ?? []).filter(el => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
    const id = requestAnimationFrame(() => (focusables()[1] ?? focusables()[0])?.focus());
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const items = focusables(), first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(id); document.removeEventListener("keydown", key); opener.current?.focus?.(); };
  }, [open, onClose]);
  return <AnimatePresence>{open && <motion.div key="drawer" className="cn-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <motion.aside ref={panel} className="cn-drawer" data-side={side} data-wide={wide || undefined} role="dialog" aria-modal="true" aria-label={label ?? title}
      initial={{ x: side === "right" ? 48 : -48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: side === "right" ? 32 : -32, opacity: 0 }} transition={{ type: "spring", damping: 32, stiffness: 300 }}>
      <header className="cn-drawer-head"><h2>{title}</h2><button type="button" className="cn-icon-btn" onClick={onClose} aria-label="Close"><X size={20} strokeWidth={1.4} /></button></header>
      <div className="cn-drawer-body">{children}</div>
    </motion.aside>
  </motion.div>}</AnimatePresence>;
}

/** A film subtitle: who speaks, and the line. Commentary and taunts appear here, never in a panel. */
export function Subtitle({ speaker, text, action }: { speaker: string; text: string | null; action?: ReactNode }) {
  return <div className="cn-subtitle-slot" aria-live="polite"><AnimatePresence mode="wait">{text && <motion.p key={text} className="cn-subtitle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
    <b>{speaker}</b><q>{text}</q>{action}
  </motion.p>}</AnimatePresence></div>;
}

/** The wordmark in a screen's corner; returns to the main menu. */
export function Wordmark({ onClick, back }: { onClick: () => void; back?: boolean }) {
  return <button type="button" className="cn-wordmark" onClick={onClick} aria-label={back ? "Back" : "Main menu"}>
    {back && <><svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M21 7H2M7 1L1 7l6 6" /></svg><i aria-hidden="true" /></>}
    <span>Farshore</span>
  </button>;
}
