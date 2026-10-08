# Farshore Phase 2: Arcade Trials

Current October 8 submission package. The original advice-voyage package in ../phase2 remains historical.

## Rubric coverage

| Requirement | Evidence |
| --- | --- |
| Information architecture, 20% | 15-screen site map, content strategy, A1 model specification, data flow, local storage and provider boundary |
| User flows, 30% | F1-F5, labeled with Phase 1 persona sketches, plus EC1-EC8 |
| Wireframes, 30% | W01-W28, every screen and all five A1 states, with flow/state annotations |
| AI spike, 10% | Six actual current-use-case calls, raw outputs, min/mean/max, two real provider failures and one app validation failure, one-page summary |
| Presentation, 10% | 12 editable slides, 600-second notes, contribution draft and supporting artifacts |

## Outputs

- Farshore-Phase-2-Arcade-Presentation.pptx and matching PDF
- Farshore-Phase-2-Arcade-Design-Packet.pdf
- technical-spike-summary.pdf
- contribution-statement.pdf and editable Markdown
- index.html and editable grayscale SVGs / content.json
- speaker-notes.md and SUBMIT-TODAY.md
- evidence/phase2-arcade-spike-2026-10-08.json and quality-review.json

## Evidence limits

Personas remain the supplied Phase 1 sketches. Real interviews, class critique and any team/solo approval are not documented in the supplied files. Do not claim they are complete. The model experiment is small feasibility evidence, not a fairness, accuracy or enjoyment benchmark. Local heuristics play the rivals, while Llama selects the policy before a round.

## Rebuild

Run from the repository root: 

```powershell
node --experimental-strip-types scripts/phase2-arcade-spike.mjs .tmp/new-evidence.json
# To retain the reviewed record, use the existing October 8 evidence when rebuilding.
node scripts/build-phase2-arcade.mjs
python scripts/render-phase2-arcade.py
& .\scripts\verify-phase2-arcade-powerpoint.ps1
python scripts/pack-phase2-arcade.py
```

The spike refuses to overwrite evidence. Changing the evidence reference requires analytic review of the new responses. The presentation authoring runtime is unavailable on this Windows host. The native OOXML fallback retains editable text, tables, diagrams and wireframes; PowerPoint renders the final slides. Python dependencies are already in .tmp/pdf-review-tools. No .env or credentials belong in the submission ZIP.
