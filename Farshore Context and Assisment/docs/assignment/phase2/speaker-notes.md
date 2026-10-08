# Farshore Phase 2 speaking plan

Total: 600 seconds (10 minutes). Q&A: 3-5 minutes separately.

## 1. Farshore

Timing: 20 seconds.

Introduce the game: the player uses free language to guide Odysseus home before 240 months. Phase 2 focuses on the structure and behavior of the interaction. This presentation uses current code plus clearly labeled design proposals. Source: Phase 2 brief, page 1; src/lib/game.ts. Original project artwork: public/art/title.png.

## 2. Players and design needs

Timing: 50 seconds.

Maya cares about fair scoring. Daniel needs a clear start and a text option. Rosa needs to understand the model and why Odysseus refused. These references come from the Phase 1 slide, not a completed interview study. Explain that task flows carry their persona labels. Source: Farshore_Phase12nd.pptx, slide 4; phase2 editable content.

## 3. Screen hierarchy

Timing: 45 seconds.

Walk through Title, Introduction, Encounter and Journey report. Shared overlays hold support content without moving the voyage forward. The Encounter contains the Llama feature, optional voice input and spoken output. Settings shows model availability. Source: src/App.tsx screen and Modal types; design packet architecture.

## 4. Data flow and privacy

Timing: 55 seconds.

Reviewed text goes through React and the local API to Llama. The model returns text and decision flags. The server determines time and trust changes from authored rules. Accepted results live in browser localStorage. Browser/OS speech may use a remote provider, so voice is a separate privacy boundary. A cloud text endpoint would change the disclosure. Sources: server/turn.ts; src/App.tsx; src/lib/dictation.ts; https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition; https://docs.ollama.com/api/openai-compatibility, accessed September 30, 2026.

## 5. F2: Counsel and decision review

Timing: 60 seconds.

Describe the primary AI task: valid counsel, processing, structure validation, candidate review and one-time commitment. The proposed review step separates generation from consequences. It preserves a meaningful story refusal while offering a response to model contradiction. Refine counsel, regenerate or discard an unscored candidate. Current code applies a valid result immediately, so this is a Phase 2 design addition. Source: src/App.tsx submit; F2 in design packet.

## 6. F3: Dictation and transcript review

Timing: 40 seconds.

Voice is optional and never submits automatically. Stop dictation and review names and negation before sending. Brave on Windows uses Windows + H guidance. The browser cannot open the OS panel itself. Dictation latency and actual microphone behavior were not measured in this spike. Sources: src/lib/dictation.ts; src/App.tsx; F3.

## 7. F4: Error recovery

Timing: 50 seconds.

No dead end. Distinguish provider failure, invalid model structure and semantic disagreement. Keep the same draft and unchanged score on failure. Story mode is explicit and labeled. Empty JSON errors already reject. Review and discard for plausible but incorrect output are proposed. The complete packet also contains F1 start/resume and F5 consequence/report. Source: server/turn.ts and src/App.tsx recovery; F1-F5.

## 8. AI interface states

Timing: 65 seconds.

Show the low-fidelity component structure. The game art and style can remain, but this phase isolates hierarchy and controls. Measurements require more than a spinner: proposed elapsed time and cancellation address waits above ten seconds. The success state includes a proposed unscored review checkpoint. The full packet has 26 wireframes across every screen and five states for interpretation, speech input and spoken replies. Sources: Phase 2 brief page 2; W01-W26; fresh spike.

## 9. Uncertainty and user control

Timing: 55 seconds.

An LLM confidence percentage would mislead. Use action wording, rationale, sources and player verification. Sources explain the story, not model certainty. A questionable candidate is unscored. A practice-only undo supports learning after commitment and restores branch state. The design does not claim a reliable automatic semantic detector or content moderation system. Sources: Phase 2 brief confidence note; W06; evidence/quality-review.json.

## 10. AI technical spike

Timing: 65 seconds.

Method: standalone script uses the existing production prompt and adapter, captures raw provider bodies and times six realistic inputs. Local CPU inference, Llama 3.2 3B Q4_K_M, temperature 0.2 and 450 output-token cap. No model was loaded before S1. Report min, arithmetic mean and max across valid calls only. S4 and S5 follow requested actions but say followed=false. S6 has no requested action but says followed=true. This is a small analytic sample, not an accuracy benchmark. Sources: scripts/phase2-spike.mjs; evidence/spike-2026-09-30.json; evidence/quality-review.json.

## 11. Failures and design changes

Timing: 45 seconds.

Two failures actually reached the model service and produced archived HTTP error bodies. The timeout is deliberately client-side with no received model response. Invalid counsel stops at the app boundary. No 429 was observed, and this test says nothing about sustained capacity. Local requests used no billed inference API. Do not claim an invalid API key failure for local Ollama because local keys are ignored. Sources: evidence/spike-2026-09-30.json; https://docs.ollama.com/api/openai-compatibility, accessed September 30, 2026.

## 12. Current prototype and Phase 2 design

Timing: 50 seconds.

Close by distinguishing the working prototype from the Phase 2 design. Keep local Llama provisionally, but the decision flags need improvement and evaluation. Class critique and real research require people. Bibek owns the concept and presentation. Codex assisted with drafting, experiment code and artifacts. The contribution statement is a review draft, not an agreed team attestation. Source: phase2/contribution-statement.md, peer-critique.md and design packet. Invite the allotted 3-5 minutes of Q&A after the 10-minute talk.