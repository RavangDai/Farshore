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
    "id": "winds",
    "place": "Aeolia · Island of winds",
    "title": "A gift best left unopened.",
    "scene": "After a month of hospitality, Aeolus gives Odysseus a bag holding the contrary winds. For nine days the fleet sails toward Ithaca. Home is visible, but the exhausted captain needs sleep and the crew suspects hidden treasure.",
    "speech": "They think I keep a treasure from them. If I rest now, will they leave the knot alone? I cannot watch it forever.",
    "temptation": "Leave the bag unguarded and let the suspicious crew open it",
    "safe": "Keep the bag sealed and reassure the crew",
    "risk": "Let the crew open the bag",
    "good": "The crew trusts their captain and leaves the bag sealed. The west wind carries the fleet to Ithaca. Your counsel has opened an earlier homecoming; the later sea trials are avoided.",
    "bad": "The crew opens the bag while Odysseus sleeps. The released winds carry the fleet back to Aeolus, who refuses another gift. Exhausted, they row on toward the Laestrygonian coast.",
    "keywords": [
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
      "don't open"
    ],
    "dangers": [
      "open",
      "untie",
      "release"
    ],
    "cost": 2,
    "loss": 18
  },
  {
    "id": "lotus",
    "place": "The lotus shore",
    "title": "The sweetness of forgetting.",
    "scene": "Driven off course beyond Cape Malea, the fleet reaches the Lotus-eaters. Three scouts eat the lotus and lose their desire to return. The hosts are welcoming, but their food threatens the memory of home.",
    "speech": "They will not come back to the ships. Must I drag my own men away from this peaceful shore?",
    "temptation": "Let the scouts stay and allow the crew to taste the lotus",
    "safe": "Bring the scouts aboard and leave before anyone else eats the lotus",
    "risk": "Let the crew stay and taste the lotus",
    "good": "Odysseus brings the reluctant scouts aboard and secures them beneath the rowing benches. He orders the fleet away before anyone else can forget the voyage.",
    "bad": "More sailors taste the lotus. Odysseus eventually forces a departure, but recovering the scattered crew has cost precious time.",
    "keywords": [
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
      "don't eat"
    ],
    "dangers": [
      "taste",
      "eat",
      "rest",
      "try"
    ],
    "cost": 3,
    "loss": 20
  },
  {
    "id": "cyclops",
    "place": "Beyond the Cyclops’ cave",
    "title": "A name the sea will remember.",
    "scene": "Polyphemus has killed six of the men trapped in his cave. Odysseus called himself Nobody, blinded the Cyclops with a heated stake, and escaped beneath his sheep. Now, from the departing ship, pride urges him to claim the deed.",
    "speech": "Nobody has saved us. Yet shall this giant never know whose cunning defeated him?",
    "temptation": "Shout his name to the Cyclops",
    "safe": "Stay anonymous and row away quietly",
    "risk": "Reveal his name",
    "good": "His name remains with his crew. The giant’s stones fall behind the departing ship.",
    "bad": "Odysseus shouts his name. Polyphemus calls on his father Poseidon: let the king return late, alone, in another man’s ship, to trouble at home. The sea has gained a powerful enemy.",
    "keywords": [
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
      "keep"
    ],
    "dangers": [
      "shout",
      "reveal",
      "announce",
      "tell him"
    ],
    "cost": 4,
    "loss": 24
  },
  {
    "id": "circe",
    "place": "Circe’s island",
    "title": "A home that is not home.",
    "scene": "With only one ship left, Odysseus reaches Aeaea. Circe turns a scouting party into pigs. Hermes gives him the herb moly; he resists her magic and makes her restore his companions. Now her hospitality makes departure easy to postpone.",
    "speech": "My companions are men again, and her halls offer rest. But they ask me to remember Ithaca. Is it time to seek the road home?",
    "temptation": "Stay another season with Circe",
    "safe": "Ask Circe how to return home and prepare to leave",
    "risk": "Stay on the island",
    "good": "He asks for the way home. Circe tells him he must first consult the dead prophet Tiresias. He prepares the ship for the voyage to Oceanus.",
    "bad": "He accepts more comfort in Circe’s halls. When the crew finally presses him to leave, she sends him to seek Tiresias among the dead.",
    "keywords": [
      "ask",
      "circe",
      "leave",
      "sail",
      "home",
      "family",
      "penelope",
      "promise",
      "depart",
      "return",
      "prepare"
    ],
    "dangers": [
      "stay",
      "rest",
      "wait",
      "sleep"
    ],
    "cost": 3,
    "loss": 18
  },
  {
    "id": "sirens",
    "place": "The Sirens’ passage",
    "title": "A song meant only for him.",
    "scene": "Back on Aeaea, the crew has buried Elpenor and heard Circe’s instructions. Now the Sirens promise Odysseus knowledge of Troy and the world. Their meadow is surrounded by the remains of those who listened.",
    "speech": "They know what happened at Troy. I cannot pass such knowledge by. There must be a way to hear them.",
    "temptation": "Follow the song toward the rocks",
    "safe": "Bind him to the mast and stop the crew’s ears with wax",
    "risk": "Follow the Sirens",
    "good": "The crew seals its ears with wax and binds Odysseus to the mast. When he begs to be released, they tighten the ropes and row beyond the song.",
    "bad": "He draws too near before the crew secures him. They struggle back into open water with a damaged ship. Your version gives them an escape; Homer does not narrate this detour.",
    "keywords": [
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
      "don't listen"
    ],
    "dangers": [
      "follow",
      "closer",
      "shore",
      "swim"
    ],
    "cost": 2,
    "loss": 24
  },
  {
    "id": "cattle",
    "place": "Thrinacia · The sun’s island",
    "title": "Hunger has a persuasive voice.",
    "scene": "After Scylla, the weary crew insists on landing on Thrinacia. They swear to spare Helios’s cattle. Contrary winds trap them until their provisions run out; fishing and hunting cannot satisfy their hunger. Eurylochus urges them to break the oath.",
    "speech": "Eurylochus says one animal would save them. If I leave to pray, who will hold the crew to its promise?",
    "temptation": "Slaughter one of the sacred cattle",
    "safe": "Keep the oath, ration other food, and leave the cattle unharmed",
    "risk": "Leave the hungry crew unwatched to pray inland",
    "good": "Odysseus holds the crew to its oath until the wind changes. The cattle live and the remaining companions sail toward Ithaca. Your choice avoids the wreck and Calypso’s captivity.",
    "bad": "While Odysseus is away praying and falls asleep, Eurylochus leads the slaughter. Helios demands punishment. After they sail, Zeus destroys the ship with a thunderbolt. Every remaining companion dies; Odysseus alone survives on the wreckage.",
    "keywords": [
      "oath",
      "ration",
      "fish",
      "forage",
      "sacred",
      "leave",
      "spare",
      "promise",
      "protect",
      "other",
      "avoid",
      "unharmed",
      "do not kill",
      "don't kill"
    ],
    "dangers": [
      "kill",
      "slaughter",
      "eat",
      "sacrifice",
      "unwatched",
      "pray inland"
    ],
    "cost": 4,
    "loss": 28
  },
  {
    "id": "underworld",
    "place": "The house of the dead",
    "title": "Some truths have a price.",
    "scene": "Following Circe’s directions, Odysseus sails to the edge of Oceanus and summons the dead. Elpenor asks for burial. Tiresias approaches, and Odysseus also sees Anticleia, the mother he did not know had died.",
    "speech": "My mother is among these shades. I came for a road home, and find grief waiting here too. What must I hear before I leave?",
    "temptation": "Leave before Tiresias has spoken",
    "safe": "Listen to Tiresias and remember his warning",
    "risk": "Flee without listening",
    "good": "He listens. Tiresias warns him to spare Helios’s cattle and foretells trouble at home. Odysseus speaks with his mother, then returns to Aeaea to bury Elpenor and hear Circe’s sailing instructions.",
    "bad": "Fear cuts short his time with the dead. He returns to Aeaea, where Elpenor is buried and Circe repeats the warning about Helios’s cattle before describing the perils ahead.",
    "keywords": [
      "listen",
      "wait",
      "hear",
      "prophet",
      "warning",
      "remember",
      "learn",
      "respect"
    ],
    "dangers": [
      "flee",
      "ignore",
      "run",
      "leave"
    ],
    "cost": 3,
    "loss": 14
  },
  {
    "id": "scylla",
    "place": "Scylla and Charybdis",
    "title": "There is no easy passage.",
    "scene": "Circe has warned of Scylla’s six heads and Charybdis’s deadly whirlpool. Passing close to Scylla will cost lives, but the whirlpool threatens the whole ship. The captain reaches for weapons against an immortal enemy.",
    "speech": "Six heads, and not one that fears me? Shall I stand here and let her take my men?",
    "temptation": "Stop to fight Scylla",
    "safe": "Keep rowing quickly past Scylla, as Circe advised",
    "risk": "Stop to fight the immortal monster",
    "good": "They row without stopping. Scylla takes six companions, but the ship escapes Charybdis. The captain must carry their deaths with him; this passage has no bloodless victory.",
    "bad": "Odysseus delays the passage trying to fight Scylla. The ship finally escapes, with more lives lost. Weapons cannot defeat the immortal monster.",
    "keywords": [
      "row",
      "quick",
      "swift",
      "pass",
      "circe",
      "escape",
      "keep moving",
      "sail"
    ],
    "dangers": [
      "fight",
      "stop",
      "attack",
      "spear"
    ],
    "cost": 4,
    "loss": 18
  },
  {
    "id": "calypso",
    "place": "Ogygia · Calypso’s island",
    "title": "Forever is not home.",
    "scene": "Alone after the destruction of his last ship, Odysseus survives another encounter with Charybdis and drifts to Ogygia. Calypso holds him there against his wish to go home. At Athena’s urging, Zeus sends Hermes to order his release.",
    "speech": "She promises life without age. Yet I sit on the shore longing for Penelope. Now that the gods permit it, I would face the sea again.",
    "temptation": "Delay his departure for the comforts Calypso offers",
    "safe": "Build the raft and choose the journey home",
    "risk": "Delay building the raft and stay longer",
    "good": "He builds and provisions a raft with Calypso’s help. On the crossing, Poseidon wrecks it. The sea goddess Ino lends him her protective veil, and Athena helps him reach Scheria alive.",
    "bad": "He postpones the raft and loses more time on Ogygia. At last he chooses his mortal home. Poseidon wrecks the raft, but Ino’s veil and Athena’s help bring him to Scheria.",
    "keywords": [
      "raft",
      "build",
      "leave",
      "home",
      "penelope",
      "mortal",
      "sail",
      "depart"
    ],
    "dangers": [
      "stay",
      "wait",
      "delay",
      "immortality",
      "eternity",
      "accept"
    ],
    "cost": 5,
    "loss": 24
  },
  {
    "id": "nausicaa",
    "place": "Scheria · The Phaeacian shore",
    "title": "A stranger on the shore.",
    "scene": "After Poseidon’s storm, Odysseus washes ashore. Nausicaa and her attendants find him. Athena has given the princess courage, but the stranger is still a frightening sight.",
    "speech": "I have nothing left to offer. Should I seize her knees and beg, or speak to her from here?",
    "temptation": "Rush toward the princess",
    "safe": "Keep a respectful distance and ask Nausicaa for help",
    "risk": "Approach suddenly and frighten her",
    "good": "He speaks from a respectful distance. Nausicaa gives him food and clothing, then directs him toward her parents, Queen Arete and King Alcinous, who can send him home.",
    "bad": "His sudden approach alarms the attendants. Once he regains their confidence, Nausicaa helps him find the palace of Arete and Alcinous, but the delay costs time.",
    "keywords": [
      "distance",
      "respect",
      "ask",
      "speak",
      "gentle",
      "help",
      "courtesy",
      "calm"
    ],
    "dangers": [
      "rush",
      "grab",
      "seize",
      "charge"
    ],
    "cost": 2,
    "loss": 14
  },
  {
    "id": "ithaca",
    "place": "Ithaca · The hidden king",
    "title": "Home has one last trial.",
    "scene": "Odysseus is back on Ithaca, but suitors have consumed his household and threatened Telemachus. Athena gives him a beggar’s disguise. Eumaeus shelters him and father and son reunite. At the hall, his old dog Argos recognizes him and dies. The suitors insult the stranger.",
    "speech": "My son stands beside me, but my hall is full of enemies. Shall I throw off these rags, or wait until the bow is in my hands?",
    "temptation": "Reveal himself before his plan is ready",
    "safe": "Keep the disguise and prepare with Telemachus for the bow contest",
    "risk": "Reveal himself too early",
    "good": "He waits. Penelope sets the contest of the bow and twelve axes. Odysseus strings his bow, makes the shot, and reveals himself. With Telemachus, Eumaeus, Philoetius, and Athena’s aid, he kills the suitors. Penelope still needs proof of who he is.",
    "bad": "He reveals himself before the household is ready. In this altered telling, he retreats and regroups with his allies, then reclaims the hall at greater cost. Penelope still needs proof of his identity.",
    "keywords": [
      "wait",
      "plan",
      "disguise",
      "telemachus",
      "patience",
      "quiet",
      "hide",
      "prepare",
      "bow",
      "contest"
    ],
    "dangers": [
      "reveal",
      "shout",
      "announce",
      "now"
    ],
    "cost": 2,
    "loss": 16
  },
  {
    "id": "cicones",
    "place": "Ismarus · The Cicones",
    "title": "The war has ended. The raiding has not.",
    "scene": "Troy has fallen. Odysseus’s twelve ships reach Ismarus, where his men raid the Cicones, kill defenders, and seize captives and supplies. He orders a departure, but the men linger to feast while the Cicones call for help.",
    "speech": "I have ordered them aboard, yet they will not leave the wine and plunder. Reinforcements may already be coming. How do I bring them away?",
    "temptation": "Let the crew continue feasting after the raid",
    "safe": "Gather the crew and depart before reinforcements arrive",
    "risk": "Stay on the shore to feast",
    "good": "The fleet departs before the counterattack. A storm drives it south; beyond Cape Malea, contrary winds carry it into unfamiliar waters.",
    "bad": "Ciconian reinforcements attack. Six men from each ship are killed before the fleet escapes. A storm then drives the survivors beyond Cape Malea and away from their course.",
    "keywords": [
      "gather",
      "depart",
      "leave",
      "aboard",
      "reinforcements",
      "escape",
      "sail",
      "home"
    ],
    "dangers": [
      "stay",
      "feast",
      "drink",
      "plunder",
      "wait"
    ],
    "cost": 2,
    "loss": 8
  },
  {
    "id": "laestrygonians",
    "place": "Telepylus · The Laestrygonians",
    "title": "A harbour with no way out.",
    "scene": "After Aeolus refuses more help, the exhausted fleet rows for six days. Eleven ships enter a narrow harbour below steep cliffs. Odysseus moors his own ship outside. Scouts discover that the Laestrygonians are giants who attack and eat strangers.",
    "speech": "Boulders are falling into the harbour. My other ships are trapped. If I row in after them, will I lose the last ship too?",
    "temptation": "Take the last ship into the harbour under attack",
    "safe": "Cut the mooring rope and escape from outside the harbour",
    "risk": "Enter the harbour to attempt a rescue",
    "good": "He cuts the rope and orders the oarsmen away. The eleven trapped ships and their crews are destroyed. His ship alone escapes to Aeaea.",
    "bad": "The rescue attempt cannot reach the trapped crews. Odysseus’s ship barely escapes after suffering damage and further losses. The eleven other ships are gone.",
    "keywords": [
      "cut",
      "rope",
      "escape",
      "outside",
      "row away",
      "leave",
      "last ship",
      "protect"
    ],
    "dangers": [
      "enter",
      "rescue",
      "inside",
      "fight"
    ],
    "cost": 2,
    "loss": 10
  },
  {
    "id": "phaeacians",
    "place": "Scheria · The Phaeacian court",
    "title": "To find a passage, tell the truth.",
    "scene": "Arete and Alcinous welcome the stranger. At a feast, the bard Demodocus sings of Troy and the wooden horse, and Odysseus weeps. His host asks his name and the story of his wandering so the Phaeacians can take him home.",
    "speech": "I have hidden my name, but these people have shown me kindness. Can I trust them with the sorrows of my voyage?",
    "temptation": "Keep his identity and destination hidden",
    "safe": "Trust his hosts, name Ithaca, and tell his story",
    "risk": "Withhold his identity and refuse to tell the story",
    "good": "He names himself and recounts his travels. The Phaeacians give him gifts and carry him asleep to Ithaca. Poseidon punishes their returning ship, turning it to stone.",
    "bad": "His silence delays the preparations. He eventually names himself and Ithaca. The Phaeacians carry him home as he sleeps; Poseidon turns their returning ship to stone.",
    "keywords": [
      "trust",
      "tell",
      "story",
      "name",
      "ithaca",
      "honest",
      "hosts",
      "thank",
      "home"
    ],
    "dangers": [
      "withhold",
      "refuse",
      "hide",
      "lie",
      "secret"
    ],
    "cost": 2,
    "loss": 8
  },
  {
    "id": "reunion",
    "place": "Ithaca · The rooted bed",
    "title": "Home is more than a name.",
    "scene": "The suitors are dead. Penelope has survived years of pressure, delaying remarriage by weaving and secretly unweaving a shroud. She will not trust a stranger’s claim. She orders their marriage bed moved outside the chamber, testing the man before her.",
    "speech": "Who could move that bed? I built it around a living olive tree. Has someone cut through its root while I was gone?",
    "temptation": "Demand recognition and dismiss Penelope’s caution",
    "safe": "Respect her caution and explain the secret of the olive-tree bed",
    "risk": "Demand that Penelope accept him without proof",
    "good": "The secret convinces Penelope. They embrace and tell one another what they endured. Odysseus later reunites with Laertes. When the suitors’ families seek revenge, Athena, with Zeus’s authority, ends the fighting and establishes peace.",
    "bad": "His demand cannot restore trust. He must listen and share the private truth of the rooted bed before Penelope recognizes him. After the reunion with Laertes, Athena ends the retaliatory fighting and establishes peace.",
    "keywords": [
      "respect",
      "caution",
      "explain",
      "secret",
      "olive",
      "bed",
      "proof",
      "listen",
      "patience"
    ],
    "dangers": [
      "demand",
      "command",
      "force",
      "dismiss"
    ],
    "cost": 1,
    "loss": 6
  }
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
  version: 3;
  route: string[];
  index: number;
  months: number;
  trust: number;
  log: Entry[];
  finished: boolean;
};
export const route = [
  "cicones",
  "lotus",
  "cyclops",
  "winds",
  "laestrygonians",
  "circe",
  "underworld",
  "sirens",
  "scylla",
  "cattle",
  "calypso",
  "nausicaa",
  "phaeacians",
  "ithaca",
  "reunion",
];
const legacyRoute = ["lotus", "cyclops", "winds", "circe", "underworld", "sirens", "scylla", "cattle", "calypso", "nausicaa", "ithaca"];
export function newGame(): Game {
  return {
    version: 3,
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
    g.version === 3 &&
    Array.isArray(g.route) &&
    g.route.length > 0 &&
    ["cicones", "lotus"].includes(g.route[0]) &&
    ["ithaca", "reunion"].includes(g.route[g.route.length - 1]) &&
    g.route.every((id, i) => route.includes(id) && (i === 0 || route.indexOf(id) > route.indexOf(g.route[i - 1]))) &&
    Number.isInteger(g.index) &&
    g.index >= 0 &&
    g.index < g.route.length &&
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
    (!g.finished || (g.log.length === g.index + 1 && (g.months >= 240 || g.index === g.route.length - 1))) &&
    g.log.every(
      (x, i) =>
        x &&
        x.encounterId === g.route[i] &&
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

/** Keep saved choices and scores; insert new chapters only ahead of an ongoing voyage. */
export function restoreSave(value: unknown): Game | null {
  if (validSave(value)) return value;
  if (!value || typeof value !== "object") return null;
  const old = value as Game & { version: number };
  if (Number(old.version) !== 2 || !Array.isArray(old.route) || old.route.join(",") !== legacyRoute.join(",")) return null;
  const upgraded = { ...old, version: 3 as const };
  if (upgraded.finished && Array.isArray(upgraded.log) && upgraded.log.length > 0) upgraded.index = upgraded.log.length - 1;
  if (!validSave(upgraded)) return null;
  if (!upgraded.finished) {
    const currentId = upgraded.route[upgraded.index];
    upgraded.route = [...upgraded.route.slice(0, upgraded.index), ...route.slice(route.indexOf(currentId))];
    const decision = upgraded.log[upgraded.index];
    if (decision) upgraded.route = routeAfterChoice(upgraded.route, upgraded.index, decision.safeChoice);
  }
  return upgraded;
}

export function routeAfterChoice(currentRoute: string[], index: number, safeChoice: boolean): string[] {
  const id = currentRoute[index];
  if (safeChoice && (id === "winds" || id === "cattle"))
    return [...currentRoute.slice(0, index + 1), "ithaca", "reunion"];
  return currentRoute;
}

export function branchExplanation(id: string, safeChoice: boolean) {
  if (!safeChoice) return null;
  if (id === "winds") return "A different way home: the sealed bag brings the fleet to Ithaca. The later sea trials have been removed from your route.";
  if (id === "cattle") return "A different way home: the cattle are spared and your companions survive. Your ship sails to Ithaca, avoiding the wreck, Ogygia, and Scheria.";
  return null;
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
    reply: safeChoice
      ? `Your counsel gives me reason to act. I will ${e.safe.charAt(0).toLowerCase() + e.safe.slice(1)}.`
      : `${followed ? "I accept your counsel." : "I have heard you, but I will follow my own judgement."} I will ${e.risk.charAt(0).toLowerCase() + e.risk.slice(1)}.`,
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
  if (game.log.length > game.index || game.finished || game.route[game.index] !== e.id)
    throw new Error("This encounter already has a decision.");
  return {
    ...game,
    route: routeAfterChoice(game.route, game.index, d.safeChoice),
    months: game.months + d.months,
    trust: Math.max(0, Math.min(100, game.trust + d.trustDelta)),
    log: [...game.log, { ...d, encounterId: e.id, advice, at: game.months }],
  };
}
export function advance(game: Game): Game {
  if (game.finished || game.log.length <= game.index) return game;
  const finished = game.months >= 240 || game.index === game.route.length - 1;
  return {
    ...game,
    index: finished ? game.index : game.index + 1,
    finished,
  };
}
