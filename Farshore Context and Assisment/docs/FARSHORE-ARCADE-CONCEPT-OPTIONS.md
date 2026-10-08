# Farshore: arcade concept options and recommended plan

Prepared October 8, 2026, for Bibek Pathak's CMPS 4200 HCI project.

Status: design proposal for discussion, not implemented gameplay or completed user research. This document responds to the new direction: Odysseus returns home by overcoming obstacles through simple games against AI-powered characters. Existing game code and previously submitted work have not been changed by this proposal.

Implementation update, October 8: the user selected the recommended direction. The three-encounter arcade route is now implemented as the default game. See [the implementation record](arcade/README.md), [new AI spike](arcade/technical-spike.md), and [verification](arcade/verification.md). The proposal below remains the original design record; five-encounter expansion and evaluation targets remain proposed.

## 1. What the game should promise

**Help Odysseus reach Ithaca by completing short arcade challenges against characters from the Odyssey. Each encounter explains one goal, teaches a small set of controls, and moves the ship closer to home.**

The player controls Odysseus and his ship directly. NPCs provide the opposition, challenge, or assistance. The main activity is playing, with a short story introduction before each encounter and a short consequence afterward.

The existing default game is a three-room investigation with evidence, inventory, mechanisms, and deductions. The older voyage is a free-language advice game. Both can support their own design goals, but neither currently delivers the new arcade loop. These alternatives are an assessment of the requested direction, not findings from participant research.

The central design hypothesis is that newcomers will understand progress better when every encounter has an immediately visible action and success condition. Test that hypothesis with real players.

## 2. What the professor actually requires

Read directly from the supplied original Phase 1 and Phase 2 PDFs.

Phase 1 requires a problem statement, primary and secondary users, 5-7 core features, an explanation of the AI's benefit, and success metrics. Research at least five pretrained models, then choose one or two with a justified integration plan. Conduct at least six interviews, synthesize the results, and create three detailed personas.

Phase 2 requires:

- A screen hierarchy, content strategy, AI integration points, and data flow, including storage and information sent to a provider.
- Flows for 3-5 key tasks, labeled with the Phase 1 personas they serve.
- User control, loading, failure recovery, and at least three AI edge cases: service failure, poor output, and invalid input.
- Wireframes for every screen and all five states of each AI feature: initial, loading, success, uncertain, and error.
- A working technical spike with at least five realistic inputs, individual latency records and minimum/average/maximum, at least two triggered failures, and a one-page summary.
- A ten-minute presentation, followed by 3-5 minutes of questions, and a contribution statement. The brief also schedules structured peer critique.

The briefs do not prescribe escape puzzles, fifteen levels, voice input, a specific engine, or a specific model provider. They do not ask you to integrate five models. The AI contribution must improve the user experience and be supported by actual evidence. A conventional game bot alone is not pretrained-model integration.

The Phase 1 brief describes teams of 2-3, while the existing presentation describes a solo project. This plan scopes development for the existing solo project; it does not establish instructor approval for that arrangement. No approval for the concept revision is asserted.

The existing Phase 2 package describes the older advice voyage. A new arcade design would require corresponding changes to its flows, architecture, wireframes, and spike. Existing advice-model outputs cannot validate a new opponent-planning task.

## 3. Four possible concepts

### Option 1: Farshore - Trials of the Voyage

**Pitch:** Each island is a short mini-game inspired by what Odysseus faces there.

**Play loop:** Reach an island, meet its character, practice the controls, complete a 30-60 second challenge, see the result, and sail onward. Replay any completed encounter from the map.

**Examples:** Dodge the Cyclops' rocks, catch winds with Aeolus, match antidote symbols in Circe's challenge, row past the Sirens, and time the bow shot on Ithaca. Aeolus is an ally with a trial, not an enemy. The suitor is an opponent at the final contest.

**Pretrained AI role:** Before a round, a model selects a permitted opponent strategy using the character, selected difficulty, and a small summary of previous attempts. Game code turns that strategy into legal, readable patterns. For example, Polyphemus favors a lane or alternates his throws, while the Sirens choose a permitted rowing-cue pattern. The strategy remains fixed for the round.

**Why choose it:** Closest to the requested variety and journey. Different episodes have a clear mechanical identity.

