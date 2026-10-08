// Authored case truth. Models may match questions to these statements, never
// create evidence, inventory, solutions, or scoring decisions.
export const CASE_SAVE = "farshore-mystery-circe-v1";
export type RoomId = "hall" | "workshop" | "harbor";
export type ActorId = "circe" | "eurylochus" | "odysseus";
export type ItemId = "cord" | "fragments" | "seal";
export type Glyph = "sun" | "wave" | "moon";
export const glyphs: Glyph[] = ["sun", "wave", "moon"];
export const clues = {
  inscription: { title: "The seal inscription", kind: "Observation", room: "hall", text: "The stone reads: ‘First the sun, then the sea, last the moon. A whole seal guards the way; a displaced seal bars it.’" },
  cord: { title: "A three-knot red cord", kind: "Observation", room: "hall", text: "Red wool is caught underneath the displaced seal. Its three tight knots match the cord Eurylochus wears around his wrist. Circe wears no such cord." },
  ledger: { title: "The bell keeper’s record", kind: "Observation", room: "hall", text: "Dusk: Circe leaves a whole seal on its pedestal. Midnight: Odysseus reports the seal broken. Dawn: the harbor gate locks. The workshop lock has three event wheels." },
  carving: { title: "The workshop carving", kind: "Observation", room: "workshop", text: "Three places for the seal: morning on the left, the tide in the middle, night on the right. The workshop drawer has lost its pull loop." },
  watch: { title: "The harbor watch log", kind: "Observation", room: "harbor", text: "Between dusk and midnight, the watch keeper saw Eurylochus carry the seal toward the crew’s side passage. No one else entered before Odysseus arrived." },
  gate: { title: "The gate keeper’s instruction", kind: "Observation", room: "harbor", text: "‘Place the whole seal in the socket. Turn the wave toward the sea. Then raise the chain.’ The sea is below the socket on the gate’s relief." },
  note: { title: "An unsent message", kind: "Observation", room: "workshop", text: "In Eurylochus’s hand: ‘I feared she would change us again. If I lift the seal, perhaps the side passage will open and the men can leave. I must try before the captain returns.’" },
  circe: { title: "Circe’s account", kind: "Statement", room: "hall", text: "Circe says she left the seal whole at dusk. She says its purpose is protection, and removing it locks the harbor." },
  eurylochus: { title: "Eurylochus’s account", kind: "Statement", room: "workshop", text: "Eurylochus says he stayed near the ship and never touched the seal. This is an unconfirmed account, not physical evidence." },
  odysseus: { title: "Odysseus’s account", kind: "Statement", room: "harbor", text: "Odysseus says he found the seal broken at midnight. He recognizes the three-knot red cord as Eurylochus’s." },
  confession: { title: "Eurylochus admits the truth", kind: "Statement", room: "workshop", text: "Faced with the cord and the watch log, Eurylochus admits moving the seal to free the crew. It slipped and broke. Fear, not sabotage, drove him." },
} as const;
export type ClueId = keyof typeof clues;
export const clueIds = Object.keys(clues) as ClueId[];
export const items: Record<ItemId, { name: string; description: string }> = {
  cord: { name: "Red cord", description: "Three knots. Strong enough to make a drawer pull." },
  fragments: { name: "Seal fragments", description: "Sun, wave, moon. Arrange them at the workbench." },
  seal: { name: "Restored seal", description: "Ready for the harbor gate’s socket." },
};
export const actors: Record<ActorId, { name: string; role: string; portrait: number; room: RoomId }> = {
  circe: { name: "Circe", role: "Keeper of the palace", portrait: 7, room: "hall" },
  eurylochus: { name: "Eurylochus", role: "A frightened crewman", portrait: 9, room: "workshop" },
  odysseus: { name: "Odysseus", role: "Captain of the ship", portrait: 0, room: "harbor" },
};
export type HotspotId = "pedestal" | "inscription" | "ledger" | "door" | "bench" | "carving" | "drawer" | "socket" | "watch" | "instructions";
export const rooms: Record<RoomId, { name: string; subtitle: string; art: number; hotspots: { id: HotspotId; label: string; x: number; y: number }[] }> = {
  hall: { name: "The entrance hall", subtitle: "A broken seal. Three different stories.", art: 0, hotspots: [
    { id: "pedestal", label: "Broken pedestal", x: 24, y: 72 }, { id: "inscription", label: "Stone inscription", x: 82, y: 40 },
    { id: "ledger", label: "Bell record", x: 87, y: 76 }, { id: "door", label: "Workshop lock", x: 52, y: 42 },
  ] },
  workshop: { name: "Circe’s workshop", subtitle: "Put the pieces together. Listen for the contradiction.", art: 1, hotspots: [
    { id: "bench", label: "Seal workbench", x: 49, y: 59 }, { id: "carving", label: "Wall carving", x: 14, y: 27 }, { id: "drawer", label: "Stuck drawer", x: 86, y: 58 },
  ] },
  harbor: { name: "The harbor gate", subtitle: "The ship is close. The way out is still sealed.", art: 2, hotspots: [
    { id: "socket", label: "Gate mechanism", x: 60, y: 55 }, { id: "watch", label: "Watch keeper’s log", x: 16, y: 84 }, { id: "instructions", label: "Rolled instruction", x: 81, y: 67 },
  ] },
};
export interface CaseState {
  version: 1; started: boolean; room: RoomId; clues: ClueId[]; items: ItemId[];
  inspected: HotspotId[]; timelineSolved: boolean; sealRestored: boolean;
  deductionSolved: boolean; motiveFound: boolean; escaped: boolean; hints: number;
}
export function newCase(): CaseState {
  return { version: 1, started: false, room: "hall", clues: [], items: [], inspected: [], timelineSolved: false, sealRestored: false, deductionSolved: false, motiveFound: false, escaped: false, hints: 0 };
}
const hotIds = Object.values(rooms).flatMap(r => r.hotspots.map(h => h.id));
export function parseCase(raw: unknown): CaseState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as CaseState;
  const booleans = ["started", "timelineSolved", "sealRestored", "deductionSolved", "motiveFound", "escaped"] as const;
  const validArray = (a: unknown, allowed: readonly string[]) => Array.isArray(a) && a.length <= allowed.length && a.every(x => typeof x === "string" && allowed.includes(x)) && new Set(a).size === a.length;
  if (s.version !== 1 || !Object.keys(rooms).includes(s.room) || booleans.some(k => typeof s[k] !== "boolean") || !validArray(s.clues, clueIds) || !validArray(s.items, Object.keys(items)) || !validArray(s.inspected, hotIds) || !Number.isInteger(s.hints) || s.hints < 0 || s.hints > 999) return null;
  // Reject impossible progress rather than inventing evidence on load.
  if ((!s.started && (s.clues.length || s.items.length || s.inspected.length || s.timelineSolved)) || (!s.timelineSolved && (s.room !== "hall" || s.sealRestored || s.items.includes("fragments") || s.items.includes("seal"))) || (s.timelineSolved && !s.clues.includes("ledger")) || (s.sealRestored !== s.items.includes("seal")) || (s.sealRestored && (!s.clues.includes("inscription") || !s.clues.includes("carving") || s.items.includes("fragments"))) || (s.deductionSolved && (!s.clues.includes("cord") || !s.clues.includes("watch"))) || (s.motiveFound !== s.clues.includes("note")) || (s.motiveFound && !s.items.includes("cord")) || (s.escaped && (!s.sealRestored || !s.clues.includes("gate"))) || (s.clues.includes("confession") && !s.deductionSolved)) return null;
  if ((!s.timelineSolved && (s.clues.some(id => clues[id].room !== "hall") || s.inspected.some(id => !rooms.hall.hotspots.some(h => h.id === id)))) || (s.items.includes("cord") !== s.clues.includes("cord")) || (s.items.includes("cord") && !s.inspected.includes("pedestal")) || ((s.items.includes("fragments") || s.sealRestored) && !s.inspected.includes("bench")) || (s.motiveFound && !s.inspected.includes("drawer"))) return null;
  return { ...newCase(), ...Object.fromEntries(Object.keys(newCase()).map(k => [k, s[k as keyof CaseState]])) } as CaseState;
}
export function readCase(text: string | null): CaseState | null {
  try { return text && text.length < 20000 ? parseCase(JSON.parse(text)) : null; } catch { return null; }
}
export type CaseAction =
  | { type: "start" } | { type: "room"; room: RoomId } | { type: "inspect"; id: HotspotId }
  | { type: "take"; item: "cord" | "fragments" } | { type: "timeline"; order: string[] }
  | { type: "restore"; order: Glyph[] } | { type: "drawer"; item: ItemId }
  | { type: "gate"; item: ItemId; facing: Glyph; motion: "raise" | "lower" }
  | { type: "deduce"; suspect: ActorId; cause: "moved" | "curse" | "attack"; evidence: ClueId[] }
  | { type: "statement"; actor: ActorId; replyId: string } | { type: "hint" };
