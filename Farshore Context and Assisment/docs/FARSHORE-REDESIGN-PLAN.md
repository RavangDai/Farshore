# Farshore gameplay redesign

Direction selected by the user: escape puzzles plus mystery investigation. Improve the working game first, then revise Phase 2 to match it. Keep the Odyssey setting, pixel art, cast, map and navy/teal/gold theme.

Circe's Broken Seal is now the default playable case. The original voyage, its cast book, and map remain accessible at `?voyage`. The [case design record](MYSTERY-CASE.md) documents implemented truth, clue dependencies, scoring, and verification. The broader design below remains the roadmap: generated character reactions, conversation memory, dedicated dictation, additional cases, newcomer evaluation, and revised Phase 2 artifacts are unfinished.

## What the current implementation needs

The existing encounters choose between safe and risky actions. Story mode uses keywords and wording rules. AI mode interprets advice, but still selects between those two authored actions. Time, trust and fixed outcomes dominate the feedback. The runtime model receives current scene context and trust, without a record of earlier promises or decisions.

This produces limited variation in what the player actually does. Trust rewards good outcomes with the same increment, rather than representing a distinct relationship. A successful wind-bag shortcut also ends the sea journey early, making later chapters inaccessible during that voyage.

## New concept

Working subtitle: Farshore: Secrets of the Voyage. An episodic mystery and escape adventure in the Odyssey world. The player travels with Odysseus, investigates conflicting accounts and uses evidence to escape dangerous places. Each chapter has a physical escape objective and an underlying mystery. No prior knowledge of the poem is required; every required clue exists in the game.

Each chapter follows this sequence:

1. Enter a scene with a visible escape goal and mystery question.
2. Examine labeled objects, collect useful items and record clues.
3. Question the characters present using suggested questions, typing or optional dictation.
4. Compare witness statements with observed facts in the journal.
5. Use items, reconstruct a sequence or solve a mechanism using the discovered evidence.
6. Present a deduction with supporting clues and resolve the escape.
7. See the case outcome, optional discoveries and unlocked next chapter.

Object examination, inventory, puzzle actions and common dialogue should respond instantly through authored content. Use real AI for custom questions and character reactions. Label AI and authored dialogue clearly. A player must be able to finish the case when the model is unavailable.

## Scoring and stakes

- Default Adventure mode rewards completing cases. Remove the twenty-year automatic loss from its core loop.
- Each case has up to three visible objective stars: escape the location, prove the central deduction with evidence, and complete a clearly labeled optional case objective. Write exact conditions before implementing the score.
- Escape and full investigation can be separate achievements. A mechanically successful escape need not resolve every secret.
- Determine objectives from committed actions, evidence IDs and authored case conditions. Do not score politeness, writing fluency, clue-click counts or model agreement.
- Hints, reading speed, voice settings and time spent waiting for AI do not reduce Adventure-mode stars. Hints reveal the goal, a relevant clue, then a possible next action in separate steps.
- Unsupported deductions receive an explanation and let the player revise their evidence. Failed model calls do not change progress or points.
- Character relationships may affect reactions and optional story details, but essential clues cannot depend on finding flattering wording.
- Introduce a separate Challenge mode only after the core experience works. Its rules must explain how reading and AI waits are excluded from any timer.

## First playable case: Circe's Broken Seal

An original fictional case inspired by the Odyssey, rather than an event claimed to appear in Homer. A protective seal has been moved, blocking the crew's route out of Circe's palace. Odysseus, Circe and Eurylochus give incomplete or conflicting accounts. Discover what happened, restore the mechanism and reach the ship.

Limit the first version to three connected areas, three speaking characters, five essential clues and three distinct puzzles.

| Area | Investigation | Escape puzzle |
| --- | --- | --- |
| Entrance hall | Examine the displaced seal, an inscription and witness accounts | Reconstruct the order of events to find the workshop access clue |
| Workshop | Find seal fragments and compare markings with the recorded inscription | Restore the seal using the correct pieces and sequence |
| Harbor gate | Confront a contradiction and present supporting evidence | Apply the repaired seal and choose the evidence-supported gate instruction |