**Main risk:** Too many unrelated mechanics create development work and repeated tutorials. Start with two game engines across three encounters, then add variations.

**Scope:** Three encounters for the first complete version; five for expansion. Approximately 8-12 minutes and 15-20 minutes respectively are experience targets to measure, not tested playtimes.

**Recommendation:** Best overall fit for this request.

### Option 2: Farshore - One Ship, Many Foes

**Pitch:** Steer one ship toward Ithaca while different Odyssey characters try to stop it.

**Play loop:** Sail a short sea section, avoid telegraphed hazards, reach the checkpoint, meet the next character, and continue. Use left/right and one contextual action throughout.

**Examples:** Polyphemus throws rocks into lanes. Released winds push the ship sideways. The Sirens create tempting side routes. Scylla threatens marked lanes, while Charybdis creates a visible current. A safe route is always readable under the selected difficulty.

**Pretrained AI role:** Choose bounded hazard sequences and enemy tactics before each section. The runtime runs movement, collisions, warning cues, and scoring immediately.

**Why choose it:** One tutorial and one main engine. Strong option when finishing a polished playable game matters more than variety.

**Main risk:** Episodes can feel alike. Give each character a different rule, silhouette, sound, and hazard behavior, while retaining the controls.

**Scope:** Three polished sections first. Add further sections through the same engine after usability checks.

### Option 3: Farshore - Duels of Cunning

**Pitch:** Odysseus earns passage by challenging mythological rivals to familiar small games.

**Play loop:** Meet a rival, see the rules, play a short match, receive passage, and unlock the next stop.

**Examples:** A Cyclops tic-tac-toe match, a best-of-three rock-paper-scissors duel with Circe, or a take-one-to-three-stones game against a suitor. These contests are invented adaptations, not scenes from Homer.

**Pretrained AI role:** Select an opponent policy before a match, or select a legal move from a supplied move list. The latter is appropriate only if measured response times are acceptable for a turn-based experience. Never put a long model wait behind every square placement without testing that interaction.

**Why choose it:** Familiar rules, straightforward input, relatively easy rules validation, and no reflex requirement.

**Main risks:** Tic-tac-toe can become repetitive; strong play often leads to draws. A draw must count as passage or provide an alternate route, rather than requiring endless rematches. Rock-paper-scissors provides limited strategic depth. Odyssey relevance depends heavily on the framing.

**Scope:** Two game types and three rivals. Avoid building a catalogue of unrelated board games.

**Recommendation:** Choose if familiar tabletop games are the main preference. Tic-tac-toe also works as an optional bonus within Option 1.

### Option 4: Farshore - One-Button Homecoming

**Pitch:** Every trial is a short timing challenge with one action button.

**Play loop:** Watch a clear cue, press at the right moment, complete the trial, and advance.

**Examples:** Hold and release a rope before the wind escapes, row on a visual pulse, stop an antidote marker on its matching symbol, and release an arrow when the bow aligns.

**Pretrained AI role:** Select a permitted sequence, tempo profile, or distraction pattern before each round. Difficulty limits define the timing windows; the model cannot shrink them.

**Why choose it:** Smallest control burden and substantial reuse of one timing engine. Easy to demonstrate in class.

**Main risk:** Repetition and reaction-time barriers. Provide slower settings, reduced motion, practice, and an assisted completion path.

**Scope:** Three trials first, expanding through new presentations and validated patterns.

## 4. Recommended design: Trials of the Voyage

### Problem and users

Proposed problem statement: People interested in an Odyssey game may find long dialogue, obscure lore, and multi-step mechanisms difficult to enter. Farshore offers short, understandable challenges that communicate each episode through action, with AI rivals whose tactics vary within fair rules.

Primary users: casual players and students who want a short browser adventure, including people unfamiliar with the poem. Secondary users: readers interested in the Odyssey and classmates evaluating AI interaction design. These groups are assumptions to validate in interviews.

### Seven core features

1. A visible route from Troy to Ithaca with encounter completion.
2. Short arcade challenges with one visible objective each.
3. A pretrained model that prepares bounded NPC strategies between rounds.
4. Short character introductions and optional source notes.
5. Practice, retries, difficulty selection, and assisted completion.
6. Keyboard and touch controls, optional sound, and reduced motion.
7. Local saves, encounter replay, and a simple voyage report.

