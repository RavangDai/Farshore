# FARSHORE: how the AI works

This document explains every place FARSHORE uses AI, what a pretrained model decides and what it never decides, and how a player (or a professor) can see each decision being made. It describes the code as it stands; where something is not built, it says so.

## In one minute

**The model is the strategist; the game is the referee.**

In three encounters (Cyclops' Cave, Sirens' Passage and the Palace of Ithaca) a pretrained language model makes the rival's decisions during play:

1. The game lays out a menu of 2 to 5 options it has already checked are fair, each with the real numbers that describe it.
2. The model picks one and gives a short reason in character.
3. The game carries the pick out with its own physics, randomness and scoring.

The inspector shows the model's pick beside the game's own best option. In Ithaca, Athena turns the same idea toward the player: she answers questions about the shot using only the game's real measurements, and shows which ones she used.

The other five encounters use the model once per round, to choose the rival's plan before play. All eight have live commentary and voices.

The model can't cheat or invent facts:

- It can only answer with an id from the menu (a JSON schema enforces this while it writes).
- Every number in its reason is checked against the numbers it was given.
- The game decides every outcome.

## The AI in the game, layer by layer

| Layer | Kind | When | Decides | Code |
|---|---|---|---|---|
| Rival plan | Pretrained LLM | Once, at the briefing | One of two plans and an opening taunt | `server/arcade.ts`, `src/lib/arcade/arcade.ts` |
| In-game decisions | Pretrained LLM | During play, at decision points (3 encounters) | One option from the game's checked menu, a reason, a spoken line | `server/decide.ts`, `src/lib/arcade/decisions.ts`, `src/lib/ai/{antinous,sirens,polyphemus}.ts` |
| Athena's counsel | Pretrained LLM | When the player asks (Ithaca) | An answer drawn only from the hall's facts, and which facts it used | `server/athena.ts`, `src/lib/ai/athena.ts` |
| Rival's debrief | Pretrained LLM | After the round (3 encounters) | The rival's account of the round, from the game's measurements | `server/decide.ts` (`kind: "debrief"`), `src/lib/arcade/debrief.ts` |
| Commentary | Pretrained LLM | During play | One spoken sentence from the bard or the rival | `server/commentary.ts`, `src/lib/arcade/commentary.ts` |
| Voice | Pretrained TTS (Kokoro-82M; browser speech as fallback) | During play | How each line sounds | `server/voice.ts`, `src/lib/arcade/rivals.ts` |
| Opponent mechanics | Hand-written algorithms | Every tick | Physics, timing, aim error, fairness vetoes, scoring | `src/lib/encounters/*.ts`, `src/lib/ai/*.ts` |

Every encounter needs a reachable model to start (`GET /api/arcade`); there is no model-free play.

## Encounter by encounter

| Encounter | What the model decides | When | What the game still decides |
|---|---|---|---|
| **Cyclops' Cave** | The briefing plan sets the first section's doctrine; the model then picks the doctrine for the collapsing hall and for the run to daylight | ~70% through each section | Every throw's lane (scored by the doctrine), its warning time, the escape-lane vetoes, every wave's fairness |
| **Sirens' Passage** | Which of the best fair melodies to sing next | During each rest between melodies | Tempo bounds, reply windows measured against the player's pace, the 50% cap on the player's weakest lane, scoring |
| **Palace of Ithaca** | Each of Antinous' five shots: full draught, steady half allowance, a showy half-draw, or a block shot at a named axe | While the player's arrow flies | Flight physics, his seeded aim error, the block cap, scoring |
| Lotus-Eaters | Plan: *pincer* (second guardian cuts you off) or *undertow* (it takes the junction ahead or the path home) | Briefing | Pathfinding, step times, detection, a 4-step limit on holding one spot |
| Aeolus | Plan: *pincer* (wider gate swings) or *undertow* (counter-gusts that answer your lift rhythm) | Briefing | Gate gaps, collision, gust bounds |
| Circe | Plan: *chain* (spend curses at once) or *hoard* (bank them until your board is crowded) | Briefing | Two-ply potion search, drop timing |
| Scylla & Charybdis | Plan: *pincer* or *undertow* (how hard the whirlpool pulls during strikes) | Briefing | Head timing, paddle size, telegraphs |
| Calypso | Plan: *pincer* (storm watch: more frequent strikes where you stand) or *undertow* (strikes where the current will carry you) | Briefing | A verified safe hop for every strike |

`tests/plans.test.mjs` proves each pair of plans changes play in every encounter.

## The pattern: the model picks, the game referees