Before coding, define the case's fixed truth, timeline, witness knowledge, any deliberate misleading statements, and the complete clue-to-puzzle dependency graph. Ensure no essential clue sits behind the puzzle that requires it. One optional discovery can explain a character's motive without blocking escape.

Later cases can use the Cyclops' cave, the wind bag and the Sirens. Expand only after the first case proves that investigation and escape mechanics work together. New mysteries, dialogue and mechanisms require clear game-adaptation labels.

## AI behavior

AI voices characters who have different knowledge, motives and personalities. Provide only the authored facts and statements available to that character in the current case state. Deliberate deception must come from the case script, rather than arbitrary model invention.

Keep authoritative clues, puzzle solutions, inventory and scores in game code. Any proposed fact or clue references from the model must use permitted IDs and pass state checks before appearing in the journal. Schema validation alone does not prove narrative accuracy; evaluate dialogue grounding against the case facts. Display authored clue text in the journal and distinguish observations from witness statements.

Use a compact record of actual questions and discovered evidence so characters can respond to a revealed contradiction. If a question is unclear or outside the character's knowledge, clarify or give a bounded in-world answer. AI cannot grant an item, solve a mechanism or award points directly.

Show elapsed model wait, cancellation and explicit retry or authored-dialogue recovery. Preserve question drafts across reloads. Cancelled or superseded replies must never change progress. Use one NPC request at a time; do not make every room action depend on a slow model turn.

## Welcoming new players

- Start with one guided room before requiring a long introduction.
- Keep the escape objective and mystery question visible; introduce characters in context.
- Provide an optional hint ladder: clarify the goal, point toward a relevant clue, then explain a possible approach.
- Offer suggested questions and selectable evidence alongside free-language questions. Neither typing nor speech should be mandatory.
- Make every puzzle usable by keyboard, touch and click; dragging can be an optional shortcut.
- Keep motion and sound optional, respect reduced motion, and let players skip text animation.
- Let players replay completed cases or return to unresolved optional discoveries.

## Implementation order

1. Write the first case's truth, clue dependency graph, character knowledge and exact objective rules. Keep existing voyage saves available as legacy reports; store escape-case progress in a separate versioned save.
2. Build one complete authored case: room navigation, object examination, inventory, evidence journal, puzzles, deductions and recovery. Preserve the existing visual theme and reuse suitable original assets.
3. Add bounded AI questioning for the three characters, with cancellation, saved drafts and authored fallback. Validate real dialogue against the case facts.
4. Check keyboard, touch, hints, reloads, revisiting rooms and all routes to the ending. Ensure every next action is understandable and no puzzle can permanently block progress.
5. Conduct actual newcomer play checks. Can players distinguish statements from facts, explain their deduction and escape without outside lore? Record findings before changing the design.
6. Expand to additional cases with different mechanisms, add relevant character memory and replay, then consider Challenge mode.
7. Revise Phase 2's architecture, flows, wireframes, presentation and evidence around the behavior actually implemented. Keep unfinished features labeled Proposed.

## Acceptance criteria for the first playable chapter

- A player unfamiliar with the Odyssey can identify the escape goal and the mystery question.
- Every essential clue is reachable before the puzzle that requires it.
- Observed facts and witness statements remain distinguishable in the journal.
- Evidence supports the final deduction and each puzzle's solution.
- Puzzles, inventory and scores resolve from authored rules, including when AI is unavailable.
- Correcting ambiguity, failed requests and cancellation cause no penalty, duplicate grant or late state change.
- Hints, suggested questions, typing, keyboard controls and reduced motion work throughout the case.
- Reloading preserves room, inventory, clues, puzzle progress and question draft. Existing voyage saves remain available.

## Direction record

The user selected "escape puzzles + mystery investigation" after considering a change to the game concept. This replaces the earlier proposal centered on advising Odysseus through preparation challenges. The first case is implemented. Phase 2 revision awaits evaluation of this playable case.
