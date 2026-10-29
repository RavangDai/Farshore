# Farshore presentation and implementation context

Source: `original/Farshore_Phase12nd.pptx`, six slides. The complete extracted slide text is in `PRESENTATION-TEXT.txt`. This file distinguishes proposal statements from verified implementation.

## Student's proposed game

| Slide | Proposal |
| --- | --- |
| 1 | Farshore: help Odysseus return home faster than his twenty-year journey. Bibek Pathak, CMPS 4200, solo project |
| 2 | The player advises and the AI decides. Wording and Odysseus' pride influence whether he listens. The wind-bag example contrasts an order with supportive advice |
| 3 | A problem appears, the player speaks, Odysseus chooses, and time passes. Weeks, months, or years can be lost |
| 4 | Six features: free speech, personality, changing trust, a running clock, new problems each game, and an end report of ignored advice. Initial priorities are free speech, personality, and the clock |
| 5 | Proposed models: Llama 3.2 3B, faster-whisper, SER-Odyssey, all-MiniLM-L6-v2, and Piper/VITS. The slide says bart-large-mnli was set aside for speed |
| 6 | Proposed laptop: Intel Core Ultra 5, 16 GB RAM. Claims approximately 10 GB for all models and under-one-second turns through preparing responses in advance |

Slide 4 sketches Maya (21, gamer concerned about fairness), Daniel (19, reader with little technical background), and Rosa (34, skeptical of AI and seeking explanations). It says six interviews are booked. These short sketches do not establish completed interviews or full research-backed personas.

Slide 5 says six models were tested, five chosen, and that the models came from class lecture material. The lecture slides and test records are not included. Slide 6's memory and latency statements are presentation claims, not measured results supplied with this code.

## User's later design direction

After submitting and presenting, the user asked to build a browser game with a retro theme, intro, animation, characters, and a clear play action. They rejected the SaaS-style interface. The current design uses original pixel assets, navy/teal/gold colors, and Odyssey characters. The user permits changes that make the game nicer or easier to build.

## Current code compared with the proposal

| Area | Current laptop edition | Remaining distinction |
| --- | --- | --- |
| Presentation | Pixel title, skippable prologue, animated portraits, illustrated scenes | Portrait movement uses CSS rather than sprite-frame animation |
| Main loop | Free text, advice decisions, trust, elapsed months, endings and captain's log | Story mode uses scripted wording rules |
| Dialogue AI | Server adapter accepts a compatible chat-completions endpoint | No live model was available for validation when this package was prepared |
| Speech input | Optional browser dictation, editable transcript, typing fallback | faster-whisper is not installed; browser speech may use an online service |
| Voice output | Optional browser speech synthesis | Piper/VITS is not installed |
| Advice analysis | Scripted rules or the selected dialogue model | Separate MiniLM and acoustic emotion recognition are not installed |
| Encounters | Eleven authored encounters in a fixed route | The slide's new problems each game and generated scenes are not implemented |
| Cast | Twenty principal Odyssey figures in the character book and scene cast | This is not every named figure in the poem; gameplay outcomes are counterfactual |
| Performance | Existing 25-second model request timeout | Memory use, warm/cold latency, and response pre-generation are not benchmarked here; pre-generation is not implemented |

The prototype reduces the proposed stack to one dialogue model plus browser speech. That is an implementation simplification, not a recorded instructor approval or a claim that all slide features are complete.

The game clock starts at 120 months for the Trojan War. Completing eleven encounters below 240 months wins. Reaching 240 months loses. Specific penalties, dialogue, and alternate outcomes are game design, not factual claims about Homer.

## Development sequence

1. Connect the proposed Llama 3.2 3B model through Ollama and validate a full turn.
2. Check nuanced advice, negation, errors, and understandable explanations with real users.
3. Measure latency and memory on the actual laptop. Record results and conditions honestly.
4. Use research evidence and any later-phase instructions to decide whether local speech models, more scene variation, or other features are needed.

This sequence is a suggested implementation plan, not an added course requirement.
