import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Check, ChevronRight, Compass, Eye, HelpCircle, KeyRound, LockKeyhole, MessageCircle, RotateCcw, Settings, Shield, Sparkles, Star, Sun, Moon, Waves, X, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";
import { act, actors, CASE_SAVE, clues, glyphs, hintsFor, items, matchAuthored, newCase, objective, readCase, repliesFor, rooms, stars, type ActorId, type CaseAction, type CaseState, type ClueId, type Glyph, type HotspotId, type ItemId, type RoomId } from "./lib/mystery";
import { VoyageAudio } from "./lib/voyage-audio";
import type { ModelStatus } from "./lib/turn";
import "./mystery.css";

type Modal = "journal" | "hint" | "settings" | "theory" | "ending" | "restart" | "about" | null;
type Selection = { type: "object"; id: HotspotId } | { type: "actor"; id: ActorId } | null;
const glyphNames: Record<Glyph, string> = { sun: "Sun", wave: "Wave", moon: "Moon" };
function GlyphIcon({ glyph, size = 22 }: { glyph: Glyph; size?: number }) { return glyph === "sun" ? <Sun size={size} /> : glyph === "wave" ? <Waves size={size} /> : <Moon size={size} />; }
function Portrait({ actor, large = false }: { actor: ActorId; large?: boolean }) {
  const tile = actors[actor].portrait;
  return <span aria-hidden="true" className={"m-portrait" + (large ? " large" : "")} style={{ backgroundPosition: (tile % 5) * 25 + "% " + Math.floor(tile / 5) * 100 / 3 + "%" }} />;
}
const objectText: Record<HotspotId, { title: string; text: string; clue?: ClueId }> = {
  pedestal: { title: "The displaced seal", text: "A circular stone has slipped from its pedestal. Its empty seams suggest missing fragments. A red wool cord, tied with three knots, is trapped beneath it." },
  inscription: { title: clues.inscription.title, text: clues.inscription.text, clue: "inscription" },
  ledger: { title: clues.ledger.title, text: clues.ledger.text, clue: "ledger" },
  door: { title: "The workshop lock", text: "Three bronze wheels mark dusk, midnight, and dawn. Put the recorded events in order to open the workshop and the passage to the harbor." },
  bench: { title: "The seal workbench", text: "Three fragments lie on a padded workbench: sun, wave, and moon. Their seams can be joined in three places, from left to right." },
  carving: { title: clues.carving.title, text: clues.carving.text, clue: "carving" },
  drawer: { title: "The stuck drawer", text: "A drawer beneath the bottles is stuck shut. The little ring where its pull loop once hung is empty. Something flexible could make a new loop." },
  socket: { title: "The harbor mechanism", text: "A round socket waits for a whole seal. Below it, a relief shows the sea. A lever beside the gate raises or lowers the harbor chain." },
  watch: { title: clues.watch.title, text: clues.watch.text, clue: "watch" },
  instructions: { title: clues.gate.title, text: clues.gate.text, clue: "gate" },
};
function initialSave() {
  try {
    const text = localStorage.getItem(CASE_SAVE);
    return { state: readCase(text) || newCase(), warning: text && !readCase(text) ? "This case save could not be read. Begin a new case when ready. Your voyage save is still available." : "" };
  } catch { return { state: newCase(), warning: "Browser storage is unavailable. You can play, but progress may not survive closing this tab." }; }
}
function getPreferences() {
  try {
    const p = JSON.parse(localStorage.getItem("farshore-mystery-preferences") || "{}");
    return { sound: p.sound === true, ai: p.ai === true, motion: p.motion !== false };
  } catch { return { sound: false, ai: false, motion: true }; }
}
function readDrafts(): Record<ActorId, string> {
  const empty = { circe: "", eurylochus: "", odysseus: "" };
  try {
    const raw = JSON.parse(localStorage.getItem("farshore-mystery-drafts-v1") || "{}");
    for (const id of Object.keys(empty) as ActorId[]) if (typeof raw[id] === "string") empty[id] = raw[id].slice(0, 500);
  } catch { /* Draft storage is optional. */ }
  return empty;
}
export default function MysteryApp() {
  const [initial] = useState(initialSave);
  const [state, setState] = useState(initial.state);
  const current = useRef(state); current.current = state;
  const [intro, setIntro] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [message, setMessage] = useState("Explore at your own pace. Progress saves in this browser.");
  const [success, setSuccess] = useState(true);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [preferences, setPreferences] = useState(getPreferences);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [timeline, setTimeline] = useState(["broken", "locked", "whole"]);
  const [sealOrder, setSealOrder] = useState<Glyph[]>(["moon", "sun", "wave"]);
  const [selectedItem, setSelectedItem] = useState<ItemId>("cord");
  const [facing, setFacing] = useState<Glyph>("sun");
  const [motion, setMotion] = useState<"raise" | "lower">("lower");
  const [suspect, setSuspect] = useState<ActorId>("circe");
  const [cause, setCause] = useState<"moved" | "curse" | "attack">("curse");
  const [evidence, setEvidence] = useState<ClueId[]>([]);
  const [dialogFeedback, setDialogFeedback] = useState("");
  const [journalFilter, setJournalFilter] = useState<"all" | "Observation" | "Statement">("all");
  const [hintLevel, setHintLevel] = useState(0);
  const [drafts, setDrafts] = useState<Record<ActorId, string>>(readDrafts);
  const [dialogue, setDialogue] = useState<{ text: string; label: string } | null>(null);
  const [questionError, setQuestionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const questionStarted = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const roomTitle = useRef<HTMLHeadingElement>(null);
  const dialogTitle = useRef<HTMLHeadingElement>(null);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const audio = useRef<VoyageAudio | null>(null);
  const [quiet, setQuiet] = useState(document.hidden);

  useEffect(() => {
    if (!state.started) return;
    try { localStorage.setItem(CASE_SAVE, JSON.stringify(state)); setStorageWarning(""); }
    catch { setStorageWarning("Progress could not be saved. Keep this tab open to finish the case."); }
  }, [state]);
  useEffect(() => {
    try { localStorage.setItem("farshore-mystery-preferences", JSON.stringify(preferences)); } catch { /* Gameplay remains available. */ }
  }, [preferences]);
  useEffect(() => { try { localStorage.setItem("farshore-mystery-drafts-v1", JSON.stringify(drafts)); } catch { /* Keep the draft in memory. */ } }, [drafts]);
  useEffect(() => {
    const service = new VoyageAudio(); audio.current = service;
    const visibility = () => setQuiet(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => { service.dispose(); audio.current = null; requestRef.current?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => { audio.current?.update({ enabled: preferences.sound, music: .25, effects: .4, ducked: busy, quiet, mood: intro ? "title" : state.escaped ? "home" : "voyage" }); }, [preferences.sound, quiet, busy, intro, state.escaped]);
  useEffect(() => { if (selection && !intro) panelTitle.current?.focus({ preventScroll: !window.matchMedia("(max-width: 800px)").matches }); }, [selection, intro]);
  useEffect(() => { if (!intro) document.getElementById("case-main")?.focus(); }, [intro]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setWaitSeconds(Math.floor((Date.now() - questionStarted.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  function dispatch(action: CaseAction) {
    const result = act(current.current, action);
    current.current = result.state;
    setState(result.state); setMessage(result.message); setSuccess(result.success);
    if (result.success) audio.current?.cue(action.type === "gate" ? "sail" : result.added.length ? "reply" : "select");
    if (result.success && ["take", "timeline", "restore", "drawer"].includes(action.type)) requestAnimationFrame(() => panelTitle.current?.focus({ preventScroll: true }));
    if (result.success && action.type === "deduce") requestAnimationFrame(() => dialogTitle.current?.focus());
    return result;
  }
  function cancelQuestion(showMessage = false) {
    requestRef.current?.abort(); requestRef.current = null; setBusy(false);
    if (showMessage) setQuestionError("Question cancelled. Your draft is kept. You can retry or select a question.");
  }
  function select(next: Selection) {
    cancelQuestion(); setQuestionError(""); setDialogue(null); setSelection(next);
    if (next?.type === "object") dispatch({ type: "inspect", id: next.id });
  }
  function changeRoom(room: RoomId) {
    const result = dispatch({ type: "room", room });
    if (result.success) { cancelQuestion(); setSelection(null); setDialogue(null); setQuestionError(""); requestAnimationFrame(() => roomTitle.current?.focus()); }
  }
  function closePanel() { cancelQuestion(); setSelection(null); requestAnimationFrame(() => roomTitle.current?.focus()); }
  async function checkConnection() {
    setChecking(true);
    try { const r = await fetch("/api/mystery", { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(); setStatus(await r.json()); }
    catch { setStatus({ aiConfigured: false, aiAvailable: false, message: "The local server could not check the model. Suggested questions are ready to use." }); }
    finally { setChecking(false); }
  }
  function askAuthored(actor: ActorId, replyId: string, label = "Authored character answer") {
    cancelQuestion(); setQuestionError("");
    const result = dispatch({ type: "statement", actor, replyId });
    if (result.success) setDialogue({ text: result.message, label });
  }
  async function askQuestion(event: FormEvent, actor: ActorId) {
    event.preventDefault();
    const question = drafts[actor].trim();
    if (question.length < 3) { setQuestionError("Write at least three characters, or select a suggested question."); return; }
    if (!preferences.ai) {
      const reply = matchAuthored(actor, state, question);
      if (reply) askAuthored(actor, reply.id, "Authored answer · keyword match");
      else setQuestionError("No authored topic matches those words. Select a question below, or enable AI question matching in Settings.");
      return;
    }
    cancelQuestion(); setQuestionError(""); setWaitSeconds(0); questionStarted.current = Date.now(); setBusy(true);
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const response = await fetch("/api/mystery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor, question, state: current.current }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(95_000)]) });
      const data = await response.json();
      if (requestRef.current !== controller) return;
      if (!response.ok) throw new Error(data.error || "The model could not answer. Try a suggested question.");
      // Never trust a network answer to write arbitrary text or clue IDs.
      const reply = repliesFor(actor, current.current).find(r => r.id === data.replyId);
      if (reply) askAuthored(actor, reply.id, "AI matched question · authored answer");
      else if (data.replyId === "unmatched") { setDialogue({ text: "I cannot answer that from what I know. Try one of the questions below.", label: "AI matched question · no available answer" }); }
      else throw new Error("The model returned an unavailable answer. Try a suggested question.");
    } catch (error) {
      if (requestRef.current === controller) setQuestionError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "The question timed out. Your draft is kept; retry or choose a suggested question.");
    } finally { if (requestRef.current === controller) { requestRef.current = null; setBusy(false); } }
  }
  function openModal(next: Modal) {
    if (!modal) dialogReturnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setDialogFeedback(""); setModal(next);
    if (next === "hint") { setHintLevel(0); dispatch({ type: "hint" }); }
  }
  function begin() { if (!state.started) dispatch({ type: "start" }); setIntro(false); if (preferences.sound) void audio.current?.unlock().catch(() => setPreferences(p => ({ ...p, sound: false }))); }
  const room = rooms[state.room];
  const actor = (Object.keys(actors) as ActorId[]).find(id => actors[id].room === state.room)!;
  const selectedObject = selection?.type === "object" ? objectText[selection.id] : null;
  const titleMap: Record<Exclude<Modal, null>, string> = { journal: "Your case journal", hint: "A nudge in the right direction", settings: "Game settings", theory: "Connect the evidence", ending: "The way home is open", restart: "Begin a fresh case?", about: "About this adventure" };
  const descriptionMap: Record<Exclude<Modal, null>, string> = { journal: "Observations establish facts. Character statements may conflict with them.", hint: "Reveal only as much as you need. Hints never cost stars.", settings: "Choose sound, motion, and how custom questions are matched.", theory: "Name who acted, explain what happened, and select two supporting clues.", ending: "Escape is only one part of the case. You can return to solve every part.", restart: "This replaces only the current mystery case saved in this browser.", about: "An original mystery inspired by Book X of Homer’s Odyssey." };

  return <div className={"mystery-app" + (!preferences.motion ? " still" : "")}>
    <a className="m-skip" href="#case-main">Skip to game</a>
    <header className="m-header">
      <button className="m-brand" onClick={() => { cancelQuestion(); setIntro(true); }} aria-label="Farshore title screen"><Compass size={26} /><span>FARSHORE<small>SECRETS OF THE VOYAGE</small></span></button>
      <nav aria-label="Game tools">
        {state.started && <button className="m-tool" aria-label={"Journal · " + state.clues.length + " clues"} onClick={() => openModal("journal")}><BookOpen size={18} /><span>Journal</span><b>{state.clues.length}</b></button>}
        <button className="m-tool" aria-label="Settings" onClick={() => openModal("settings")}><Settings size={18} /><span>Settings</span></button>
      </nav>
    </header>
    {storageWarning && <p className="m-storage" role="alert">{storageWarning}</p>}
    <main id="case-main" tabIndex={-1}>
      {intro ? <section className="m-intro">
        <div className="m-hero">
          <div className="m-hero-art" />
          <div className="m-hero-copy">
            <span className="m-eyebrow"><span className="m-dot" /> AN ODYSSEY MYSTERY</span>
            <h1>Every voyage<br />hides a <em>secret.</em></h1>
            <p>The harbor is sealed. The stone is broken.<br className="m-desktop-break" /> Someone in Circe’s palace is hiding the truth.</p>
            <div className="m-case-label"><KeyRound size={18} /><span>CASE 01<small>Circe’s Broken Seal</small></span></div>
            <button className="m-button primary m-begin" onClick={begin}>{state.started ? "Continue investigation" : "Begin investigation"}<ArrowRight size={19} /></button>
            <span className="m-start-note">No timer. No lost lives. Follow your curiosity.</span>
          </div>
          <div className="m-hero-caption"><span>AEAEA · CIRCE’S PALACE</span><span>ONE NIGHT. THREE STORIES.</span></div>
        </div>
        <div className="m-intro-bottom">
          <div><Eye /><span>Explore the palace<small>Inspect objects. Collect what matters.</small></span></div>
          <div><MessageCircle /><span>Question the witnesses<small>Ask, listen, and spot contradictions.</small></span></div>
          <div><KeyRound /><span>Solve your way out<small>Use clues to restore the seal and escape.</small></span></div>
        </div>
        <footer className="m-title-footer"><button onClick={() => openModal("about")}>Story & sources</button><a href="?voyage">Original voyage</a><span>A new case in the world of Farshore</span></footer>
      </section> : <div className="m-play">
        <div className="m-case-heading"><div><span className="m-eyebrow">CASE 01 · AEAEA</span><h1>Circe’s Broken Seal</h1></div><button className="m-rating" onClick={() => openModal("ending")} aria-label={"Case progress: " + stars(state) + " of 3 stars"}>{[state.escaped, state.deductionSolved, state.motiveFound].map((earned, i) => <Star key={i} size={22} fill={earned ? "currentColor" : "none"} className={earned ? "earned" : ""} />)}<span>{stars(state)}/3</span></button></div>
        <div className="m-objective"><Compass size={19} /><span>{objective(state)}</span><button onClick={() => openModal("hint")}><HelpCircle size={17} />Need a hint?</button></div>
        <section className="m-case-goals" aria-label="Case objectives">
          <p><strong>The mystery:</strong> Who moved the protective seal, and why?</p>
          <ul>
            {[
              { earned: state.escaped, title: "Escape", text: "Restore the seal and open the harbor gate." },
              { earned: state.deductionSolved, title: "Prove what happened", text: "Support your theory with two independent clues." },
              { earned: state.motiveFound, title: "Optional: discover the motive", text: "Find the unsent message in the workshop." },
            ].map(goal => <li key={goal.title}>{goal.earned ? <Check size={17} aria-label="Completed" /> : <Star size={17} aria-label="Not yet completed" />}<span><strong>{goal.title}</strong><small>{goal.text}</small></span></li>)}
          </ul>
        </section>
        <div className="m-game-grid">
          <section className="m-location" aria-label="Explore the palace">
            <nav className="m-room-nav" aria-label="Palace rooms">{(Object.keys(rooms) as RoomId[]).map((id, i) => <button key={id} className={state.room === id ? "active" : ""} aria-current={state.room === id ? "location" : undefined} aria-disabled={id !== "hall" && !state.timelineSolved} onClick={() => changeRoom(id)}>{id !== "hall" && !state.timelineSolved ? <LockKeyhole size={15} /> : <span className="m-room-number">0{i + 1}</span>}{id === "hall" ? "Entrance hall" : id === "workshop" ? "Workshop" : "Harbor gate"}</button>)}</nav>
            <div className="m-room-title"><h2 ref={roomTitle} tabIndex={-1}>{room.name}</h2><span>{state.room === "harbor" && state.escaped ? "The gate is open. The crew can sail again." : room.subtitle}</span></div>
            <div className="m-scene" style={{ backgroundPosition: "center " + room.art * 50 + "%" }} role="group" aria-label={room.name + " interactive scene"}>
              <div className="m-scene-vignette" />
              <span className="m-scene-instruction"><Eye size={14} />Select an object to investigate</span>
              {room.hotspots.map((spot, i) => <button key={spot.id} data-object={spot.id} className={"m-hotspot" + (selection?.type === "object" && selection.id === spot.id ? " selected" : "")} style={{ left: "clamp(64px, " + spot.x + "%, calc(100% - 64px))", top: spot.y + "%" }} onClick={() => select({ type: "object", id: spot.id })} aria-label={"Inspect " + spot.label}><span className="m-marker">{state.inspected.includes(spot.id) ? <Check size={14} /> : i + 1}</span><span className="m-hotspot-label">{spot.label}</span></button>)}
            </div>
            <div className="m-people"><button onClick={() => select({ type: "actor", id: actor })}><Portrait actor={actor} /><span><small>QUESTION A WITNESS</small><strong>{actors[actor].name}</strong><span>{actors[actor].role}</span></span><MessageCircle size={21} /><ChevronRight size={17} /></button><div className="m-room-note">{state.room === "hall" ? "The night left traces. Begin with the stone." : state.room === "workshop" ? "Some pieces fit. Some stories don’t." : "The truth is closer than the horizon."}</div></div>
          </section>
          <aside className="m-investigation" aria-label="Investigation panel">
            {selectedObject && selection?.type === "object" ? <>
              <div className="m-panel-kicker"><Eye size={15} />OBJECT EXAMINATION<button aria-label="Back to room" onClick={closePanel}><X size={16} /></button></div>
              <h2 ref={panelTitle} tabIndex={-1}>{selectedObject.title}</h2><p>{selectedObject.text}</p>
              {selectedObject.clue && <div className="m-recorded"><BookOpen size={15} />Recorded as an observation</div>}
              {selection.id === "pedestal" && <button className="m-button primary" disabled={state.items.includes("cord")} onClick={() => dispatch({ type: "take", item: "cord" })}>{state.items.includes("cord") ? <><Check size={17} />Cord collected</> : <><KeyRound size={17} />Take the red cord</>}</button>}
              {selection.id === "ledger" && <button className="m-button" onClick={() => select({ type: "object", id: "door" })}>Examine workshop lock<ArrowRight size={17} /></button>}
              {selection.id === "door" && (state.timelineSolved ? <div className="m-solved"><Check />Lock opened<button className="m-button" onClick={() => changeRoom("workshop")}>Enter workshop<ArrowRight size={17} /></button></div> : <form onSubmit={e => { e.preventDefault(); dispatch({ type: "timeline", order: timeline }); }}><h3>Reconstruct the night</h3>{["Dusk", "Midnight", "Dawn"].map((time, i) => <label className="m-field" key={time}><span>{time}</span><select aria-label={time + " event"} value={timeline[i]} onChange={e => setTimeline(p => p.map((v, j) => j === i ? e.target.value : v))}><option value="whole">Seal whole on pedestal</option><option value="broken">Captain finds broken seal</option><option value="locked">Harbor gate locks</option></select></label>)}<button className="m-button primary">Test the event order<KeyRound size={17} /></button></form>)}
              {selection.id === "bench" && (state.sealRestored ? <div className="m-solved"><Check />Seal restored<button className="m-button" onClick={() => changeRoom("harbor")}>Go to harbor<ArrowRight size={17} /></button></div> : <><button className="m-button" disabled={state.items.includes("fragments")} onClick={() => dispatch({ type: "take", item: "fragments" })}>{state.items.includes("fragments") ? "Fragments collected" : "Collect the fragments"}</button><form onSubmit={e => { e.preventDefault(); dispatch({ type: "restore", order: sealOrder }); }}><h3>Arrange the seal</h3><div className="m-glyph-slots">{sealOrder.map((glyph, i) => <label key={i}><span>{["LEFT", "MIDDLE", "RIGHT"][i]}</span><GlyphIcon glyph={glyph} size={28} /><select aria-label={["Left", "Middle", "Right"][i] + " seal fragment"} value={glyph} onChange={e => setSealOrder(p => p.map((v, j) => j === i ? e.target.value as Glyph : v))}>{glyphs.map(g => <option value={g} key={g}>{glyphNames[g]}</option>)}</select></label>)}</div><button className="m-button primary">Join the fragments<Sparkles size={17} /></button></form></>)}
              {selection.id === "drawer" && (state.motiveFound ? <div className="m-found-note"><span className="m-eyebrow">THE UNSENT MESSAGE</span><p>{clues.note.text}</p><Check size={16} />Motive discovered</div> : <form onSubmit={e => { e.preventDefault(); dispatch({ type: "drawer", item: selectedItem }); }}><InventoryChoice state={state} selected={selectedItem} onChange={setSelectedItem} /><button className="m-button primary">Use item on drawer<KeyRound size={17} /></button></form>)}
              {selection.id === "socket" && (state.escaped ? <div className="m-solved"><Check />Harbor gate opened<button className="m-button primary" onClick={() => openModal("ending")}>View case result<ArrowRight size={17} /></button></div> : <form onSubmit={e => { e.preventDefault(); const r = dispatch({ type: "gate", item: selectedItem, facing, motion }); if (r.success) openModal("ending"); }}><InventoryChoice state={state} selected={selectedItem} onChange={setSelectedItem} /><label className="m-field"><span>Symbol facing the sea</span><select value={facing} onChange={e => setFacing(e.target.value as Glyph)}>{glyphs.map(g => <option key={g} value={g}>{glyphNames[g]}</option>)}</select></label><label className="m-field"><span>Chain lever</span><select value={motion} onChange={e => setMotion(e.target.value as "raise" | "lower")}><option value="lower">Lower chain</option><option value="raise">Raise chain</option></select></label><button className="m-button primary">Operate the gate<KeyRound size={17} /></button></form>)}
              {(selection.id === "watch" || selection.id === "inscription") && <button className="m-button" onClick={() => openModal("theory")}>Connect the evidence<ArrowRight size={17} /></button>}
              <p className={"m-panel-feedback" + (success ? "" : " unsuccessful")}>{message}</p>
            </> : selection?.type === "actor" ? <>
              <div className="m-panel-kicker"><MessageCircle size={15} />WITNESS CONVERSATION<button aria-label="Back to room" onClick={closePanel}><X size={16} /></button></div>
              <div className="m-witness"><Portrait actor={selection.id} large /><div><h2 ref={panelTitle} tabIndex={-1}>{actors[selection.id].name}</h2><span>{actors[selection.id].role}</span></div></div>
              <div className="m-dialogue" aria-live="polite"><span>{dialogue?.label || "Authored character dialogue"}</span><p>{dialogue?.text || (selection.id === "circe" ? state.sealRestored ? "The seal is whole again. Tell me what you still wish to know." : "The sea is waiting, but the seal must be restored. Tell me what you need to know." : selection.id === "eurylochus" ? "I want the men safely aboard. What is it you wish to ask?" : state.escaped ? "The gate is open and the crew can sail. What else do you wish to know?" : "Find a way through this gate. And find out what happened to that seal.")}</p></div>
              <h3>Ask about…</h3><div className="m-questions">{repliesFor(selection.id, state).map(reply => <button key={reply.id} onClick={() => askAuthored(selection.id, reply.id)}>{reply.question}<ChevronRight size={15} /></button>)}</div>
              <form className="m-custom-question" onSubmit={e => void askQuestion(e, selection.id)}>
                <label htmlFor="m-question">Or ask in your own words</label><textarea id="m-question" rows={2} maxLength={500} value={drafts[selection.id]} placeholder="What do you know about the seal?" onChange={e => setDrafts(p => ({ ...p, [selection.id]: e.target.value }))} />
                <span className="m-mode-note">{preferences.ai ? "AI matches your question to a permitted authored answer." : "Authored mode uses keywords. Suggested questions always work."}</span>
                {questionError && <p className="m-question-error" role="alert">{questionError}</p>}
                <div className="m-question-actions">
                  {busy && <div className="m-waiting"><span role="status">Matching question…</span><span role="timer" aria-live="off">{waitSeconds}s elapsed</span><small>Suggested questions stay available.</small></div>}
                  <button type={busy ? "button" : "submit"} className={"m-button" + (busy ? "" : " primary")} onClick={e => { if (busy) { e.preventDefault(); cancelQuestion(true); } }}>{busy ? "Cancel" : questionError && preferences.ai ? "Retry question" : "Ask " + actors[selection.id].name}{!busy && <ArrowRight size={16} />}</button>
                </div>
              </form>
            </> : <>
              <div className="m-panel-kicker"><Compass size={15} />YOUR INVESTIGATION</div>
              <h2>{stars(state) === 3 ? "Every piece fits." : state.deductionSolved ? "The evidence tells the story." : "Something doesn’t add up."}</h2>
              <p>{state.escaped ? state.deductionSolved ? state.motiveFound ? "The gate is open, the truth is supported, and Eurylochus’s message explains his fear for the crew. Revisit the palace or question him about what happened." : "The gate is open, and the evidence shows Eurylochus moved the seal. His reason is still worth investigating." : "The crew can leave through the open gate. Use the clues to discover who moved the seal and why." : state.deductionSolved ? "The evidence shows Eurylochus moved the seal. Restore it and open the harbor gate so the crew can leave." : "Circe says the seal protects the palace. Someone moved it. Now the crew’s way out is closed."}</p>
              <div className="m-start-steps"><div><span>1</span><p>Inspect the labeled objects in the room.</p></div><div><span>2</span><p>Question the witness. Compare their account with what you find.</p></div><div><span>3</span><p>Use your satchel and journal to solve the mechanisms.</p></div></div><button className="m-button" onClick={() => openModal("theory")}><BookOpen size={17} />Connect the evidence</button><div className="m-panel-footnote"><Shield size={16} /><span>Take your time. Wrong attempts and hints never reduce your score.</span></div>
            </>}
          </aside>
        </div>
        <div className={"m-feedback" + (success ? "" : " unsuccessful")} role="status" aria-live="polite">{success ? <Sparkles size={17} /> : <HelpCircle size={17} />}<span>{message}</span></div>
        <div className="m-bottom-bar"><div className="m-satchel"><span className="m-eyebrow"><KeyRound size={15} />YOUR SATCHEL</span>{state.items.length ? state.items.map(id => <button key={id} className={selectedItem === id ? "selected" : ""} onClick={() => { setSelectedItem(id); setMessage(items[id].description); setSuccess(true); }}><span>{id === "cord" ? "⌁" : id === "seal" ? "◉" : "◈"}</span>{items[id].name}{selectedItem === id && <Check size={13} />}</button>) : <span className="m-empty-satchel">Items you collect appear here.</span>}</div><button className="m-button m-theory-button" onClick={() => openModal("theory")}><BookOpen size={17} />{state.deductionSolved ? "Theory confirmed" : "Build your theory"}<ArrowRight size={16} /></button></div>
        <footer className="m-play-footer"><span>{storageWarning ? "Save unavailable" : "Progress saved in this browser"} · No timer</span><div><button onClick={() => openModal("about")}>Story & sources</button><button onClick={() => openModal("restart")}><RotateCcw size={13} />New case</button></div></footer>
      </div>}
    </main>
    <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}>
      <DialogContent overlayClassName="m-dialog-overlay" className={"m-dialog " + (modal === "journal" || modal === "theory" ? "m-dialog-wide" : "")} onCloseAutoFocus={event => {
        event.preventDefault();
        const previous = dialogReturnFocus.current;
        const target = previous?.isConnected && !previous.matches(":disabled") ? previous : panelTitle.current || roomTitle.current || document.getElementById("case-main");
        target?.focus();
        dialogReturnFocus.current = null;
      }}>
        <DialogTitle ref={dialogTitle} tabIndex={-1}>{modal === "ending" && !state.escaped ? "Your case progress" : modal ? titleMap[modal] : ""}</DialogTitle><DialogDescription>{modal ? descriptionMap[modal] : ""}</DialogDescription>
        {modal === "journal" && <><div className="m-journal-filters" role="group" aria-label="Filter journal">{(["all", "Observation", "Statement"] as const).map(filter => <button key={filter} aria-pressed={journalFilter === filter} onClick={() => setJournalFilter(filter)}>{filter === "all" ? "All clues" : filter + "s"}</button>)}</div><div className="m-journal-list">{state.clues.filter(id => journalFilter === "all" || clues[id].kind === journalFilter).map(id => <article key={id}><span className={"m-clue-kind " + clues[id].kind.toLowerCase()}>{clues[id].kind} · {rooms[clues[id].room].name}</span><h3>{clues[id].title}</h3><p>{clues[id].text}</p></article>)}{!state.clues.some(id => journalFilter === "all" || clues[id].kind === journalFilter) && <p>Nothing recorded here yet. Inspect the room or question its witness.</p>}</div><button className="m-button primary" onClick={() => openModal("theory")}>Build your theory<ArrowRight size={17} /></button></>}
        {modal === "hint" && <><div className="m-hint-level">HINT {hintLevel + 1} OF 3</div><p className="m-hint-text">{hintsFor(state)[hintLevel]}</p>{hintLevel < 2 && <button className="m-button" onClick={() => { setHintLevel(p => p + 1); dispatch({ type: "hint" }); }}>Reveal a clearer hint<ChevronRight size={17} /></button>}<button className="m-button primary" onClick={() => setModal(null)}>Return to investigation</button></>}
        {modal === "settings" && <><label className="m-toggle"><span><Volume2 size={18} />Music & sounds<small>Original sea ambience and retro music</small></span><input type="checkbox" checked={preferences.sound} onChange={e => { const enabled = e.target.checked; setPreferences(p => ({ ...p, sound: enabled })); if (enabled) void audio.current?.unlock().catch(() => { setPreferences(p => ({ ...p, sound: false })); setDialogFeedback("Audio could not start in this browser."); }); }} /></label><label className="m-toggle"><span>Ambient motion<small>Also respects your device’s reduced-motion setting</small></span><input type="checkbox" checked={preferences.motion} onChange={e => setPreferences(p => ({ ...p, motion: e.target.checked }))} /></label><label className="m-toggle"><span>AI question matching<small>Custom questions use the configured model. Suggested questions remain instant.</small></span><input type="checkbox" checked={preferences.ai} onChange={e => { cancelQuestion(); setPreferences(p => ({ ...p, ai: e.target.checked })); if (e.target.checked) void checkConnection(); }} /></label><p className="m-settings-note">The model chooses from answers this character is allowed to give. It cannot create evidence or change stars. Your custom question and these available answers are sent to the configured model service.</p><div className="m-model-status"><span>{checking ? "Checking model connection…" : status?.message || "Check the connection before trying a custom AI question."}</span><button className="m-button" disabled={checking} onClick={() => void checkConnection()}>Check connection</button></div>{dialogFeedback && <p role="status">{dialogFeedback}</p>}<button className="m-button primary" onClick={() => setModal(null)}>Done</button></>}
        {modal === "theory" && (state.deductionSolved ? <div className="m-confirmed"><Check size={35} /><h3>Your theory is supported.</h3><p>Eurylochus moved the seal. His cord links him to the pedestal; the watch log independently places him carrying it. The broken seal activated the harbor lock.</p><p>{state.motiveFound ? "His unsent message explains his fear for the crew. Question him again to hear his admission." : "Why he acted is still worth investigating. Look for a private message in the workshop."}</p><button className="m-button primary" onClick={() => setModal(null)}>Keep investigating</button></div> : <form onSubmit={e => { e.preventDefault(); const r = dispatch({ type: "deduce", suspect, cause, evidence }); setDialogFeedback(r.message); if (r.success) setEvidence([]); }}><div className="m-theory-selects"><label className="m-field"><span>Who acted?</span><select value={suspect} onChange={e => setSuspect(e.target.value as ActorId)}>{(Object.keys(actors) as ActorId[]).map(id => <option key={id} value={id}>{actors[id].name}</option>)}</select></label><label className="m-field"><span>What caused the lock?</span><select value={cause} onChange={e => setCause(e.target.value as typeof cause)}><option value="curse">A deliberate curse</option><option value="moved">Moving the protective seal</option><option value="attack">An attack from outside</option></select></label></div><fieldset className="m-evidence-options"><legend>Choose two supporting clues ({evidence.length}/2)</legend>{state.clues.map(id => <label key={id}><input type="checkbox" checked={evidence.includes(id)} onChange={e => { setEvidence(p => e.target.checked ? [...p, id] : p.filter(x => x !== id)); setDialogFeedback(""); }} /><span><strong>{clues[id].title}</strong><small>{clues[id].kind} · {clues[id].text}</small></span></label>)}{!state.clues.length && <p>Inspect the palace to gather evidence first.</p>}</fieldset>{dialogFeedback && <p className="m-theory-feedback" role="status">{dialogFeedback}</p>}<button className="m-button primary">Test this theory<ArrowRight size={17} /></button></form>)}
        {modal === "ending" && <><div className="m-ending-stars">{[state.escaped, state.deductionSolved, state.motiveFound].map((earned, i) => <Star key={i} size={44} fill={earned ? "currentColor" : "none"} className={earned ? "earned" : ""} />)}</div><p>{state.escaped ? "The harbor chain rises. The crew steps aboard under the first light of dawn. The voyage can continue." : "The crew is still waiting for the harbor gate to open. Each discovery brings you closer."}</p><ul className="m-achievements">{[{ earned: state.escaped, title: "Find a way out", text: "Restore the seal and open the harbor gate." }, { earned: state.deductionSolved, title: "Uncover the truth", text: "Support your theory with independent evidence." }, { earned: state.motiveFound, title: "Understand the motive", text: "Find Eurylochus’s unsent message." }].map(goal => <li key={goal.title}>{goal.earned ? <Check /> : <Star />}<span><strong>{goal.title}</strong><small>{goal.text}</small></span></li>)}</ul><div className="m-ending-note">No deductions for hints, wrong attempts, reading time, or writing style.</div><button className="m-button primary" onClick={() => setModal(null)}>{stars(state) === 3 ? "Revisit the palace" : "Continue investigating"}<ArrowRight size={17} /></button><button className="m-button" onClick={() => openModal("restart")}>Play the case again</button></>}
        {modal === "restart" && <><p>The current clues, inventory, and stars for Circe’s Broken Seal will be cleared. Your original voyage save is separate.</p><button className="m-button primary" onClick={() => { cancelQuestion(); const fresh = newCase(); fresh.started = true; current.current = fresh; setState(fresh); setSelection(null); setDialogue(null); setEvidence([]); setTimeline(["broken", "locked", "whole"]); setSealOrder(["moon", "sun", "wave"]); setDrafts({ circe: "", eurylochus: "", odysseus: "" }); setSelectedItem("cord"); setFacing("sun"); setMotion("lower"); setSuspect("circe"); setCause("curse"); setQuestionError(""); setMessage("A new investigation begins in the entrance hall."); setSuccess(true); setIntro(false); setModal(null); }}>Begin fresh case<RotateCcw size={16} /></button><button className="m-button" onClick={() => setModal(null)}>Keep current progress</button></>}
        {modal === "about" && <><p>Farshore: Secrets of the Voyage turns the homeward journey into mysteries you can investigate. This first playable case has three rooms, three mechanisms, and three witnesses.</p><p>Circe’s Broken Seal is an original fictional case. Homer’s Book X supplies the island, characters, Circe’s transformation of the crew, and Eurylochus’s distrust. The seal, watch log, drawer message, timeline lock, and harbor mechanism were invented for this game.</p><a className="m-source-link" href="https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap10" target="_blank" rel="noreferrer">Read Book X · Samuel Butler translation<ArrowRight size={16} /></a><p>Play with a mouse, touch, or keyboard. Tab moves between controls; Enter activates buttons. All puzzle choices have labels. No dragging, microphone, or model connection is required.</p><a className="m-button" href="?voyage">Open the original voyage<ArrowRight size={16} /></a></>}
      </DialogContent>
    </Dialog>
  </div>;
}
function InventoryChoice({ state, selected, onChange }: { state: CaseState; selected: ItemId; onChange: (item: ItemId) => void }) {
  return <label className="m-field"><span>Item from your satchel</span><select value={state.items.includes(selected) ? selected : ""} onChange={e => onChange(e.target.value as ItemId)}><option value="" disabled>Choose an item</option>{state.items.map(id => <option value={id} key={id}>{items[id].name}</option>)}</select></label>;
}