export interface CaseResult { state: CaseState; message: string; success: boolean; added: ClueId[] }
export function act(s: CaseState, action: CaseAction): CaseResult {
  const n: CaseState = { ...s, clues: [...s.clues], items: [...s.items], inspected: [...s.inspected] };
  const added: ClueId[] = [];
  const add = (id: ClueId) => { if (!n.clues.includes(id)) { n.clues.push(id); added.push(id); } };
  const done = (message: string, success = true): CaseResult => ({ state: success ? n : s, message, success, added: success ? added : [] });
  if (action.type === "start") { n.started = true; return done("Investigate the seal and find a way back to the ship."); }
  if (!s.started) return done("Begin the case first.", false);
  if (action.type === "room") {
    if (action.room !== "hall" && !s.timelineSolved) return done("Reconstruct the night at the workshop lock to open the palace passages.", false);
    n.room = action.room; return done(action.room === "harbor" && n.escaped ? "The gate is open. The crew can sail again." : rooms[action.room].subtitle);
  }
  if (action.type === "hint") { n.hints = Math.min(999, n.hints + 1); return done("A hint is available. Hints never reduce your stars."); }
  if (action.type === "inspect") {
    if (!rooms[s.room].hotspots.some(h => h.id === action.id)) return done("That object is in another room.", false);
    if (!n.inspected.includes(action.id)) n.inspected.push(action.id);
    const clue: Partial<Record<HotspotId, ClueId>> = { inscription: "inscription", ledger: "ledger", carving: "carving", watch: "watch", instructions: "gate" };
    if (clue[action.id]) add(clue[action.id]!);
    return done(clue[action.id] ? `Added to journal: ${clues[clue[action.id]!].title}.` : "Look closely. This object may help you leave.");
  }
  if (action.type === "take") {
    const spot = action.item === "cord" ? "pedestal" : "bench";
    const room = action.item === "cord" ? "hall" : "workshop";
    if (s.room !== room || !s.inspected.includes(spot)) return done("Inspect the object before collecting it.", false);
    if (s.items.includes(action.item) || (action.item === "fragments" && s.sealRestored)) return done("You have already collected this item.");
    n.items.push(action.item); if (action.item === "cord") add("cord");
    return done(`${items[action.item].name} added to your satchel.`);
  }
  if (action.type === "timeline") {
    if (s.room !== "hall" || !s.clues.includes("ledger")) return done("Read the bell record in the hall first.", false);
    if (action.order.join(",") !== "whole,broken,locked") return done("The order does not match the bell record. Place dusk first, midnight next, dawn last.", false);
    n.timelineSolved = true; return done("The bronze lock clicks open. The workshop and harbor passage are accessible.");
  }
  if (action.type === "restore") {
    if (s.room !== "workshop" || !s.items.includes("fragments") || !s.clues.includes("inscription") || !s.clues.includes("carving")) return done("Collect the fragments and inspect both the hall inscription and workshop carving.", false);
    if (action.order.join(",") !== "sun,wave,moon") return done("The seams resist. Compare the hall inscription with morning, tide, and night on the wall.", false);
    n.items = n.items.filter(i => i !== "fragments"); n.items.push("seal"); n.sealRestored = true;
    return done("The fragments fit. A warm line of light joins the seal. Take it to the harbor gate.");
  }
  if (action.type === "drawer") {
    if (s.room !== "workshop" || !s.inspected.includes("drawer") || action.item !== "cord" || !s.items.includes("cord")) return done("The pull loop is missing. A flexible item from the hall could replace it.", false);
    add("note"); n.motiveFound = true; return done("The red cord becomes a pull loop. Inside is Eurylochus’s unsent message.");
  }
  if (action.type === "gate") {
    if (s.room !== "harbor" || action.item !== "seal" || !s.sealRestored || !s.clues.includes("gate")) return done("You need the restored seal and the gate keeper’s instruction.", false);
    if (action.facing !== "wave" || action.motion !== "raise") return done("The gate remains closed. Which symbol faces the sea, and which way should the chain move?", false);
    n.escaped = true; return done("The chain rises. The gate opens onto the harbor. Your crew can sail again.");
  }
  if (action.type === "deduce") {
    if (action.evidence.length !== 2 || new Set(action.evidence).size !== 2 || action.evidence.some(id => !s.clues.includes(id))) return done("Select two different clues from your journal to support your theory.", false);
    if (action.suspect !== "eurylochus" || action.cause !== "moved" || !["cord", "watch"].every(id => action.evidence.includes(id as ClueId))) return done("This theory is not supported yet. Find one physical link to a person and an independent account of them carrying the seal.", false);
    n.deductionSolved = true; return done("The cord identifies Eurylochus; the watch log places him carrying the seal. Moving it caused the lock, rather than a curse.");
  }
  if (action.type === "statement") {
    if (actors[action.actor].room !== s.room) return done("Meet this character in their room.", false);
    const reply = repliesFor(action.actor, s).find(r => r.id === action.replyId);
    if (!reply) return done("That account is not available yet.", false);
    if (reply.clue) add(reply.clue);
    return done(reply.text);
  }
  return done("Try another action.", false);
}
export interface Reply { id: string; question: string; text: string; keywords: string[]; clue?: ClueId }
export function repliesFor(actor: ActorId, state: Pick<CaseState, "deductionSolved" | "motiveFound">): Reply[] {
  if (actor === "circe") return [
    { id: "circe-night", question: "When did you last see the seal?", text: "At dusk, whole and on its pedestal. I left for the garden. Whoever moved it did so afterward. Read the bell keeper’s record; you need not take my word for it.", keywords: ["when", "dusk", "night", "alibi", "where", "see"], clue: "circe" },
    { id: "circe-purpose", question: "Why did the harbor gate close?", text: "The seal protects these halls. Remove it and the harbor shuts, so no creature can escape. This is the mechanism at work. The inscription beside the pedestal explains it.", keywords: ["why", "gate", "curse", "magic", "protect", "lock", "purpose"] },
    { id: "circe-repair", question: "Can the seal be repaired?", text: "My workshop holds the fragments. Remember the inscription: sun, sea, moon. The carving there tells you where each belongs. The bell record will open the workshop lock.", keywords: ["repair", "fix", "fragment", "workshop", "open", "puzzle", "help"] },
  ];
  if (actor === "odysseus") return [
    { id: "odysseus-night", question: "What did you find at midnight?", text: "A broken seal, and the crew waiting for a way out. I arrived at midnight, after Circe left. I did not see who broke it. The watch keeper’s log might tell us more.", keywords: ["midnight", "night", "when", "where", "find", "who"], clue: "odysseus" },
    { id: "odysseus-cord", question: "Do you recognize this red cord?", text: "Eurylochus ties three knots in red wool around his wrist. I would recognize that habit anywhere. A cord alone is not enough; find another account before accusing him.", keywords: ["cord", "red", "knot", "recognize", "eurylochus", "evidence"], clue: "odysseus" },
    { id: "odysseus-exit", question: "How do we reach the ship?", text: "Restore the seal in the workshop. There is an instruction beside the gate: face the wave toward the sea and raise the chain. We can investigate further before we sail.", keywords: ["ship", "leave", "escape", "gate", "chain", "sea", "sail"] },
  ];
  return [
    { id: "eurylochus-night", question: "Where were you before midnight?", text: state.deductionSolved ? "I was in the hall. I moved the seal and dropped it. I should have told you before you found the cord and the watch log." : "Near the ship. I never touched the seal. Circe’s spells have trapped us before; perhaps you should question her.", keywords: ["when", "where", "night", "touch", "seal", "alibi"], clue: state.deductionSolved ? "confession" : "eurylochus" },
    { id: "eurylochus-fear", question: "Why are you afraid of Circe?", text: "She once changed our companions into swine. I stayed outside then. Even after she restored them, I could not believe we were safe here. I wanted a way for the men to leave.", keywords: ["fear", "afraid", "circe", "men", "crew", "motive", "why"] },
    ...(state.deductionSolved ? [{ id: "eurylochus-truth", question: "The evidence places you with the seal. Explain.", text: "I lifted it to open the crew’s side passage. It slipped and broke. I thought I was freeing the men; instead I locked the harbor. I lied because I feared the captain would call me a coward.", keywords: ["evidence", "cord", "log", "truth", "confess", "moved", "lie"], clue: "confession" as ClueId }] : []),
    ...(state.motiveFound ? [{ id: "eurylochus-note", question: "Is this your unsent message?", text: state.deductionSolved ? "Yes. That is why I acted. Fear for the crew does not excuse my silence. Let me help carry the seal back." : "It is mine. You know what I feared. But a message is only a plan; find out what happened before you judge me.", keywords: ["note", "message", "letter", "plan"] }] : []),
  ];
}
export function matchAuthored(actor: ActorId, state: CaseState, question: string): Reply | null {
  const words: string[] = question.toLowerCase().match(/[a-z]+/g) || [];
  const scored = repliesFor(actor, state).map(reply => ({ reply, score: reply.keywords.filter(w => words.includes(w)).length })).sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].reply : null;
}
export function objective(s: CaseState) {
  if (!s.timelineSolved) return "Reconstruct the night to open the workshop.";
  if (!s.sealRestored) return "Collect the fragments and restore the seal.";
  if (!s.escaped) return "Use the restored seal to open the harbor gate.";
  if (!s.deductionSolved) return "You escaped. Use the evidence to solve the mystery.";
  if (!s.motiveFound) return "The mystery is solved. Find the reason behind it.";
  return "Case complete. The crew is ready to sail.";
}
export function stars(s: CaseState) { return Number(s.escaped) + Number(s.deductionSolved) + Number(s.motiveFound); }
export function hintsFor(s: CaseState): string[] {
  if (s.escaped && s.deductionSolved && s.motiveFound) return ["You have earned all three stars.", "Revisit the witnesses to hear how their accounts change after your deduction.", "You can explore the palace again or begin a fresh case from the footer."];
  if (!s.timelineSolved) return ["The bell keeper recorded three moments in the hall.", "Match the event wheels to dusk, midnight, and dawn.", "Choose: seal whole → seal broken → gate locked."];
  if (!s.sealRestored) return ["Collect the fragments from the workshop bench. Compare two stone texts.", "The hall inscription names the symbols; the workshop carving names their places.", "Left to right: Sun → Wave → Moon. Read both inscriptions first."];
  if (!s.escaped) return ["A rolled instruction sits beside the harbor gate.", "Insert the restored seal. The sea is below the socket.", "Choose the restored seal, Wave facing the sea, and Raise chain."];
  if (!s.deductionSolved) return ["A witness statement can conflict with a physical observation.", "One clue identifies Eurylochus. A separate record places him carrying the seal.", "Theory: Eurylochus moved the seal. Evidence: three-knot red cord + harbor watch log."];
  return ["There is still a stuck drawer in the workshop.", "Its pull loop is missing. Look in your satchel for something flexible.", "Use the red cord on the drawer to find the unsent message."];
}
