# Submit and present today

## Upload

The professor explicitly asks for presentation slides and a team contribution statement. Use the new Arcade files, not the older advice-voyage slides.

1. Open Farshore-Phase-2-Arcade-Presentation.pptx. Review your name and the current game description.
2. Read contribution-statement.md and correct any inaccurate contribution or teammate details. Review its PDF before upload.
3. Upload the slides and reviewed contribution PDF to the course submission area. If supporting files are allowed, also attach the design packet, spike summary or the full ZIP. Follow any LMS-specific instructions the professor has given.
4. Keep the presentation PDF as a backup. The design packet holds the full flows and wireframe set for questions.

## Ten-minute rehearsal

Use speaker-notes.md. All 8 slides total 600 seconds. Full flows and wireframes remain in the supporting design packet. The 3-5 minutes of Q&A come afterward. Do not play through all five encounters during the timed presentation. A game demo is optional and is not mandated by this brief.

Your opening: "Farshore turns Odysseus' journey into five distinct arcade trials. Phase 2 shows how a player learns each trial, reviews an optional AI strategy, and recovers when the model fails."

Your AI explanation: "Llama chooses one allowed rival strategy before the match. Local game logic makes the rival's moves. The model cannot change scoring, warnings or campaign progress."

Your evidence: "I ran six current-use-case model calls. They took 7.317 to 11.613 seconds, averaging 8.279 seconds. All returned legal strategies. Two choices differed from advisory prompt preferences, so legality does not prove the best tactics."

Your research status: "The personas come from my Phase 1 sketches. I am using them as design references and do not claim an interview-backed evaluation here."

## Likely questions

- Why use AI? It selects a rival strategy from recent attempt observations while fixed local rules preserve responsiveness and predictable scoring. Its effect on enjoyment still needs evaluation.
- Why can players play without it? Optional planning can fail or take more than ten seconds. Local play keeps the game usable.
- What does the model receive? The browser sends a shore ID, difficulty and up to two numeric attempt summaries. The server gives Llama derived habits and win count. This test uses loopback Ollama. No names, audio or free text.
- Can the model cheat? The server rejects illegal strategy/focus fields. Local code owns scores and collision rules. Fairness still needs user playtests.
- How can a player undo an AI result? Change mode/difficulty to discard it before play. A dedicated Discard control is Proposed. Practice changes no progress. There is no post-round score reversal.
- What are the failures? A nonexistent model returned 404, malformed provider JSON returned 400, and unsupported difficulty returned app 400 before inference. 429 and sustained capacity were not measured.

## Remaining human evidence

Add actual peer critique or interview records if you have them. Do not replace missing records with invented feedback. The supplied Phase 1 slides show a solo project; this package does not assert instructor approval.
