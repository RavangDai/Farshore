export type Encounter = {
  id: string;
  place: string;
  title: string;
  scene: string;
  speech: string;
  temptation: string;
  safe: string;
  risk: string;
  good: string;
  bad: string;
  keywords: string[];
  dangers: string[];
  cost: number;
  loss: number;
};
export const encounters: Encounter[] = [
  {
    id: "winds",
    place: "Aeolia · Island of winds",
    title: "A gift best left unopened.",
    scene:
      "Aeolus has bound the contrary winds inside a leather bag. Ithaca is close, but the crew whispers that their captain is hiding gold. Odysseus is exhausted. The crew watches the knot while he fights sleep.",
    speech:
      "They think I keep a treasure from them. If I rest now, will they leave the knot alone? I cannot watch it forever.",
    temptation: "Leave the bag unguarded and let the suspicious crew open it",
    safe: "Keep the bag sealed and reassure the crew",
    risk: "Open the bag",
    good: "The knot stays tied. With the crew reassured, a gentle wind carries the ship toward home.",
    bad: "The released winds tear through the sails. When the storm ends, Ithaca is far beyond the horizon.",
    keywords: [
      "seal",
      "closed",
      "shut",
      "tied",
      "leave",
      "guard",
      "trust",
      "home",
      "risk",
      "promise",
      "protect",
      "keep",
      "do not open",
      "don’t open",
      "don't open",
    ],
    dangers: ["open", "untie", "release"],
    cost: 2,
    loss: 18,
  },
  {
    id: "lotus",
    place: "The lotus shore",
    title: "The sweetness of forgetting.",
    scene:
      "A quiet island offers food and shelter. Three sailors taste a strange flower and forget why they ever wanted to leave. The hosts offer Odysseus a taste.",
    speech:
      "Look how peaceful they are. One mouthful, then we sail. Surely we have earned a little rest?",
    temptation: "Taste the lotus and rest",
    safe: "Refuse the lotus and bring the crew aboard",
    risk: "Taste the lotus",
    good: "He carries the dreaming sailors back to their benches. The island grows smaller, and their memories return.",
    bad: "One mouthful becomes a season of dreaming. The crew eventually drags him from the shore.",
    keywords: [
      "refuse",
      "leave",
      "aboard",
      "return",
      "memory",
      "forget",
      "home",
      "family",
      "sail",
      "avoid",
      "poison",
      "do not eat",
      "don't eat",
    ],
    dangers: ["taste", "eat", "rest", "try"],
    cost: 3,
    loss: 20,
  },
  {
    id: "cyclops",
    place: "Beyond the Cyclops’ cave",
    title: "A name the sea will remember.",
    scene:
      "The ship has escaped the Cyclops. From the shore, the giant roars for the name of the man who blinded him. Odysseus rises at the stern.",
    speech:
      "Shall he tell the world that Nobody defeated him? Let him learn the name of Odysseus, king of Ithaca.",
    temptation: "Shout his name to the Cyclops",
    safe: "Stay anonymous and row away quietly",
    risk: "Reveal his name",
    good: "His name remains with his crew. The giant’s stones fall behind the departing ship.",
    bad: "The giant hears his name and calls on Poseidon. A season of hostile seas follows.",
    keywords: [
      "quiet",
      "silent",
      "nobody",
      "anonymous",
      "row",
      "away",
      "home",
      "family",
      "pride",
      "secret",
      "do not tell",
      "don't tell",
      "keep",
    ],
    dangers: ["shout", "reveal", "announce", "tell him"],
    cost: 4,
    loss: 24,
  },
  {
    id: "circe",
    place: "Circe’s island",
    title: "A home that is not home.",
    scene:
      "Circe has lifted her spell from the crew. Her halls are warm, her table generous. Outside, a fair wind waits. She asks the captain to stay another season.",
    speech:
      "They have suffered enough. Let them sleep in real beds a little longer. Ithaca will still be there.",
    temptation: "Stay another season with Circe",
    safe: "Thank Circe and sail while the wind is fair",
    risk: "Stay on the island",
    good: "He thanks his host and gathers the crew. Comfort gives way to purpose as the sails fill.",
    bad: "Days become months in Circe’s halls. The fair wind has gone by the time the captain remembers his promise.",
    keywords: [
      "leave",
      "sail",
      "home",
      "family",
      "penelope",
      "wind",
      "promise",
      "depart",
      "thank",
      "return",
      "now",
    ],
    dangers: ["stay", "rest", "wait", "sleep"],
    cost: 3,
    loss: 18,
  },
  {
    id: "sirens",
    place: "The Sirens’ passage",
    title: "A song meant only for him.",
    scene:
      "A voice carries over the water, promising knowledge of every hero and every war. The crew prepares wax for their ears. Odysseus wants to listen.",
    speech:
      "They know what happened at Troy. I cannot pass such knowledge by. There must be a way to hear them.",
    temptation: "Follow the song toward the rocks",
    safe: "Bind him to the mast and stop the crew’s ears with wax",
    risk: "Follow the Sirens",
    good: "Bound to the mast, he hears the song while the crew rows safely past the rocks.",
    bad: "The song draws the bow toward the rocks. The survivors spend months repairing the shattered ship.",
    keywords: [
      "mast",
      "tie",
      "bind",
      "rope",
      "wax",
      "ears",
      "ignore",
      "safe",
      "row",
      "sail past",
      "avoid",
      "do not listen",
      "don't listen",
    ],
    dangers: ["follow", "closer", "shore", "swim"],
    cost: 2,
    loss: 24,
  },
  {
    id: "cattle",
    place: "Thrinacia · The sun’s island",
    title: "Hunger has a persuasive voice.",
    scene:
      "The stores are nearly empty. The cattle of Helios graze nearby. Eurylochus argues that starving is worse than risking the gods’ anger. Odysseus must decide how to keep the crew from breaking its oath.",
    speech:
      "Eurylochus says one animal would save them. If I leave to pray, who will hold the crew to its promise?",
    temptation: "Slaughter one of the sacred cattle",
    safe: "Protect the cattle and find fish or other food",
    risk: "Kill the sacred cattle",
    good: "The crew fishes from the rocks. A modest meal buys enough time for the winds to change.",
    bad: "Smoke from the feast reaches the sun god. A violent storm drives the ship into a long and bitter detour.",
    keywords: [
      "fish",
      "forage",
      "sacred",
      "leave",
      "spare",
      "promise",
      "protect",
      "other",
      "avoid",
      "do not kill",
      "don't kill",
    ],
    dangers: ["kill", "slaughter", "eat", "sacrifice"],
    cost: 4,
    loss: 28,
  },
  {
    id: "underworld",
    place: "The house of the dead",
    title: "Some truths have a price.",
    scene:
      "Circe has sent Odysseus to consult Tiresias. The blind prophet steps out of the shadows with a warning about the journey ahead. Fear urges the captain back toward daylight.",
    speech:
      "The dead crowd this shore. Must I listen to every dark prophecy before I can go home?",
    temptation: "Leave before Tiresias has spoken",
    safe: "Listen to Tiresias and remember his warning",
    risk: "Flee without listening",
    good: "Tiresias warns him about the cattle of Helios and the trials still to come. The captain carries that knowledge back to the living.",
    bad: "He hurries away before the warning is complete. Doubt and uncertainty slow the next crossing.",
    keywords: [
      "listen",
      "wait",
      "hear",
      "prophet",
      "warning",
      "remember",
      "learn",
      "respect",
    ],
    dangers: ["flee", "ignore", "run", "leave"],
    cost: 3,
    loss: 14,
  },
  {
    id: "scylla",
    place: "Scylla and Charybdis",
    title: "There is no easy passage.",
    scene:
      "Scylla waits above the narrow channel; Charybdis churns below. Circe warned that lingering to fight the monster would make the loss worse. Odysseus reaches for his spear.",
    speech:
      "Six heads, and not one that fears me? Shall I stand here and let her take my men?",
    temptation: "Stop to fight Scylla",
    safe: "Keep rowing quickly past Scylla, as Circe advised",
    risk: "Stop to fight the immortal monster",
    good: "The ship passes swiftly. Even the wiser course carries a terrible loss; the survivors escape before Scylla can strike again.",
    bad: "He pauses to fight an enemy he cannot defeat. More men are lost before the battered ship escapes.",
    keywords: [
      "row",
      "quick",
      "swift",
      "pass",
      "circe",
      "escape",
      "keep moving",
      "sail",
    ],
    dangers: ["fight", "stop", "attack", "spear"],
    cost: 4,
    loss: 18,
  },
  {
    id: "calypso",
    place: "Ogygia · Calypso’s island",
    title: "Forever is not home.",
    scene:
      "Separated from his companions, Odysseus has reached Calypso’s island. Hermes brings the gods’ order to release him. Calypso offers immortality if he will stay.",
    speech:
      "She offers an end to age and sorrow. Yet each evening I look out toward the sea. What is eternity without Ithaca?",
    temptation: "Remain with Calypso",
    safe: "Build the raft and choose the journey home",
    risk: "Stay and accept immortality",
    good: "He chooses his mortal home. Calypso helps provision the raft, and he sails toward an uncertain horizon.",
    bad: "He delays again beside Calypso. The sea waits while another season slips away.",
    keywords: [
      "raft",
      "build",
      "leave",
      "home",
      "penelope",
      "mortal",
      "sail",
      "depart",
    ],
    dangers: ["stay", "immortality", "eternity", "accept"],
    cost: 5,
    loss: 24,
  },
  {
    id: "nausicaa",
    place: "Scheria · The Phaeacian shore",
    title: "A stranger on the shore.",
    scene:
      "After Poseidon’s storm, Odysseus washes ashore. Nausicaa and her attendants find him. Athena has given the princess courage, but the stranger is still a frightening sight.",
    speech:
      "I have nothing left to offer. Should I seize her knees and beg, or speak to her from here?",
    temptation: "Rush toward the princess",
    safe: "Keep a respectful distance and ask Nausicaa for help",
    risk: "Approach suddenly and frighten her",
    good: "His careful words win her help. She gives him directions to the palace, where the Phaeacians can arrange his passage.",
    bad: "His sudden movement alarms the attendants. He must work patiently to regain their confidence and find help.",
    keywords: [
      "distance",
      "respect",
      "ask",
      "speak",
      "gentle",
      "help",
      "courtesy",
      "calm",
    ],
    dangers: ["rush", "grab", "seize", "charge"],
    cost: 2,
    loss: 14,
  },
  {
    id: "ithaca",
    place: "Ithaca · The hidden king",
    title: "Home has one last trial.",
    scene:
      "Athena conceals him in a beggar’s disguise. Eumaeus shelters him; Telemachus becomes his ally. Argos recognizes his master at the palace gate. Inside, Antinous insults the stranger while Penelope waits.",
    speech:
      "My own hall is full of men who mock me. I could reveal myself now. Why must I hide in my own home?",
    temptation: "Reveal himself before his plan is ready",
    safe: "Keep the disguise and plan with Telemachus",
    risk: "Reveal himself too early",
    good: "He holds his temper and prepares with his son. The suitors are overcome; Penelope tests and recognizes him. At last he can visit his father, Laertes.",
    bad: "His anger exposes him too soon. Regaining his household takes longer before Penelope can be sure that her husband has returned.",
    keywords: [
      "wait",
      "plan",
      "disguise",
      "telemachus",
      "patience",
      "quiet",
      "hide",
      "prepare",
    ],
    dangers: ["reveal", "shout", "announce", "now"],
    cost: 2,
    loss: 16,
  },
];
export type Decision = {
  followed: boolean;
  safeChoice: boolean;
  tone: string;
  reply: string;
  reason: string;
  months: number;
  trustDelta: number;
  outcome: string;
  source: "story" | "ai";
};
export type Entry = Decision & {
  encounterId: string;
  advice: string;
  at: number;
};
export type Game = {
  version: 2;
  route: string[];
  index: number;
  months: number;
  trust: number;
  log: Entry[];
  finished: boolean;
};
export const route = [
  "lotus",
  "cyclops",
  "winds",
  "circe",
  "underworld",
  "sirens",
  "scylla",
  "cattle",
  "calypso",
  "nausicaa",
  "ithaca",
];
export function newGame(): Game {
  return {
    version: 2,
    route: [...route],
    index: 0,
    months: 120,
    trust: 50,
    log: [],
    finished: false,
  };
}
export const firstGame: Game = newGame();
export function validSave(value: unknown): value is Game {
  if (!value || typeof value !== "object") return false;
  const g = value as Game;
  return (
    g.version === 2 &&
    Array.isArray(g.route) &&
    g.route.join(",") === route.join(",") &&
    Number.isInteger(g.index) &&
    g.index >= 0 &&
    g.index < route.length &&
    Number.isFinite(g.months) &&
    g.months >= 120 &&
    g.months < 600 &&
    Number.isInteger(g.trust) &&
    g.trust >= 0 &&
    g.trust <= 100 &&
    typeof g.finished === "boolean" &&
    Array.isArray(g.log) &&
    g.log.length >= g.index &&
    g.log.length <= g.index + 1 &&
    g.log.every(
      (x, i) =>
        x &&
        x.encounterId === route[i] &&
        typeof x.advice === "string" &&
        typeof x.reply === "string" &&
        typeof x.reason === "string" &&
        typeof x.outcome === "string" &&
        Number.isFinite(x.months) &&
        Number.isFinite(x.trustDelta) &&
        typeof x.followed === "boolean" &&
        typeof x.safeChoice === "boolean",
    )
  );
}
export function formatTime(months: number) {
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}
export function storyDecision(
  e: Encounter,
  advice: string,
  trust: number,
): Decision {
  const text = advice.toLowerCase().replace(/[’]/g, "'");
  const respectful =
    /\b(please|friend|home|family|penelope|crew|understand|trust|together|could|perhaps|consider|because|risk|promise)\b/.test(
      text,
    );
  const harsh =
    /\b(stupid|idiot|obey|fool|shut up|must|order you)\b/.test(text) ||
    (/^(do not|don't|stop|never)\b/.test(text) && !respectful);
  const mentions = (w: string) => new RegExp("\\b" + w + "\\b").test(text);
  const safeHits = e.keywords.filter(
    (w) =>
      mentions(w) &&
      !["home", "family", "trust", "risk", "promise", "crew"].includes(w),
  ).length;
  const goalHint = /\b(home|family|promise)\b/.test(text);
  const riskHits = e.dangers.filter((w) => {
    const at = text.indexOf(w);
    return (
      at >= 0 &&
      !/(don't|do not|never|avoid|not|no need to)\s+\w*\s*$/.test(
        text.slice(Math.max(0, at - 20), at),
      )
    );
  }).length;
  const relevant = safeHits + riskHits > 0 || goalHint;
  const advisesSafe =
    safeHits > riskHits || (riskHits === 0 && (safeHits > 0 || goalHint));
  const followed = relevant && !harsh && (respectful || trust >= 65);
  const safeChoice = followed ? advisesSafe : false;
  const tone = harsh
    ? "Commanding"
    : respectful
      ? "Supportive"
      : relevant
        ? "Direct"
        : "Unclear";
  const reason = !relevant
    ? "He could not connect your advice to the danger in front of him, so he followed his own impulse."
    : harsh
      ? "The wording challenged his authority. His pride outweighed the warning."
      : followed
        ? advisesSafe
          ? "Your advice gave him a reason to protect the journey. He chose to trust you."
          : "He accepted your suggestion, but the plan exposed the crew to danger."
        : "He heard the warning, but it did not give him a strong enough reason to resist his own curiosity.";
  return {
    followed,
    safeChoice,
    tone,
    reason,
    reply: !relevant
      ? "Speak plainly, my friend. What would you have me do here? I must make my own choice."
      : harsh
        ? "I have crossed a sea of troubles. I will not be commanded on my own ship."
        : safeChoice
          ? "You remind me of what matters. My pride can wait. We still have a home to reach."
          : followed
            ? "Then we agree. I will take that chance, and may the gods be kind."
            : "You ask caution of a man who has outwitted kings. I must see this through for myself.",
    months: safeChoice ? e.cost : e.loss,
    trustDelta: safeChoice ? 12 : followed ? -12 : -5,
    outcome: safeChoice ? e.good : e.bad,
    source: "story",
  };
}
export function applyDecision(
  game: Game,
  e: Encounter,
  advice: string,
  d: Decision,
): Game {
  if (game.log.length > game.index || game.finished)
    throw new Error("This encounter already has a decision.");
  return {
    ...game,
    months: game.months + d.months,
    trust: Math.max(0, Math.min(100, game.trust + d.trustDelta)),
    log: [...game.log, { ...d, encounterId: e.id, advice, at: game.months }],
  };
}
export function advance(game: Game): Game {
  if (game.log.length <= game.index) return game;
  return {
    ...game,
    index: Math.min(game.index + 1, game.route.length - 1),
    finished: game.months >= 240 || game.index === game.route.length - 1,
  };
}