Free-language input and voice are optional later features. Neither is required to start or complete the arcade adventure.

### Core loop and the first encounter

Title -> brief introduction -> map -> encounter briefing -> optional practice -> opponent preparation -> arcade round -> result -> next encounter -> homecoming.

The introduction is two short cards, with a skip button: the war is over; Odysseus must get back to Ithaca. The first encounter introduces Polyphemus in context instead of requiring a character book.

Sample briefing:

> The Cyclops is throwing rocks at your ship. Move left or right to avoid the marked lanes. Survive for 45 seconds. Three hits end the attempt.

The player can select a ten-second practice before starting. Practice has no campaign consequences. The round displays only the ship, hazards, warning cues, three hit indicators, and progress to safety.

On success: "You escaped the Cyclops. Next: the Sirens." On failure: "Your ship was struck three times. Retry, practice, or use assistance." Explain the objective again beside those controls.

### The three-encounter complete version

| Encounter | Player action | Initial authored success condition | Opponent role |
| --- | --- | --- | --- |
| Cyclops' Coast | Switch between three ship lanes | Survive 45 seconds with fewer than three hits | Polyphemus chooses a permitted throw plan |
| Sirens' Passage | Press Row when a visual pulse reaches the marker | Complete at least six of eight cues correctly | Sirens choose a permitted cue sequence |
| Ithaca's Bow | Press Release when the moving aim marker is aligned | Make three successful shots within five attempts | A suitor selects a permitted contest-pressure pattern |

Thresholds are initial design values to tune after playtests. Siren timing and bow alignment share an engine. The MVP therefore needs one lane engine and one timing engine, not three independent systems.

Each challenge teaches its action in place. Audio is optional; every required cue is visible. Mistimed input immediately says "Early," "Late," or "Aligned," rather than displaying an unexplained score change.

The abridged route is explicitly labeled a game adaptation. A brief transition explains that other parts of the journey have been condensed. The final bow contest leads to an authored reunion epilogue; it does not imply that winning the contest alone resolves every event in Homer's homecoming.

### Expansion to five encounters

Expand the route to Cyclops -> Aeolus -> Circe -> Sirens -> Ithaca only after the three-encounter version works.

- Aeolus: catch a fixed number of helpful wind tokens using the lane engine; avoid marked contrary winds. He offers a friendly trial. Catching tokens is an invented arcade representation of the wind-bag episode.
- Circe: select the button that matches a visible antidote symbol. Keep the reference on screen, with two or three choices and no hidden sequence to memorize. This adds a small matching engine and an authored explanation of Hermes' protective herb.

The design deliberately avoids requiring lore recall. Circe's original transformation episode motivates the scene, but the antidote contest is invented. Additional Odyssey episodes belong in later expansion, not the first build.

### Progress, failure, and rewards

Use "Encounters cleared: 1 of 3" as the main progress display. Reaching Ithaca completes the voyage. Retrying a level never erases previous completion.

Default play has no global countdown, trust meter, lives shared between levels, inventory system, or month calculation. A short local round timer is visible only when it defines that challenge. This is a proposed revision of the original voyage's rules, not a requirement from the professor.

Results record Cleared, Assisted, or Pending. Assistance can slow the challenge further or allow passage after the player confirms. Offer it whenever wanted, and suggest it after repeated failures. All completion paths can reach the ending; an assisted result is recorded plainly without blocking the story.

Optional encounter medals can reward accuracy and remaining ship health later. Do not introduce them before the basic objective and progression make sense. A voyage-time challenge could return as an optional mode after testing; reading and AI waits must never count against it.

## 5. Real AI integration and fair play

### One model, one initial responsibility

Start by evaluating the project's existing local Llama 3.2 3B for the new task. Reuse its server connection if the spike shows acceptable output quality. This is a provisional candidate, not a claim that it is the best model.

The pretrained model receives encounter identity, authored character traits, selected difficulty, permitted plan IDs, and a compact summary of at most two previous attempts. For Cyclops, the summary can contain lane occupancy and hit counts. For timing games, use early/late/missed counts. Avoid raw keystroke or microphone capture.