1. **Menu.** At a decision point, the engine builds 2 to 5 options. Each has already passed that encounter's fairness checks, and each carries measured features: expected axes over 40 simulated loosings, a forecast miss count, lane dwell %, and so on. The engine also scores each option for itself; that score is never sent to the model.
2. **Request.** `DecisionDirector` (`src/lib/arcade/decisions.ts`) sends the menu's labels and features, the facts, and the rival's recent lines to `/api/decide`. The system prompt is fixed per encounter, so a local model keeps it cached.
3. **Constrained answer.** The JSON schema allows `optionId` to be only one of the menu's ids. The reply is `{ optionId, reason, line }`.
4. **Verification** (`verifyChoice`, `server/decide.ts`):
   - An id that isn't on the menu rejects the whole reply.
   - A reason that quotes a number the game never gave is replaced by a plain sentence, and the reply is flagged `edited`.
   - A spoken line containing a number is dropped.
5. **Execution.** The answer reaches the engine as an action (`choose`). The engine checks once more that the menu id is current and the option is on it, then carries it out.
6. **Record.** The decision is stored in the encounter's `AIRuntime` with a `chooser`: who picked (model or game), the model's name, the latency, the game's own top option, and whether they agreed.

**When the model is late.** Ithaca holds Antinous' aim, and the Sirens hold their breath, up to a cap (5 s and 3.5 s). The cave never waits: a section plan is due at the section boundary. If the cap or the boundary passes without a usable answer, the game plays its own top option, and the inspector labels it *Game's pick* with the reason ("the model did not answer in time"). The round itself still required a model to start.

## Cyclops' Cave in detail

The cave has three sections (the narrow passage, the collapsing hall, the run to daylight). Difficulty decides which **doctrines** are on the menu:

| Doctrine | On the menu at | What it does to the throw scoring | Algorithm name |
|---|---|---|---|
| Lane rotation | Easy | A fixed Left, Centre, Right rotation | Reactive rotation (fixed sequence) |
| Hunt your lane | Every tier | Throws at the lane the player occupies | Lane tracking (current position) |
| Cut off your next move | Medium, Hard | A Markov forecast of where the player will be when the boulder lands | Markov lane forecast + utility choice |
| Press your weak spot | Hard | The forecast, a doubled bonus (+24) for the lane the player escapes worst, and the spawner leans single hazards toward the type they fail most (jump, slide or dodge) | Markov forecast + weak-spot pressure |

Each option is described by the player model:

- **Hunt:** the player's favourite lane and its dwell share.
- **Cut off:** the forecast confidence and the player's mean reaction time.
- **Press:** the player's weakest lane and their hazard failure counts.

The game's own estimate favours whichever measurement is strongest. Every throw under every doctrine still passes `escapeLanes`, `cleanEscapeLanes` and `openLanes`, and every wave passes `patternIsFair`. `tests/decisions.test.mjs` checks that every committed throw left an action-free escape lane, under every doctrine on every tier.

Each adopted plan is closed with what it achieved ("3 throws, 1 landed"), which feeds the debrief.

The engine run on its own (with no model, as in most tests) keeps the original fixed tier policy. That is why `tests/cave-runner.test.mjs` still checks that each difficulty names a different algorithm.

## Sirens' Passage in detail

The reviewed composition controller (`src/lib/ai/sirens.ts`) is now wired in. `evaluateSirens` scores every melody shape: staircase, mirror, pedal, syncopated, the weakness weave, the fairness floor, and a repeat. `sirensMenu` offers the model the best fair ones (up to four), each with:

- its notes and tempo
- its share on the player's weakest lane
- the forecast misses
- its complexity
- how much it changes from the last melody

`commitSirens` sings the pick. The model's reason leads in the record; the game's promise always follows it ("Sung at 553 ms per note: 2.5 s of listening, then a 5.2 s reply window, which admits 12 taps against the 4 asked").

The four invariants hold for everything on the menu:

- tempo between 440 and 900 ms
- 3 to 6 notes
- a reply window that admits every note at the player's measured pace
- never more than half a melody on their weakest lane

The plan leans the scores: *swell* favours the weave, *echo* favours melodies with rests.

The Sirens' line appears on screen but is never spoken, because the ear belongs to the melody.

## Palace of Ithaca in detail

When the player looses, `bowMenu` (`src/lib/ai/antinous.ts`) measures Antinous' options with the hall's own `archeryShot` and `bestAim`, passed in so there is one copy of the physics. Each option is flown 40 times, using the tier's real execution error, from a private seed that never disturbs the contest's own random stream.

| Option | Offered | Trade-off |
|---|---|---|
| Read the full draught | Always (except under the *Unsteady suitor* plan) | Best aim, full error |
| Steady hand, half the draught | Always | Tighter hand (70% error), half the wind allowance: better in light draughts, worse in strong ones |
| Showy half-draw | Only when he leads by 3 or more | Lower expected score, wider spread: pride |
| Lodge an arrow in axe *k* | Medium (1 target) and Hard (2), never on the last arrow | His own count capped at 6. The opening *k* is narrowed for the player's next arrow, and only offered when replaying the player's last line shows it would cost them an axe |

