# FARSHORE — explainable AI architecture

This document explains how FARSHORE's opponents think, how that thinking is recorded, and how the player sees it. It covers what exists today and names what does not yet exist, so the status here is honest rather than aspirational.

## Status at a glance

| Encounter | Controller | Wired into engine | AI Lab coverage |
|---|---|---|---|
| Cyclops' Cave | `src/lib/ai/cyclops.ts` | **Yes** — `src/lib/encounters/cave-runner.ts` | Full — compact insights, expanded lab, world overlays |
| Sirens' Passage | `src/lib/ai/sirens.ts` | Not yet — the encounter still runs `src/lib/mythic.ts`'s original song logic | Controller written and reviewed; integration pending |
| Lotus-Eaters, Aeolus, Calypso, Circe, Scylla, Ithaca | — | Not yet — these still run their original engines (`odyssey-games.ts` / `mythic.ts`) with the pre-existing `inspectAI()`-style debug readout | Not yet |

The explainable AI *framework* (Part 6 of the design brief — perception, memory, evaluation, decision, telegraph, learn, plus the runtime, player model, and three-mode inspector UI) is complete and genre-agnostic. The Cyclops encounter is the full reference implementation, proven by 60+ targeted tests including a fairness invariant checked against thousands of simulated situations. Extending the same framework to the other seven encounters is a per-encounter integration job — write the controller (largely done, see table), then rewire that encounter's tick loop to call it and feed its state through `src/lib/ai/feeds.ts` to the shared inspector.

## 1. The six-stage decision pipeline

Every opponent decision — when fully wired — passes through six stages, implemented as one function call per encounter (`decideCave`, `decideSirens`, …) that runs them in order and returns a plain action object:

1. **Perceive** — build a `<Encounter>Perception` snapshot from real engine state only (player position, velocity, nearby hazards, lives, elapsed time). Nothing here is invented; every field traces to a value the engine already holds.
2. **Remember** — read the `PlayerModel` (below) for this encounter's choice space: dwell time per option, a transition matrix, measured reaction time, per-option success/failure counts.
3. **Evaluate** — score every action genuinely under consideration. Each becomes a `Candidate { action, score, note }`. Nothing is scored that the policy didn't actually compute a number for.
4. **Decide** — `argmax` over the candidates picks the winner. `selectedCandidate` is set to that winner's `action` id, which is how the UI can assert "the executed action matches the selected one" instead of trusting prose.
5. **Telegraph & act** — a committed attack is announced for `commitMs` before it can land. The target is locked at this moment; nothing re-aims mid-telegraph.
6. **Learn** — once the action resolves, `recordOutcome` (or an encounter-specific equivalent) attaches what actually happened to the original decision record, and the player model's counters update.

### The shared contract (`src/lib/ai/types.ts`)

```ts
type AIDecision = {
  id: string;            // "<agentId>-<seq>", deterministic
  at: number;             // simulation ms — pausing the game pauses the record
  algorithm: string;      // named honestly, differs by difficulty
  state: AIState;
  observations: Reading[];
  memory: Reading[];
  candidates: Candidate[];
  selectedAction: string; // human-readable: "Throw boulder at Left lane"
  selectedCandidate?: string; // machine-readable: "boulder:left"
  target?: string;
  confidence?: number;    // ONLY set when a real probability model produced it
  reason: string;         // must cite the actual numbers that drove the choice
  commitMs?: number;
  safety?: { escapes: number; actionFree: number }; // the fairness guarantee this decision made, recorded at decision time
  outcome?: DecisionOutcome;
  outcomeNote?: string;
};
```

`AIRuntime` holds a ring buffer of the last 14 decisions and 44 events (`DECISION_LIMIT`, `EVENT_LIMIT`), plus running stats (`decisions`, `attacks`, `attacksLanded`, `predictions`, `predictionsCorrect`, `intervalSum/Count`, `nodesExplored`, `coordinationEvents`). Nothing here holds a DOM node, an `HTMLImageElement`, or an engine class instance — every field is plain data, which is what lets `structuredClone` copy a whole encounter state (AI runtime included) on every tick, the same way the rest of the engine already worked.

**No fabrication, enforced structurally, not by convention.** `confidence` is an optional field. A policy with no probability model — easy-tier fixed rotations, for instance — simply never sets it, and the inspector's compact panel and candidate table both render "no probability model" rather than a invented percentage. This was checked adversarially: see §5.

## 2. The player model (`src/lib/ai/player-model.ts`)

This is **online behavioural statistics**, not machine learning, and the UI says so explicitly. It is deliberately simple enough to explain in one paragraph to a class:

- **Occupancy** — exponentially decayed dwell time per option (`observeDwell`, half-life 9s by default), so a habit from two minutes ago has faded by the time it would misinform a forecast. `occupancyPrior()` additionally blends toward uniform until `PRIOR_EVIDENCE_MS` (7s) of real observation has accumulated — a player who has been in the cave for two seconds does not yet support a "100% forecast."
- **Transitions** — a Laplace-smoothed `options × options` count matrix (`observeChoice`). `predictDistribution()` blends the Markov row toward the occupancy prior, with the blend weight rising with how many transitions have actually been seen from the current option (`predict().grounded` becomes `true` at ≥3). This is what "confidence" means wherever it appears: a real posterior over options, never a guess.
- **Reaction time** — `observeReaction()` records the delay between a telegraph locking and the player's answering input, filtering out physically impossible values. `predictAfter()` uses the measured mean to decide whether a forecast horizon is even long enough for the player to act — inside one reaction time, the forecast has to say "stays where they are," because that is the truth.
- **Per-option success/failure** — `observeResolution()` and `weakestOption()` surface which option the player defends worst, gated behind a minimum sample count so a single unlucky event doesn't get reported as a weakness.

## 3. Difficulty is three different algorithms

The design brief's hardest-to-fake requirement: hard must be *smarter*, not merely faster. For the one fully wired encounter (Cyclops), this is enforced in code, not in prose:

| Tier | Algorithm name | What it actually does |
|---|---|---|
| Easy | `Reactive rotation (fixed sequence)` | Targets `wave % 3`. Consults no player state at all. |
| Medium | `Lane tracking (current position)` | Targets whatever lane the player currently occupies. No forecasting, no memory beyond "where are you right now." |
| Hard | `Markov lane forecast + utility choice` | Reads the player model's transition-weighted forecast for where the player will be when the boulder lands, adds a bonus for the player's historically weakest lane, and adds a bonus for how much the current obstacle layout is already squeezing that lane — then throws at the `argmax`. |

`tests/cave-runner.test.mjs` asserts this distinction directly: *"each difficulty names a different algorithm"*, *"easy ignores the player's position; normal tracks it"*, *"only the predictive policy reports a confidence value"*, *"the hard policy follows the observed lane habit"*, and — critically — *"the predictive policy can be wrong"*, because a hard AI that cannot be defeated by a clever player is not demonstrating intelligence, it's demonstrating omniscience, which the brief explicitly forbids.

## 4. Fairness: the invariant that survived adversarial testing

The single hardest property to get right in this kind of system is: **the opponent must never commit to an attack the player cannot survive, however badly they've been playing.** This is not a vibe — it's three composed guards, each with its own test:

1. **`escapeLanes`** — a lane counts as an escape only if it isn't the target, is reachable in the time available (`horizonMs / LANE_CHANGE_MS` lane-changes), carries no boulder of its own, and has no un-answerable hazard arriving within `CONFLICT_WINDOW_S` (0.55s) of the boulder's own impact. The conflict window exists because two threats arriving almost simultaneously are, for a real player, one problem, not two independently survivable ones.
2. **`cleanEscapeLanes`** — the stricter subset where the player needs *no action at all*, just to be there. A throw is only ever committed when at least one clean escape exists.
3. **`openLanes`** — looks past the boulder's own impact to `AFTERMATH_S` (0.95s) beyond it, so the opponent can't claim the one lane an *upcoming wave* is about to leave open — which would force the player to vacate for the boulder and return for the wave inside one window.

If none of these hold, the throw is withheld — scored at `-1000` with a note ending `"— withheld"`, visible in the candidate table exactly like any other evaluated option, not hidden. **This was not simply asserted — it was checked.** `tests/cave-runner.test.mjs` includes a standalone invariant checker that drives thousands of threat groups across every difficulty, both opponent sources, and many seeds, against a deliberately careless (random-walk) player, and asserts a survivable option existed every single time. Building that checker surfaced two real bugs during development (a telegraph that could claim a lane a wave was about to need, and a spawner that could box in a lane a boulder had already claimed) — both are now fixed, and both failure modes are permanently covered by regression tests.

Every committed decision also records its own `safety: { escapes, actionFree }` at the moment it was made, so the guarantee can be checked against the actual instant of commitment rather than reconstructed later from a possibly-stale snapshot — this is what lets the AI Lab state, truthfully, how many escape routes a given attack left.

## 5. Verification, not self-report

The seven non-Cyclops controllers were authored by independent agents against this same contract, then each was reviewed *adversarially* by a second, separate agent whose explicit brief was to find fabrication, fake tier differences, fairness holes, purity violations (`Math.random`, `Date.now`, unbounded growth, non-cloneable state), and contract breaches — not to confirm the author's self-report. See each controller file's header comment for its own stated fairness invariants, in the same style as `cyclops.ts`.

## 6. The AI Lab / Professor mode

`src/components/ai-lab-mode.tsx` (data layer: `src/lib/ai/lab.ts`) is a dedicated classroom-presentation surface, reachable from the main menu. It:

- Lets a presenter pick any encounter and any difficulty independently of campaign progress, and launches it as a **practice attempt that records no medal, score, or unlock** — `finish()` in `ArcadeApp.tsx` branches on `run.lab` before ever touching `finishAttempt`.
- Offers **seeded comparison**: holding one seed across all three difficulty runs of the same encounter, so a side-by-side table can honestly claim "the only thing that changed was the opponent."
- Shows a comparison table of real per-run metrics — decisions made, mean interval, forecast accuracy (or "not applicable" when the policy makes no forecast), attack success rate, search nodes explored, coordination events — pulled via `labRunFrom()`, a pure, independently unit-tested projection (`tests/ai-lab-mode.test.mjs`) from a real, completed `AIRuntime`. No metric is invented for the table; a metric a controller doesn't feed simply doesn't appear.
- Carries two presenter-only reveal toggles (predicted lane, observed history) that change only what is *drawn* in the world — `CaveScene`'s `showPrediction` / `showHistory` overlay flags — never what the opponent *decides*. The render layer reads the same decision records the compact panel does; it does not recompute anything.

## 7. The inspector UI: three modes, one data source

`src/components/ai-inspector.tsx` exports `AIInsights` (compact overlay) and `AILab` (the full pipeline view: six collapsible stages, candidate table with the winning row highlighted, a forecast distribution bar chart when one exists, live metrics, and a chronological decision timeline). Both read the identical `InspectorFeed` — there is no separate "demo data" path. `F3` cycles Immersive → AI Insights → AI Lab without restarting the encounter (`src/components/arcade-round.tsx`); switching never touches the simulation.

## 8. Performance

AI decisions run on a fixed cadence per encounter (`cavePolicy().cooldownMs`, 2.3–3.4s depending on tier), not every render frame — the Cyclops engine's own tick cost measures at ~0.175ms including a full `structuredClone`, well inside a 16ms frame budget. The inspector reads already-computed records; it performs no search or simulation of its own, so opening the full AI Lab panel costs React render time only, never simulation time.

## What's left

The remaining integration work, per encounter, is the same shape each time: add the controller's perception/action/decision types to the engine's state, call `decide<X>` from the tick function at the right cadence, translate the returned action into the engine's existing mechanics, and add a `<X>Feed` to `src/lib/ai/feeds.ts` plus a world-space overlay to that encounter's renderer. Sirens' controller is the most immediately actionable, since the move from timer-driven melodies to the controller's `decideSirens` call is a narrower change than the others (no new entity types, just a different source for "what melody plays next").

## 9. The model-planned rival, live commentary and voice

Every encounter is now played against a model-planned rival; the earlier model-free *Arcade Solo* mode is gone from the game, and an encounter cannot start until `GET /api/arcade` reports the configured model as available. The split of responsibilities is unchanged and deliberate: **the model chooses and narrates, the game decides.**

- **Strategy, before the round** (`server/arcade.ts`). When a briefing opens, the model reads the player's last two attempt summaries and returns a JSON-schema-constrained `{ planId, focus, taunt }`. `planId` must come from the encounter's AI catalog and `focus` must equal the game-derived habit, exactly as before; the new `taunt` is one in-character sentence spoken over the encounter's title card. It travels beside the plan, never inside it, so `validPlan` and every engine still see only `{ planId, focus, source }`.
- **Live commentary, during the round** (`src/lib/commentary.ts`, `server/commentary.ts`). `detectMoment()` compares consecutive engine commits and names the single most important change (win/loss, hit, miss, the Cyclops closing in, a streak, a progress milestone, points). The `CommentaryDirector` paces requests like a broadcast: one in flight, a minimum gap, the most important pending moment wins, lines that would arrive too late to match the action are dropped, and pausing drops whatever was waiting. The model receives only bounded engine facts (score, lives, time left, progress, streak, the engine's own status text) and the last few lines, and returns one schema-bound sentence in the voice the game chose: the **bard** (Homeric narrator) or the **rival** (persona per encounter in `src/lib/rivals.ts`). Output is stripped of markup, links and quotes before it is shown or spoken. Commentary never feeds back into the simulation.
- **Prompt caching on CPU.** The commentary system prompt is identical for every line of an encounter, whichever voice speaks, and per-line facts are short plain text. On a CPU-only laptop this cut a line from about 13 seconds to 3 to 7, because the local server reuses the cached prefix. The bard's opening line is requested while the player reads the briefing, which hides the one cold read per encounter.
- **Voice** (`src/lib/voice.ts`, `server/voice.ts`). If `FARSHORE_TTS_URL` names an OpenAI-compatible `/v1/audio/speech` server (Kokoro-82M in the Colab notebook), `/api/voice` proxies each line with a per-character Kokoro voice; otherwise the browser's speech synthesis reads it with per-character pitch and rate. Music ducks while a voice speaks, and the voice stops on pause.
- **Hosting.** `colab/farshore_model_server.ipynb` runs Ollama with `qwen3:4b-instruct` and Kokoro on a Colab T4 behind an API-key gateway and a Cloudflare quick tunnel, for players whose laptops are too slow.

Tests: `tests/commentary.test.mjs` covers moment detection, facts, pacing, staleness and pause behaviour of the director, the commentary endpoint's validation, cache-friendly prompt shape and failure codes, and the voice proxy.