The model returns a permitted plan ID, a permitted emphasis ID, and a short explanation. Example: choose "alternating throws" with "left emphasis" after a player repeatedly remains in the left lane. Selecting those parameters changes actual hazard generation in code, so the AI affects gameplay beyond dialogue.

Game code owns warning duration, speed caps, scoring, collision detection, legal target lanes, and win/loss. The model cannot rewrite rules or make a hit count as a miss. Structured JSON support helps constrain format; validate identifiers and gameplay constraints separately.

### Never call the language model in the action loop

The existing September 30 advice-model spike recorded 8.87-38.43 seconds per call, averaging 26.36 seconds. Later question-matching checks had a different latency profile. Neither experiment establishes latency for the new strategy task.

Use one preparation request before a round. After validation, freeze the plan for that round and run it locally. The opponent may adapt between attempts using summaries; it does not read future input or change a committed attack after seeing a dodge.

Preparing the next plan while the player reads a result may reduce visible waiting, but it cannot guarantee instant replies. Benchmark before promising speed.

### Fairness constraints

- Display a warning before every damaging attack. Initial targets: at least 900 ms on normal and 1,400 ms on easy, subject to usability testing.
- Always leave a reachable safe lane. Validate a pattern against lane-switch timing before accepting it.
- Difficulty is chosen by the player and cannot be raised by the model.
- Keep timing windows fixed under that chosen setting. Initial targets for the Sirens are +/-450 ms on normal and +/-800 ms on easy, to be tested.
- Pause stops simulation, input judgment, and local timers. Returning from a hidden browser tab requires a countdown before resuming.
- Reject invalid strategies instead of improvising an unfair substitute.

### AI controls and recovery

During preparation, show elapsed time and Cancel. Let the player use practice while preparation runs. Separate practice and campaign state so a late reply cannot alter an active practice round.

When preparation succeeds, show a brief opponent description, such as "The Cyclops will use alternating throws." Offer Start round, Prepare another, and Change difficulty. Regeneration has no score penalty. A difficulty change invalidates the previous plan.

On failure, keep the encounter and selected difficulty intact. Offer Retry AI and Play standard opponent. Standard mode is visibly authored and uses the same fair difficulty limits. It completes the route without a model, but it is not evidence of pretrained AI integration. Switching modes cancels the request; late responses cannot change gameplay.

An unknown plan ID, incoherent explanation, unsupported difficulty, or unsafe schedule produces an uncertain/invalid result with an explanation and the same recovery choices. Do not invent a confidence percentage.

### Data flow

Player difficulty and attempt summary -> browser -> local server validation -> configured model -> server validates candidate -> player accepts prepared opponent -> local simulation -> authored result -> browser save.

Save progress, preferences, and compact attempt summaries locally under a new versioned arcade key. Disclose what summaries are sent for AI preparation. With local Ollama, the model call remains on the laptop; with a hosted provider, those summaries go to that provider. Credentials remain server-side. No cloud-save or speech feature is part of the first build.

## 6. Screen and HCI plan

Screens and overlays: title; short introduction; voyage map; encounter briefing and practice; AI preparation states; active game; pause/settings; round result; ending/replay. Each screen has a single prominent next action.

Use existing pixel scenes, portraits, palette, and map where suitable. Keep a standard readable font for instructions. Use large touch controls with at least 44 px targets as a design target; verify actual keyboard and touch use. Provide visible focus, symbol/text cues alongside color, instant text, mute, and reduced motion. Slower settings and assisted passage complement those controls.

Five task flows for the Phase 2 packet:

1. Start a new voyage and learn the first challenge.
2. Prepare an AI opponent, review it, change it, and start.
3. Complete a round or recover through retry/practice/assistance.
4. Recover from a timeout or invalid AI strategy using explicit standard play.
5. Resume a saved voyage and replay a completed encounter.

Map these to the actual Phase 1 personas. The existing Maya, Daniel, and Rosa sketches can be provisional labels only until the user's interview evidence is available.

Wireframe all five AI preparation states, with input and output annotations. The success state shows the prepared opponent and user controls; the uncertain state explains a rejected or unsuitable plan; the error state offers retry and standard play.

## 7. Development milestones