The moment a block shot is chosen, the hall announces the axe ("Antinous eyes axe 6…"), before the arrow lodges. After the player's next arrow, the block is judged honestly: the same arrow is flown again through an open axe, and the runtime records whether the block actually cost them anything.

## Athena's counsel (Ithaca)

**Ask Athena** opens a panel during the player's turn. The player can type, pick a suggested question, or speak (browser speech recognition). There are three questions per contest, with no medal cost; only answered questions count.

`athenaFacts` gathers what Athena may use:

- the draught
- the allowance into it
- the last arrow and the hall's own correction
- the narrowed axe
- the draw and hold rules
- the score and the arrow number

**Precision depends on difficulty.** The allowance arrives already cut to what the tier allows: Easy hears "about a hole left", Medium "some way left", Hard only "to the left". She cannot reveal more than the facts contain.

**Validation:**

- The schema restricts `usedFacts` to the keys she was given.
- Every number in her answer must appear in the facts.
- An off-topic or rule-breaking question gets a fixed in-character refusal, never model-written text.

The panel shows her answer with **Athena used** chips for each fact.

## The debrief

After Cyclops, Sirens or Ithaca, the results screen shows **What the rival learned**:

- The game's own measurements: time in each lane, hazard failures, reaction time, missed notes by lane, arrows, block shots that cost you, questions to Athena.
- Every menu decision, and who made it.
- When the model gives one that passes the number check, the rival's account in its own voice.

## Explainability in the interface

`src/components/ai/ai-inspector.tsx` has three modes, cycled with F3:

| Mode | What it shows |
|---|---|
| Immersive | The game only |
| AI Insights | A compact panel, for the 3D encounters floating, for Sirens inside the sidebar: the current action and its short reason. While a model is deciding, the menu it is choosing from. Under each decision, *Model's pick · model · latency* and whether it matched the game's own top option. |
| AI Lab | The full pipeline: perception, memory, the scored candidate table (the model's pick and the game's top option are tagged), the decision with its chooser, the result, live metrics including **model–game agreement**, and the timeline |

The five briefing-planned encounters describe their plan in the encounter sidebar and in the AI Lab.

The **AI Lab** screen on the main menu runs any encounter at any difficulty without touching the campaign. Model decisions there run at temperature 0, so seeded comparisons are as repeatable as a language model allows.

## The player model (`src/lib/ai/player-model.ts`)

Online behavioural statistics, not machine learning, and the interface says so:

- **Occupancy:** exponentially decayed dwell time per option, with a 9 s half-life.
- **Transitions:** a Laplace-smoothed transition matrix, used for the Markov forecast.
- **Reaction time:** measured from a locked telegraph to the player's answer.
- **Success and failure per option:** which lane or note the player defends worst. It is reported only after two samples.

These measurements feed the menus' features, the game's own option scores and the debrief.

## Choosing the model by measurement

`scripts/ai-eval.mjs` sends about 84 in-game requests, generated from seeded engine runs, through the game's real handlers:

- Antinous' menus
- Sirens' menus
- cave section plans
- debriefs
- Athena questions, including injection attempts

For each model it reports:

| Measure | Meaning |
|---|---|
| Valid | Share of requests answered with a reply the game accepted |
| Grounded | Share of accepted decisions whose reason needed no correction |
| Agreement | Share of decisions matching the game's own top option. This is not a quality score: a model may disagree for good reasons. |
| Refusals | Share of off-topic and injection questions Athena refused |
| Answered | Share of real questions Athena answered |
| Debriefs | Share of debriefs that passed the number check |
| Latency | Median and 95th-percentile seconds per request |

Results are saved in `docs/ai-eval/`. See [the results](ai-eval/README.md).

The Colab notebook (`colab/farshore_model_server.ipynb`) runs two models: a **planner** for decisions, Athena and debriefs (`FARSHORE_MODEL_NAME`, default `gemma3:12b`), and the fast `qwen3:4b-instruct` for commentary (`FARSHORE_COMMENTARY_MODEL`).

## Testing it

- `tests/decisions.test.mjs`:
  - menus keep their promises on every tier
  - a stale or off-menu answer is ignored
  - a late model means the game's labelled pick
  - the schema enum and the grounding check work
  - the director and the debrief behave correctly
  - the Sirens' and the cave's fairness hold under any pick
- `tests/athena.test.mjs`: precision by difficulty, the question limit, grounding, refusals.
- `tests/plans.test.mjs`: every plan changes play in every encounter.
- `tests/cave-runner.test.mjs`, `tests/mythic.test.mjs`: the engines, including the cave's invariant checker across thousands of situations.
- The mock AI service (`/api/ai-mock?mode=…`) drives every AI state with no model: answers, waits, failures and rejections.

## Not built, or not wired

- Lotus, Aeolus, Calypso, Circe and Scylla have no separate explainable controller. Those encounters run their engines' own logic, shaped by the model's briefing plan.
- The palace battle that would follow Ithaca's archery contest is not built.