| Milestone | Work | Done when |
| --- | --- | --- |
| 1. Prove one encounter | Build Cyclops briefing, practice, lane play, pause, result, and retry with authored opposition | A newcomer can play without a verbal explanation and recover from losing |
| 2. Prove the AI task | Add bounded strategy preparation, validation, cancellation, standard mode, and a new spike | Real model outputs produce legal strategies; failure recovery preserves progress |
| 3. Finish a short voyage | Add the shared timing engine, Sirens, bow contest, map progress, separate saves, and epilogue | Start-to-ending play works across three encounters, including assistance and reload |
| 4. Evaluate and polish | Conduct actual newcomer checks; inspect keyboard, touch, readability, timing, and AI labels | Record findings and address observed confusion or unfairness |
| 5. Align the assignment | Revise architecture, five flows, wireframes, spike summary, and presentation | Every artifact matches implemented behavior and marks proposed additions |
| 6. Expand if justified | Add Aeolus and Circe, then replay variety | New encounters improve the tested experience without delaying the complete base game |

Suggested implementation boundaries: an arcade app entry; authored encounter definitions and a pure progression reducer; separate lane and timing components; a server-only opponent planner; and a standalone strategy spike. Reuse the existing model configuration without exposing secrets.

Keep existing mystery and voyage saves separate. Once this direction is selected for implementation, expose older modes deliberately and give the arcade save a new key. The planning document itself does not change the current entry point.

Verify legal patterns, round completion, retry/reset, pause timing, input duplication, cancellation, stale replies, saves, and invalid model output. Run the existing test suite and production build after implementation, then inspect actual desktop and phone-sized play. No gameplay tests are needed for this planning-only document.

## 8. Evidence and acceptance targets

Initial targets, not collected results:

- At least five of six test participants can explain the current goal after reading the briefing.
- At least five of six complete the first attempt's action loop without external coaching.
- Players can identify which opponent used the model and which used authored rules.
- A player can recover from a failed AI preparation call without losing progress.
- Every evaluated model strategy is either validated as legal or explicitly rejected.
- Keyboard-only play and touch controls can reach the ending; required cues work with audio muted.

The six interviews required by Phase 1 and the proposed play checks serve different purposes. Record them honestly; testing alone does not establish completion of interview research or persona synthesis.

New strategy-spike cases: a first-time easy player; a player who favors one lane; a player with repeated misses; a timing player who presses early; a timing player who presses late; and an unsupported pattern request. Record outputs, legality, latency, and the reason for any rejection. Trigger at least two failure conditions separately, such as an unavailable provider and an invalid returned plan. Clearly distinguish actual provider failures from simulated invalid-output tests.

Compare at least five pretrained candidates in the Phase 1 model table using I/O, limits, expected latency, and cost. Retain one or two only with a user-needs and feasibility justification. Current prices and limits need verification when preparing that table.

## 9. Story integrity and sources

Canonical anchors: Polyphemus and the ship's escape in Book IX; Aeolus and Circe in Book X; the Sirens in Book XII; and the bow contest in Book XXI. Games, repeated trials, AI tactics, medals, and altered routes are original adaptations. Include a short optional "In Homer / In this game" explanation.

Sources reviewed:

- [Original Phase 1 brief](assignment/original/CMPS_4200_HCI_Phase_1_Project_Requirements.pdf), both pages.
- [Original Phase 2 brief](assignment/original/CMPS_4200_HCI_Phase_2_Project_Requirements.pdf), all three pages.
- [Current case record](MYSTERY-CASE.md) and `src/lib/mystery.ts` for the implemented investigation.
- Root `README.md`, `PROJECT-NOTES.md`, `src/main.tsx`, and `src/lib/game.ts` for the two existing modes and reusable assets.
- [Existing spike summary](assignment/phase2/technical-spike-summary.md) and analytic review for measured advice-task limitations.
- [Homer's Odyssey, Samuel Butler translation](https://www.gutenberg.org/files/1727/1727-h/1727-h.htm), checked October 8, 2026. This translation sometimes uses Roman divine names; the game uses Greek names.
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), checked October 8, 2026. Schema support helps with output format and does not establish strategy quality.

Suggested presentation pitch: "Farshore is a browser arcade adventure in which players help Odysseus reach Ithaca through short challenges inspired by the Odyssey. A pretrained model prepares character-specific rival tactics between rounds, while authored rules keep controls responsive and outcomes fair."
